// Real-time channel (WebSocket). Browsers cannot send the HttpOnly session cookie to
// this server, so they first ask the authenticated REST API for a one-time ticket
// (POST /api/v1/ws-ticket) and present it when opening /ws.
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import { config } from "../config/config.js";
import { query } from "../db/db.js";
import { messageQueries } from "../queries/messages.queries.js";

const ticketLifetime = 30000;
const tickets = new Map(); // ticket -> { userId, expires }
const clients = new Map(); // userId -> Set<WebSocket>
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function issueTicket(userId, now = Date.now()) {
  for (const [ticket, entry] of tickets)
    if (entry.expires <= now) tickets.delete(ticket);
  const ticket = randomBytes(24).toString("base64url");
  tickets.set(ticket, { userId, expires: now + ticketLifetime });
  return ticket;
}
// Tickets are single use: consuming one removes it.
export function consumeTicket(ticket, now = Date.now()) {
  const entry = tickets.get(ticket ?? "");
  if (!entry) return null;
  tickets.delete(ticket);
  return entry.expires > now ? entry.userId : null;
}

// Sends one event to every open connection of the given users (all their tabs).
export function publish(userIds, event) {
  const payload = JSON.stringify(event);
  for (const userId of new Set(userIds)) {
    for (const socket of clients.get(userId) ?? [])
      if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function register(socket, userId) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(socket);
  socket.isAlive = true;
  socket.on("pong", () => (socket.isAlive = true));
  const partners = new Map(); // conversationId -> { partnerId, checked }
  let budget = 30; // typing messages allowed per 10 seconds
  const refill = setInterval(() => (budget = 30), 10000);

  async function partnerOf(conversationId) {
    const cached = partners.get(conversationId);
    if (cached && Date.now() - cached.checked < 60000) return cached.partnerId;
    const [row] = await query(messageQueries.findMembership, [
      conversationId,
      userId,
      userId,
    ]);
    const partnerId = row
      ? row.first_participant_user_id === userId
        ? row.second_participant_user_id
        : row.first_participant_user_id
      : null;
    partners.set(conversationId, { partnerId, checked: Date.now() });
    return partnerId;
  }

  socket.on("message", async (raw) => {
    if (budget-- <= 0) return;
    try {
      const data = JSON.parse(raw.toString());
      if (data?.type !== "typing" || !uuidPattern.test(data.conversationId))
        return;
      const partnerId = await partnerOf(data.conversationId);
      if (partnerId)
        publish([partnerId], {
          type: "typing",
          conversationId: data.conversationId,
          userId,
          typing: Boolean(data.typing),
        });
    } catch {
      // Malformed frames from a client are ignored.
    }
  });
  socket.on("close", () => {
    clearInterval(refill);
    clients.get(userId)?.delete(socket);
    if (!clients.get(userId)?.size) clients.delete(userId);
  });
  socket.on("error", () => socket.terminate());
  socket.send(JSON.stringify({ type: "ready" }));
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on("upgrade", (request, socket, head) => {
    const reject = (status) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/ws") return reject("404 Not Found");
    const origin = request.headers.origin;
    if (origin && !config.origins.includes(origin))
      return reject("403 Forbidden");
    const userId = consumeTicket(url.searchParams.get("ticket"));
    if (!userId) return reject("401 Unauthorized");
    wss.handleUpgrade(request, socket, head, (ws) => register(ws, userId));
  });
  // Drop connections whose peer vanished without closing.
  const heartbeat = setInterval(() => {
    for (const sockets of clients.values())
      for (const socket of sockets) {
        if (!socket.isAlive) socket.terminate();
        else {
          socket.isAlive = false;
          socket.ping();
        }
      }
  }, 30000);
  heartbeat.unref();
  server.on("close", () => {
    clearInterval(heartbeat);
    for (const sockets of clients.values())
      for (const s of sockets) s.close(1001);
  });
}
