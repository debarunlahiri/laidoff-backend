import { Router } from "express";
import { z } from "zod";
import os from "node:os";
import { query } from "../db/db.js";
import { HttpError, page, text, uuid } from "../utils/http.js";
import { escapeLike } from "../queries/query-guards.js";
import { topics } from "./posts.js";
import { adminManage } from "./admin-manage.js";
import { emailConfigured, sendMail } from "../services/email.js";
import {
  renderPasswordChangedEmail,
  renderWarningEmail,
  warningReasons,
  warningTypes,
} from "../services/email-templates.js";
import { adminConsoleQueries as sql } from "../queries/admin-console.queries.js";
import { randomUUID } from "node:crypto";
import { agentQueries } from "../queries/agent.queries.js";
import { hashPassword, newToken, tokenHash } from "../utils/security.js";
import { passwordProblem } from "../utils/password-strength.js";

// Mounted behind the administrator check in admin.js. Every mutation here is
// also written to audit_logs by the request-logging middleware.
export const adminConsole = Router();
// Create / catalog endpoints. Registered first so static paths such as
// /posts/bulk-delete-style routes never fall into a `:id` handler.
adminConsole.use(adminManage);
const like = (value) => `%${escapeLike(value.trim())}%`;
const where = (conditions) =>
  conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
const delta = ([row]) => ({ current: row.current, previous: row.previous });

// ---------- Dashboard ----------
adminConsole.get("/analytics", async (req, res) => {
  const { days } = z
    .object({ days: z.coerce.number().int().min(7).max(90).default(30) })
    .parse(req.query);
  const [totals] = await query(sql.totals);
  const [pending] = await query(sql.pending);
  const win = [days, days, days];
  const [users, posts, comments, referrals] = await Promise.all([
    query(sql.usersWindow, win),
    query(sql.postsWindow, win),
    query(sql.commentsWindow, win),
    query(sql.referralsWindow, win),
  ]);
  const [uS, pS, cS, rS] = await Promise.all([
    query(sql.usersSeries, [days]),
    query(sql.postsSeries, [days]),
    query(sql.commentsSeries, [days]),
    query(sql.referralsSeries, [days]),
  ]);
  res.json({
    days,
    totals,
    pending,
    windows: {
      users: delta(users),
      posts: delta(posts),
      comments: delta(comments),
      referrals: delta(referrals),
    },
    series: uS.map((row, index) => ({
      day: row.day,
      users: row.total,
      posts: pS[index]?.total ?? 0,
      comments: cS[index]?.total ?? 0,
      referrals: rS[index]?.total ?? 0,
    })),
    topTopics: await query(sql.topTopics, [days]),
  });
});

// ---------- System health ----------
adminConsole.get("/system", async (_req, res) => {
  const [api] = await query(sql.apiHealth);
  const [db] = await query(sql.dbFailures);
  res.json({
    api,
    databaseFailures: db.total,
    slowRoutes: await query(sql.slowRoutes),
    recentErrors: await query(sql.recentErrors),
    runtime: {
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      loadAverage: Number(os.loadavg()[0].toFixed(2)),
      environment: process.env.NODE_ENV ?? "development",
    },
    smtpConfigured: emailConfigured(),
  });
});

// ---------- Users ----------
adminConsole.get("/users/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const [user] = await query(sql.userDetail, [id]);
  if (!user) throw new HttpError(404, "User not found");
  res.json({ ...user, recentPosts: await query(sql.userPosts, [id]) });
});
adminConsole.post("/users/:id/revoke-sessions", async (req, res) => {
  const id = uuid(req.params.id);
  if (id === req.user.id)
    throw new HttpError(400, "Use Sign out to end your own session");
  const result = await query(sql.revokeSessions, [id]);
  res.json({ revoked: result.affectedRows ?? 0 });
});
adminConsole.post("/users/:id/set-password", async (req, res) => {
  const id = uuid(req.params.id);
  if (id === req.user.id)
    throw new HttpError(
      400,
      "Change your own password from your account settings",
    );
  const { password } = z
    .object({
      password: z
        .string()
        .min(12, "Password must be at least 12 characters")
        .max(128, "Password must be at most 128 characters")
        .refine(
          (v) => v === v.trim(),
          "Password cannot start or end with a space",
        ),
      confirmPassword: z.string(),
    })
    .strict()
    .refine((v) => v.password === v.confirmPassword, {
      message: "The two passwords do not match",
      path: ["confirmPassword"],
    })
    .parse(req.body);
  const [user] = await query(sql.userDetail, [id]);
  if (!user) throw new HttpError(404, "User not found");
  const weak = passwordProblem(password, {
    email: user.email,
    name: user.name,
  });
  if (weak) throw new HttpError(400, weak);
  await query(sql.setPassword, [await hashPassword(password), id]);
  // Anyone holding an old session must sign in again with the new password.
  const result = await query(sql.revokeSessions, [id]);
  // Tell the member. Mail trouble never fails the change (sendMail does not throw).
  void sendMail({
    to: user.email,
    ...renderPasswordChangedEmail({ name: user.name, by: "admin" }),
    template: "password_changed",
    userId: id,
  });
  res.json({ updated: true, revoked: result.affectedRows ?? 0 });
});

// ---------- Agent API keys (see AGENT_API.md) ----------
// The key itself is returned once, on creation, as `apiKey` (redacted in logs);
// only its hash is stored, so it can never be shown again.
adminConsole.get("/agent-keys", async (_req, res) => {
  res.json({ items: await query(agentQueries.listKeys) });
});
adminConsole.post("/agent-keys", async (req, res) => {
  const b = z
    .strictObject({
      name: z.string().trim().min(1, "Give the key a name").max(80),
      account: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase())
        .default("news@laidoffcircle.com"),
      writesPerHour: z.coerce.number().int().min(1).max(1000).default(60),
    })
    .parse(req.body);
  const [account] = await query(agentQueries.findAccount, [b.account]);
  if (!account) throw new HttpError(404, `No account found for ${b.account}`);
  if (account.status !== "active")
    throw new HttpError(400, `${b.account} is not an active account`);
  const apiKey = `lak_${newToken()}`;
  const id = randomUUID();
  await query(agentQueries.createKey, [
    id,
    b.name,
    tokenHash(apiKey),
    apiKey.slice(0, 8),
    account.id,
    b.writesPerHour,
  ]);
  res.status(201).json({
    id,
    name: b.name,
    account: b.account,
    accountName: account.name,
    writesPerHour: b.writesPerHour,
    apiKey,
  });
});
adminConsole.post("/agent-keys/:id/revoke", async (req, res) => {
  const result = await query(agentQueries.revokeKey, [uuid(req.params.id)]);
  if (!result.affectedRows)
    throw new HttpError(404, "No active key with that id");
  res.json({ revoked: true });
});

// ---------- Content ----------
adminConsole.get("/posts", async (req, res) => {
  const { limit, offset } = page(req);
  const f = z
    .object({
      search: z.string().max(160).optional(),
      reported: z.enum(["all", "yes"]).default("all"),
      referral: z.enum(["all", "yes"]).default("all"),
      poll: z.enum(["all", "yes"]).default("all"),
      anonymous: z.enum(["all", "yes"]).default("all"),
      topic: z.string().max(80).optional(),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (f.search?.trim()) {
    conditions.push(
      "(p.post_content ILIKE ? OR u.full_name ILIKE ? OR u.email ILIKE ?)",
    );
    params.push(like(f.search), like(f.search), like(f.search));
  }
  if (f.reported === "yes")
    conditions.push("EXISTS (SELECT 1 FROM reports r WHERE r.post_id=p.id)");
  if (f.anonymous === "yes") conditions.push("p.is_anonymous=true");
  if (f.poll === "yes")
    conditions.push(
      "EXISTS (SELECT 1 FROM post_polls pp WHERE pp.post_id=p.id)",
    );
  if (f.topic?.trim()) {
    conditions.push("p.post_topic ILIKE ?");
    params.push(like(f.topic));
  }
  const w = where(conditions);
  const [{ total }] = await query(sql.countPosts(w), params);
  res.json({
    total,
    items: await query(sql.listPosts(w), [...params, limit, offset]),
  });
});
adminConsole.post("/posts/bulk-delete", async (req, res) => {
  const { ids } = z
    .strictObject({ ids: z.array(z.uuid()).min(1).max(100) })
    .parse(req.body);
  const result = await query(sql.deletePosts, [ids]);
  res.json({ deleted: result.affectedRows ?? 0 });
});
adminConsole.get("/posts/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const [post] = await query(sql.postDetail, [id]);
  if (!post) throw new HttpError(404, "Post not found");
  const [reports, comments, [warned], warnings, [summary]] = await Promise.all([
    query(sql.postReports, [id]),
    query(sql.postComments, [id]),
    query(sql.warningCount, [post.authorId]),
    query(sql.userWarnings, [post.authorId]),
    query(sql.listPosts("WHERE p.id=?"), [id, 1, 0]),
  ]);
  res.json({
    ...post,
    summary,
    reports,
    comments,
    warningCount: warned?.total ?? 0,
    warnings,
  });
});
adminConsole.patch("/posts/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const body = z.strictObject({ topic: z.enum(topics) }).parse(req.body);
  const result = await query(sql.updatePostTopic, [body.topic, id]);
  if (!result.affectedRows) throw new HttpError(404, "Post not found");
  res.json({ id, topic: body.topic });
});
adminConsole.post("/posts/:id/reports/resolve", async (req, res) => {
  const id = uuid(req.params.id);
  const body = z
    .strictObject({
      status: z.enum(["resolved", "dismissed"]),
      resolutionSummary: text(2000).optional(),
    })
    .parse(req.body);
  const result = await query(sql.resolvePostReports, [
    body.status,
    body.resolutionSummary ?? null,
    req.user.id,
    id,
  ]);
  res.json({ updated: result.affectedRows ?? 0, status: body.status });
});
// Emails the author a friendly warning about this post (reason + optional note).
adminConsole.post("/posts/:id/warn", async (req, res) => {
  const id = uuid(req.params.id);
  const body = z
    .strictObject({
      reason: z.enum(Object.keys(warningReasons)),
      type: z.enum(Object.keys(warningTypes)).default("warning"),
      note: text(1000).optional(),
    })
    .parse(req.body);
  const [post] = await query(sql.postDetail, [id]);
  if (!post) throw new HttpError(404, "Post not found");
  const mail = renderWarningEmail({
    name: post.authorName,
    reason: body.reason,
    type: body.type,
    excerpt: post.text,
    note: body.note,
  });
  const sent = await sendMail({
    to: post.authorEmail,
    ...mail,
    template: "warning",
    userId: post.authorId,
  });
  if (!sent)
    throw new HttpError(
      503,
      "The warning email could not be sent. Check the email settings and try again.",
    );
  await query(sql.insertWarning, [
    post.authorId,
    id,
    req.user.id,
    body.reason,
    body.note?.trim() || null,
    post.text.slice(0, 400),
    body.type,
  ]);
  const [{ total }] = await query(sql.warningCount, [post.authorId]);
  res.json({ sent: true, warningCount: total });
});
adminConsole.delete("/comments/:id", async (req, res) => {
  const result = await query(sql.deleteComment, [uuid(req.params.id)]);
  if (!result.affectedRows) throw new HttpError(404, "Comment not found");
  res.status(204).end();
});
adminConsole.delete("/posts/:id", async (req, res) => {
  const result = await query(sql.deletePost, [uuid(req.params.id)]);
  if (!result.affectedRows) throw new HttpError(404, "Post not found");
  res.status(204).end();
});

// ---------- Moderation queue ----------
adminConsole.get("/reports", async (req, res) => {
  const { limit, offset } = page(req);
  const f = z
    .object({
      kind: z.enum(["post", "comment"]).default("post"),
      status: z
        .enum(["open", "pending", "reviewing", "resolved", "dismissed", "all"])
        .default("open"),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (f.status === "open")
    conditions.push("r.report_status IN ('pending','reviewing')");
  else if (f.status !== "all") {
    conditions.push("r.report_status=?");
    params.push(f.status);
  }
  const w = where(conditions);
  const [{ total }] = await query(
    f.kind === "post" ? sql.countPostReports(w) : sql.countCommentReports(w),
    params,
  );
  const list = f.kind === "post" ? sql.listPostReports : sql.listCommentReports;
  res.json({ total, items: await query(list(w), [...params, limit, offset]) });
});
adminConsole.patch("/reports/:kind/:id", async (req, res) => {
  const kind = z.enum(["post", "comment"]).parse(req.params.kind);
  const id = uuid(req.params.id);
  const body = z
    .strictObject({
      status: z.enum(["reviewing", "resolved", "dismissed"]),
      resolutionSummary: text(2000).optional(),
      removeContent: z.boolean().optional(),
    })
    .parse(req.body);
  const [found] = await query(
    kind === "post" ? sql.findPostReport : sql.findCommentReport,
    [id],
  );
  if (!found) throw new HttpError(404, "Report not found");
  if (kind === "post")
    await query(sql.updatePostReport, [
      body.status,
      body.resolutionSummary ?? null,
      req.user.id,
      id,
    ]);
  else await query(sql.updateCommentReport, [body.status, id]);
  // Removing the content cascades to its reports, so it must come last.
  if (body.removeContent)
    await query(kind === "post" ? sql.deletePost : sql.deleteComment, [
      found.contentId,
    ]);
  res.json({ id, status: body.status, removed: Boolean(body.removeContent) });
});

// ---------- Layoff report verification ----------
adminConsole.get("/workforce", async (req, res) => {
  const { limit, offset } = page(req);
  const f = z
    .object({
      status: z.enum(["all", "user_reported", "verified"]).default("all"),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (f.status !== "all") {
    conditions.push("w.verification_status=?");
    params.push(f.status);
  }
  const w = where(conditions);
  const [{ total }] = await query(sql.countWorkforce(w), params);
  res.json({
    total,
    items: await query(sql.listWorkforce(w), [...params, limit, offset]),
  });
});
adminConsole.patch("/workforce/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const body = z
    .strictObject({
      status: z.enum(["user_reported", "verified"]),
      summary: z.string().trim().max(2000).optional(),
    })
    .parse(req.body);
  const result = await query(sql.updateWorkforce, [
    body.status,
    body.summary || null,
    body.status,
    body.status,
    req.user.id,
    id,
  ]);
  if (!result.affectedRows) throw new HttpError(404, "Report not found");
  res.json({ id, status: body.status });
});

// ---------- Hashtags ----------
adminConsole.get("/hashtags", async (req, res) => {
  const { days } = z
    .object({ days: z.coerce.number().int().min(7).max(365).default(30) })
    .parse(req.query);
  const [trending, allTime] = await Promise.all([
    query(sql.topHashtags, [days, 50]),
    query(sql.allTimeHashtags, [50]),
  ]);
  const catalog = await query(
    `SELECT tag,emoji,icon_name AS "iconName",accent_color AS "accentColor",display_name AS "displayName",is_featured AS featured FROM hashtag_catalog`,
  );
  const meta = new Map(catalog.map((c) => [c.tag, c]));
  const decorate = (rows) =>
    rows.map((r) => ({ ...r, ...(meta.get(r.tag) ?? {}) }));
  res.json({
    days,
    trending: decorate(trending),
    allTime: decorate(allTime),
    catalog,
  });
});

adminConsole.get("/hashtags/:tag/posts", async (req, res) => {
  const tag = z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{1,49}$/)
    .parse(req.params.tag);
  const { limit, offset } = page(req);
  const f = z
    .object({
      search: z.string().max(160).optional(),
      filter: z
        .enum(["all", "reported", "poll", "anonymous", "images"])
        .default("all"),
      sort: z
        .enum(["newest", "oldest", "likes", "comments", "reports"])
        .default("newest"),
    })
    .parse(req.query);
  const pattern = `#${tag}(?![A-Za-z0-9_])`;
  const conditions = ["p.post_content ~* ?"];
  const params = [pattern];
  if (f.search?.trim()) {
    conditions.push("(p.post_content ILIKE ? OR u.full_name ILIKE ?)");
    params.push(like(f.search), like(f.search));
  }
  if (f.filter === "reported")
    conditions.push("EXISTS (SELECT 1 FROM reports r WHERE r.post_id=p.id)");
  if (f.filter === "anonymous") conditions.push("p.is_anonymous=true");
  if (f.filter === "poll")
    conditions.push(
      "EXISTS (SELECT 1 FROM post_polls pp WHERE pp.post_id=p.id)",
    );
  if (f.filter === "images")
    conditions.push(
      "EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id=p.id)",
    );
  const order = {
    newest: "p.created_at DESC",
    oldest: "p.created_at ASC",
    likes:
      "(SELECT count(*) FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='like') DESC, p.created_at DESC",
    comments:
      "(SELECT count(*) FROM comments cm WHERE cm.post_id=p.id) DESC, p.created_at DESC",
    reports:
      "(SELECT count(*) FROM reports r WHERE r.post_id=p.id) DESC, p.created_at DESC",
  }[f.sort];
  const w = where(conditions);
  const [[stats], [{ total }], items] = await Promise.all([
    query(sql.hashtagStats, [pattern]),
    query(sql.countPosts(w), params),
    query(sql.listPosts(w, order), [...params, limit, offset]),
  ]);
  res.json({ tag: tag.toLowerCase(), stats, total, items });
});

// ---------- Referrals (admin) ----------
adminConsole.get("/referrals", async (req, res) => {
  const { limit, offset } = page(req);
  const f = z
    .object({
      search: z.string().max(160).optional(),
      status: z.enum(["all", "open", "closed"]).default("all"),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (f.search?.trim()) {
    conditions.push(
      "(r.job_title ILIKE ? OR c.company_name ILIKE ? OR u.full_name ILIKE ?)",
    );
    params.push(like(f.search), like(f.search), like(f.search));
  }
  if (f.status !== "all") {
    conditions.push("r.referral_status=?");
    params.push(f.status);
  }
  const w = where(conditions);
  const [{ total }] = await query(sql.countReferrals(w), params);
  res.json({
    total,
    items: await query(sql.listReferrals(w), [...params, limit, offset]),
  });
});
adminConsole.patch("/referrals/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const { status } = z
    .object({ status: z.enum(["open", "closed"]) })
    .parse(req.body);
  const result = await query(sql.updateReferralStatus, [status, status, id]);
  if (!result.rows?.length && !result.affectedRows)
    throw new HttpError(404, "Referral not found");
  res.json({ id, status });
});

// ---------- Community notes ----------
adminConsole.get("/notes", async (req, res) => {
  const { limit, offset } = page(req);
  const f = z
    .object({
      status: z
        .enum(["all", "pending", "approved", "rejected"])
        .default("pending"),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (f.status !== "all") {
    conditions.push("n.review_status=?");
    params.push(f.status);
  }
  const w = where(conditions);
  const [{ total }] = await query(sql.countNotes(w), params);
  res.json({
    total,
    items: await query(sql.listNotes(w), [...params, limit, offset]),
  });
});
adminConsole.patch("/notes/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const body = z
    .strictObject({
      status: z.enum(["approved", "rejected"]),
      reason: text(2000).optional(),
    })
    .parse(req.body);
  const [found] = await query(sql.findNote, [id]);
  if (!found) throw new HttpError(404, "Note not found");
  await query(sql.updateNote, [
    body.status,
    body.reason ?? null,
    req.user.id,
    id,
  ]);
  res.json({ id, status: body.status });
});

// ---------- Audit trail ----------
adminConsole.get("/audit", async (req, res) => {
  const { limit, offset } = page(req);
  const f = z
    .object({
      search: z.string().max(160).optional(),
      outcome: z
        .enum(["all", "succeeded", "rejected", "failed"])
        .default("all"),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (f.outcome !== "all") {
    conditions.push("a.outcome=?");
    params.push(f.outcome);
  }
  if (f.search?.trim()) {
    conditions.push(
      "(a.action_name ILIKE ? OR a.resource_type ILIKE ? OR a.resource_identifier ILIKE ?)",
    );
    params.push(like(f.search), like(f.search), like(f.search));
  }
  const w = where(conditions);
  const [{ total }] = await query(sql.countAudit(w), params);
  res.json({
    total,
    items: await query(sql.listAudit(w), [...params, limit, offset]),
  });
});
