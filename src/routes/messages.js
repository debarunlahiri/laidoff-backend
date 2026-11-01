import { messageQueries } from "../queries/messages.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { HttpError, page, text, uuid, mustExist } from "../http.js";
import { publish } from "../realtime.js";
import multer from "multer";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
export const messages = Router();

// Attachments are kept outside the public uploads folder and only served to the
// two people in the conversation. Types are checked by file signature, not name.
const zip = (b) =>
  b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const ole = (b) => b.subarray(0, 4).toString("hex") === "d0cf11e0";
const office = (ext, mime, match) => ({ exts: [ext], mime, match });
const attachmentTypes = [
  {
    exts: ["png"],
    mime: "image/png",
    match: (b) => b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
  },
  {
    exts: ["jpg", "jpeg"],
    mime: "image/jpeg",
    match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    exts: ["gif"],
    mime: "image/gif",
    match: (b) => b.subarray(0, 3).toString("latin1") === "GIF",
  },
  {
    exts: ["webp"],
    mime: "image/webp",
    match: (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  {
    exts: ["pdf"],
    mime: "application/pdf",
    match: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  },
  office(
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    zip,
  ),
  office(
    "xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip,
  ),
  office(
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip,
  ),
  office("doc", "application/msword", ole),
  office("xls", "application/vnd.ms-excel", ole),
  office("ppt", "application/vnd.ms-powerpoint", ole),
  {
    exts: ["txt"],
    mime: "text/plain",
    match: (b) => !b.subarray(0, 1024).includes(0),
  },
  {
    exts: ["csv"],
    mime: "text/csv",
    match: (b) => !b.subarray(0, 1024).includes(0),
  },
];
const maxAttachments = 3;
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: maxAttachments, fields: 2 },
});
// Browsers only render these inline; everything else downloads.
const inlineMimes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
async function withAttachments(rows) {
  if (!rows.length) return rows;
  const files = await query(
    messageQueries.listAttachments(rows.length),
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    attachments: files
      .filter((file) => file.messageId === row.id)
      .map(({ messageId: _messageId, ...file }) => file),
  }));
}
async function membership(id, userId, c) {
  const [row] = await query(
    messageQueries.findMembership,
    [uuid(id), userId, userId],
    c,
  );
  if (!row) throw new HttpError(404, "Conversation not found");
  return row;
}
messages.get("/", async (req, res) => {
  const { limit, offset } = page(req);
  res.json(
    await query(messageQueries.listConversations({ limit, offset }), [
      req.user.id,
      req.user.id,
      req.user.id,
      req.user.id,
    ]),
  );
});
messages.post("/", async (req, res) => {
  const { userId } = z.object({ userId: z.uuid() }).parse(req.body);
  if (userId === req.user.id)
    throw new HttpError(400, "Cannot message yourself");
  await mustExist(query, "users", userId);
  const pair = [userId, req.user.id].sort();
  const id = randomUUID();
  await query(messageQueries.upsertConversation, [id, ...pair, pair.join(":")]);
  const [row] = await query(messageQueries.findConversationByPair, [
    pair.join(":"),
  ]);
  res.status(201).json(row);
});
messages.get("/:id/messages", async (req, res) => {
  await membership(req.params.id, req.user.id);
  const { limit, offset } = page(req);
  const rows = await query(messageQueries.listMessages({ limit, offset }), [
    req.params.id,
  ]);
  res.json(await withAttachments(rows.reverse()));
});
messages.get("/:id/attachments/:attachmentId", async (req, res) => {
  const conversation = await membership(req.params.id, req.user.id);
  const [file] = await query(messageQueries.findAttachment, [
    uuid(req.params.attachmentId),
    conversation.id,
  ]);
  if (!file) throw new HttpError(404, "Attachment not found");
  const inline = inlineMimes.has(file.mime) && req.query.download !== "1";
  res.set({
    "Content-Type": file.mime,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, max-age=3600",
  });
  res.sendFile(path.join(config.privateUploadDir, file.storedName));
});
messages.post(
  "/:id/messages",
  attachmentUpload.array("files", maxAttachments),
  async (req, res) => {
    const { text: body } = z
      .object({ text: z.string().trim().max(10000).default("") })
      .parse(req.body ?? {});
    const uploads = req.files ?? [];
    if (!body && !uploads.length)
      throw new HttpError(400, "Write a message or attach a file");
    await membership(req.params.id, req.user.id);
    // Check every file before anything is written to disk.
    const accepted = uploads.map((file) => {
      const original = file.originalname.slice(0, 255);
      const ext = path.extname(original).slice(1).toLowerCase();
      const kind = attachmentTypes.find(
        (type) => type.exts.includes(ext) && type.match(file.buffer),
      );
      if (!kind)
        throw new HttpError(
          400,
          `"${original}" is not a supported file type (images, PDF, Office documents, TXT, CSV)`,
        );
      const id = randomUUID();
      return {
        id,
        original,
        mime: kind.mime,
        size: file.size,
        stored: `${id}.${kind.exts[0]}`,
        buffer: file.buffer,
      };
    });
    const id = randomUUID();
    let partnerId;
    const written = [];
    try {
      if (accepted.length)
        await mkdir(config.privateUploadDir, { recursive: true });
      for (const file of accepted) {
        const target = path.join(config.privateUploadDir, file.stored);
        await writeFile(target, file.buffer);
        written.push(target);
      }
      await transaction(async (c) => {
        const row = await membership(req.params.id, req.user.id, c);
        partnerId =
          row.first_participant_user_id === req.user.id
            ? row.second_participant_user_id
            : row.first_participant_user_id;
        await query(
          messageQueries.createMessage,
          [id, row.id, req.user.id, body],
          c,
        );
        for (const file of accepted)
          await query(
            messageQueries.createAttachment,
            [file.id, id, file.stored, file.original, file.mime, file.size],
            c,
          );
        // New messages are announced through the Chats unread badge and the
        // realtime "message.new" event below, not the notifications list.
      });
    } catch (error) {
      await Promise.all(
        written.map((target) => unlink(target).catch(() => {})),
      );
      throw error;
    }
    // After commit: tell both people's open tabs a message arrived.
    publish([partnerId, req.user.id], {
      type: "message.new",
      conversationId: req.params.id,
      senderId: req.user.id,
    });
    const [row] = await query(messageQueries.findMessage, [id]);
    const [message] = await withAttachments([row]);
    res.status(201).json(message);
  },
);
messages.put("/:id/read", async (req, res) => {
  await membership(req.params.id, req.user.id);
  const conversation = await membership(req.params.id, req.user.id);
  await query(messageQueries.markMessagesRead, [req.params.id, req.user.id]);
  publish(
    [
      conversation.first_participant_user_id,
      conversation.second_participant_user_id,
    ],
    {
      type: "message.read",
      conversationId: req.params.id,
      readerId: req.user.id,
    },
  );
  res.status(204).end();
});
