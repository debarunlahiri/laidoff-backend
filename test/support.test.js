import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { createSupportRouter } from "../src/routes/support.js";
import { supportQueries as sql } from "../src/queries/support.queries.js";
import { enforceVerification } from "../src/middleware/verification-gate.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const ticketId = "00000000-0000-4000-8000-000000000003";
const adminId = "00000000-0000-4000-8000-000000000004";
const draft = {
  subject: " Sign-in issue ",
  category: "account",
  priority: "high",
  description: "I cannot verify my email.",
};

function harness({
  admin = false,
  userId = ownerId,
  isAdmin = admin,
  status = "open",
  failNotification = false,
} = {}) {
  let tickets = [
    {
      id: ticketId,
      userId: ownerId,
      subject: "Sign-in issue",
      category: "account",
      priority: "normal",
      status,
    },
  ];
  let messages = [];
  let images = [];
  const removed = [];
  const savedBatches = [];
  const calls = [];
  const notifications = [];
  const connection = {};
  let commits = 0;
  let rollbacks = 0;
  const database = async (statement, params, conn) => {
    calls.push({ statement, params, connection: conn });
    if (statement === sql.create) {
      const [id, userId, subject, category, priority, description] = params;
      tickets.push({
        id,
        userId,
        subject,
        category,
        priority,
        description,
        status: "open",
      });
      return { affectedRows: 1 };
    }
    if (statement === sql.updateStatus) {
      tickets.find((t) => t.id === params[1]).status = params[0];
      return { affectedRows: 1 };
    }
    if (statement === sql.addMessage) {
      const [id, ticketId, userId, isStaff, kind, body] = params;
      messages.push({ id, ticketId, userId, isStaff, kind, body });
      return { affectedRows: 1 };
    }
    if (statement === sql.addImage) {
      const [
        id,
        ticketId,
        messageId,
        storedName,
        name,
        size,
        width,
        height,
        position,
      ] = params;
      images.push({
        id,
        ticketId,
        messageId,
        storedName,
        name,
        size,
        width,
        height,
        position,
      });
      return { affectedRows: 1 };
    }
    if (statement === sql.findImage)
      return images.filter(
        (image) => image.id === params[0] && image.ticketId === params[1],
      );
    if (statement === sql.messages)
      return messages
        .filter((m) => m.ticketId === params[0])
        .slice(params[2], params[2] + params[1]);
    if (statement === sql.count || statement === sql.list({ admin })) {
      assert.equal(params[0], admin ? null : userId);
      assert.equal(params[1], admin ? null : userId);
      const rows = tickets.filter(
        (t) =>
          (params[0] === null || t.userId === params[0]) &&
          (!params[2] || t.status === params[2]),
      );
      return statement === sql.count
        ? [{ total: rows.length }]
        : rows.slice(params[5], params[5] + params[4]);
    }
    if (
      [sql.find({ admin }), sql.find({ admin, lock: true })].includes(statement)
    ) {
      assert.equal(params[1], admin ? null : userId);
      assert.equal(params[2], admin ? null : userId);
      return tickets
        .filter(
          (t) =>
            t.id === params[0] &&
            (params[1] === null || t.userId === params[1]),
        )
        .map((t) => ({ ...t }));
    }
    throw new Error("Unexpected SQL");
  };
  const runTransaction = async (fn) => {
    const previous = structuredClone({ tickets, messages, images });
    try {
      const result = await fn(connection);
      commits++;
      return result;
    } catch (error) {
      tickets = previous.tickets;
      messages = previous.messages;
      images = previous.images;
      rollbacks++;
      throw error;
    }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = userId ? { id: userId, isAdmin } : null;
    next();
  });
  app.use(
    "/",
    createSupportRouter({
      admin,
      database,
      runTransaction,
      imageStore: {
        async save(files) {
          savedBatches.push(files);
          return files.map((file) => {
            const id = randomUUID();
            return {
              id,
              storedName: `${id}.webp`,
              name: file.originalname,
              size: file.size,
              width: 1,
              height: 1,
            };
          });
        },
        async remove(files) {
          removed.push(...files);
        },
        path() {
          throw new Error("Unexpected disk access");
        },
      },
      sendNotification: async (...args) => {
        if (failNotification) throw new Error("Notification write failed");
        notifications.push(args);
      },
    }),
  );
  app.use((error, _req, res, _next) =>
    res
      .status(
        error instanceof ZodError || error instanceof multer.MulterError
          ? 400
          : (error.status ?? 500),
      )
      .json({ error: { message: error.message } }),
  );
  return {
    app,
    calls,
    notifications,
    removed,
    savedBatches,
    connection,
    state: () => ({ tickets, messages, images, commits, rollbacks }),
  };
}

test("members only list their own tickets; an admin can list the queue", async () => {
  const own = await request(harness().app).get("/").expect(200);
  assert.equal(own.body.total, 1);
  assert.match(own.headers["cache-control"], /no-store/);
  const other = await request(harness({ userId: otherId }).app)
    .get("/")
    .expect(200);
  assert.equal(other.body.total, 0);
  const admin = await request(harness({ admin: true, userId: adminId }).app)
    .get("/?status=open&limit=1")
    .expect(200);
  assert.equal(admin.body.items.length, 1);
});
test("another member cannot read, reply, or update a ticket", async () => {
  const { app } = harness({ userId: otherId });
  await request(app).get(`/${ticketId}`).expect(404);
  await request(app).get(`/${ticketId}/messages`).expect(404);
  await request(app)
    .post(`/${ticketId}/messages`)
    .send({ body: "Intrusion" })
    .expect(404);
  await request(app)
    .patch(`/${ticketId}`)
    .send({ status: "resolved" })
    .expect(404);
});
test("support requires authentication and admin support rejects non-admins", async () => {
  await request(harness({ userId: null }).app)
    .get("/")
    .expect(401);
  await request(harness({ admin: true, isAdmin: false }).app)
    .get("/")
    .expect(404);
});
test("creation validates and binds the signed-in owner rather than accepting one from the client", async () => {
  const h = harness();
  const response = await request(h.app).post("/").send(draft).expect(201);
  const saved = h.state().tickets.find((t) => t.id === response.body.id);
  assert.equal(saved.subject, "Sign-in issue");
  assert.equal(saved.userId, ownerId);
  await request(h.app)
    .post("/")
    .send({ ...draft, userId: otherId })
    .expect(400);
  await request(h.app)
    .post("/")
    .send({ ...draft, subject: " " })
    .expect(400);
  await request(h.app)
    .post("/")
    .send({ ...draft, description: "x".repeat(10001) })
    .expect(400);
});
test("invalid pagination, identifiers, category, and staff-only status values are rejected", async () => {
  const h = harness();
  await request(h.app).get("/?offset=-1").expect(400);
  await request(h.app).get("/?limit=101").expect(400);
  await request(h.app).get("/?status=unknown").expect(400);
  await request(h.app).get("/invalid-id").expect(400);
  await request(h.app)
    .post("/")
    .send({ ...draft, category: "unknown" })
    .expect(400);
  await request(h.app)
    .patch(`/${ticketId}`)
    .send({ status: "closed" })
    .expect(400);
  assert.equal(h.state().messages.length, 0);
});
test("reply writes lock the owner-scoped ticket and update status in the same transaction", async () => {
  const h = harness({ status: "waiting_on_you" });
  await request(h.app)
    .post(`/${ticketId}/messages`)
    .send({ body: "More detail" })
    .expect(201);
  assert.equal(h.state().tickets[0].status, "open");
  assert.equal(h.state().messages[0].isStaff, false);
  assert.equal(h.state().commits, 1);
  assert.ok(
    h.calls.some(
      (c) =>
        c.statement.includes("FOR UPDATE OF t") &&
        c.connection === h.connection,
    ),
  );
  assert.ok(
    h.calls
      .filter(
        (c) =>
          c.statement === sql.addMessage || c.statement === sql.updateStatus,
      )
      .every((c) => c.connection === h.connection),
  );
});
test("admin replies request a member response and notify only the ticket owner", async () => {
  const h = harness({ admin: true, userId: adminId });
  await request(h.app)
    .post(`/${ticketId}/messages`)
    .send({ body: "Please try again." })
    .expect(201);
  assert.equal(h.state().tickets[0].status, "waiting_on_you");
  assert.equal(h.state().messages[0].isStaff, true);
  assert.equal(h.notifications[0][1], ownerId);
  assert.equal(h.notifications[0][3], "support_update");
  assert.equal(h.notifications[0][4], ticketId);
});
test("closed and resolved tickets reject replies until reopened", async () => {
  for (const status of ["resolved", "closed"]) {
    const h = harness({ status });
    await request(h.app)
      .post(`/${ticketId}/messages`)
      .send({ body: "Hello" })
      .expect(409);
    assert.equal(h.state().messages.length, 0);
    await request(h.app)
      .patch(`/${ticketId}`)
      .send({ status: "open" })
      .expect(204);
    await request(h.app)
      .post(`/${ticketId}/messages`)
      .send({ body: "Hello" })
      .expect(201);
  }
});
test("status changes leave a visible history and repeated changes create no duplicate event", async () => {
  const h = harness();
  await request(h.app)
    .patch(`/${ticketId}`)
    .send({ status: "resolved" })
    .expect(204);
  await request(h.app)
    .patch(`/${ticketId}`)
    .send({ status: "resolved" })
    .expect(204);
  assert.equal(h.state().messages.length, 1);
  assert.equal(h.state().messages[0].kind, "status");
  assert.equal(h.state().messages[0].body, "Status changed to Resolved.");
});
test("a failed notification rolls back both the reply and the ticket status", async () => {
  const h = harness({ admin: true, userId: adminId, failNotification: true });
  await request(h.app)
    .post(`/${ticketId}/messages`)
    .send({ body: "Not committed" })
    .expect(500);
  assert.equal(h.state().messages.length, 0);
  assert.equal(h.state().tickets[0].status, "open");
  assert.equal(h.state().rollbacks, 1);
});
test("SQL-looking text stays in bound parameters", async () => {
  const h = harness();
  const subject = "'; DROP TABLE support_tickets; --";
  await request(h.app)
    .post("/")
    .send({ ...draft, subject })
    .expect(201);
  const call = h.calls.find((c) => c.statement === sql.create);
  assert.ok(!call.statement.includes(subject));
  assert.equal(call.params[2], subject);
});
test("expired verification allows only the narrow support namespace", async () => {
  await enforceVerification({
    path: "/support",
    method: "POST",
    user: { id: ownerId },
  });
  await enforceVerification({
    path: `/support/${ticketId}/messages`,
    method: "POST",
    user: { id: ownerId },
  });
});

// Route tests use a fake image store; actual byte validation lives in support-images.js.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
function multipartDraft(app, count) {
  let pending = request(app).post("/");
  for (const [key, value] of Object.entries(draft))
    pending = pending.field(key, value);
  for (let i = 0; i < count; i++)
    pending = pending.attach("images", png, `screenshot-${i}.png`);
  return pending;
}
test("five images commit with the initial ticket in selection order", async () => {
  const h = harness();
  const response = await multipartDraft(h.app, 5).expect(201);
  assert.equal(h.state().images.length, 5);
  assert.deepEqual(
    h.state().images.map((image) => image.position),
    [0, 1, 2, 3, 4],
  );
  assert.ok(
    h
      .state()
      .images.every(
        (image) =>
          image.ticketId === response.body.id && image.messageId === null,
      ),
  );
  assert.ok(
    h.calls
      .filter((call) => call.statement === sql.addImage)
      .every((call) => call.connection === h.connection),
  );
});
test("a sixth image is rejected before saving any ticket or files", async () => {
  const h = harness();
  await multipartDraft(h.app, 6).expect(400);
  assert.equal(h.savedBatches.length, 0);
  assert.equal(h.state().tickets.length, 1);
  assert.equal(h.state().images.length, 0);
});
test("reply attachments are linked to the reply and ticket", async () => {
  const h = harness();
  const response = await request(h.app)
    .post(`/${ticketId}/messages`)
    .field("body", "Screenshots")
    .attach("images", png, "screen.png")
    .expect(201);
  assert.equal(h.state().images[0].ticketId, ticketId);
  assert.equal(h.state().images[0].messageId, response.body.id);
});
test("other members cannot fetch images or cause image processing for a reply", async () => {
  const h = harness({ userId: otherId });
  await request(h.app).get(`/${ticketId}/images/${adminId}`).expect(404);
  await request(h.app)
    .post(`/${ticketId}/messages`)
    .field("body", "Intrusion")
    .attach("images", png, "screen.png")
    .expect(404);
  assert.equal(h.savedBatches.length, 0);
  assert.ok(!h.calls.some((call) => call.statement === sql.findImage));
});
test("failed reply transactions remove stored images and roll back their records", async () => {
  const h = harness({ admin: true, userId: adminId, failNotification: true });
  await request(h.app)
    .post(`/${ticketId}/messages`)
    .field("body", "Screenshots")
    .attach("images", png, "screen.png")
    .expect(500);
  assert.equal(h.state().messages.length, 0);
  assert.equal(h.state().images.length, 0);
  assert.equal(h.removed.length, 1);
});
