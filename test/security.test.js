import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  newToken,
  tokenHash,
} from "../src/security.js";
import { paging, uuid } from "../src/http.js";
test("passwords use independent salts and reject incorrect values", async () => {
  const a = await hashPassword("a long test password");
  const b = await hashPassword("a long test password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("a long test password", a), true);
  assert.equal(await verifyPassword("wrong", a), false);
});
test("session tokens are random and stored as hashes", () => {
  const a = newToken();
  assert.equal(a.length, 43);
  assert.notEqual(a, newToken());
  assert.equal(tokenHash(a).length, 64);
  assert.notEqual(tokenHash(a), a);
});
test("pagination and resource IDs reject SQL fragments and oversized requests", () => {
  assert.throws(() => paging.parse({ limit: "1; DROP TABLE posts" }));
  assert.throws(() => paging.parse({ limit: 101 }));
  assert.throws(() => uuid("invalid"));
  assert.deepEqual(paging.parse({}), { limit: 20, offset: 0 });
});
