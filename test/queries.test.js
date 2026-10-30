import test from "node:test";
import assert from "node:assert/strict";
import { buildPostFeedQuery } from "../src/queries/post-feed.queries.js";
import { buildReferralListQuery } from "../src/queries/referral-list.queries.js";
import { buildProfileUpdateQuery } from "../src/queries/profile-update.queries.js";
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
