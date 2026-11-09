-- Public verified badge: 'blue' for individual members, 'gold' for companies/organisations.
-- Separate from email verification (users.email_verified_at).
ALTER TABLE users ADD COLUMN verified_badge VARCHAR(10)
  CHECK (verified_badge IN ('blue','gold'));
CREATE INDEX idx_users_verified_badge ON users(verified_badge) WHERE verified_badge IS NOT NULL;
