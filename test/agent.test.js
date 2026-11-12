import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { keyPattern, postBody, reportBody } from "../src/routes/agent.js";

const app = createApp();
const today = new Date().toISOString().slice(0, 10);
const validReport = {
  company: "Acme",
  eventDate: today,
  rolesAffected: 400,
  sourceUrl: "https://example.com/news",
};

test("the agent API describes itself without a key", async () => {
  const response = await request(app).get("/api/v1/agent").expect(200);
  assert.equal(response.body.version, "v1");
  assert.ok(response.body.endpoints.some((e) => e.path === "/posts"));
  assert.equal(response.headers["cache-control"], "no-store");
});

test("agent endpoints reject missing, malformed and member-session credentials", async () => {
  const memberToken = "A".repeat(43); // shaped like a member session token
  for (const path of ["/topics", "/companies", "/insights"]) {
    const response = await request(app).get(`/api/v1/agent${path}`).expect(401);
    assert.equal(response.body.error.code, "UNAUTHORIZED");
  }
  await request(app)
    .post("/api/v1/agent/posts")
    .set("Authorization", `Bearer ${memberToken}`)
    .send({ text: "hello" })
    .expect(401);
  await request(app)
    .post("/api/v1/agent/posts")
    .set("X-API-Key", "lak_short")
    .send({ text: "hello" })
    .expect(401);
  await request(app).get("/api/v1/agent/nothing-here").expect(401); // unknown paths do not reveal themselves without a key
});

test("agent keys have a fixed, recognisable format", () => {
  assert.ok(keyPattern.test(`lak_${"a".repeat(43)}`));
  assert.ok(!keyPattern.test("a".repeat(43)));
  assert.ok(!keyPattern.test(`lak_${"a".repeat(42)}`));
  assert.ok(!keyPattern.test(`lak_${"a".repeat(43)}!`));
});

test("post bodies are validated strictly", () => {
  assert.equal(postBody.parse({ text: " hi " }).text, "hi");
  assert.equal(postBody.parse({ text: "hi" }).topic, "General discussion");
  assert.throws(() => postBody.parse({}));
  assert.throws(() => postBody.parse({ text: "   " }));
  assert.throws(() => postBody.parse({ text: "x".repeat(5001) }));
  assert.throws(() => postBody.parse({ text: "hi", topic: "Gossip" }));
  assert.throws(() => postBody.parse({ text: "hi", anonymous: true }));
  assert.throws(() => postBody.parse({ text: "hi", companyId: "not-a-uuid" }));
});

test("report bodies need a company, a real past date and an http(s) source", () => {
  assert.equal(reportBody.parse(validReport).headcount, null);
  assert.throws(() => reportBody.parse({ ...validReport, company: undefined }));
  assert.throws(() =>
    reportBody.parse({ ...validReport, eventDate: "2999-01-01" }),
  );
  assert.throws(() =>
    reportBody.parse({ ...validReport, eventDate: "yesterday" }),
  );
  assert.throws(() =>
    reportBody.parse({ ...validReport, eventDate: "1999-12-31" }),
  );
  assert.throws(() => reportBody.parse({ ...validReport, rolesAffected: 0 }));
  assert.throws(() => reportBody.parse({ ...validReport, rolesAffected: 1.5 }));
  assert.throws(() => reportBody.parse({ ...validReport, headcount: -1 }));
  assert.throws(() =>
    reportBody.parse({ ...validReport, sourceUrl: "javascript:alert(1)" }),
  );
  assert.throws(() =>
    reportBody.parse({ ...validReport, sourceUrl: "ftp://example.com/a" }),
  );
  assert.throws(() => reportBody.parse({ ...validReport, verified: true }));
});
