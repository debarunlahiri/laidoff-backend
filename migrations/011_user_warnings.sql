-- Warnings an administrator has emailed to members (one row per warning sent).
CREATE TABLE user_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  issued_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  warning_reason VARCHAR(40) NOT NULL,
  warning_note TEXT,
  post_excerpt VARCHAR(400),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_user_warnings_user ON user_warnings (user_id, created_at DESC);
CREATE INDEX idx_user_warnings_post ON user_warnings (post_id);
