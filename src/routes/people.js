import { peopleQueries } from "../queries/people.queries.js";
import { buildProfileUpdateQuery } from "../queries/profile-update.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db/db.js";
import { HttpError, id, page, text, uuid, mustExist } from "../utils/http.js";
import { notify } from "../services/notifications.js";
import {
  getPrivacy,
  savePrivacy,
  privacySchema,
  canView,
} from "../services/privacy.js";
import { sendMail } from "../services/email.js";
import { renderPasswordChangedEmail } from "../services/email-templates.js";
import { hashPassword, verifyPassword } from "../utils/security.js";
import { passwordProblem } from "../utils/password-strength.js";
import {
  usernameSchema,
  usernameProblem,
  assertUsernameFree,
} from "../utils/username.js";
export const people = Router();
people.get("/companies/:id", async (req, res) => {
  const [company] = await query(peopleQueries.findCompany, [
    uuid(req.params.id),
  ]);
  if (!company) throw new HttpError(404, "Company not found");
  res.json(company);
});
// Any member can add a company that is missing from the list. A name that already
// exists (case-insensitive) returns the existing company instead of a duplicate.
people.post("/companies", async (req, res) => {
  const b = z
    .strictObject({
      name: text(160),
      website: z.union([z.literal(""), z.url().max(2048)]).default(""),
      industry: z.string().trim().max(160).default(""),
      headquarters: z.string().trim().max(160).default(""),
    })
    .parse(req.body);
  const [existing] = await query(
    "SELECT id,company_name AS name FROM companies WHERE lower(company_name)=lower(?)",
    [b.name],
  );
  if (existing) return res.json({ ...existing, existing: true });
  const id = randomUUID();
  await query(
    "INSERT INTO companies(id,company_name,website_url,industry_name,headquarters_location,created_by_user_id) VALUES(?,?,?,?,?,?)",
    [
      id,
      b.name,
      b.website || null,
      b.industry || null,
      b.headquarters || null,
      req.user.id,
    ],
  );
  res.status(201).json({ id, name: b.name, existing: false });
});
people.get("/network/stats", async (req, res) => {
  const [stats] = await query(
    peopleQueries.networkStats,
    Array(5).fill(req.user.id),
  );
  res.json(stats);
});
people.get("/companies", async (req, res) => {
  const { limit, offset } = page(req);
  const search = z
    .string()
    .max(160)
    .parse(req.query.search ?? "");
  res.json(
    await query(peopleQueries.searchCompanies({ limit, offset }), [
      "%" + search + "%",
    ]),
  );
});
people.get("/users", async (req, res) => {
  const { limit, offset } = page(req);
  const search = z
    .string()
    .max(160)
    .parse(req.query.search ?? "");
  res.json(
    await query(peopleQueries.searchPeople({ limit, offset }), [
      req.user.id,
      req.user.id,
      "%" + search + "%",
      "%" + search + "%",
      "%" + search + "%",
    ]),
  );
});
people.get("/users/username-available", async (req, res) => {
  const username = usernameSchema.safeParse(req.query.username ?? "");
  if (!username.success)
    return res.json({
      available: false,
      reason: username.error.issues[0].message,
    });
  const reason = await usernameProblem(username.data, req.user?.id ?? null);
  res.json({ available: !reason, ...(reason ? { reason } : {}) });
});
// 403 unless the member's privacy setting for `key` (and their profile setting) lets the viewer in.
export async function requireVisible(req, ownerId, key) {
  const privacy = await getPrivacy(ownerId);
  if (
    !(await canView(req.user, ownerId, privacy.profile)) ||
    !(await canView(req.user, ownerId, privacy[key]))
  )
    throw new HttpError(403, "This member keeps that private", "PRIVATE");
}
// Change the signed-in member's own password. The current password is required,
// and every other session is signed out (this one stays). A wrong current password
// answers 400, not 401, so the app does not treat it as an expired session.
people.put("/me/password", async (req, res) => {
  const b = z
    .strictObject({
      currentPassword: z.string().min(1).max(128),
      password: z
        .string()
        .min(12, "Password must be at least 12 characters")
        .max(128, "Password must be at most 128 characters"),
      confirmPassword: z.string().max(128),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: "The two passwords do not match",
      path: ["confirmPassword"],
    })
    .parse(req.body);
  const [account] = await query(peopleQueries.findPasswordAccount, [
    req.user.id,
  ]);
  if (!account?.password_hash)
    throw new HttpError(
      400,
      "This account signs in with Google and has no password to change",
    );
  if (!(await verifyPassword(b.currentPassword, account.password_hash)))
    throw new HttpError(400, "Your current password is incorrect");
  if (b.password === b.currentPassword)
    throw new HttpError(400, "Choose a password you have not used just now");
  const weak = passwordProblem(b.password, {
    email: account.email,
    name: account.name,
  });
  if (weak) throw new HttpError(400, weak);
  await query(peopleQueries.changePassword, [
    await hashPassword(b.password),
    req.user.id,
  ]);
  const result = await query(peopleQueries.revokeOtherSessions, [
    req.user.id,
    req.tokenHash,
  ]);
  // Tell the member. Mail trouble never fails the change (sendMail does not throw).
  void sendMail({
    to: account.email,
    ...renderPasswordChangedEmail({ name: account.name, by: "user" }),
    template: "password_changed",
    userId: req.user.id,
  });
  res.json({ updated: true, otherSessionsSignedOut: result.affectedRows ?? 0 });
});
people.get("/me/privacy", async (req, res) => {
  res.json(await getPrivacy(req.user.id));
});
people.put("/me/privacy", async (req, res) => {
  const patch = privacySchema.parse(req.body);
  res.json(await savePrivacy(req.user.id, patch));
});
// The path segment is a member id (UUID) or an @username.
const memberId = async (value) => {
  if (id.safeParse(value).success) return value;
  const name = usernameSchema.safeParse(decodeURIComponent(value));
  if (!name.success) throw new HttpError(404, "User not found");
  const [row] = await query(peopleQueries.findIdByUsername, [name.data]);
  if (!row) throw new HttpError(404, "User not found");
  return row.id;
};
people.get("/users/:id", async (req, res) => {
  const rows = await query(peopleQueries.findPublicProfile, [
    await memberId(req.params.id),
  ]);
  if (!rows.length) throw new HttpError(404, "User not found");
  const privacy = await getPrivacy(rows[0].id);
  if (!(await canView(req.user, rows[0].id, privacy.profile))) {
    const { id, name, username, profileImageUrl } = rows[0];
    return res.json({
      id,
      name,
      username,
      profileImageUrl,
      restricted: true,
      restrictedTo: privacy.profile,
    });
  }
  res.json(rows[0]);
});
people.get("/users/:id/stats", async (req, res) => {
  const id = await memberId(req.params.id);
  const rows = await query(peopleQueries.findPublicProfile, [id]);
  if (!rows.length) throw new HttpError(404, "User not found");
  const [stats] = await query(
    peopleQueries.userActivityStats,
    Array(10).fill(id),
  );
  const privacy = await getPrivacy(id);
  const allowed = async (key) => canView(req.user, id, privacy[key]);
  const profileOpen = await allowed("profile");
  const hide = {
    posts: !profileOpen,
    likesReceived: !profileOpen || !(await allowed("likes")),
    dislikesReceived: !profileOpen || !(await allowed("dislikes")),
    referrals: !profileOpen || !(await allowed("referrals")),
    openReferrals: !profileOpen || !(await allowed("referrals")),
    followers: !profileOpen || !(await allowed("followers")),
    following: !profileOpen || !(await allowed("following")),
    connections: !profileOpen || !(await allowed("connections")),
  };
  res.json({
    ...Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [
        key,
        hide[key] ? null : Number(value),
      ]),
    ),
    hidden: Object.keys(hide).filter((key) => hide[key]),
  });
});
people.get("/users/:id/followers", async (req, res) => {
  const id = uuid(req.params.id);
  const { limit, offset } = page(req);
  await mustExist(query, "users", id);
  await requireVisible(req, id, "followers");
  res.json(await query(peopleQueries.listFollowers({ limit, offset }), [id]));
});
people.get("/users/:id/following", async (req, res) => {
  const id = uuid(req.params.id);
  const { limit, offset } = page(req);
  await mustExist(query, "users", id);
  await requireVisible(req, id, "following");
  res.json(await query(peopleQueries.listFollowing({ limit, offset }), [id]));
});
people.get("/users/:id/connections", async (req, res) => {
  const id = uuid(req.params.id);
  const { limit, offset } = page(req);
  await mustExist(query, "users", id);
  await requireVisible(req, id, "connections");
  res.json(
    await query(peopleQueries.listAcceptedConnections({ limit, offset }), [
      id,
      id,
      id,
    ]),
  );
});
// Only the member can see who reacted to their posts.
people.get("/users/:id/reactions", async (req, res) => {
  const id = uuid(req.params.id);
  if (id !== req.user.id)
    throw new HttpError(403, "Only you can see who reacted to your posts");
  const { type } = z
    .object({ type: z.enum(["like", "dislike"]) })
    .parse(req.query);
  const { limit, offset } = page(req);
  res.json(
    await query(peopleQueries.listReactionsReceived({ limit, offset }), [
      id,
      type,
    ]),
  );
});
// Avatar and cover come from the caller's own uploads (or null to remove).
const imageKinds = {
  profile: peopleQueries.setProfileImage,
  cover: peopleQueries.setCoverImage,
};
people.put("/me/images/:kind", async (req, res) => {
  const sql = Object.hasOwn(imageKinds, req.params.kind)
    ? imageKinds[req.params.kind]
    : null;
  if (!sql) throw new HttpError(404, "Unknown image type");
  const { uploadId } = z.object({ uploadId: z.uuid() }).parse(req.body);
  const [upload] = await query(peopleQueries.findOwnedUploadFile, [
    uploadId,
    req.user.id,
  ]);
  if (!upload) throw new HttpError(400, "Invalid upload");
  const url = `/uploads/${upload.file}`;
  await query(sql, [url, req.user.id]);
  res.json({ url });
});
people.delete("/me/images/:kind", async (req, res) => {
  const sql = Object.hasOwn(imageKinds, req.params.kind)
    ? imageKinds[req.params.kind]
    : null;
  if (!sql) throw new HttpError(404, "Unknown image type");
  await query(sql, [null, req.user.id]);
  res.status(204).end();
});
people.patch("/me", async (req, res) => {
  const body = z
    .object({
      name: text(100),
      username: usernameSchema,
      role: z.string().trim().max(160),
      about: z.string().max(5000),
      skills: z.array(text(80)).max(30),
      nextChapter: z.string().max(3000),
      openToWork: z.boolean(),
      location: z.string().trim().max(160),
      websiteUrl: z
        .url()
        .max(2048)
        .refine((value) => /^https?:\/\//.test(value))
        .nullable(),
      linkedinProfileUrl: z
        .url()
        .max(2048)
        .refine((value) => /^https?:\/\//.test(value))
        .nullable(),
    })
    .partial()
    .strict()
    .parse(req.body);
  if (!Object.keys(body).length)
    throw new HttpError(400, "No profile fields supplied");
  if (body.username) await assertUsernameFree(body.username, req.user.id);
  const profileQuery = buildProfileUpdateQuery(body, req.user.id);
  await query(profileQuery.sql, profileQuery.params);
  res.json({ updated: true });
});
people.put("/users/:id/follow", async (req, res) => {
  const other = uuid(req.params.id);
  if (other === req.user.id) throw new HttpError(400, "Cannot follow yourself");
  await mustExist(query, "users", other);
  await query(peopleQueries.createFollow, [req.user.id, other]);
  res.json({ following: true });
});
people.delete("/users/:id/follow", async (req, res) => {
  await query(peopleQueries.deleteFollow, [req.user.id, uuid(req.params.id)]);
  res.status(204).end();
});
people.get("/connections", async (req, res) => {
  const { limit, offset } = page(req);
  res.json(
    await query(peopleQueries.listConnections({ limit, offset }), [
      req.user.id,
      req.user.id,
      req.user.id,
    ]),
  );
});
people.post("/connections", async (req, res) => {
  const { userId } = z.object({ userId: z.uuid() }).parse(req.body);
  if (userId === req.user.id)
    throw new HttpError(400, "Cannot connect to yourself");
  const result = await transaction(async (c) => {
    await mustExist(query, "users", userId, c);
    if ((await getPrivacy(userId, c)).connect === "only_me")
      throw new HttpError(
        403,
        "This member isn't accepting connection requests",
        "PRIVATE",
      );
    const pair = [req.user.id, userId].sort().join(":");
    const existing = await query(peopleQueries.findConnectionByPair, [pair], c);
    if (existing.length) return existing[0];
    const id = randomUUID();
    await query(
      peopleQueries.createConnection,
      [id, req.user.id, userId, pair],
      c,
    );
    await notify(
      c,
      userId,
      req.user,
      "connection",
      id,
      `${req.user.name} sent you a connection request.`,
    );
    return { id, status: "pending" };
  });
  res.status(201).json(result);
});
people.patch("/connections/:id", async (req, res) => {
  const { status } = z
    .object({ status: z.literal("accepted") })
    .parse(req.body);
  const result = await transaction(async (c) => {
    const [row] = await query(
      peopleQueries.lockConnection,
      [uuid(req.params.id)],
      c,
    );
    if (!row) throw new HttpError(404, "Connection not found");
    if (row.recipient_id !== req.user.id)
      throw new HttpError(403, "Only the recipient can accept");
    if (row.status !== "accepted") {
      await query(peopleQueries.acceptConnection, [status, row.id], c);
      await notify(
        c,
        row.requester_id,
        req.user,
        "connection_accepted",
        row.id,
        `${req.user.name} accepted your connection request.`,
      );
    }
    return { id: row.id, status };
  });
  res.json(result);
});
people.delete("/connections/:id", async (req, res) => {
  const result = await query(peopleQueries.deleteConnection, [
    uuid(req.params.id),
    req.user.id,
    req.user.id,
  ]);
  if (!result.affectedRows) throw new HttpError(404, "Connection not found");
  res.status(204).end();
});
