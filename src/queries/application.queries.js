import { assertPagination } from "./query-guards.js";

export const applicationQueries = {
  notificationSummary: `SELECT
    (SELECT COUNT(*) FROM notifications WHERE user_id=? AND read_at IS NULL AND notification_type<>'message') AS unread,
    (SELECT COUNT(*) FROM messages JOIN conversations ON conversations.id=messages.conversation_id WHERE (conversations.first_participant_user_id=? OR conversations.second_participant_user_id=?) AND messages.sender_id<>? AND messages.read_at IS NULL) AS unreadMessages`,
  checkDatabase: "SELECT 1",
  listNotifications: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT n.id,n.notification_type AS type,n.resource_id AS resourceId,n.notification_message AS text,n.read_at AS readAt,n.created_at AS createdAt,
      a.id AS actorId,a.full_name AS actorName,a.professional_headline AS actorHeadline,a.profile_image_url AS actorImageUrl,
      CASE
        WHEN n.notification_type='message' THEN (SELECT LEFT(IF(m.message_content='','Sent an attachment',m.message_content),160) FROM messages m WHERE m.conversation_id=n.resource_id AND m.sender_id=n.actor_id ORDER BY m.created_at DESC LIMIT 1)
        WHEN n.notification_type IN ('like','comment') THEN (SELECT LEFT(p.post_content,160) FROM posts p WHERE p.id=n.resource_id)
        WHEN n.notification_type LIKE 'referral%' THEN (SELECT CONCAT(r.job_title,' at ',c.company_name) FROM referrals r JOIN companies c ON c.id=r.company_id WHERE r.id=n.resource_id)
      END AS preview
      FROM notifications n JOIN users a ON a.id=n.actor_id WHERE n.user_id=? AND n.notification_type<>'message' ORDER BY n.created_at DESC,n.id DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  markAllNotificationsRead:
    "UPDATE notifications SET read_at=UTC_TIMESTAMP(3) WHERE user_id=? AND read_at IS NULL",
  markNotificationRead:
    "UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE id=? AND user_id=?",
};
