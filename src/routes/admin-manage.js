import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { query, transaction } from "../db/db.js";
import { HttpError, text, uuid } from "../utils/http.js";
import { escapeLike } from "../queries/query-guards.js";
import { hashPassword } from "../utils/security.js";
import { passwordProblem } from "../utils/password-strength.js";
import { topics } from "./posts.js";
import { referralQueries } from "../queries/referrals.queries.js";
import { postQueries } from "../queries/posts.queries.js";
import { postPollQueries } from "../queries/post-polls.queries.js";
import { adminConsoleQueries as sql } from "../queries/admin-console.queries.js";

// Admin "create" and catalog-management endpoints. Mounted by admin-console.js,
// so every route already requires an administrator and is audited.
export const adminManage = Router();
const like = (v) => `%${escapeLike(v.trim())}%`;
const optionalText = (max) => z.string().trim().max(max).default("");
const key = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{1,40}$/, "Use letters, numbers, dashes or underscores");

const webLink = z
  .union([
    z.literal(""),
    z.url().max(2048).refine((v) => /^https?:\/\//i.test(v), "Use an http(s) link"),
  ])
  .default("")
  .transform((v) => v || null);

// ---------- Pickers ----------
adminManage.get("/lookups/users", async (req, res) => {
  const { search } = z
    .object({ search: z.string().max(100).default("") })
    .parse(req.query);
  res.json(
    await query(
      `SELECT id,full_name AS name,email,account_status AS status FROM users
       WHERE ?='' OR full_name ILIKE ? OR email ILIKE ? ORDER BY full_name LIMIT 15`,
      [search.trim(), like(search), like(search)],
    ),
  );
});
adminManage.get("/lookups/companies", async (req, res) => {
  const { search } = z
    .object({ search: z.string().max(100).default("") })
    .parse(req.query);
  res.json(
    await query(
      `SELECT id,company_name AS name,industry_name AS industry FROM companies
       WHERE is_active AND (?='' OR company_name ILIKE ?) ORDER BY company_name LIMIT 15`,
      [search.trim(), like(search)],
    ),
  );
});

// ---------- Companies ----------
const companySchema = z.strictObject({
  name: text(160),
  description: optionalText(5000),
  website: z.union([z.literal(""), z.url().max(2048)]).default(""),
  industry: optionalText(160),
  headquarters: optionalText(160),
  active: z.boolean().default(true),
});
adminManage.get("/companies", async (req, res) => {
  const { limit, offset } = page(req);
  const f = z
    .object({
      search: z.string().max(160).optional(),
      status: z.enum(["all", "active", "hidden"]).default("all"),
    })
    .parse(req.query);
  const conditions = [];
  const params = [];
  if (f.search?.trim()) {
    conditions.push("(c.company_name ILIKE ? OR c.industry_name ILIKE ?)");
    params.push(like(f.search), like(f.search));
  }
  if (f.status !== "all") conditions.push(`c.is_active=${f.status === "active"}`);
  const w = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [{ total }] = await query(sql.countCompanies(w), params);
  res.json({ total, items: await query(sql.listCompanies(w), [...params, limit, offset]) });
});
adminManage.get("/companies/:id", async (req, res) => {
  const [row] = await query(
    `SELECT id,company_name AS name,company_description AS description,website_url AS website,industry_name AS industry,headquarters_location AS headquarters,is_active AS active FROM companies WHERE id=?`,
    [uuid(req.params.id)],
  );
  if (!row) throw new HttpError(404, "Company not found");
  res.json({ ...row, description: row.description ?? "", website: row.website ?? "", industry: row.industry ?? "", headquarters: row.headquarters ?? "" });
});
adminManage.post("/companies", async (req, res) => {
  const b = companySchema.parse(req.body);
  const [dupe] = await query("SELECT id FROM companies WHERE lower(company_name)=lower(?)", [b.name]);
  if (dupe) throw new HttpError(409, "A company with this name already exists");
  const id = randomUUID();
  await query(
    `INSERT INTO companies(id,company_name,company_description,website_url,industry_name,headquarters_location,is_active,created_by_user_id)
     VALUES(?,?,?,?,?,?,?,?)`,
    [id, b.name, b.description || null, b.website || null, b.industry || null, b.headquarters || null, b.active, req.user.id],
  );
  res.status(201).json({ id, name: b.name });
});
adminManage.put("/companies/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const b = companySchema.parse(req.body);
  const [dupe] = await query("SELECT id FROM companies WHERE lower(company_name)=lower(?) AND id<>?", [b.name, id]);
  if (dupe) throw new HttpError(409, "Another company already uses this name");
  const result = await query(
    `UPDATE companies SET company_name=?,company_description=?,website_url=?,industry_name=?,headquarters_location=?,is_active=?,updated_at=utc_now() WHERE id=?`,
    [b.name, b.description || null, b.website || null, b.industry || null, b.headquarters || null, b.active, id],
  );
  if (!result.affectedRows) throw new HttpError(404, "Company not found");
  res.json({ id });
});

// ---------- Users ----------
adminManage.post("/users", async (req, res) => {
  const b = z
    .strictObject({
      name: text(100),
      email: z.email().max(254),
      password: z.string().min(12).max(128),
      headline: optionalText(160),
      location: optionalText(160),
      openToWork: z.boolean().default(false),
      isAdmin: z.boolean().default(false),
      badge: z.enum(["blue", "gold"]).nullable().default(null),
      emailVerified: z.boolean().default(true),
      accountStatus: z.enum(["active", "suspended", "deactivated"]).default("active"),
    })
    .parse(req.body);
  const weak = passwordProblem(b.password, { email: b.email, name: b.name });
  if (weak) throw new HttpError(400, weak);
  const [exists] = await query("SELECT id FROM users WHERE email=?", [b.email]);
  if (exists) throw new HttpError(409, "An account with this email already exists");
  const id = randomUUID();
  await query(
    `INSERT INTO users(id,email,password_hash,full_name,professional_headline,profile_location,open_to_work,is_admin,account_status,professional_skills,verified_badge,email_verified_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ? THEN utc_now() ELSE NULL END)`,
    [id, b.email, await hashPassword(b.password), b.name, b.headline, b.location, b.openToWork, b.isAdmin, b.accountStatus, "[]", b.badge, b.emailVerified],
  );
  res.status(201).json({ id, email: b.email, name: b.name });
});

// ---------- Posts ----------
adminManage.post("/posts", async (req, res) => {
  const b = z
    .strictObject({
      userId: z.uuid(),
      text: z.string().trim().min(1).max(20000),
      topic: z.enum(topics).default("General discussion"),
      companyId: z.uuid().nullable().default(null),
      anonymous: z.boolean().default(false),
      poll: z
        .strictObject({
          options: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
          allowMultiple: z.boolean().default(false),
          durationHours: z.number().int().min(1).max(720).nullable().default(null),
        })
        .nullable()
        .default(null),
    })
    .refine(
      (p) => !p.poll || new Set(p.poll.options.map((o) => o.toLowerCase())).size === p.poll.options.length,
      { message: "Poll options must be different from each other" },
    )
    .parse(req.body);
  const [author] = await query("SELECT id FROM users WHERE id=?", [b.userId]);
  if (!author) throw new HttpError(404, "Author not found");
  if (b.companyId) {
    const [c] = await query("SELECT id FROM companies WHERE id=?", [b.companyId]);
    if (!c) throw new HttpError(404, "Company not found");
  }
  const id = randomUUID();
  await transaction(async (c) => {
    await query(postQueries.createPost, [id, b.userId, b.text, b.topic, b.companyId, b.anonymous, null], c);
    if (b.poll) {
      const h = b.poll.durationHours;
      await query(postPollQueries.createPoll, [id, b.poll.allowMultiple, h, h], c);
      for (const [pos, option] of b.poll.options.entries())
        await query(postPollQueries.addOption, [randomUUID(), id, option, pos], c);
    }
  });
  res.status(201).json({ id });
});

// ---------- Referrals ----------
adminManage.post("/referrals", async (req, res) => {
  const b = z
    .strictObject({
      userId: z.uuid(),
      companyId: z.uuid(),
      title: text(120),
      location: text(160),
      workMode: z.enum(["remote", "hybrid", "onsite"]).default("onsite"),
      level: z.enum(["entry", "mid", "senior", "lead"]).nullable().default(null),
      minExperience: z.number().int().min(0).max(60).nullable().default(null),
      skills: text(200),
      description: optionalText(10000),
      companyLink: webLink,
      jobLink: webLink,
    })
    .parse(req.body);
  const [u] = await query("SELECT id FROM users WHERE id=?", [b.userId]);
  if (!u) throw new HttpError(404, "Owner not found");
  const [c] = await query("SELECT id FROM companies WHERE id=?", [b.companyId]);
  if (!c) throw new HttpError(404, "Company not found");
  const id = randomUUID();
  await query(referralQueries.createReferral, [
    id, b.userId, b.companyId, b.title, b.location, b.workMode, b.level,
    b.minExperience, b.skills, b.description, "[]", b.companyLink, b.jobLink,
  ]);
  res.status(201).json({ id });
});

// ---------- Layoff / workforce reports ----------
adminManage.post("/workforce", async (req, res) => {
  const b = z
    .strictObject({
      userId: z.uuid(),
      companyId: z.uuid(),
      eventDate: z.iso.date(),
      rolesAffected: z.number().int().min(0).max(10000000),
      headcount: z.number().int().min(0).max(10000000).nullable().default(null),
      hires: z.number().int().min(0).max(10000000).nullable().default(null),
      sourceUrl: z.url().max(2048).refine((v) => /^https?:\/\//.test(v)),
      status: z.enum(["user_reported", "verified"]).default("verified"),
      summary: optionalText(2000),
    })
    .parse(req.body);
  const [u] = await query("SELECT id FROM users WHERE id=?", [b.userId]);
  if (!u) throw new HttpError(404, "Reporter not found");
  const [c] = await query("SELECT id FROM companies WHERE id=?", [b.companyId]);
  if (!c) throw new HttpError(404, "Company not found");
  const id = randomUUID();
  const verified = b.status === "verified";
  await query(
    `INSERT INTO workforce_reports(id,company_id,user_id,event_date,reported_roles_affected,reported_headcount,reported_hires,source_url,verification_status,verification_summary,verified_at,verified_by_user_id)
     VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ? THEN utc_now() ELSE NULL END,CASE WHEN ? THEN ?::uuid ELSE NULL END)`,
    [id, b.companyId, b.userId, b.eventDate, b.rolesAffected, b.headcount, b.hires, b.sourceUrl, b.status, b.summary || null, verified, verified, req.user.id],
  );
  res.status(201).json({ id });
});

// ---------- Report options (category -> sub-options) ----------
const subSchema = z.strictObject({
  id: z.uuid().optional(),
  key,
  label: text(160),
  active: z.boolean().default(true),
});
const categorySchema = z.strictObject({
  key,
  label: text(120),
  description: optionalText(300),
  icon: z.string().trim().max(16).default(""),
  active: z.boolean().default(true),
  subcategories: z.array(subSchema).max(40).default([]),
});
const optionTree = `SELECT c.id,c.category_key AS key,c.category_label AS label,c.category_description AS description,c.category_icon AS icon,
  c.is_active AS active,c.display_position AS position,
  (SELECT count(*)::int FROM reports r WHERE r.report_category=c.category_key) AS "postReports",
  COALESCE((SELECT json_agg(json_build_object('id',s.id,'key',s.subcategory_key,'label',s.subcategory_label,'active',s.is_active) ORDER BY s.display_position,s.subcategory_label)
    FROM report_subcategories s WHERE s.category_id=c.id),'[]'::json) AS subcategories
  FROM report_categories c`;
adminManage.get("/report-options", async (_req, res) => {
  res.json(await query(`${optionTree} ORDER BY c.display_position,c.category_label`));
});
adminManage.get("/report-options/:id", async (req, res) => {
  const [row] = await query(`${optionTree} WHERE c.id=?`, [uuid(req.params.id)]);
  if (!row) throw new HttpError(404, "Report option not found");
  res.json(row);
});
async function saveCategory(id, b, c) {
  const keys = b.subcategories.map((s) => s.key);
  if (new Set(keys).size !== keys.length)
    throw new HttpError(400, "Sub-option keys must be unique");
  const [clash] = await query(
    "SELECT id FROM report_categories WHERE category_key=? AND id<>?",
    [b.key, id],
    c,
  );
  if (clash) throw new HttpError(409, "Another option already uses this key");
  const keep = [];
  for (const [position, s] of b.subcategories.entries()) {
    const subId = s.id ?? randomUUID();
    keep.push(subId);
    await query(
      `INSERT INTO report_subcategories(id,category_id,subcategory_key,subcategory_label,display_position,is_active)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT (id) DO UPDATE SET subcategory_key=EXCLUDED.subcategory_key,subcategory_label=EXCLUDED.subcategory_label,display_position=EXCLUDED.display_position,is_active=EXCLUDED.is_active,updated_at=utc_now()`,
      [subId, id, s.key, s.label, position, s.active],
      c,
    );
  }
  await query(
    "DELETE FROM report_subcategories WHERE category_id=? AND NOT (id = ANY(?::uuid[]))",
    [id, keep],
    c,
  );
}
adminManage.post("/report-options", async (req, res) => {
  const b = categorySchema.parse(req.body);
  const id = randomUUID();
  await transaction(async (c) => {
    const [{ next }] = await query(
      "SELECT COALESCE(max(display_position),0)+1 AS next FROM report_categories",
      [],
      c,
    );
    await query(
      `INSERT INTO report_categories(id,category_key,category_label,category_description,category_icon,display_position,is_active)
       VALUES(?,?,?,?,?,?,?)`,
      [id, b.key, b.label, b.description, b.icon, next, b.active],
      c,
    );
    await saveCategory(id, b, c);
  });
  res.status(201).json({ id });
});
adminManage.put("/report-options/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const b = categorySchema.parse(req.body);
  await transaction(async (c) => {
    const [row] = await query("SELECT category_key FROM report_categories WHERE id=?", [id], c);
    if (!row) throw new HttpError(404, "Report option not found");
    if (row.category_key !== b.key)
      throw new HttpError(400, "The key of an existing option can't be changed");
    await query(
      `UPDATE report_categories SET category_label=?,category_description=?,category_icon=?,is_active=?,updated_at=utc_now() WHERE id=?`,
      [b.label, b.description, b.icon, b.active, id],
      c,
    );
    await saveCategory(id, b, c);
  });
  res.json({ id });
});
adminManage.post("/report-options/reorder", async (req, res) => {
  const { ids } = z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) }).parse(req.body);
  await transaction(async (c) => {
    for (const [position, id] of ids.entries())
      await query("UPDATE report_categories SET display_position=? WHERE id=?", [position, id], c);
  });
  res.json({ ok: true });
});
adminManage.delete("/report-options/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const [row] = await query("SELECT category_key FROM report_categories WHERE id=?", [id]);
  if (!row) throw new HttpError(404, "Report option not found");
  if (row.category_key === "other")
    throw new HttpError(400, 'The "other" option is the fallback and can\'t be deleted');
  await query("DELETE FROM report_categories WHERE id=?", [id]);
  res.status(204).end();
});

// ---------- Hashtag catalog (emoji / icon / description) ----------
const tagSchema = z.strictObject({
  tag: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^#/, ""))
    .pipe(z.string().regex(/^[a-z][a-z0-9_]{1,49}$/, "Start with a letter; letters, numbers and _ only (2–50)")),
  displayName: optionalText(80),
  emoji: z.string().trim().max(16).default(""),
  iconName: z.string().trim().max(40).regex(/^[A-Za-z0-9-]*$/).default(""),
  accentColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).default(""),
  description: optionalText(300),
  featured: z.boolean().default(false),
});
const tagCols = `tag,display_name AS "displayName",emoji,icon_name AS "iconName",accent_color AS "accentColor",tag_description AS description,is_featured AS featured,created_at AS "createdAt"`;
adminManage.get("/hashtag-catalog", async (_req, res) => {
  res.json(await query(`SELECT ${tagCols} FROM hashtag_catalog ORDER BY is_featured DESC,tag`));
});
adminManage.get("/hashtag-catalog/:tag", async (req, res) => {
  const [row] = await query(`SELECT ${tagCols} FROM hashtag_catalog WHERE tag=?`, [req.params.tag.toLowerCase()]);
  if (!row) throw new HttpError(404, "Hashtag not found");
  res.json(row);
});
adminManage.post("/hashtag-catalog", async (req, res) => {
  const b = tagSchema.parse(req.body);
  const [dupe] = await query("SELECT tag FROM hashtag_catalog WHERE tag=?", [b.tag]);
  if (dupe) throw new HttpError(409, "This hashtag is already in the catalog");
  await query(
    `INSERT INTO hashtag_catalog(tag,display_name,emoji,icon_name,accent_color,tag_description,is_featured) VALUES(?,?,?,?,?,?,?)`,
    [b.tag, b.displayName, b.emoji, b.iconName, b.accentColor, b.description, b.featured],
  );
  res.status(201).json({ tag: b.tag });
});
adminManage.put("/hashtag-catalog/:tag", async (req, res) => {
  const b = tagSchema.parse({ ...req.body, tag: req.params.tag });
  const result = await query(
    `UPDATE hashtag_catalog SET display_name=?,emoji=?,icon_name=?,accent_color=?,tag_description=?,is_featured=?,updated_at=utc_now() WHERE tag=?`,
    [b.displayName, b.emoji, b.iconName, b.accentColor, b.description, b.featured, b.tag],
  );
  if (!result.affectedRows) throw new HttpError(404, "Hashtag not found");
  res.json({ tag: b.tag });
});
adminManage.delete("/hashtag-catalog/:tag", async (req, res) => {
  const result = await query("DELETE FROM hashtag_catalog WHERE tag=?", [req.params.tag.toLowerCase()]);
  if (!result.affectedRows) throw new HttpError(404, "Hashtag not found");
  res.status(204).end();
});
