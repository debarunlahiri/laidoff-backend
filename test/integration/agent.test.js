import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config/config.js";
import { closeLogger } from "../../src/utils/logger.js";
import { pool, query } from "../../src/db/db.js";

if (!config.DB_NAME.endsWith("_test"))
  throw new Error("Integration tests require DB_NAME ending in _test");
const run = promisify(execFile);
const app = createApp();
const official = "news@laidoffcircle.com";
const label = `itest-${randomUUID().slice(0, 8)}`;
const companyName = `Agent Test Co ${label}`;
const today = new Date().toISOString().slice(0, 10);
const year = Number(today.slice(0, 4));
const created = { posts: [], reports: [] };

// Issues a key with the real management script, the way an operator would.
async function issueKey(name, writesPerHour = 60) {
  const { stdout } = await run(
    process.execPath,
    [
      "scripts/agent-key.js",
      "create",
      "--name",
      `${label}-${name}`,
      "--writes-per-hour",
      String(writesPerHour),
    ],
    { env: { ...process.env, LOGGING_ENABLED: "false" } },
  );
  const [key] = stdout.match(/lak_[A-Za-z0-9_-]{43}/);
  const [{ id }] = await query(
    "SELECT id FROM agent_api_keys WHERE key_name=?",
    [`${label}-${name}`],
  );
  return { key, id };
}
const as = (key) => ({ Authorization: `Bearer ${key}` });

test.after(async () => {
  for (const id of created.reports)
    await query("DELETE FROM workforce_reports WHERE id=?", [id]);
  for (const id of created.posts)
    await query("DELETE FROM posts WHERE id=?", [id]);
  await query("DELETE FROM agent_api_keys WHERE key_name LIKE ?", [
    `${label}-%`,
  ]);
  await query("DELETE FROM companies WHERE company_name LIKE ?", [`%${label}`]);
  await pool.end();
  await closeLogger();
});

test("reading: keys authenticate, topics and companies and insights answer", async () => {
  const { key } = await issueKey("read");
  const topics = await request(app)
    .get("/api/v1/agent/topics")
    .set(as(key))
    .expect(200);
  assert.ok(topics.body.topics.includes("Layoff updates"));
  // Wildcards in a search are matched literally.
  const wildcard = await request(app)
    .get("/api/v1/agent/companies?search=%25")
    .set(as(key))
    .expect(200);
  assert.deepEqual(wildcard.body.companies, []);
  await request(app)
    .get("/api/v1/agent/companies?limit=1000")
    .set(as(key))
    .expect(400);
  const insights = await request(app)
    .get(`/api/v1/agent/insights?year=${year}`)
    .set(as(key))
    .expect(200);
  assert.equal(insights.body.year, year);
  assert.equal(insights.body.status, "user_reported");
  // The member-facing insights route still works after sharing its logic.
  const member = await request(app)
    .get(`/api/v1/insights?year=${year}`)
    .expect(200);
  assert.equal(member.body.year, year);
  await request(app).get("/api/v1/insights?year=1999").expect(400);
});

test("member routes are unaffected and never accept an agent key", async () => {
  const { key } = await issueKey("isolation");
  await request(app).post("/api/v1/posts").send({ text: "x" }).expect(401);
  await request(app)
    .post("/api/v1/posts")
    .set(as(key))
    .send({ text: "x" })
    .expect(401);
});

test("posting: validates, publishes as the official account, creates companies once", async () => {
  const { key } = await issueKey("post");
  const bad = await request(app)
    .post("/api/v1/agent/posts")
    .set(as(key))
    .send({ text: "hello", anonymous: true })
    .expect(400);
  assert.equal(bad.body.error.code, "INVALID_REQUEST");
  assert.ok(bad.body.error.issues.length);
  await request(app)
    .post("/api/v1/agent/posts")
    .set(as(key))
    .set("Content-Type", "application/json")
    .send("{nope")
    .expect(400)
    .expect((r) => assert.equal(r.body.error.code, "INVALID_REQUEST"));
  await request(app)
    .post("/api/v1/agent/posts")
    .set(as(key))
    .send({ text: "hello", companyId: randomUUID() })
    .expect(404)
    .expect((r) => assert.equal(r.body.error.code, "COMPANY_NOT_FOUND"));

  const first = await request(app)
    .post("/api/v1/agent/posts")
    .set(as(key))
    .send({
      text: "  Acme is cutting 400 roles.  ",
      topic: "Layoff updates",
      company: companyName,
    })
    .expect(201);
  created.posts.push(first.body.id);
  assert.equal(first.body.text, "Acme is cutting 400 roles.");
  assert.equal(first.body.company.name, companyName);
  assert.equal(first.body.url, `${config.APP_URL}/posts/${first.body.id}`);
  assert.equal(first.body.author.name, "LaidOff News");

  const [row] = await query(
    "SELECT p.is_anonymous,p.post_topic,u.email FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?",
    [first.body.id],
  );
  assert.equal(row.email, official);
  assert.equal(row.is_anonymous, false);
  assert.equal(row.post_topic, "Layoff updates");

  // The same name in other letters reuses the company instead of duplicating it.
  const second = await request(app)
    .post("/api/v1/agent/posts")
    .set(as(key))
    .send({ text: "Follow-up", company: companyName.toUpperCase() })
    .expect(201);
  created.posts.push(second.body.id);
  assert.equal(second.body.company.id, first.body.company.id);

  // The public feed shows it.
  const post = await request(app)
    .get(`/api/v1/posts/${first.body.id}`)
    .expect(200);
  assert.equal(post.body.name, "LaidOff News");
});

test("idempotency: a retry replays, a changed body conflicts, parallel retries publish once", async () => {
  const { key } = await issueKey("idem");
  const send = (body, idem) =>
    request(app)
      .post("/api/v1/agent/posts")
      .set(as(key))
      .set("Idempotency-Key", idem)
      .send(body);
  const body = { text: `Once only ${label}` };
  const a = await send(body, `a-${label}`).expect(201);
  created.posts.push(a.body.id);
  const b = await send(body, `a-${label}`).expect(201);
  assert.equal(b.headers["idempotent-replay"], "true");
  assert.equal(b.body.id, a.body.id);
  await send({ text: "Something else" }, `a-${label}`)
    .expect(409)
    .expect((r) => assert.equal(r.body.error.code, "IDEMPOTENCY_KEY_REUSED"));
  await request(app)
    .post("/api/v1/agent/posts")
    .set(as(key))
    .set("Idempotency-Key", "has spaces")
    .send(body)
    .expect(400);

  const parallel = await Promise.all(
    Array.from({ length: 6 }, () =>
      send({ text: `Parallel ${label}` }, `p-${label}`),
    ),
  );
  const ids = new Set(parallel.map((r) => r.body.id));
  assert.ok(parallel.every((r) => r.status === 201));
  assert.equal(ids.size, 1);
  created.posts.push(...ids);
  const [{ count }] = await query(
    "SELECT count(*)::int AS count FROM posts WHERE post_content=?",
    [`Parallel ${label}`],
  );
  assert.equal(count, 1);
});

test("reports: validate, record as user_reported, appear in insights, refuse duplicates", async () => {
  const { key } = await issueKey("report");
  const report = {
    company: companyName,
    eventDate: today,
    rolesAffected: 400,
    sourceUrl: "https://example.com/news/acme",
    headcount: 5000,
  };
  const post = (body) =>
    request(app).post("/api/v1/agent/insights/reports").set(as(key)).send(body);
  await post({ ...report, eventDate: "2999-01-01" }).expect(400);
  await post({ ...report, sourceUrl: "javascript:alert(1)" }).expect(400);
  await post({ ...report, rolesAffected: 0 }).expect(400);
  await post({ ...report, company: undefined }).expect(400);

  const ok = await post(report).expect(201);
  created.reports.push(ok.body.id);
  assert.equal(ok.body.status, "user_reported");
  assert.equal(ok.body.company.name, companyName);
  assert.equal(ok.body.hires, null);
  const [saved] = await query(
    "SELECT verification_status,reported_headcount FROM workforce_reports WHERE id=?",
    [ok.body.id],
  );
  assert.equal(saved.verification_status, "user_reported");
  assert.equal(saved.reported_headcount, 5000);

  const duplicate = await post(report).expect(409);
  assert.equal(duplicate.body.error.code, "DUPLICATE_REPORT");
  assert.equal(duplicate.body.error.existingId, ok.body.id);

  const insights = await request(app)
    .get(`/api/v1/agent/insights?year=${year}`)
    .set(as(key))
    .expect(200);
  const entry = insights.body.companies.find((c) => c.name === companyName);
  assert.equal(entry.rolesAffected, 400);
  assert.equal(entry.headcount, 5000);
});

test("writes are limited per key and report when to retry", async () => {
  const { key } = await issueKey("limit", 2);
  for (const n of [1, 2]) {
    const ok = await request(app)
      .post("/api/v1/agent/posts")
      .set(as(key))
      .send({ text: `Limit ${n} ${label}` })
      .expect(201);
    created.posts.push(ok.body.id);
  }
  const limited = await request(app)
    .post("/api/v1/agent/posts")
    .set(as(key))
    .send({ text: `Limit 3 ${label}` })
    .expect(429);
  assert.equal(limited.body.error.code, "RATE_LIMITED");
  assert.ok(Number(limited.headers["retry-after"]) > 0);
  // Reads are not limited.
  await request(app).get("/api/v1/agent/topics").set(as(key)).expect(200);
});

test("revoked keys and suspended accounts stop working immediately", async () => {
  const { key, id } = await issueKey("revoke");
  await request(app).get("/api/v1/agent/topics").set(as(key)).expect(200);
  const { stdout } = await run(
    process.execPath,
    ["scripts/agent-key.js", "revoke", id],
    {
      env: { ...process.env, LOGGING_ENABLED: "false" },
    },
  );
  assert.match(stdout, /Revoked key/);
  await request(app).get("/api/v1/agent/topics").set(as(key)).expect(401);

  const other = await issueKey("suspend");
  await query("UPDATE users SET account_status='suspended' WHERE email=?", [
    official,
  ]);
  try {
    await request(app)
      .get("/api/v1/agent/topics")
      .set(as(other.key))
      .expect(401);
  } finally {
    await query("UPDATE users SET account_status='active' WHERE email=?", [
      official,
    ]);
  }
  await request(app).get("/api/v1/agent/topics").set(as(other.key)).expect(200);
});
