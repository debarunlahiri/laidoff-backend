import test from "node:test";
import assert from "node:assert/strict";
import {
  googleIdentityFromClaims,
  safePictureUrl,
} from "../src/services/firebase-authentication.js";

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
    pictureUrl: null,
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

test("only https Google-hosted profile pictures are kept", () => {
  const google = "https://lh3.googleusercontent.com/a/abc=s96-c";
  assert.equal(safePictureUrl(google), google);
  for (const bad of [
    "http://lh3.googleusercontent.com/a/abc",
    "https://evil.example/a.png",
    "https://googleusercontent.com.evil.example/a.png",
    "javascript:alert(1)",
    "not a url",
    undefined,
    42,
  ])
    assert.equal(safePictureUrl(bad), null);
});
