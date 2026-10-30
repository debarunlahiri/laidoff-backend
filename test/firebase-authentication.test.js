import test from "node:test";
import assert from "node:assert/strict";
import { googleIdentityFromClaims } from "../src/services/firebase-authentication.js";

test("only verified Google sign-in claims can provision an identity", () => {
  const claims = {
    uid: "firebase-user",
    email: "Test@Example.com",
    email_verified: true,
    name: "Test User",
    firebase: {
      sign_in_provider: "google.com",
      identities: { "google.com": ["google-subject"] },
    },
  };
  assert.deepEqual(googleIdentityFromClaims(claims), {
    firebaseUserId: "firebase-user",
    providerSubject: "google-subject",
    email: "test@example.com",
    name: "Test User",
  });
  assert.throws(() =>
    googleIdentityFromClaims({ ...claims, email_verified: false }),
  );
  assert.throws(() =>
    googleIdentityFromClaims({
      ...claims,
      firebase: { ...claims.firebase, sign_in_provider: "password" },
    }),
  );
  assert.throws(() =>
    googleIdentityFromClaims({
      ...claims,
      firebase: { sign_in_provider: "google.com", identities: {} },
    }),
  );
});
