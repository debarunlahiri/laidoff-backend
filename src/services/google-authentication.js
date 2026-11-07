import { randomUUID } from "node:crypto";
import { query, transaction } from "../db/db.js";
import { googleAuthenticationQueries as sql } from "../queries/google-authentication.queries.js";
import { authenticationQueries } from "../queries/authentication.queries.js";
import { createSession } from "./authentication-sessions.js";
import { HttpError } from "../utils/http.js";

async function insertIdentity(identity, userId, connection) {
  const id = randomUUID();
  await query(
    sql.createIdentity,
    [
      id,
      userId,
      identity.providerSubject,
      identity.firebaseUserId,
      identity.email,
    ],
    connection,
  );
  return id;
}
// Uploaded photos are stored as /uploads/<file>; provider photos are absolute URLs.
const hasCustomPhoto = (url) =>
  typeof url === "string" && url.startsWith("/uploads/");
export async function signInWithGoogleIdentity(identity, req) {
  return transaction(async (connection) => {
    const [existing] = await query(
      sql.findIdentity,
      [identity.firebaseUserId, identity.providerSubject],
      connection,
    );
    let user;
    let identityId;
    let created = false;
    if (existing) {
      if (existing.accountStatus !== "active")
        throw new HttpError(403, "This account is not active");
      // A provider email change must not silently overwrite the local account's address.
      user = {
        id: existing.userId,
        name: existing.name,
        email: existing.email,
        profileImageUrl: hasCustomPhoto(existing.profileImageUrl)
          ? existing.profileImageUrl
          : (identity.pictureUrl ?? existing.profileImageUrl),
      };
      identityId = existing.identityId;
      // Keep a photo the member uploaded; only refresh a Google-provided one.
      if (
        identity.pictureUrl &&
        !hasCustomPhoto(existing.profileImageUrl) &&
        identity.pictureUrl !== existing.profileImageUrl
      )
        await query(
          sql.updateProfileImage,
          [identity.pictureUrl, user.id],
          connection,
        );
      await query(
        sql.recordIdentityLogin,
        [identity.email, identityId],
        connection,
      );
    } else {
      const [collision] = await query(
        sql.findEmailAccount,
        [identity.email],
        connection,
      );
      if (collision)
        throw new HttpError(
          409,
          "This email already has an account. Sign in with your password, then link Google from your account menu.",
        );
      user = {
        id: randomUUID(),
        email: identity.email,
        name: identity.name,
        profileImageUrl: identity.pictureUrl,
      };
      created = true;
      await query(
        sql.createGoogleUser,
        [user.id, user.email, user.name, user.profileImageUrl],
        connection,
      );
      identityId = await insertIdentity(identity, user.id, connection);
    }
    await query(authenticationQueries.recordLogin, [user.id], connection);
    return {
      ...(await createSession(
        user.id,
        req,
        connection,
        "google.com",
        identityId,
      )),
      user: { ...user, emailVerified: true },
      created,
    };
  });
}
export async function linkGoogleIdentity(identity, userId) {
  return transaction(async (connection) => {
    const [account] = await query(
      sql.findEmailAccount,
      [identity.email],
      connection,
    );
    if (!account || account.id !== userId || account.accountStatus !== "active")
      throw new HttpError(
        403,
        "Use the Google account with the same email as your signed-in account",
      );
    const [existing] = await query(
      sql.findIdentity,
      [identity.firebaseUserId, identity.providerSubject],
      connection,
    );
    if (existing && existing.userId !== userId)
      throw new HttpError(409, "This Google account is already linked");
    if (!existing) await insertIdentity(identity, userId, connection);
    await query(sql.verifyEmail, [userId], connection);
    if (identity.pictureUrl)
      await query(
        sql.updateProfileImage,
        [identity.pictureUrl, userId],
        connection,
      );
    return { linked: true, provider: "google.com" };
  });
}
