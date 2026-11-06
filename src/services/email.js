import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { config } from "../config.js";
import { query } from "../db.js";
import { applicationLog } from "../logger.js";
import { adminQueries as sql } from "../queries/admin.queries.js";
import { getEmailSettings } from "./email-settings.js";

export const emailConfigured = () =>
  Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD);

let transporter;
function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE, // true for 465 (implicit TLS)
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transporter;
}

async function logEmail({ userId, to, template, subject, status, errorCode }) {
  try {
    await query(sql.insertLog, [
      randomUUID(),
      userId ?? null,
      to,
      template ?? "other",
      String(subject).slice(0, 300),
      status,
      errorCode ? String(errorCode).slice(0, 60) : null,
    ]);
  } catch {
    // The delivery log is best-effort; never let it break sending.
  }
}

// Sends one message and records it in the email log. Returns false (never throws)
// so email trouble can't break an API request.
export async function sendMail({ to, subject, html, text, template, userId }) {
  const settings = await getEmailSettings();
  const record = (status, errorCode) =>
    logEmail({ userId, to, template, subject, status, errorCode });
  if (!settings.emailsEnabled || !emailConfigured()) {
    void applicationLog(
      "warn",
      "email.skipped",
      "Email not sent (disabled or SMTP not configured)",
      { template },
    );
    await record(
      "skipped",
      settings.emailsEnabled ? "smtp_not_configured" : "disabled",
    );
    return false;
  }
  try {
    const from = config.MAIL_FROM || config.SMTP_USER;
    await getTransporter().sendMail({
      from: { name: settings.fromName, address: from },
      to,
      subject,
      html,
      text,
    });
    void applicationLog("info", "email.sent", "Email sent", { template });
    await record("sent");
    return true;
  } catch (error) {
    void applicationLog(
      "error",
      "email.failed",
      "Email could not be sent",
      { template, errorCode: error.code ?? error.name },
      error,
    );
    await record("failed", error.code ?? error.name);
    return false;
  }
}

export async function closeMailer() {
  transporter?.close();
}
