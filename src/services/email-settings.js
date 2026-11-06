import { z } from "zod";
import { config } from "../config.js";
import { query } from "../db.js";
import { adminQueries as sql } from "../queries/admin.queries.js";

// Admin-editable values. Environment variables provide the defaults.
const defaults = () => ({
  emailsEnabled: true,
  welcomeEnabled: true,
  // Unverified members get read-only access for N hours, then are locked out.
  verificationRequired: true,
  verificationGraceHours: 24,
  fromName: config.MAIL_FROM_NAME,
  verificationHours: config.EMAIL_VERIFICATION_HOURS,
  remindersEnabled: config.VERIFICATION_REMINDERS_ENABLED,
  reminderAfterHours: config.VERIFICATION_REMINDER_AFTER_HOURS,
  reminderIntervalHours: config.VERIFICATION_REMINDER_INTERVAL_HOURS,
  reminderMax: config.VERIFICATION_REMINDER_MAX,
});
export const emailSettingsSchema = z
  .strictObject({
    emailsEnabled: z.boolean(),
    welcomeEnabled: z.boolean(),
    verificationRequired: z.boolean(),
    verificationGraceHours: z.number().int().min(1).max(720),
    fromName: z.string().trim().min(1).max(80),
    verificationHours: z.number().int().min(1).max(168),
    remindersEnabled: z.boolean(),
    reminderAfterHours: z.number().int().min(1).max(720),
    reminderIntervalHours: z.number().int().min(1).max(720),
    reminderMax: z.number().int().min(0).max(20),
  })
  .partial();

let cache = null;
let loadedAt = 0;
export function clearEmailSettingsCache() {
  cache = null;
}
export async function getEmailSettings() {
  if (cache && Date.now() - loadedAt < 15000) return cache;
  let rows = [];
  try {
    rows = await query(sql.listSettings);
  } catch {
    // Table missing or database briefly unavailable: fall back to defaults.
  }
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const parsed = emailSettingsSchema.safeParse(stored);
  cache = { ...defaults(), ...(parsed.success ? parsed.data : {}) };
  loadedAt = Date.now();
  return cache;
}
export async function saveEmailSettings(patch, adminId) {
  for (const [key, value] of Object.entries(patch))
    await query(sql.saveSetting, [key, JSON.stringify(value), adminId]);
  clearEmailSettingsCache();
  return getEmailSettings();
}
export async function resetEmailSettings() {
  await query(sql.deleteSettings);
  clearEmailSettingsCache();
  return getEmailSettings();
}
