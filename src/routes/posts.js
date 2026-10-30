import { postQueries } from "../queries/posts.queries.js";
import { buildPostFeedQuery } from "../queries/post-feed.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { HttpError, page, text, uuid, mustExist } from "../http.js";
import { notify } from "../notifications.js";
export const posts = Router();
posts.get("/topics", async (req, res) =>
  res.json(await query(postQueries.trendingTopics, [req.user.id])),
);
export const topics = [
  "Personal experience",
  "Offering referrals",
  "Career advice",
  "Layoff updates",
  "Hiring",
  "General discussion",
];
const postSchema = z.object({
  text: text(20000),
  topic: z.enum(topics).default("General discussion"),
  companyId: z.uuid().nullable().default(null),
  anonymous: z.boolean().default(false),
  uploadId: z.uuid().nullable().default(null),
});
async function author(postId, connection) {
  const [p] = await query(postQueries.findAuthor, [uuid(postId)], connection);
  if (!p) throw new HttpError(404, "Post not found");
  return p;
}
posts.get("/", async (req, res) => {
  const { limit, offset } = page(req);
  const filters = z
    .object({
      search: z.string().max(200).default(""),
      topic: z.enum(topics).optional(),
      companyId: z.uuid().optional(),
      tab: z
        .enum(["all", "following", "referrals", "bookmarks", "hidden"])
        .default("all"),
      sort: z.enum(["latest", "most-liked"]).default("latest"),
    })
    .parse(req.query);
  const feedQuery = buildPostFeedQuery({
    filters,
    userId: req.user.id,
    limit,
    offset,
  });
  const rows = await query(feedQuery.sql, feedQuery.params);
  res.json(
    rows.map((p) => ({ ...p, image: p.image ? `/uploads/${p.image}` : null })),
  );
});
posts.post("/", async (req, res) => {
  const body = postSchema.parse(req.body);
  if (body.companyId) await mustExist(query, "companies", body.companyId);
  if (body.uploadId) {
    const rows = await query(postQueries.findOwnedUpload, [
      body.uploadId,
      req.user.id,
    ]);
    if (!rows.length) throw new HttpError(400, "Invalid upload");
  }
  const id = randomUUID();
  await query(postQueries.createPost, [
    id,
    req.user.id,
    body.text,
    body.topic,
    body.companyId,
    body.anonymous,
    body.uploadId,
  ]);
  res.status(201).json({ id, ...body });
});
posts.delete("/:id", async (req, res) => {
  const p = await author(req.params.id);
  if (p.user_id !== req.user.id)
    throw new HttpError(403, "Only the author can delete");
  await query(postQueries.deletePost, [req.params.id]);
  res.status(204).end();
});
posts.put("/:id/reaction", async (req, res) => {
  const { reaction } = z
    .object({ reaction: z.enum(["like", "dislike"]) })
    .parse(req.body);
  await transaction(async (c) => {
    const p = await author(req.params.id, c);
    const old = await query(
      postQueries.findReaction,
      [req.params.id, req.user.id],
      c,
    );
    await query(
      postQueries.upsertReaction,
      [req.params.id, req.user.id, reaction],
      c,
    );
    if (reaction === "like" && old[0]?.reaction !== "like")
      await notify(
        c,
        p.user_id,
        req.user,
        "like",
        req.params.id,
        `${req.user.name} liked your post.`,
      );
  });
  res.json({ reaction });
});
posts.delete("/:id/reaction", async (req, res) => {
  await query(postQueries.deleteReaction, [uuid(req.params.id), req.user.id]);
  res.status(204).end();
});
for (const [route, table] of [
  ["bookmark", "bookmarks"],
  ["repost", "reposts"],
  ["hide", "hidden_posts"],
]) {
  posts.put(`/:id/${route}`, async (req, res) => {
    await author(req.params.id);
    await query(postQueries.addPostAction({ table }), [
      req.params.id,
      req.user.id,
    ]);
    res.json({ active: true });
  });
  posts.delete(`/:id/${route}`, async (req, res) => {
    await query(postQueries.removePostAction({ table }), [
      uuid(req.params.id),
      req.user.id,
    ]);
    res.status(204).end();
  });
}
posts.delete("/hidden/all", async (req, res) => {
  await query(postQueries.restoreHiddenPosts, [req.user.id]);
  res.status(204).end();
});
posts.get("/:id/comments", async (req, res) => {
  await author(req.params.id);
  const { limit, offset } = page(req);
  res.json(
    await query(postQueries.listComments({ limit, offset }), [req.params.id]),
  );
});
posts.post("/:id/comments", async (req, res) => {
  const body = z.object({ text: text(5000) }).parse(req.body);
  const id = randomUUID();
  await transaction(async (c) => {
    const p = await author(req.params.id, c);
    await query(
      postQueries.createComment,
      [id, req.params.id, req.user.id, body.text],
      c,
    );
    await notify(
      c,
      p.user_id,
      req.user,
      "comment",
      req.params.id,
      `${req.user.name} commented on your post.`,
    );
  });
  res.status(201).json({ id, ...body });
});
posts.get("/:id/notes", async (req, res) => {
  await author(req.params.id);
  const { limit, offset } = page(req);
  res.json(
    await query(postQueries.listVisibleNotes({ limit, offset }), [
      req.params.id,
      req.user.id,
    ]),
  );
});
posts.post("/:id/notes", async (req, res) => {
  const body = z
    .object({
      text: text(5000),
      sourceUrl: z
        .url()
        .max(2048)
        .refine((v) => /^https?:\/\//.test(v)),
    })
    .parse(req.body);
  await author(req.params.id);
  const id = randomUUID();
  await query(postQueries.createNote, [
    id,
    req.params.id,
    req.user.id,
    body.text,
    body.sourceUrl,
  ]);
  res.status(201).json({ id, status: "pending" });
});
posts.post("/:id/reports", async (req, res) => {
  const { reason } = z.object({ reason: text(1000) }).parse(req.body);
  await author(req.params.id);
  await query(postQueries.upsertReport, [
    randomUUID(),
    req.params.id,
    req.user.id,
    reason,
  ]);
  res.status(201).json({ status: "pending" });
});
