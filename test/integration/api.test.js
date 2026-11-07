import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../../src/app.js";
import { tokenHash } from "../../src/utils/security.js";
import {
  applicationLog,
  closeLogger,
  flushLogs,
} from "../../src/utils/logger.js";
import { config } from "../../src/config/config.js";
import { pool, query } from "../../src/db/db.js";
if (!config.DB_NAME.endsWith("_test"))
  throw new Error("Integration tests require DB_NAME ending in _test");
const app = createApp();
const ids = [];
test.after(async () => {
  for (const id of ids) await query("DELETE FROM users WHERE id=?", [id]);
  await pool.end();
  await closeLogger();
});
async function register(name) {
  const email = `${randomUUID()}@example.test`;
  const password = "integration-password-123";
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ name, email, password })
    .expect(201);
  ids.push(response.body.user.id);
  return { ...response.body, email, password };
}
const as = (token) => ({ Authorization: `Bearer ${token}` });
test("authenticated social workflow and authorization boundaries", async () => {
  const alice = await register("Alice Test");
  const bob = await register("Bob Test");
  const eve = await register("Eve Test");
  await request(app)
    .post("/api/v1/auth/login")
    .send({ email: alice.email, password: "incorrect-password" })
    .expect(401);
  await request(app)
    .post("/api/v1/auth/login")
    .send({ email: alice.email, password: alice.password })
    .expect(200);
  const companyId = randomUUID();
  await query("INSERT INTO companies(id,company_name) VALUES(?,?)", [
    companyId,
    `Test ${companyId}`,
  ]);
  try {
    const a = as(alice.token),
      b = as(bob.token),
      e = as(eve.token);
    await request(app)
      .get("/api/v1/posts?limit=1%3BDROP%20TABLE%20posts")
      .set(a)
      .expect(400);
    await request(app)
      .patch("/api/v1/me")
      .set(a)
      .send({ about: "Profile updated", skills: ["Node.js"], openToWork: true })
      .expect(200);
    const profile = await request(app)
      .get(`/api/v1/users/${alice.user.id}`)
      .set(b)
      .expect(200);
    assert.equal(profile.body.about, "Profile updated");
    assert.equal(profile.body.email, undefined);
    await request(app)
      .put(`/api/v1/users/${alice.user.id}/follow`)
      .set(b)
      .expect(200);
    const companySearch = await request(app)
      .get("/api/v1/companies?search=Test")
      .set(a)
      .expect(200);
    assert.ok(companySearch.body.some((c) => c.id === companyId));
    const created = await request(app)
      .post("/api/v1/posts")
      .set(a)
      .send({ text: "A test post", companyId })
      .expect(201);
    const postId = created.body.id;
    await request(app).delete(`/api/v1/posts/${postId}`).set(b).expect(403);
    await request(app)
      .put(`/api/v1/posts/${postId}/reaction`)
      .set(b)
      .send({ reaction: "like" })
      .expect(200);
    await request(app)
      .put(`/api/v1/posts/${postId}/reaction`)
      .set(b)
      .send({ reaction: "dislike" })
      .expect(200);
    const feed = await request(app).get("/api/v1/posts").set(b).expect(200);
    const post = feed.body.find((p) => p.id === postId);
    assert.equal(post.likes, 0);
    assert.equal(post.dislikes, 1);
    assert.equal(post.reaction, "dislike");
    await request(app)
      .put(`/api/v1/posts/${postId}/bookmark`)
      .set(b)
      .expect(200);
    const bookmarks = await request(app)
      .get("/api/v1/posts?tab=bookmarks")
      .set(b)
      .expect(200);
    assert.ok(bookmarks.body.some((p) => p.id === postId));
    await request(app).put(`/api/v1/posts/${postId}/hide`).set(b).expect(200);
    assert.ok(
      !(await request(app).get("/api/v1/posts").set(b)).body.some(
        (p) => p.id === postId,
      ),
    );
    await request(app).delete("/api/v1/posts/hidden/all").set(b).expect(204);
    await request(app)
      .post(`/api/v1/posts/${postId}/comments`)
      .set(b)
      .send({ text: "Thanks for sharing" })
      .expect(201);
    await request(app)
      .post(`/api/v1/posts/${postId}/notes`)
      .set(b)
      .send({ text: "Context", sourceUrl: "https://example.com/source" })
      .expect(201);
    assert.equal(
      (await request(app).get(`/api/v1/posts/${postId}/notes`).set(e)).body
        .length,
      0,
    );
    const anonymous = await request(app)
      .post("/api/v1/posts")
      .set(a)
      .send({ text: "Anonymous test", anonymous: true })
      .expect(201);
    const anonFeed = await request(app).get("/api/v1/posts").set(b);
    assert.equal(
      anonFeed.body.find((p) => p.id === anonymous.body.id).authorId,
      null,
    );
    const connection = await request(app)
      .post("/api/v1/connections")
      .set(a)
      .send({ userId: bob.user.id })
      .expect(201);
    await request(app)
      .patch(`/api/v1/connections/${connection.body.id}`)
      .set(a)
      .send({ status: "accepted" })
      .expect(403);
    await request(app)
      .patch(`/api/v1/connections/${connection.body.id}`)
      .set(b)
      .send({ status: "accepted" })
      .expect(200);
    const ref = await request(app)
      .post("/api/v1/referrals")
      .set(a)
      .send({
        companyId,
        title: "Engineer",
        location: "Remote",
        skills: "Node.js",
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/referrals/${ref.body.id}/requests`)
      .set(a)
      .expect(400);
    await request(app)
      .post(`/api/v1/referrals/${ref.body.id}/requests`)
      .set(b)
      .expect(201);
    await request(app)
      .post(`/api/v1/referrals/${ref.body.id}/requests`)
      .set(b)
      .expect(201);
    assert.equal(
      (
        await query(
          "SELECT COUNT(*) AS n FROM referral_requests WHERE referral_id=?",
          [ref.body.id],
        )
      )[0].n,
      1,
    );
    await request(app)
      .get(`/api/v1/referrals/${ref.body.id}/requests`)
      .set(e)
      .expect(404);
    await request(app)
      .patch(`/api/v1/referrals/${ref.body.id}/requests/${bob.user.id}`)
      .set(a)
      .send({ status: "accepted" })
      .expect(200);
    const conversation = await request(app)
      .post("/api/v1/conversations")
      .set(a)
      .send({ userId: bob.user.id })
      .expect(201);
    const chat = conversation.body.id;
    await request(app)
      .get(`/api/v1/conversations/${chat}/messages`)
      .set(e)
      .expect(404);
    await request(app)
      .post(`/api/v1/conversations/${chat}/messages`)
      .set(e)
      .send({ text: "Intrusion" })
      .expect(404);
    await request(app)
      .post(`/api/v1/conversations/${chat}/messages`)
      .set(a)
      .send({ text: "Hello Bob" })
      .expect(201);
    assert.equal(
      (await request(app).get("/api/v1/conversations").set(b)).body.find(
        (c) => c.id === chat,
      ).unread,
      1,
    );
    await request(app)
      .put(`/api/v1/conversations/${chat}/read`)
      .set(b)
      .expect(204);
    const notifications = await request(app)
      .get("/api/v1/notifications")
      .set(b)
      .expect(200);
    assert.ok(notifications.body.length);
    await request(app)
      .put(`/api/v1/notifications/${notifications.body[0].id}/read`)
      .set(e)
      .expect(404);
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const uploaded = await request(app)
      .post("/api/v1/uploads")
      .set(a)
      .attach("photo", image, "test.png")
      .expect(201);
    await request(app)
      .post("/api/v1/posts")
      .set(b)
      .send({ text: "Stolen photo", uploadId: uploaded.body.id })
      .expect(400);
    await request(app)
      .post("/api/v1/posts")
      .set(a)
      .send({ text: "Photo post", uploadId: uploaded.body.id })
      .expect(201);
    await request(app).get(uploaded.body.url).expect(200);
    await request(app)
      .post("/api/v1/uploads")
      .set(a)
      .attach("photo", Buffer.from("invalid"), "bad.png")
      .expect(400);
    await request(app)
      .post("/api/v1/insights/reports")
      .set(a)
      .send({
        companyId,
        eventDate: "2026-10-01",
        rolesAffected: 25,
        sourceUrl: "https://example.com/event",
      })
      .expect(201);
    const insights = await request(app)
      .get("/api/v1/insights?year=2026")
      .set(a)
      .expect(200);
    assert.ok(insights.body.companies.some((c) => c.id === companyId));
    await request(app)
      .post("/api/v1/uploads")
      .set(a)
      .attach(
        "photo",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
        ),
        "test.svg",
      )
      .expect(400);
    await query(
      "UPDATE sessions SET expires_at=utc_now() - INTERVAL '1 second' WHERE token_hash=?",
      [tokenHash(eve.token)],
    );
    await request(app).get("/api/v1/auth/me").set(e).expect(401);
    await request(app).post("/api/v1/auth/logout").set(a).expect(204);
    await request(app).get("/api/v1/auth/me").set(a).expect(401);
  } finally {
    for (const id of ids) await query("DELETE FROM users WHERE id=?", [id]);
    await query("DELETE FROM companies WHERE id=?", [companyId]);
  }
});

test("database logs correlate requests, redact secrets, preserve audits, and replay an outage", async () => {
  const account = await register("Logging Test");
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: account.email, password: account.password })
    .expect(200);
  const requestId = login.headers["x-request-id"];
  assert.ok(requestId);
  const profile = await request(app)
    .get("/api/v1/auth/me")
    .set(as(account.token))
    .set("Cookie", "private_session=do-not-log-this")
    .expect(200);
  await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Duplicate",
      email: account.email,
      password: account.password,
    })
    .expect(409);
  await flushLogs();
  await flushLogs();
  const [entry] = await query(
    "SELECT * FROM api_request_logs WHERE request_id=?",
    [requestId],
  );
  assert.ok(entry);
  const body =
    typeof entry.request_body === "string"
      ? JSON.parse(entry.request_body)
      : entry.request_body;
  const response =
    typeof entry.response_body === "string"
      ? JSON.parse(entry.response_body)
      : entry.response_body;
  assert.equal(body.password, "[REDACTED]");
  assert.equal(response.token, "[REDACTED]");
  assert.equal(entry.actor_user_id, account.user.id);
  const [profileLog] = await query(
    "SELECT * FROM api_request_logs WHERE request_id=?",
    [profile.headers["x-request-id"]],
  );
  const headers =
    typeof profileLog.request_headers === "string"
      ? JSON.parse(profileLog.request_headers)
      : profileLog.request_headers;
  assert.equal(headers.authorization, "[REDACTED]");
  assert.equal(headers.cookie, "[REDACTED]");
  const sqlLogs = await query(
    "SELECT * FROM database_query_logs WHERE request_id=?",
    [requestId],
  );
  assert.ok(sqlLogs.length >= 2);
  assert.ok(!JSON.stringify(sqlLogs).includes(account.password));
  assert.ok(sqlLogs.some((row) => row.actor_user_id === account.user.id));
  const audits = await query("SELECT * FROM audit_logs WHERE request_id=?", [
    requestId,
  ]);
  assert.equal(audits[0].outcome, "succeeded");
  assert.ok(!JSON.stringify(audits).includes(account.password));
  const rejectedLogs = await query(
    "SELECT id FROM database_query_logs WHERE was_successful=FALSE AND error_code='23505'",
  );
  assert.ok(rejectedLogs.length);
  const marker = `test.outage.${randomUUID()}`;
  await flushLogs();
  await query(
    "ALTER TABLE application_logs RENAME TO application_logs_outage_test",
  );
  try {
    await applicationLog("warn", marker, "Durable outbox test", { test: true });
    await flushLogs();
    await flushLogs();
    const files = (await readdir(config.logOutboxDir)).filter((file) =>
      file.endsWith(".json"),
    );
    const records = await Promise.all(
      files.map(async (file) =>
        JSON.parse(
          await readFile(path.join(config.logOutboxDir, file), "utf8"),
        ),
      ),
    );
    assert.ok(records.some((record) => record.row.event_name === marker));
  } finally {
    await query(
      "ALTER TABLE application_logs_outage_test RENAME TO application_logs",
    );
  }
  await flushLogs();
  await flushLogs();
  const replayed = await query(
    "SELECT id FROM application_logs WHERE event_name=?",
    [marker],
  );
  assert.equal(replayed.length, 1);
});

test("Google provisioning, repeat login, collision protection, explicit linking, and suspension", async () => {
  const email = `google-${randomUUID()}@example.test`;
  const identity = {
    firebaseUserId: randomUUID(),
    providerSubject: randomUUID(),
    email,
    name: "Google Test",
  };
  const identities = new Map([["valid-google", identity]]);
  const googleApp = createApp({
    verifyGoogle: async (token) => {
      const result = identities.get(token);
      if (!result) {
        const { HttpError } = await import("../../src/utils/http.js");
        throw new HttpError(401, "Invalid Google identity");
      }
      return result;
    },
  });
  await request(googleApp)
    .post("/api/v1/auth/google")
    .send({ idToken: "invalid" })
    .expect(401);
  const first = await request(googleApp)
    .post("/api/v1/auth/google")
    .send({ idToken: "valid-google" })
    .expect(200);
  ids.push(first.body.user.id);
  const repeat = await request(googleApp)
    .post("/api/v1/auth/google")
    .send({ idToken: "valid-google" })
    .expect(200);
  assert.equal(repeat.body.user.id, first.body.user.id);
  const [row] = await query("SELECT password_hash FROM users WHERE id=?", [
    first.body.user.id,
  ]);
  assert.equal(row.password_hash, null);
  await request(googleApp)
    .get("/api/v1/auth/me")
    .set(as(first.body.token))
    .expect(200);
  await request(googleApp)
    .post("/api/v1/auth/login")
    .send({ email, password: "random-password-123" })
    .expect(401);
  const native = await register("Google Link Test");
  const linkIdentity = {
    firebaseUserId: randomUUID(),
    providerSubject: randomUUID(),
    email: native.email,
    name: "Linked Account",
  };
  identities.set("google-link", linkIdentity);
  await request(googleApp)
    .post("/api/v1/auth/google")
    .send({ idToken: "google-link" })
    .expect(409);
  await request(googleApp)
    .post("/api/v1/auth/google/link")
    .set(as(first.body.token))
    .send({ idToken: "google-link" })
    .expect(403);
  await request(googleApp)
    .post("/api/v1/auth/google/link")
    .set(as(native.token))
    .send({ idToken: "google-link" })
    .expect(200);
  const linked = await request(googleApp)
    .post("/api/v1/auth/google")
    .send({ idToken: "google-link" })
    .expect(200);
  assert.equal(linked.body.user.id, native.user.id);
  await query("UPDATE users SET account_status='suspended' WHERE id=?", [
    first.body.user.id,
  ]);
  await request(googleApp)
    .get("/api/v1/auth/me")
    .set(as(first.body.token))
    .expect(401);
  await request(googleApp)
    .post("/api/v1/auth/google")
    .send({ idToken: "valid-google" })
    .expect(403);
  await flushLogs();
  await flushLogs();
  const [stored] = await query(
    "SELECT request_body FROM api_request_logs WHERE request_id=?",
    [first.headers["x-request-id"]],
  );
  const body =
    typeof stored.request_body === "string"
      ? JSON.parse(stored.request_body)
      : stored.request_body;
  assert.equal(body.idToken, "[REDACTED]");
});
