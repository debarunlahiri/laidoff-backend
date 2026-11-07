import { notificationQueries } from "../queries/notifications.queries.js";
import { randomUUID } from "node:crypto";
import { query } from "../db/db.js";
import { publish } from "./realtime.js";
export async function notify(
  connection,
  userId,
  actor,
  type,
  resourceId,
  text,
) {
  if (userId === actor.id) return;
  await query(
    notificationQueries.createNotification,
    [randomUUID(), userId, actor.id, type, resourceId, text],
    connection,
  );
  // The row may still be inside an open transaction, so give it a moment to
  // commit before telling the client to reload.
  setTimeout(() => publish([userId], { type: "notification" }), 250).unref();
}
