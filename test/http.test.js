import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
const app = createApp();
test("health works without a database", async () => {
  const response = await request(app).get("/health").expect(200);
  assert.equal(response.body.status, "ok");
  assert.ok(response.headers["x-content-type-options"]);
});
test("protected resources reject missing and malformed credentials", async () => {
  await request(app).get("/api/v1/posts").expect(401);
  await request(app)
    .get("/api/v1/conversations")
    .set("Authorization", "Bearer invalid")
    .expect(401);
});
test("CORS rejects unapproved origins", async () => {
  await request(app)
    .get("/health")
    .set("Origin", "https://untrusted.example")
    .expect(403);
  await request(app)
    .get("/health")
    .set("Origin", "http://localhost:3000")
    .expect(200);
});
test("registration validates input before database access", async () => {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "invalid", password: "short" })
    .expect(400);
});
test("invalid JSON returns a structured error", async () => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Content-Type", "application/json")
    .send("{bad")
    .expect(400);
  assert.equal(response.body.error.message, "Invalid JSON");
});
