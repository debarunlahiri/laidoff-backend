import { HttpError } from "../utils/http.js";
import { getEmailSettings } from "../services/email-settings.js";

const utcMs = (value) =>
  value instanceof Date
    ? value.getTime()
    : Date.parse(
        /[zZ]$|[+-]\d{2}:\d{2}$/.test(value)
          ? value
          : `${String(value).replace(" ", "T")}Z`,
      );

// What the frontend needs to know about a member's verification status.
export async function verificationInfo({ emailVerified, createdAt, isAdmin }) {
  const settings = await getEmailSettings();
  const required = !emailVerified && !isAdmin && settings.verificationRequired;
  const deadline = required
    ? utcMs(createdAt) + settings.verificationGraceHours * 3600000
    : null;
  return {
    emailVerified: Boolean(emailVerified),
    verificationRequired: required,
    emailVerificationDeadline: deadline
      ? new Date(deadline).toISOString()
      : null,
    verificationExpired: required && Date.now() > deadline,
  };
}

// Unverified members: read-only for the grace period (default 24 h), then nothing
// except the verification endpoints (which live outside this gate).
export async function enforceVerification(req) {
  const user = req.user;
  if (!user?.id) return;
  // Account help remains available even when email verification has expired.
  if (/^\/support(?:\/|$)/.test(req.path ?? "")) return;
  const info = await verificationInfo(user);
  if (!info.verificationRequired) return;
  if (info.verificationExpired)
    throw new HttpError(
      403,
      "Your free preview has ended. Please verify your email to continue.",
      "EMAIL_VERIFICATION_REQUIRED",
    );
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
    throw new HttpError(
      403,
      "Please verify your email before you do this. We’ve sent you a link.",
      "EMAIL_NOT_VERIFIED",
    );
}
