import test from "node:test";
import assert from "node:assert/strict";
import { redact, logJson } from "../src/utils/logger.js";

test("redaction handles nested credentials, header variants, binary values, and cycles", () => {
  const object = {
    password: "secret",
    nested: {
      refreshToken: "token",
      authorization: "Bearer abc",
      apiKey: "key",
      normal: "kept",
    },
    binary: Buffer.from("private"),
  };
  object.self = object;
  const safe = redact(object);
  assert.equal(safe.password, "[REDACTED]");
  assert.equal(safe.nested.refreshToken, "[REDACTED]");
  assert.equal(safe.nested.apiKey, "[REDACTED]");
  assert.equal(safe.nested.normal, "kept");
  assert.deepEqual(safe.binary, { binaryBytes: 7 });
  assert.equal(safe.self, "[CIRCULAR]");
  assert.equal(
    redact("Auth Bearer very-secret-value"),
    "Auth Bearer [REDACTED]",
  );
});
test("oversized structured log payloads remain valid JSON and expose truncation", () => {
  const payload = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`field${i}`, "a".repeat(16000)]),
  );
  const result = JSON.parse(logJson(payload));
  assert.equal(result.truncated, true);
  assert.ok(result.originalCharacters > 64000);
});
