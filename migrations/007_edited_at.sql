-- When the author last changed a post or comment (NULL = never edited).
ALTER TABLE posts ADD COLUMN edited_at TIMESTAMP(3);
ALTER TABLE comments ADD COLUMN edited_at TIMESTAMP(3);
