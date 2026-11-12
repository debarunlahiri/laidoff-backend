-- API keys for trusted AI agents (see AGENT_API.md). Only a SHA-256 hash of each key
-- is stored. A key acts as one existing member account (normally the official
-- "LaidOff News" account), so everything it publishes carries that account's name.
CREATE TABLE agent_api_keys (
  id UUID PRIMARY KEY,
  key_name VARCHAR(80) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  key_hint VARCHAR(12) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  writes_per_hour INTEGER NOT NULL DEFAULT 60 CHECK (writes_per_hour BETWEEN 1 AND 1000),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  last_used_at TIMESTAMP(3),
  revoked_at TIMESTAMP(3)
);
CREATE INDEX idx_agent_api_keys_user ON agent_api_keys (user_id);

-- Answers to writes that carried an Idempotency-Key, so a retry returns the first
-- result instead of publishing twice. Rows older than a day are purged on write.
CREATE TABLE agent_requests (
  key_id UUID NOT NULL REFERENCES agent_api_keys(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(200) NOT NULL,
  route VARCHAR(40) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status SMALLINT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (key_id, idempotency_key)
);
CREATE INDEX idx_agent_requests_created ON agent_requests (created_at);
