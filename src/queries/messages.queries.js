import { assertPagination } from "./query-guards.js";

export const messageQueries = {
  findMembership:
    "SELECT * FROM conversations WHERE id=? AND (first_participant_user_id=? OR second_participant_user_id=?)",
  listConversations: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT c.id,c.created_at AS "createdAt",u.id AS "userId",u.full_name AS name,u.professional_headline AS role,u.profile_image_url AS "profileImageUrl",(SELECT CASE WHEN m.message_content='' THEN 'Sent an attachment' ELSE m.message_content END FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS preview,(SELECT sender_id FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS "lastSenderId",(SELECT read_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS "lastReadAt",(SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id) AS "lastMessageAt",(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) AS unread FROM conversations c JOIN users u ON u.id=CASE WHEN c.first_participant_user_id=? THEN c.second_participant_user_id ELSE c.first_participant_user_id END WHERE c.first_participant_user_id=? OR c.second_participant_user_id=? ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id),c.created_at) DESC,c.id LIMIT ${limit} OFFSET ${offset}`;
  },
  upsertConversation:
    "INSERT INTO conversations(id,first_participant_user_id,second_participant_user_id,participant_pair_key) VALUES(?,?,?,?) ON CONFLICT (participant_pair_key) DO NOTHING",
  findConversationByPair:
    "SELECT id FROM conversations WHERE participant_pair_key=?",
  listMessages: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT id,sender_id AS "senderId",message_content AS text,read_at AS "readAt",created_at AS "createdAt" FROM messages WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  createMessage:
    "INSERT INTO messages(id,conversation_id,sender_id,message_content) VALUES(?,?,?,?)",
  findMessage:
    'SELECT id,message_content AS text,sender_id AS "senderId",created_at AS "createdAt" FROM messages WHERE id=?',
  createAttachment:
    "INSERT INTO message_attachments(id,message_id,stored_file_name,original_file_name,mime_type,file_size_bytes) VALUES(?,?,?,?,?,?)",
  // One query for a page of messages: ids are bound as placeholders.
  listAttachments: (count) =>
    `SELECT id,message_id AS "messageId",original_file_name AS name,mime_type AS mime,file_size_bytes AS size FROM message_attachments WHERE message_id IN (${Array(count).fill("?").join(",")}) ORDER BY created_at,id`,
  findAttachment:
    'SELECT a.stored_file_name AS "storedName",a.original_file_name AS name,a.mime_type AS mime FROM message_attachments a JOIN messages m ON m.id=a.message_id WHERE a.id=? AND m.conversation_id=?',
  markMessagesRead:
    "UPDATE messages SET read_at=utc_now() WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL",
};
