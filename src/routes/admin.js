import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { query } from "../db/db.js";
import { HttpError, page, text, uuid } from "../utils/http.js";
import { config } from "../config/config.js";
import { adminQueries as sql } from "../queries/admin.queries.js";
import { adminSupport } from "./support.js";
import { adminConsole } from "./admin-console.js";
import { emailConfigured, sendMail } from "../services/email.js";
import {
  emailSettingsSchema,
  getEmailSettings,
  resetEmailSettings,
  saveEmailSettings,
} from "../services/email-settings.js";
import {
  clearTemplateCache,
  defaultTemplates,
  effectiveContent,
  emailVariables,
  loadStoredTemplates,
  renderEmail,
  templateKeys,
  templateMeta,
} from "../services/email-templates.js";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
} from "../services/email-verification.js";

export const admin = Router();

// Every admin route needs an active administrator account. Everyone else gets the
// exact response an unknown URL gets, so the admin API's existence isn't revealed.
admin.use(
  rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { message: "Too many requests" } },
  }),
  async (req, res, next) => {
    const [row] = await query(sql.isAdmin, [req.user.id]);
    if (!row?.isAdmin)
      return res.status(404).json({ error: { message: "Route not found" } });
    next();
  },
);

admin.use("/support", adminSupport);
admin.use(adminConsole);

const like = (value) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const templateKey = (value) => {
  if (!templateKeys.includes(value))
    throw new HttpError(404, "Unknown template");
  return value;
};
const str = (max) => z.string().max(max);
const contentSchema = z
  .strictObject({
    subject: str(200),
    preheader: str(200),
    heading: str(200),
    intro: str(3000),
    buttonLabel: str(60),
    footerNote: str(1000),
    notice: str(1000),
    signoff: str(300),
    featuresTitle: str(100),
    stepsTitle: str(100),
    features: z
      .array(z.strictObject({ icon: str(40), title: str(100), text: str(500) }))
      .max(8),
    steps: z.array(z.strictObject({ title: str(100), text: str(500) })).max(6),
    htmlOverride: str(60000),
  })
  .partial();

// ---------- Overview ----------
admin.get("/overview", async (_req, res) => {
  const [users] = await query(sql.userStats);
  const byStatus = Object.fromEntries(
    (await query(sql.emailStats)).map((r) => [r.status, r.total]),
  );
  res.json({
    users,
    smtpConfigured: emailConfigured(),
    emailsLast7Days: {
      sent: byStatus.sent ?? 0,
      failed: byStatus.failed ?? 0,
      skipped: byStatus.skipped ?? 0,
    },
    sentByTemplate: await query(sql.emailStatsByTemplate),
  });
});

// ---------- Templates ----------
admin.get("/email/templates", async (_req, res) => {
  const stored = await loadStoredTemplates();
  res.json(
    templateKeys.map((key) => ({
      key,
      ...templateMeta[key],
      customized: Boolean(stored[key]),
      updatedAt: stored[key]?.updatedAt ?? null,
      content: effectiveContent(key, stored[key]?.content),
      defaults: defaultTemplates[key],
    })),
  );
});
admin.put("/email/templates/:key", async (req, res) => {
  const key = templateKey(req.params.key);
  const content = contentSchema.parse(req.body);
  await query(sql.saveTemplate, [key, JSON.stringify(content), req.user.id]);
  clearTemplateCache();
  res.status(204).end();
});
admin.delete("/email/templates/:key", async (req, res) => {
  await query(sql.deleteTemplate, [templateKey(req.params.key)]);
  clearTemplateCache();
  res.status(204).end();
});

const sampleVars = (name = "Alex Morgan", email = "alex@example.com") =>
  emailVariables({ name, email });
admin.post("/email/templates/:key/preview", async (req, res) => {
  const key = templateKey(req.params.key);
  const body = z
    .object({
      content: contentSchema.optional(),
      verified: z.boolean().optional(),
    })
    .parse(req.body ?? {});
  const stored = (await loadStoredTemplates())[key]?.content;
  res.json(
    renderEmail(
      key,
      effectiveContent(key, body.content ?? stored),
      sampleVars(),
      {
        verified: body.verified ?? false,
      },
    ),
  );
});
admin.post("/email/templates/:key/test", async (req, res) => {
  const key = templateKey(req.params.key);
  const body = z
    .object({
      to: z.email().max(254).optional(),
      content: contentSchema.optional(),
    })
    .parse(req.body ?? {});
  const [me] = await query(sql.userEmail, [req.user.id]);
  const to = body.to ?? me.email;
  const stored = (await loadStoredTemplates())[key]?.content;
  const mail = renderEmail(
    key,
    effectiveContent(key, body.content ?? stored),
    sampleVars(me.name, to),
  );
  const sent = await sendMail({
    to,
    template: key,
    userId: req.user.id,
    ...mail,
    subject: `[Test] ${mail.subject}`,
  });
  res.json({ sent, to });
});

// ---------- Settings ----------
admin.get("/email/settings", async (_req, res) => {
  res.json({
    settings: await getEmailSettings(),
    smtpConfigured: emailConfigured(),
    smtpHost: config.SMTP_HOST,
    smtpUser: config.SMTP_USER,
  });
});
admin.put("/email/settings", async (req, res) => {
  const patch = emailSettingsSchema.parse(req.body);
  res.json({ settings: await saveEmailSettings(patch, req.user.id) });
});
admin.delete("/email/settings", async (_req, res) => {
  res.json({ settings: await resetEmailSettings() });
});

// ---------- Delivery log ----------
admin.get("/email/logs", async (req, res) => {
  const { limit, offset } = page(req);
  const filters = z
    .object({
      status: z.enum(["sent", "failed", "skipped"]).optional(),
      search: z.string().max(160).optional(),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (filters.status) {
    conditions.push("status=?");
    params.push(filters.status);
  }
  if (filters.search?.trim()) {
    conditions.push("recipient ILIKE ?");
    params.push(like(filters.search.trim()));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [{ total }] = await query(sql.countLogs(where), params);
  res.json({
    total,
    items: await query(sql.listLogs(where), [...params, limit, offset]),
  });
});

// ---------- Users ----------
admin.get("/users", async (req, res) => {
  const { limit, offset } = page(req);
  const filters = z
    .object({
      search: z.string().max(160).optional(),
      verified: z.enum(["all", "yes", "no"]).default("all"),
      status: z
        .enum(["all", "active", "suspended", "deactivated"])
        .default("all"),
      role: z.enum(["all", "admin", "member"]).default("all"),
      badge: z.enum(["all", "blue", "gold", "none"]).default("all"),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (filters.search?.trim()) {
    conditions.push("(email ILIKE ? OR full_name ILIKE ?)");
    params.push(like(filters.search.trim()), like(filters.search.trim()));
  }
  if (filters.verified === "yes")
    conditions.push("email_verified_at IS NOT NULL");
  if (filters.verified === "no") conditions.push("email_verified_at IS NULL");
  if (filters.status !== "all") {
    conditions.push("account_status=?");
    params.push(filters.status);
  }
  if (filters.role !== "all")
    conditions.push(`is_admin=${filters.role === "admin"}`);
  if (filters.badge === "none") conditions.push("verified_badge IS NULL");
  else if (filters.badge !== "all") {
    conditions.push("verified_badge=?");
    params.push(filters.badge);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [{ total }] = await query(sql.countUsers(where), params);
  res.json({
    total,
    items: await query(sql.listUsers(where), [...params, limit, offset]),
  });
});
admin.patch("/users/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const patch = z
    .strictObject({
      name: text(100),
      emailVerified: z.boolean(),
      accountStatus: z.enum(["active", "suspended", "deactivated"]),
      isAdmin: z.boolean(),
      badge: z.enum(["blue", "gold"]).nullable(),
      reminderCount: z.number().int().min(0).max(32767),
    })
    .partial()
    .parse(req.body);
  if (
    id === req.user.id &&
    (patch.isAdmin === false ||
      (patch.accountStatus && patch.accountStatus !== "active"))
  )
    throw new HttpError(
      400,
      "You can't remove your own admin access or suspend yourself",
    );
  const assignments = [];
  const params = [];
  if (patch.name !== undefined)
    (assignments.push("full_name=?"), params.push(patch.name));
  if (patch.emailVerified !== undefined)
    assignments.push(
      patch.emailVerified
        ? "email_verified_at=COALESCE(email_verified_at,utc_now())"
        : "email_verified_at=NULL",
    );
  if (patch.accountStatus !== undefined)
    (assignments.push("account_status=?"), params.push(patch.accountStatus));
  if (patch.isAdmin !== undefined)
    (assignments.push("is_admin=?"), params.push(patch.isAdmin));
  if (patch.badge !== undefined)
    (assignments.push("verified_badge=?"), params.push(patch.badge));
  if (patch.reminderCount !== undefined)
    (assignments.push("verification_reminder_count=?"),
      params.push(patch.reminderCount));
  if (!assignments.length) throw new HttpError(400, "Nothing to update");
  const result = await query(sql.updateUser(assignments), [...params, id]);
  if (!result.affectedRows) throw new HttpError(404, "User not found");
  const [user] = await query(sql.findUser, [id]);
  res.json(user);
});
async function targetUser(req) {
  const [user] = await query(sql.findUser, [uuid(req.params.id)]);
  if (!user) throw new HttpError(404, "User not found");
  return user;
}
admin.post("/users/:id/send-verification", async (req, res) => {
  const user = await targetUser(req);
  if (user.emailVerifiedAt)
    throw new HttpError(400, "This email is already verified");
  res.json({ sent: await sendVerificationEmail(user) });
});
admin.post("/users/:id/send-welcome", async (req, res) => {
  const user = await targetUser(req);
  res.json({
    sent: await sendWelcomeEmail(user, Boolean(user.emailVerifiedAt)),
  });
});
// Permanently removes the user and all their content (cascade).
admin.delete("/users/:id", async (req, res) => {
  const id = uuid(req.params.id);
  if (id === req.user.id)
    throw new HttpError(400, "You can't delete your own account");
  const result = await query("DELETE FROM users WHERE id=?", [id]);
  if (!result.affectedRows) throw new HttpError(404, "User not found");
  res.json({ deleted: true });
});
