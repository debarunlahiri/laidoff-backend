-- LaifOffCircle PostgreSQL schema (squashed from the former MySQL migrations 001-018).
-- Requires the postgresql-contrib package: pg_trgm (fast ILIKE '%term%' search) and
-- citext (case-insensitive email, like MySQL's *_ci collation). Creating extensions
-- needs a superuser or a role with CREATE on the database (PG13+ trusts both extensions).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- All timestamps are UTC "timestamp(3)" values, matching the MySQL DATETIME(3) data.
CREATE FUNCTION utc_now() RETURNS timestamp(3) LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'UTC')::timestamp(3) $$;

-- Replaces MySQL's "ON UPDATE CURRENT_TIMESTAMP(3)".
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := utc_now(); RETURN NEW; END $$;

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email CITEXT NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  full_name VARCHAR(100) NOT NULL,
  professional_headline VARCHAR(160) NOT NULL DEFAULT '',
  biography TEXT,
  professional_skills JSONB,
  career_objective TEXT,
  open_to_work BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  account_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended','deactivated')),
  email_verified_at TIMESTAMP(3),
  last_login_at TIMESTAMP(3),
  profile_location VARCHAR(160) NOT NULL DEFAULT '',
  profile_image_url VARCHAR(2048),
  cover_image_url VARCHAR(2048),
  website_url VARCHAR(2048),
  linkedin_profile_url VARCHAR(2048),
  profile_visibility VARCHAR(20) NOT NULL DEFAULT 'members' CHECK (profile_visibility IN ('public','members'))
);
CREATE INDEX idx_users_status_created ON users (account_status, created_at);
CREATE INDEX idx_users_full_name_trgm ON users USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_users_headline_trgm ON users USING gin (professional_headline gin_trgm_ops);

CREATE TABLE companies (
  id UUID PRIMARY KEY,
  company_name VARCHAR(160) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  company_description TEXT,
  website_url VARCHAR(2048),
  industry_name VARCHAR(160),
  headquarters_location VARCHAR(160),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
-- MySQL's unique company name was case-insensitive; keep that.
CREATE UNIQUE INDEX uq_companies_name ON companies (lower(company_name));
CREATE INDEX idx_companies_name_trgm ON companies USING gin (company_name gin_trgm_ops);

CREATE TABLE authentication_identities (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name VARCHAR(80) NOT NULL,
  provider_subject_identifier VARCHAR(255) NOT NULL,
  firebase_user_identifier VARCHAR(128) NOT NULL,
  verified_email_address VARCHAR(254) NOT NULL,
  last_authenticated_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  CONSTRAINT uq_authentication_provider_subject UNIQUE (provider_name, provider_subject_identifier),
  CONSTRAINT uq_authentication_firebase_identifier UNIQUE (firebase_user_identifier),
  CONSTRAINT uq_authentication_user_provider UNIQUE (user_id, provider_name)
);

CREATE TABLE sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  revoked_at TIMESTAMP(3),
  last_activity_at TIMESTAMP(3),
  login_ip_address VARCHAR(45),
  login_user_agent VARCHAR(1024),
  authentication_provider VARCHAR(80) NOT NULL DEFAULT 'password',
  authentication_identity_id UUID REFERENCES authentication_identities(id) ON DELETE SET NULL
);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX idx_sessions_user_expiration ON sessions (user_id, expires_at, revoked_at);

CREATE TABLE uploads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stored_file_name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  original_file_name VARCHAR(255),
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/webp',
  file_size_bytes BIGINT,
  image_width_pixels INTEGER,
  image_height_pixels INTEGER,
  sha256_checksum CHAR(64)
);
CREATE INDEX idx_uploads_owner_created ON uploads (user_id, created_at);

CREATE TABLE posts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_content TEXT NOT NULL,
  post_topic VARCHAR(80) NOT NULL DEFAULT 'General discussion',
  company_id UUID REFERENCES companies(id),
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  upload_id UUID REFERENCES uploads(id),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_posts_user ON posts (user_id);
CREATE INDEX idx_posts_upload ON posts (upload_id);
CREATE INDEX idx_posts_created_at ON posts (created_at);
CREATE INDEX idx_posts_topic ON posts (post_topic);
CREATE INDEX idx_posts_company ON posts (company_id);
CREATE INDEX idx_posts_content_trgm ON posts USING gin (post_content gin_trgm_ops);

CREATE TABLE post_images (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  display_position SMALLINT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (post_id, upload_id),
  CONSTRAINT uq_post_images_position UNIQUE (post_id, display_position)
);

CREATE TABLE reactions (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type VARCHAR(10) NOT NULL CHECK (reaction_type IN ('like','dislike')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_reactions_user ON reactions (user_id);

CREATE TABLE bookmarks (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_bookmarks_user ON bookmarks (user_id);

CREATE TABLE reposts (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_reposts_user ON reposts (user_id);

CREATE TABLE hidden_posts (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_hidden_posts_user ON hidden_posts (user_id);

CREATE TABLE comments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_comment_id UUID,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_content TEXT NOT NULL,
  upload_id UUID,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_upload FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL
);
CREATE INDEX idx_comments_post_created ON comments (post_id, created_at);
CREATE INDEX idx_comments_user ON comments (user_id);
CREATE INDEX idx_comments_parent ON comments (parent_comment_id, created_at);

CREATE TABLE comment_reactions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type VARCHAR(10) NOT NULL CHECK (reaction_type IN ('like','dislike')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (follower_id, followed_id)
);
CREATE INDEX idx_follows_followed_created ON follows (followed_id, created_at);

CREATE TABLE connections (
  id UUID PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_pair_key VARCHAR(73) NOT NULL UNIQUE,
  connection_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (connection_status IN ('pending','accepted')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  accepted_at TIMESTAMP(3)
);
CREATE INDEX idx_connections_recipient_status ON connections (recipient_id, connection_status, created_at);
CREATE INDEX idx_connections_requester_status ON connections (requester_id, connection_status, created_at);

CREATE TABLE referrals (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  job_title VARCHAR(120) NOT NULL,
  job_location VARCHAR(160) NOT NULL,
  work_mode VARCHAR(10) NOT NULL DEFAULT 'onsite' CHECK (work_mode IN ('remote','hybrid','onsite')),
  experience_level VARCHAR(10) CHECK (experience_level IN ('entry','mid','senior','lead')),
  min_experience_years SMALLINT,
  required_skills VARCHAR(200) NOT NULL,
  job_description TEXT,
  request_fields JSONB,
  referral_status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (referral_status IN ('open','closed')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  closed_at TIMESTAMP(3)
);
CREATE INDEX idx_referrals_created_at ON referrals (created_at);
CREATE INDEX idx_referrals_company_status ON referrals (company_id, referral_status, created_at);
CREATE INDEX idx_referrals_owner_status ON referrals (user_id, referral_status, created_at);
CREATE INDEX idx_referrals_status_created ON referrals (referral_status, created_at);
CREATE INDEX idx_referrals_title_trgm ON referrals USING gin (job_title gin_trgm_ops);
CREATE INDEX idx_referrals_skills_trgm ON referrals USING gin (required_skills gin_trgm_ops);
CREATE INDEX idx_referrals_location_trgm ON referrals USING gin (job_location gin_trgm_ops);

CREATE TABLE referral_requests (
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending','accepted','declined')),
  request_message VARCHAR(500),
  request_answers JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  decision_at TIMESTAMP(3),
  decision_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (referral_id, user_id)
);
CREATE INDEX idx_referral_requests_user ON referral_requests (user_id);
CREATE INDEX idx_referral_requests_decider ON referral_requests (decision_by_user_id);

CREATE TABLE referral_feedback (
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feedback_type VARCHAR(12) NOT NULL CHECK (feedback_type IN ('helpful','not_helpful')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (referral_id, user_id)
);
CREATE INDEX idx_referral_feedback_type ON referral_feedback (referral_id, feedback_type);
CREATE INDEX idx_referral_feedback_user ON referral_feedback (user_id);

CREATE TABLE referral_documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stored_file_name VARCHAR(100) NOT NULL UNIQUE,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_referral_documents_owner ON referral_documents (user_id, created_at);

CREATE TABLE referral_request_documents (
  referral_id UUID NOT NULL,
  user_id UUID NOT NULL,
  field_id VARCHAR(30) NOT NULL,
  document_id UUID NOT NULL REFERENCES referral_documents(id) ON DELETE CASCADE,
  PRIMARY KEY (referral_id, user_id, field_id),
  FOREIGN KEY (referral_id, user_id) REFERENCES referral_requests(referral_id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_request_documents_document ON referral_request_documents (document_id);

CREATE TABLE referral_shares (
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (referral_id, user_id)
);
CREATE INDEX idx_referral_shares_referral_created ON referral_shares (referral_id, created_at);
CREATE INDEX idx_referral_shares_user ON referral_shares (user_id);

CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  first_participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  second_participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_pair_key VARCHAR(73) NOT NULL UNIQUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_conversations_first_user ON conversations (first_participant_user_id);
CREATE INDEX idx_conversations_second_user ON conversations (second_participant_user_id);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_content TEXT NOT NULL,
  read_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_messages_sender ON messages (sender_id);
CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_unread ON messages (conversation_id, sender_id, read_at);

CREATE TABLE message_attachments (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  stored_file_name VARCHAR(100) NOT NULL UNIQUE,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_message_attachments_message ON message_attachments (message_id);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(40) NOT NULL,
  resource_id UUID,
  notification_message VARCHAR(300) NOT NULL,
  read_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_notifications_actor ON notifications (actor_id);
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at);
CREATE INDEX idx_notifications_unread ON notifications (user_id, read_at, created_at);

CREATE TABLE community_notes (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_content TEXT NOT NULL,
  source_url VARCHAR(2048) NOT NULL,
  review_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  reviewed_at TIMESTAMP(3),
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_reason VARCHAR(2000)
);
CREATE INDEX idx_community_notes_post ON community_notes (post_id);
CREATE INDEX idx_community_notes_user ON community_notes (user_id);
CREATE INDEX idx_community_notes_review ON community_notes (review_status, created_at);

CREATE TABLE reports (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_category VARCHAR(20) NOT NULL DEFAULT 'other' CHECK (report_category IN ('spam','harassment','misinformation','inappropriate','other')),
  report_reason VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  report_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (report_status IN ('pending','reviewing','resolved','dismissed')),
  resolution_summary VARCHAR(2000),
  reviewed_at TIMESTAMP(3),
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (post_id, user_id)
);
CREATE INDEX idx_reports_user ON reports (user_id);
CREATE INDEX idx_reports_status_created ON reports (report_status, created_at);
CREATE INDEX idx_reports_category ON reports (report_category);

CREATE TABLE comment_reports (
  id UUID PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_category VARCHAR(20) NOT NULL DEFAULT 'other' CHECK (report_category IN ('spam','harassment','misinformation','inappropriate','other')),
  report_reason VARCHAR(1000) NOT NULL,
  report_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (report_status IN ('pending','reviewing','resolved','dismissed')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  UNIQUE (comment_id, user_id)
);
CREATE INDEX idx_comment_reports_status_created ON comment_reports (report_status, created_at);
CREATE INDEX idx_comment_reports_user ON comment_reports (user_id);

CREATE TABLE post_polls (
  post_id UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
  closes_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE TABLE post_poll_options (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES post_polls(post_id) ON DELETE CASCADE,
  option_text VARCHAR(100) NOT NULL,
  display_position SMALLINT NOT NULL
);
CREATE INDEX idx_poll_options_post ON post_poll_options (post_id, display_position);
CREATE TABLE post_poll_votes (
  option_id UUID NOT NULL REFERENCES post_poll_options(id) ON DELETE CASCADE,
  post_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (option_id, user_id)
);
CREATE INDEX idx_poll_votes_user ON post_poll_votes (post_id, user_id);
CREATE INDEX idx_poll_votes_user_only ON post_poll_votes (user_id);

CREATE TABLE post_shares (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_post_shares_post_created ON post_shares (post_id, created_at);
CREATE INDEX idx_post_shares_user ON post_shares (user_id);

CREATE TABLE post_views (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL DEFAULT 1,
  device VARCHAR(20) NOT NULL DEFAULT 'desktop',
  source VARCHAR(20) NOT NULL DEFAULT 'detail',
  first_viewed_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  last_viewed_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_post_views_post_last ON post_views (post_id, last_viewed_at);
CREATE INDEX idx_post_views_user ON post_views (user_id);

CREATE TABLE workforce_reports (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  reported_roles_affected INTEGER NOT NULL,
  reported_headcount INTEGER,
  reported_hires INTEGER,
  source_url VARCHAR(2048) NOT NULL,
  verification_status VARCHAR(15) NOT NULL DEFAULT 'user_reported' CHECK (verification_status IN ('user_reported','verified')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  verified_at TIMESTAMP(3),
  verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  verification_summary VARCHAR(2000)
);
CREATE INDEX idx_workforce_reports_company ON workforce_reports (company_id);
CREATE INDEX idx_workforce_reports_user ON workforce_reports (user_id);
CREATE INDEX idx_workforce_reports_event_date ON workforce_reports (event_date);

CREATE TABLE daily_reminders (
  id UUID PRIMARY KEY,
  reminder_quote VARCHAR(300) NOT NULL UNIQUE,
  reminder_supporting_text VARCHAR(300) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_daily_reminders_active_order ON daily_reminders (is_active, display_order, id);
INSERT INTO daily_reminders (id, reminder_quote, reminder_supporting_text, display_order) VALUES
  (gen_random_uuid(), 'Your worth doesn’t change when your job does.', 'One chapter closes. You’re still the author.', 1),
  (gen_random_uuid(), 'A setback is a detour, not a destination.', 'The next step doesn’t have to be a big one.', 2),
  (gen_random_uuid(), 'Asking for help is a strength, not a weakness.', 'Someone in this circle has been exactly where you are.', 3),
  (gen_random_uuid(), 'You are more than your last job title.', 'Your skills, your story and your people go with you.', 4),
  (gen_random_uuid(), 'Progress counts, even when it’s quiet.', 'One message, one application, one conversation at a time.', 5),
  (gen_random_uuid(), 'Rest is part of the plan.', 'Take the pause you need, then take the next small step.', 6),
  (gen_random_uuid(), 'Your next chapter is still unwritten.', 'Good things start with a connection.', 7);

-- Logging tables. Ids are stored as UUID; JSON payloads as JSONB.
CREATE TABLE api_request_logs (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  actor_user_id UUID,
  http_method VARCHAR(16) NOT NULL,
  request_path VARCHAR(2048) NOT NULL,
  route_pattern VARCHAR(512),
  request_query JSONB,
  request_headers JSONB,
  request_body JSONB,
  response_headers JSONB,
  response_body JSONB,
  http_status_code SMALLINT NOT NULL,
  response_size_bytes BIGINT NOT NULL DEFAULT 0,
  request_size_bytes BIGINT,
  duration_milliseconds NUMERIC(14,3) NOT NULL,
  client_ip_address VARCHAR(45),
  client_user_agent VARCHAR(1024),
  response_completed BOOLEAN NOT NULL,
  started_at TIMESTAMP(3) NOT NULL,
  completed_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_api_logs_user_started ON api_request_logs (actor_user_id, started_at);
CREATE INDEX idx_api_logs_status_started ON api_request_logs (http_status_code, started_at);
CREATE INDEX idx_api_logs_started ON api_request_logs (started_at);

CREATE TABLE application_logs (
  id UUID PRIMARY KEY,
  request_id UUID,
  actor_user_id UUID,
  log_level VARCHAR(10) NOT NULL CHECK (log_level IN ('debug','info','warn','error','fatal')),
  event_name VARCHAR(160) NOT NULL,
  log_message TEXT NOT NULL,
  log_context JSONB,
  error_name VARCHAR(160),
  error_code VARCHAR(160),
  error_stack_trace TEXT,
  process_identifier INTEGER NOT NULL,
  host_name VARCHAR(255) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_application_logs_request ON application_logs (request_id);
CREATE INDEX idx_application_logs_level_time ON application_logs (log_level, occurred_at);
CREATE INDEX idx_application_logs_event_time ON application_logs (event_name, occurred_at);

CREATE TABLE database_query_logs (
  id UUID PRIMARY KEY,
  request_id UUID,
  actor_user_id UUID,
  database_name VARCHAR(128) NOT NULL,
  sql_operation VARCHAR(32) NOT NULL,
  sql_statement_template TEXT NOT NULL,
  parameter_count INTEGER NOT NULL,
  parameter_types JSONB,
  affected_row_count BIGINT,
  returned_row_count BIGINT,
  duration_milliseconds NUMERIC(14,3) NOT NULL,
  was_successful BOOLEAN NOT NULL,
  error_code VARCHAR(160),
  error_message TEXT,
  transaction_id UUID,
  started_at TIMESTAMP(3) NOT NULL,
  completed_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_database_logs_request ON database_query_logs (request_id);
CREATE INDEX idx_database_logs_success_started ON database_query_logs (was_successful, started_at);
CREATE INDEX idx_database_logs_transaction ON database_query_logs (transaction_id);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  request_id UUID,
  actor_user_id UUID,
  action_name VARCHAR(160) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_identifier VARCHAR(160),
  outcome VARCHAR(10) NOT NULL CHECK (outcome IN ('succeeded','rejected','failed')),
  change_summary JSONB,
  client_ip_address VARCHAR(45),
  occurred_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_audit_logs_actor_time ON audit_logs (actor_user_id, occurred_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_identifier);
CREATE INDEX idx_audit_logs_request ON audit_logs (request_id);

-- Keep updated_at current on every table that has the column.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = current_schema() AND column_name = 'updated_at'
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
