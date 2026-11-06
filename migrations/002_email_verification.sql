-- Email verification for email/password accounts (Google accounts are verified by Firebase).
CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  email CITEXT NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  used_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_email_verification_user ON email_verification_tokens (user_id, created_at);

ALTER TABLE users
  ADD COLUMN verification_reminder_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN verification_reminder_sent_at TIMESTAMP(3);
CREATE INDEX idx_users_unverified ON users (created_at)
  WHERE email_verified_at IS NULL AND password_hash IS NOT NULL;
