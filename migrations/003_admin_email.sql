-- Admin role plus admin-editable email templates, settings and a delivery log.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE email_templates (
  template_key VARCHAR(40) PRIMARY KEY CHECK (template_key IN ('verification','reminder','welcome')),
  content JSONB NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE email_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE email_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient CITEXT NOT NULL,
  template_key VARCHAR(40) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_code VARCHAR(60),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_email_logs_created ON email_logs (created_at DESC);
CREATE INDEX idx_email_logs_user ON email_logs (user_id, created_at DESC);
