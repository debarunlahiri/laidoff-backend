import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db/db.js";
import { HttpError, page, text, uuid } from "../utils/http.js";
import { supportQueries as sql } from "../queries/support.queries.js";
import {
  supportImageUpload,
  supportImageStore,
} from "../services/support-images.js";
import { notify } from "../services/notifications.js";

export const supportStatuses = [
  "open",
  "in_progress",
  "waiting_on_you",
  "resolved",
  "closed",
];
const statusLabels = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_you: "Waiting for your reply",
  resolved: "Resolved",
  closed: "Closed",
};
const createSchema = z.strictObject({
  subject: text(160),
  category: z.enum([
    "account",
    "technical",
    "referrals",
    "safety",
    "feedback",
    "other",
  ]),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  description: text(10000),
});
const replySchema = z.strictObject({ body: text(10000) });

// Mounted after session authentication; the admin variant is additionally mounted
// inside the existing admin permission gate. Dependencies allow database-free tests.
export function createSupportRouter({
  admin = false,
  database = query,
  runTransaction = transaction,
  sendNotification = notify,
  imageStore = supportImageStore,
} = {}) {
  const router = Router();
  router.use((req, _res, next) => {
    if (!req.user?.id) throw new HttpError(401, "Authentication required");
    if (admin && !req.user.isAdmin) throw new HttpError(404, "Route not found");
    next();
  });
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  const writeLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: admin ? 100 : 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        message: "Too many support requests. Please try again shortly.",
      },
    },
  });
  const owner = (req) => (admin ? null : req.user.id);
  async function find(req, connection, lock = false) {
    const [ticket] = await database(
      sql.find({ admin, lock }),
      [uuid(req.params.id), owner(req), owner(req)],
      connection,
    );
    if (!ticket) throw new HttpError(404, "Support ticket not found");
    return ticket;
  }
  async function inform(connection, req, ticket, message) {
    if (admin)
      await sendNotification(
        connection,
        ticket.userId,
        req.user,
        "support_update",
        ticket.id,
        message,
      );
  }

  async function attach(connection, ticketId, messageId, images) {
    for (const [position, image] of images.entries()) {
      await database(
        sql.addImage,
        [
          image.id,
          ticketId,
          messageId,
          image.storedName,
          image.name,
          image.size,
          image.width,
          image.height,
          position,
        ],
        connection,
      );
    }
  }
  router.get("/:id/images/:imageId", async (req, res) => {
    const ticket = await find(req);
    const [image] = await database(sql.findImage, [
      uuid(req.params.imageId),
      ticket.id,
    ]);
    if (!image) throw new HttpError(404, "Image not found");
    res.set({
      "Content-Type": "image/webp",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    res.sendFile(imageStore.path(image.storedName));
  });

  router.get("/", async (req, res) => {
    const { limit, offset } = page(req);
    const status = z.enum(supportStatuses).optional().parse(req.query.status);
    const params = [owner(req), owner(req), status ?? null, status ?? null];
    const [items, [count]] = await Promise.all([
      database(sql.list({ admin }), [...params, limit, offset]),
      database(sql.count, params),
    ]);
    res.json({ items, total: count.total });
  });
  if (!admin)
    router.post("/", writeLimiter, supportImageUpload, async (req, res) => {
      const draft = createSchema.parse(req.body);
      const id = randomUUID();
      const images = await imageStore.save(req.files ?? []);
      try {
        await runTransaction(async (connection) => {
          await database(
            sql.create,
            [
              id,
              req.user.id,
              draft.subject,
              draft.category,
              draft.priority,
              draft.description,
            ],
            connection,
          );
          await attach(connection, id, null, images);
        });
      } catch (error) {
        await imageStore.remove(images);
        throw error;
      }
      res.status(201).json({ id });
    });
  router.get("/:id", async (req, res) => res.json(await find(req)));
  router.get("/:id/messages", async (req, res) => {
    const ticket = await find(req);
    const { limit, offset } = page(req);
    res.json(await database(sql.messages, [ticket.id, limit, offset]));
  });
  router.post(
    "/:id/messages",
    writeLimiter,
    supportImageUpload,
    async (req, res) => {
      const { body } = replySchema.parse(req.body);
      const id = randomUUID();
      // Check ownership before decoding any uploaded images, then lock again for writes.
      const accessible = await find(req);
      if (["resolved", "closed"].includes(accessible.status))
        throw new HttpError(409, "Reopen this ticket before adding a reply.");
      const images = await imageStore.save(req.files ?? []);
      try {
        await runTransaction(async (connection) => {
          const ticket = await find(req, connection, true);
          if (["resolved", "closed"].includes(ticket.status))
            throw new HttpError(
              409,
              "Reopen this ticket before adding a reply.",
            );
          await database(
            sql.addMessage,
            [id, ticket.id, req.user.id, admin, "reply", body],
            connection,
          );
          await attach(connection, ticket.id, id, images);
          // Both the reply and its queue status commit together. Locking the ticket
          // prevents concurrent resolve/reply requests from losing an update.
          await database(
            sql.updateStatus,
            [admin ? "waiting_on_you" : "open", ticket.id],
            connection,
          );
          await inform(
            connection,
            req,
            ticket,
            `Support replied to your ticket: ${ticket.subject}`,
          );
        });
      } catch (error) {
        await imageStore.remove(images);
        throw error;
      }
      res.status(201).json({ id });
    },
  );
  router.patch("/:id", writeLimiter, async (req, res) => {
    const { status } = z
      .strictObject({
        status: z.enum(admin ? supportStatuses : ["open", "resolved"]),
      })
      .parse(req.body);
    await runTransaction(async (connection) => {
      const ticket = await find(req, connection, true);
      if (ticket.status === status) return;
      await database(sql.updateStatus, [status, ticket.id], connection);
      await database(
        sql.addMessage,
        [
          randomUUID(),
          ticket.id,
          req.user.id,
          admin,
          "status",
          `Status changed to ${statusLabels[status]}.`,
        ],
        connection,
      );
      await inform(
        connection,
        req,
        ticket,
        `Your support ticket is now ${statusLabels[status].toLowerCase()}: ${ticket.subject}`,
      );
    });
    res.status(204).end();
  });
  return router;
}

export const support = createSupportRouter();
export const adminSupport = createSupportRouter({ admin: true });
