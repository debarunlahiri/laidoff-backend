import { messageQueries } from "../queries/messages.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { HttpError, page, text, uuid, mustExist } from "../http.js";
import { notify } from "../notifications.js";
export const messages = Router();
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
  res.json(rows.reverse());
});
messages.post("/:id/messages", async (req, res) => {
  const { text: body } = z.object({ text: text(10000) }).parse(req.body);
  const id = randomUUID();
  await transaction(async (c) => {
    const row = await membership(req.params.id, req.user.id, c);
    await query(
      messageQueries.createMessage,
      [id, row.id, req.user.id, body],
      c,
    );
    await notify(
      c,
      row.first_participant_user_id === req.user.id
        ? row.second_participant_user_id
        : row.first_participant_user_id,
      req.user,
      "message",
      row.id,
      `${req.user.name} sent you a message.`,
    );
  });
  const [row] = await query(messageQueries.findMessage, [id]);
  res.status(201).json(row);
});
messages.put("/:id/read", async (req, res) => {
  await membership(req.params.id, req.user.id);
  await query(messageQueries.markMessagesRead, [req.params.id, req.user.id]);
  res.status(204).end();
});
