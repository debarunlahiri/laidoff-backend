import { assertPagination } from "./query-guards.js";

export const applicationQueries = {
  checkDatabase: "SELECT 1",
  listNotifications: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT id,notification_type AS type,resource_id AS resourceId,notification_message AS text,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  markAllNotificationsRead:
    "UPDATE notifications SET read_at=UTC_TIMESTAMP(3) WHERE user_id=? AND read_at IS NULL",
  markNotificationRead:
    "UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE id=? AND user_id=?",
};
