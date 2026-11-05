import test from "node:test";
import assert from "node:assert/strict";
import { buildPostFeedQuery } from "../src/queries/post-feed.queries.js";
import { buildReferralListQuery } from "../src/queries/referral-list.queries.js";
import { buildProfileUpdateQuery } from "../src/queries/profile-update.queries.js";
import { escapeLike } from "../src/queries/query-guards.js";
import { postQueries } from "../src/queries/posts.queries.js";
import { loggingQueries } from "../src/queries/logging.queries.js";

test("dynamic feed and referral queries bind filter values instead of interpolating them", () => {
  const search = "' OR 1=1; DROP TABLE users; --";
  const feed = buildPostFeedQuery({
    filters: {
      search,
      tab: "all",
      sort: "latest",
      topic: "Career advice",
      companyId: "company",
    },
    userId: "user",
    limit: 20,
    offset: 0,
  });
  const referrals = buildReferralListQuery({
    filters: { search, status: "open", companyId: "company" },
    userId: "user",
    limit: 20,
    offset: 0,
  });
  for (const built of [feed, referrals]) {
    assert.ok(!built.sql.includes(search));
    assert.ok(built.params.includes(`%${search}%`));
    assert.equal((built.sql.match(/\?/g) ?? []).length, built.params.length);
  }
});
test("profile updates whitelist columns and bind nested JSON values", () => {
  const result = buildProfileUpdateQuery(
    { name: "Test", skills: ["Node.js"] },
    "user",
  );
  assert.ok(result.sql.includes("full_name=?"));
  assert.deepEqual(result.params, ["Test", '["Node.js"]', "user"]);
  assert.throws(() =>
    buildProfileUpdateQuery({ password_hash: "invalid" }, "user"),
  );
});
test("query builders reject unsafe identifiers and pagination", () => {
  assert.throws(() => postQueries.addPostAction({ table: "users" }));
  assert.throws(() =>
    postQueries.listComments({ limit: "20;DROP TABLE posts", offset: 0 }),
  );
  assert.throws(() =>
    loggingQueries.insertRecord({ table: "users", columns: ["id"] }),
  );
  assert.throws(() =>
    loggingQueries.insertRecord({
      table: "audit_logs",
      columns: ["id);DROP TABLE users"],
    }),
  );
});

test("report upsert binds category and reason", () => {
  assert.equal((postQueries.upsertReport.match(/\?/g) ?? []).length, 5);
  assert.ok(postQueries.upsertReport.includes("report_category"));
});

test("author filters never expose anonymous posts and bind the author id", () => {
  const built = buildPostFeedQuery({
    filters: { tab: "all", sort: "latest", authorId: "author-id" },
    userId: "viewer",
    limit: 20,
    offset: 0,
  });
  assert.ok(built.sql.includes("p.user_id=? AND p.is_anonymous=FALSE"));
  assert.ok(built.params.includes("author-id"));
  assert.ok(!built.sql.includes("author-id"));
  assert.equal((built.sql.match(/\?/g) ?? []).length, built.params.length);
});

test("search terms are escaped so wildcards match literally", () => {
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  assert.equal(escapeLike("plain"), "plain");
});

test("comment queries bind params and cap reply parents", async () => {
  const { postQueries } = await import("../src/queries/posts.queries.js");
  assert.match(
    postQueries.listComments({ limit: 5, offset: 0 }),
    /parent_comment_id IS NULL/,
  );
  const sql = postQueries.listReplies({ count: 3 });
  assert.equal((sql.match(/\?/g) ?? []).length, 3 + 2); // viewer + post + 3 ids
  assert.throws(() => postQueries.listReplies({ count: 0 }));
  assert.throws(() => postQueries.listReplies({ count: 101 }));
});

test("websocket tickets are single use and expire", async () => {
  const { issueTicket, consumeTicket } = await import("../src/realtime.js");
  const ticket = issueTicket("user-1", 1000);
  assert.equal(consumeTicket(ticket, 2000), "user-1");
  assert.equal(consumeTicket(ticket, 2000), null); // already used
  const stale = issueTicket("user-2", 1000);
  assert.equal(consumeTicket(stale, 1000 + 31000), null);
  assert.equal(consumeTicket("nope"), null);
});

test("post image queries cap placeholders", async () => {
  const { postImageQueries } =
    await import("../src/queries/post-images.queries.js");
  assert.equal(
    (postImageQueries.findOwnedUploads({ count: 3 }).match(/\?/g) ?? []).length,
    4,
  );
  assert.throws(() => postImageQueries.findOwnedUploads({ count: 7 }));
  assert.throws(() => postImageQueries.listImages({ count: 0 }));
});

test("attachPostImages falls back to the legacy single image", async () => {
  const { attachPostImages } = await import("../src/post-images.js");
  assert.deepEqual(await attachPostImages([]), []);
});

test("referral filters and sorts bind every value and whitelist ordering", () => {
  const built = buildReferralListQuery({
    filters: {
      search: "react",
      status: "open",
      view: "available",
      workMode: "remote",
      level: "senior",
      location: "India",
      skill: "TypeScript",
      postedWithin: 7,
      topRated: true,
      requestStatus: "pending",
      sort: "helpful",
    },
    userId: "user",
    limit: 20,
    offset: 0,
  });
  assert.equal((built.sql.match(/\?/g) ?? []).length, built.params.length);
  assert.ok(built.sql.includes('ORDER BY "authorScore" DESC'));
  assert.ok(built.params.includes("%TypeScript%"));
  const unknown = buildReferralListQuery({
    filters: { search: "", status: "all", sort: "x; DROP TABLE users" },
    userId: "user",
    limit: 5,
    offset: 0,
  });
  assert.ok(unknown.sql.includes("ORDER BY r.created_at DESC"));
  assert.ok(!unknown.sql.includes("DROP"));
});
