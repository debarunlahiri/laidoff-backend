import { postQueries } from "../queries/posts.queries.js";
import { buildPostFeedQuery } from "../queries/post-feed.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { HttpError, page, text, uuid, mustExist } from "../http.js";
import { notify } from "../notifications.js";
import { postImageQueries } from "../queries/post-images.queries.js";
import { attachPostImages } from "../post-images.js";
import { attachPolls } from "../post-polls.js";
import { postPollQueries } from "../queries/post-polls.queries.js";
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
posts.get("/topic-options", (_req, res) => res.json(topics));
export const reportCategories = [
  { value: "spam", label: "Spam or misleading promotion" },
  { value: "harassment", label: "Harassment or hate" },
  { value: "misinformation", label: "False or misleading information" },
  { value: "inappropriate", label: "Inappropriate or unsafe content" },
  { value: "other", label: "Something else" },
];
posts.get("/report-categories", (_req, res) => res.json(reportCategories));
const postSchema = z
  .object({
    // Text may be empty when the post is photos only.
    text: z.string().trim().max(20000).default(""),
    topic: z.enum(topics).default("General discussion"),
    companyId: z.uuid().nullable().default(null),
    anonymous: z.boolean().default(false),
    uploadId: z.uuid().nullable().default(null), // single photo (older clients)
    uploadIds: z.array(z.uuid()).max(6).default([]),
    // 2-6 options; durationHours null means the poll never closes.
    poll: z
      .object({
        options: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
        allowMultiple: z.boolean().default(false),
        durationHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 30)
          .nullable()
          .default(null),
      })
      .nullable()
      .default(null),
  })
  .refine((post) => post.text || post.uploadId || post.uploadIds.length, {
    message: "Write something or add a photo",
  })
  .refine((post) => !post.poll || post.text, {
    message: "Add a question for your poll",
  })
  .refine(
    (post) =>
      !post.poll ||
      new Set(post.poll.options.map((option) => option.toLowerCase())).size ===
        post.poll.options.length,
    { message: "Poll options must be different from each other" },
  );
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
      authorId: z.uuid().optional(),
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
  res.json(await attachPolls(await attachPostImages(rows), req.user.id));
});
posts.get("/:id/engagement", async (req, res) => {
  await author(req.params.id);
  const { type } = z
    .object({
      type: z.enum([
        "likes",
        "dislikes",
        "comments",
        "shares",
        "reposts",
        "views",
      ]),
    })
    .parse(req.query);
  // Only the author can see who viewed their post.
  if (type === "views" && (await author(req.params.id)).user_id !== req.user.id)
    throw new HttpError(403, "Only the author can see who viewed this post");
  const { limit, offset } = page(req);
  res.json(
    await query(postQueries.listEngagement({ type, limit, offset }), [
      req.params.id,
    ]),
  );
});
function deviceType(userAgent = "") {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}
posts.post("/:id/view", async (req, res) => {
  const { source } = z
    .object({ source: z.enum(["detail", "feed"]).default("detail") })
    .parse(req.body ?? {});
  const post = await author(req.params.id);
  // The author's own visits don't count.
  if (post.user_id !== req.user.id)
    await query(postQueries.recordView, [
      req.params.id,
      req.user.id,
      deviceType(req.get("user-agent")),
      source,
    ]);
  const [{ views }] = await query(postQueries.countViews, [req.params.id]);
  res.json({ views });
});
posts.put("/:id/share", async (req, res) => {
  await author(req.params.id);
  await query(postQueries.addShare, [req.params.id, req.user.id]);
  const [{ shares }] = await query(postQueries.countShares, [req.params.id]);
  res.json({ shares });
});
posts.get("/:id", async (req, res) => {
  const postId = uuid(req.params.id);
  const feedQuery = buildPostFeedQuery({
    filters: { id: postId, tab: "all", sort: "latest" },
    userId: req.user.id,
    limit: 1,
    offset: 0,
  });
  const rows = await query(feedQuery.sql, feedQuery.params);
  if (!rows.length) throw new HttpError(404, "Post not found");
  const [post] = await attachPolls(await attachPostImages(rows), req.user.id);
  res.json(post);
});
posts.post("/", async (req, res) => {
  const body = postSchema.parse(req.body);
  if (body.companyId) await mustExist(query, "companies", body.companyId);
  const uploadIds = [
    ...new Set([...(body.uploadId ? [body.uploadId] : []), ...body.uploadIds]),
  ].slice(0, 6);
  if (uploadIds.length) {
    const owned = await query(
      postImageQueries.findOwnedUploads({ count: uploadIds.length }),
      [req.user.id, ...uploadIds],
    );
    if (owned.length !== uploadIds.length)
      throw new HttpError(400, "Invalid upload");
  }
  const id = randomUUID();
  await transaction(async (c) => {
    await query(
      postQueries.createPost,
      [
        id,
        req.user.id,
        body.text,
        body.topic,
        body.companyId,
        body.anonymous,
        uploadIds[0] ?? null,
      ],
      c,
    );
    for (const [position, uploadId] of uploadIds.entries())
      await query(postImageQueries.addImage, [id, uploadId, position], c);
    if (body.poll) {
      const hours = body.poll.durationHours;
      await query(
        postPollQueries.createPoll,
        [id, body.poll.allowMultiple, hours, hours],
        c,
      );
      for (const [position, option] of body.poll.options.entries())
        await query(
          postPollQueries.addOption,
          [randomUUID(), id, option, position],
          c,
        );
    }
  });
  res.status(201).json({ id, ...body, uploadIds });
});
// Vote (or change your vote) while the poll is open. Single-choice polls take
// exactly one option; multiple-choice polls take one or more.
posts.put("/:id/poll/vote", async (req, res) => {
  const id = uuid(req.params.id);
  const { optionIds } = z
    .object({ optionIds: z.array(z.uuid()).min(1).max(6) })
    .parse(req.body);
  const chosen = [...new Set(optionIds)];
  await transaction(async (c) => {
    await author(id, c);
    const [poll] = await query(postPollQueries.findPoll, [id], c);
    if (!poll) throw new HttpError(404, "This post has no poll");
    if (poll.closed) throw new HttpError(409, "This poll has closed");
    const valid = new Set(
      (await query(postPollQueries.listOptionIds, [id], c)).map((o) => o.id),
    );
    if (chosen.some((option) => !valid.has(option)))
      throw new HttpError(400, "Choose options from this poll");
    if (!poll.allowMultiple && chosen.length !== 1)
      throw new HttpError(400, "Choose one option");
    await query(postPollQueries.clearVotes, [id, req.user.id], c);
    for (const option of chosen)
      await query(postPollQueries.addVote, [option, id, req.user.id], c);
  });
  const [row] = await attachPolls([{ id }], req.user.id);
  res.json(row.poll);
});
posts.delete("/:id/poll/vote", async (req, res) => {
  const id = uuid(req.params.id);
  await transaction(async (c) => {
    await author(id, c);
    const [poll] = await query(postPollQueries.findPoll, [id], c);
    if (!poll) throw new HttpError(404, "This post has no poll");
    if (poll.closed) throw new HttpError(409, "This poll has closed");
    await query(postPollQueries.clearVotes, [id, req.user.id], c);
  });
  const [row] = await attachPolls([{ id }], req.user.id);
  res.json(row.poll);
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
  const { sort, filter } = z
    .object({
      sort: z.enum(["oldest", "newest", "top"]).default("oldest"),
      filter: z.enum(["all", "mine", "replied"]).default("all"),
    })
    .parse(req.query);
  const viewer = req.user.id;
  const top = await query(
    postQueries.listComments({ limit, offset, sort, filter }),
    filter === "mine"
      ? [viewer, req.params.id, viewer]
      : [viewer, req.params.id],
  );
  const replies = top.length
    ? await query(postQueries.listReplies({ count: top.length }), [
        viewer,
        req.params.id,
        ...top.map((comment) => comment.id),
      ])
    : [];
  const withMedia = (comment) => ({
    ...comment,
    media: comment.media ? `/uploads/${comment.media}` : null,
  });
  res.json(
    top.map((comment) => ({
      ...withMedia(comment),
      replies: replies
        .filter((reply) => reply.parentId === comment.id)
        .map(withMedia),
    })),
  );
});
posts.post("/:id/comments", async (req, res) => {
  const body = z
    .object({
      text: z.string().trim().max(5000).default(""),
      parentId: z.uuid().optional(),
      uploadId: z.uuid().optional(),
    })
    .refine((comment) => comment.text || comment.uploadId, {
      message: "Write a comment or add a photo or GIF",
    })
    .parse(req.body);
  const id = randomUUID();
  await transaction(async (c) => {
    const p = await author(req.params.id, c);
    // Threads are two levels deep: replying to a reply attaches to its parent.
    let parentId = null;
    let target = null;
    if (body.parentId) {
      [target] = await query(
        postQueries.findComment,
        [body.parentId, req.params.id],
        c,
      );
      if (!target) throw new HttpError(404, "Comment not found");
      parentId = target.parentId ?? target.id;
    }
    if (body.uploadId) {
      const owned = await query(
        postQueries.findOwnedUpload,
        [body.uploadId, req.user.id],
        c,
      );
      if (!owned.length) throw new HttpError(400, "Upload not found");
    }
    await query(
      postQueries.createComment,
      [
        id,
        req.params.id,
        parentId,
        req.user.id,
        body.text,
        body.uploadId ?? null,
      ],
      c,
    );
    if (target && target.user_id !== p.user_id)
      await notify(
        c,
        target.user_id,
        req.user,
        "comment",
        req.params.id,
        `${req.user.name} replied to your comment.`,
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
posts.put("/:id/comments/:commentId/reaction", async (req, res) => {
  const { reaction } = z
    .object({ reaction: z.enum(["like", "dislike"]) })
    .parse(req.body);
  const [found] = await query(postQueries.findComment, [
    uuid(req.params.commentId),
    uuid(req.params.id),
  ]);
  if (!found) throw new HttpError(404, "Comment not found");
  await query(postQueries.upsertCommentReaction, [
    found.id,
    req.user.id,
    reaction,
  ]);
  res.json({ reaction });
});
posts.delete("/:id/comments/:commentId/reaction", async (req, res) => {
  await query(postQueries.deleteCommentReaction, [
    uuid(req.params.commentId),
    req.user.id,
  ]);
  res.status(204).end();
});
posts.post("/:id/comments/:commentId/reports", async (req, res) => {
  const body = z
    .object({
      category: z.enum(reportCategories.map((c) => c.value)).default("other"),
      reason: z.string().trim().max(1000).default(""),
    })
    .parse(req.body);
  const [comment] = await query(postQueries.findCommentAuthor, [
    uuid(req.params.commentId),
    uuid(req.params.id),
  ]);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (comment.user_id === req.user.id)
    throw new HttpError(400, "You can't report your own comment");
  const label = reportCategories.find((c) => c.value === body.category).label;
  await query(postQueries.upsertCommentReport, [
    randomUUID(),
    req.params.commentId,
    req.user.id,
    body.category,
    body.reason || label,
  ]);
  res.status(201).json({ status: "pending" });
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
  const body = z
    .object({
      category: z.enum(reportCategories.map((c) => c.value)).default("other"),
      reason: z.string().trim().max(1000).default(""),
    })
    .parse(req.body);
  const post = await author(req.params.id);
  if (post.user_id === req.user.id)
    throw new HttpError(400, "You can't report your own post");
  const label = reportCategories.find((c) => c.value === body.category).label;
  await query(postQueries.upsertReport, [
    randomUUID(),
    req.params.id,
    req.user.id,
    body.category,
    body.reason || label,
  ]);
  res.status(201).json({ status: "pending" });
});
