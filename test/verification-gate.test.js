import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceVerification,
  verificationInfo,
} from "../src/middleware/verification-gate.js";
import {
  cacheResponses,
  clearResponseCache,
} from "../src/middleware/response-cache.js";

const hoursAgo = (h) => new Date(Date.now() - h * 3600000);
const user = (over) => ({
  id: "u1",
  emailVerified: false,
  isAdmin: false,
  createdAt: hoursAgo(1),
  ...over,
});
const code = async (req) => {
  try {
    await enforceVerification(req);
    return "ok";
  } catch (error) {
    return `${error.status}:${error.appCode}`;
  }
};

test("unverified members can read but not change anything during the first 24 hours", async () => {
  assert.equal(await code({ method: "GET", user: user() }), "ok");
  assert.equal(
    await code({ method: "POST", user: user() }),
    "403:EMAIL_NOT_VERIFIED",
  );
  assert.equal(
    await code({ method: "DELETE", user: user() }),
    "403:EMAIL_NOT_VERIFIED",
  );
});

test("after 24 hours an unverified member is locked out of everything", async () => {
  const old = user({ createdAt: hoursAgo(25) });
  assert.equal(
    await code({ method: "GET", user: old }),
    "403:EMAIL_VERIFICATION_REQUIRED",
  );
  assert.equal(
    await code({ method: "POST", user: old }),
    "403:EMAIL_VERIFICATION_REQUIRED",
  );
});

test("verified members, admins and anonymous visitors are not gated", async () => {
  const old = { createdAt: hoursAgo(500) };
  assert.equal(
    await code({ method: "POST", user: user({ ...old, emailVerified: true }) }),
    "ok",
  );
  assert.equal(
    await code({ method: "POST", user: user({ ...old, isAdmin: true }) }),
    "ok",
  );
  assert.equal(await code({ method: "GET", user: { id: null } }), "ok");
});

test("verification info reports the deadline", async () => {
  const info = await verificationInfo(user({ createdAt: hoursAgo(2) }));
  assert.equal(info.verificationRequired, true);
  assert.equal(info.verificationExpired, false);
  const hoursLeft =
    (Date.parse(info.emailVerificationDeadline) - Date.now()) / 3600000;
  assert.ok(hoursLeft > 21.9 && hoursLeft < 22.1);
  assert.equal(
    (await verificationInfo(user({ emailVerified: true })))
      .verificationRequired,
    false,
  );
});

test("response cache serves repeats from memory and can be cleared", () => {
  clearResponseCache();
  const mw = cacheResponses(60000);
  const run = () => {
    const sent = [];
    const res = {
      statusCode: 200,
      headers: {},
      set(k, v) {
        this.headers[k] = v;
        return this;
      },
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        sent.push(b);
        return this;
      },
    };
    mw({ method: "GET", originalUrl: "/api/v1/x" }, res, () =>
      res.json({ n: 1 }),
    );
    return res;
  };
  assert.equal(run().headers["X-Cache"], "MISS");
  assert.equal(run().headers["X-Cache"], "HIT");
  clearResponseCache("/x");
  assert.equal(run().headers["X-Cache"], "MISS");
});
