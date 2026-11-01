import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { config } from "../config.js";
import { HttpError } from "../http.js";

export async function verifyGoogleIdentity(idToken) {
  if (!config.FIREBASE_PROJECT_ID)
    throw new HttpError(503, "Google sign-in is not configured yet");
  if (
    config.NODE_ENV === "production" &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new HttpError(503, "Authentication configuration is invalid");
  const app =
    getApps().find((app) => app.name === "laidoff-auth") ??
    initializeApp(
      {
        projectId: config.FIREBASE_PROJECT_ID,
        credential: applicationDefault(),
      },
      "laidoff-auth",
    );
  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(idToken, true);
  } catch (error) {
    if (
      [
        "auth/id-token-expired",
        "auth/id-token-revoked",
        "auth/argument-error",
        "auth/invalid-id-token",
        "auth/user-disabled",
        "auth/user-not-found",
      ].includes(error.code)
    )
      throw new HttpError(
        401,
        "Google session expired or invalid. Please sign in again.",
      );
    throw new HttpError(
      503,
      "Google sign-in could not be verified. Please try again later.",
    );
  }
  return googleIdentityFromClaims(decoded);
}

// Only keep https images served from Google's own image hosts.
export function safePictureUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      /(^|\.)googleusercontent\.com$/.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function googleIdentityFromClaims(decoded) {
  const subject = decoded.firebase?.identities?.["google.com"]?.[0];
  if (
    decoded.firebase?.sign_in_provider !== "google.com" ||
    !decoded.email_verified ||
    typeof decoded.email !== "string" ||
    typeof subject !== "string" ||
    typeof decoded.uid !== "string" ||
    !decoded.email ||
    !subject ||
    !decoded.uid
  )
    throw new HttpError(401, "A verified Google account is required");
  const email = decoded.email.toLowerCase();
  if (email.length > 254 || subject.length > 255 || decoded.uid.length > 128)
    throw new HttpError(401, "Invalid Google account identity");
  return {
    pictureUrl: safePictureUrl(decoded.picture),
    firebaseUserId: decoded.uid,
    providerSubject: subject,
    email,
    name: (decoded.name || email.split("@")[0]).slice(0, 100),
  };
}
