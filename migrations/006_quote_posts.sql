-- A post can quote another post ("repost with comment").
ALTER TABLE posts ADD COLUMN quoted_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;
CREATE INDEX idx_posts_quoted ON posts (quoted_post_id);
