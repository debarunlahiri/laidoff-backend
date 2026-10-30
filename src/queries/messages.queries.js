import { assertPagination } from "./query-guards.js";

export const messageQueries = {
  findMembership:
    "SELECT * FROM conversations WHERE id=? AND (first_participant_user_id=? OR second_participant_user_id=?)",
  listConversations: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT c.id,c.created_at AS createdAt,u.id AS userId,u.full_name AS name,u.professional_headline AS role,(SELECT message_content AS text FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS preview,(SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id) AS lastMessageAt,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) AS unread FROM conversations c JOIN users u ON u.id=IF(c.first_participant_user_id=?,c.second_participant_user_id,c.first_participant_user_id) WHERE c.first_participant_user_id=? OR c.second_participant_user_id=? ORDER BY COALESCE(lastMessageAt,c.created_at) DESC,c.id LIMIT ${limit} OFFSET ${offset}`;
  },
  upsertConversation:
    "INSERT INTO conversations(id,first_participant_user_id,second_participant_user_id,participant_pair_key) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE participant_pair_key=VALUES(participant_pair_key)",
  findConversationByPair:
    "SELECT id FROM conversations WHERE participant_pair_key=?",
  listMessages: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT id,sender_id AS senderId,message_content AS text,read_at AS readAt,created_at AS createdAt FROM messages WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  createMessage:
    "INSERT INTO messages(id,conversation_id,sender_id,message_content) VALUES(?,?,?,?)",
  findMessage:
    "SELECT id,message_content AS text,sender_id AS senderId,created_at AS createdAt FROM messages WHERE id=?",
  markMessagesRead:
    "UPDATE messages SET read_at=UTC_TIMESTAMP(3) WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL",
};
