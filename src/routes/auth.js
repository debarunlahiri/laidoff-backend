import { createSession } from "../services/authentication-sessions.js";
import { verifyGoogleIdentity } from "../services/firebase-authentication.js";
import {
  signInWithGoogleIdentity,
  linkGoogleIdentity,
} from "../services/google-authentication.js";
import { googleAuthenticationQueries } from "../queries/google-authentication.queries.js";
import { authenticationQueries } from "../queries/authentication.queries.js";
import { logContext } from "../log-context.js";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { query, transaction } from "../db.js";
import { hashPassword, verifyPassword } from "../security.js";
import { authenticate } from "../auth.js";
import { HttpError, text } from "../http.js";
import { passwordProblem } from "../password-strength.js";
import { verificationInfo } from "../verification-gate.js";
import {
  sendRegistrationEmails,
  sendGoogleWelcomeEmail,
  verifyEmailToken,
  resendVerification,
} from "../services/email-verification.js";
export function createAuthenticationRouter({
  verifyGoogle = verifyGoogleIdentity,
} = {}) {
  const auth = Router();
  const credentials = z.object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  });
  auth.post("/register", async (req, res) => {
    const body = credentials.extend({ name: text(100) }).parse(req.body);
    const weak = passwordProblem(body.password, body);
    if (weak) throw new HttpError(400, weak);
    const userId = randomUUID();
    const passwordHash = await hashPassword(body.password);
    const result = await transaction(async (c) => {
      await query(
        authenticationQueries.createUser,
        [userId, body.email, passwordHash, body.name, "[]"],
        c,
      );
      return createSession(userId, req, c);
    });
    if (logContext.getStore()) logContext.getStore().userId = userId;
    // Verification link + welcome greeting; sent in the background after the account is committed.
    sendRegistrationEmails({ id: userId, email: body.email, name: body.name });
    res.status(201).json({
      ...result,
      user: {
        id: userId,
        email: body.email,
        name: body.name,
        ...(await verificationInfo({
          emailVerified: false,
          createdAt: new Date(),
          isAdmin: false,
        })),
      },
    });
  });
  auth.post("/verify-email", async (req, res) => {
    const { token } = z
      .object({ token: z.string().min(20).max(200) })
      .parse(req.body);
    res.json(await verifyEmailToken(token));
  });
  auth.post("/resend-verification", authenticate, async (req, res) => {
    res.json(await resendVerification(req.user.id));
  });
  auth.post("/login", async (req, res) => {
    const body = credentials.parse(req.body);
    const rows = await query(authenticationQueries.findLoginAccount, [
      body.email,
    ]);
    // Run the same expensive operation even for unknown accounts.
    const fallback = "00000000000000000000000000000000:" + "00".repeat(64);
    const valid = await verifyPassword(
      body.password,
      rows[0]?.password_hash ?? fallback,
    );
    if (
      !rows.length ||
      !rows[0].password_hash ||
      !valid ||
      rows[0].account_status !== "active"
    )
      throw new HttpError(401, "Invalid email or password");
    const { password_hash, account_status, ...user } = rows[0];
    if (logContext.getStore()) logContext.getStore().userId = user.id;
    await query(authenticationQueries.recordLogin, [user.id]);
    res.json({
      ...(await createSession(user.id, req)),
      user: { ...user, ...(await verificationInfo(user)) },
    });
  });
  auth.post("/logout", authenticate, async (req, res) => {
    await query(authenticationQueries.revokeSession, [req.tokenHash]);
    res.status(204).end();
  });
  auth.get("/me", authenticate, async (req, res) => {
    const [user] = await query(authenticationQueries.findCurrentProfile, [
      req.user.id,
    ]);
    res.json({ ...user, ...(await verificationInfo(user)) });
  });

  auth.post("/google", async (req, res) => {
    const { idToken } = z
      .object({ idToken: z.string().min(1).max(20000) })
      .parse(req.body);
    const identity = await verifyGoogle(idToken);
    const { created, ...result } = await signInWithGoogleIdentity(
      identity,
      req,
    );
    if (logContext.getStore()) logContext.getStore().userId = result.user.id;
    if (created) sendGoogleWelcomeEmail(result.user);
    res.json(result);
  });
  auth.post("/google/link", authenticate, async (req, res) => {
    const { idToken } = z
      .object({ idToken: z.string().min(1).max(20000) })
      .parse(req.body);
    res.json(
      await linkGoogleIdentity(await verifyGoogle(idToken), req.user.id),
    );
  });
  auth.get("/providers", authenticate, async (req, res) =>
    res.json(
      await query(googleAuthenticationQueries.listIdentities, [req.user.id]),
    ),
  );
  return auth;
}
