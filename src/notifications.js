import { notificationQueries } from "./queries/notifications.queries.js";
import { randomUUID } from "node:crypto";
import { query } from "./db.js";
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
}
