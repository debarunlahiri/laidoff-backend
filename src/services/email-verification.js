import { randomUUID } from "node:crypto";
import { query, transaction } from "../db.js";
import { applicationLog } from "../logger.js";
import { HttpError } from "../http.js";
import { newToken, tokenHash } from "../security.js";
import { emailVerificationQueries as sql } from "../queries/email-verification.queries.js";
import { sendMail, emailConfigured } from "./email.js";
import { buildEmail } from "./email-templates.js";
import { getEmailSettings } from "./email-settings.js";

// Replaces any earlier unused link, so only the newest email works.
async function issueToken(user, hours) {
  const token = newToken();
  await transaction(async (c) => {
    await query(sql.deleteUnusedTokens, [user.id], c);
    await query(
      sql.createToken,
      [
        randomUUID(),
        user.id,
        tokenHash(token),
        user.email,
        new Date(Date.now() + hours * 3600000),
      ],
      c,
    );
  });
  return token;
}

async function sendLinkEmail(template, user) {
  const { verificationHours: hours } = await getEmailSettings();
  const token = await issueToken(user, hours);
  return sendMail({
    to: user.email,
    template,
    userId: user.id,
    ...(await buildEmail(template, user, { token, hours })),
  });
}
export const sendVerificationEmail = (user) =>
  sendLinkEmail("verification", user);
export const sendReminderEmail = (user) => sendLinkEmail("reminder", user);

export async function sendWelcomeEmail(user, verified = false) {
  const settings = await getEmailSettings();
  if (!settings.welcomeEnabled) return false;
  return sendMail({
    to: user.email,
    template: "welcome",
    userId: user.id,
    ...(await buildEmail("welcome", user, { verified })),
  });
}

// After registering: verification link + welcome greeting. Never blocks or fails the request.
export function sendRegistrationEmails(user) {
  void (async () => {
    await sendVerificationEmail(user);
    await sendWelcomeEmail(user, false);
  })().catch((error) =>
    applicationLog(
      "error",
      "email.registration_failed",
      "Registration emails failed",
      {},
      error,
    ),
  );
}

// New Google accounts are already verified, so they only get the greeting.
export function sendGoogleWelcomeEmail(user) {
  void sendWelcomeEmail(user, true).catch((error) =>
    applicationLog(
      "error",
      "email.welcome_failed",
      "Welcome email failed",
      {},
      error,
    ),
  );
}

export async function verifyEmailToken(token) {
  return transaction(async (c) => {
    const [row] = await query(sql.findToken, [tokenHash(token)], c);
    if (!row || row.accountStatus !== "active")
      throw new HttpError(
        400,
        "This verification link is invalid or has expired",
      );
    if (row.verifiedAt) return { verified: true, alreadyVerified: true };
    if (row.usedAt || !row.isCurrent)
      throw new HttpError(
        400,
        "This verification link is invalid or has expired",
      );
    await query(sql.markTokenUsed, [row.id], c);
    await query(sql.markEmailVerified, [row.userId], c);
    return { verified: true, alreadyVerified: false };
  });
}

const RESEND_COOLDOWN_SECONDS = 60;
export async function resendVerification(userId) {
  const [user] = await query(sql.findAccount, [userId]);
  if (!user) throw new HttpError(404, "Account not found");
  if (user.verifiedAt) return { verified: true, sent: false };
  const [{ seconds } = {}] = await query(sql.lastTokenAge, [userId]);
  if (seconds != null && seconds < RESEND_COOLDOWN_SECONDS)
    throw new HttpError(
      429,
      `Please wait ${RESEND_COOLDOWN_SECONDS - seconds} seconds before requesting another email`,
    );
  const sent = await sendVerificationEmail(user);
  if (!sent)
    throw new HttpError(
      503,
      "The verification email could not be sent right now. Please try again later",
    );
  return { verified: false, sent: true };
}

// ---- Reminder job: emails unverified accounts a few times, then stops. ----
const TICK_MS = 15 * 60000;
const BATCH = 25;
let timer;
export async function runReminderPass() {
  const settings = await getEmailSettings();
  if (
    !emailConfigured() ||
    !settings.emailsEnabled ||
    !settings.remindersEnabled ||
    !settings.reminderMax
  )
    return 0;
  const due = await query(sql.claimDueReminders, [
    settings.reminderMax,
    settings.reminderAfterHours,
    settings.reminderIntervalHours,
    BATCH,
  ]);
  for (const user of due)
    if (!(await sendReminderEmail(user)))
      await query(sql.releaseReminder, [user.id]);
  await query(sql.deleteExpiredTokens);
  return due.length;
}
export function startVerificationReminders() {
  // Always scheduled: admins can switch reminders on/off without a restart.
  const tick = () =>
    runReminderPass().catch((error) =>
      applicationLog(
        "error",
        "email.reminder_pass_failed",
        "Reminder pass failed",
        {},
        error,
      ),
    );
  setTimeout(tick, 30000).unref();
  timer = setInterval(tick, TICK_MS);
  timer.unref();
}
export const stopVerificationReminders = () => clearInterval(timer);
