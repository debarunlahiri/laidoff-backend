-- Up to five private images on the initial report or on each reply.
ALTER TABLE support_messages ADD CONSTRAINT support_messages_id_ticket_unique UNIQUE (id, ticket_id);
CREATE TABLE support_images (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  message_id UUID,
  stored_file_name VARCHAR(80) NOT NULL UNIQUE,
  original_file_name VARCHAR(255) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 4),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  FOREIGN KEY (message_id, ticket_id) REFERENCES support_messages(id, ticket_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_support_images_initial ON support_images(ticket_id, position) WHERE message_id IS NULL;
CREATE UNIQUE INDEX idx_support_images_reply ON support_images(message_id, position) WHERE message_id IS NOT NULL;
