ALTER TABLE users
    CHANGE COLUMN name full_name VARCHAR(100) NOT NULL,
    CHANGE COLUMN role professional_headline VARCHAR(160) NOT NULL DEFAULT '',
    CHANGE COLUMN about biography TEXT,
    CHANGE COLUMN skills professional_skills JSON,
    CHANGE COLUMN next_chapter career_objective TEXT;

ALTER TABLE companies
    CHANGE COLUMN name company_name VARCHAR(160) NOT NULL;

ALTER TABLE uploads
    CHANGE COLUMN filename stored_file_name VARCHAR(100) NOT NULL;

ALTER TABLE posts
    CHANGE COLUMN text post_content TEXT NOT NULL,
    CHANGE COLUMN topic post_topic VARCHAR(80) NOT NULL DEFAULT 'General discussion',
    CHANGE COLUMN anonymous is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE reactions
    CHANGE COLUMN reaction reaction_type ENUM('like','dislike') NOT NULL;

ALTER TABLE comments
    CHANGE COLUMN text comment_content TEXT NOT NULL;

ALTER TABLE connections
    CHANGE COLUMN pair_key participant_pair_key VARCHAR(73) NOT NULL,
    CHANGE COLUMN status connection_status ENUM('pending','accepted') NOT NULL DEFAULT 'pending';

ALTER TABLE referrals
    CHANGE COLUMN title job_title VARCHAR(120) NOT NULL,
    CHANGE COLUMN location job_location VARCHAR(160) NOT NULL,
    CHANGE COLUMN skills required_skills VARCHAR(200) NOT NULL,
    CHANGE COLUMN description job_description TEXT,
    CHANGE COLUMN status referral_status ENUM('open','closed') NOT NULL DEFAULT 'open';

ALTER TABLE referral_requests
    CHANGE COLUMN status request_status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending';

ALTER TABLE conversations
    CHANGE COLUMN user_a first_participant_user_id CHAR(36) NOT NULL,
    CHANGE COLUMN user_b second_participant_user_id CHAR(36) NOT NULL,
    CHANGE COLUMN pair_key participant_pair_key VARCHAR(73) NOT NULL;

ALTER TABLE messages
    CHANGE COLUMN text message_content TEXT NOT NULL;

ALTER TABLE notifications
    CHANGE COLUMN type notification_type VARCHAR(40) NOT NULL,
    CHANGE COLUMN text notification_message VARCHAR(300) NOT NULL;

ALTER TABLE community_notes
    CHANGE COLUMN text note_content TEXT NOT NULL,
    CHANGE COLUMN status review_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending';

ALTER TABLE reports
    CHANGE COLUMN reason report_reason VARCHAR(1000) NOT NULL;

ALTER TABLE workforce_reports
    CHANGE COLUMN roles_affected reported_roles_affected INT UNSIGNED NOT NULL,
    CHANGE COLUMN headcount reported_headcount INT UNSIGNED,
    CHANGE COLUMN hires reported_hires INT UNSIGNED,
    CHANGE COLUMN status verification_status ENUM('user_reported','verified') NOT NULL DEFAULT 'user_reported';

ALTER TABLE bookmarks
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE comments
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE community_notes
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE companies
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE connections
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE conversations
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE follows
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE hidden_posts
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE messages
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE notifications
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE posts
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE reactions
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE referral_requests
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE referrals
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE reports
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE reposts
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE sessions
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE uploads
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE users
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE workforce_reports
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE users
    ADD COLUMN account_status ENUM('active', 'suspended', 'deactivated') NOT NULL DEFAULT 'active',
    ADD COLUMN email_verified_at DATETIME(3) NULL,
    ADD COLUMN last_login_at DATETIME(3) NULL,
    ADD COLUMN profile_location VARCHAR(160) NOT NULL DEFAULT '',
    ADD COLUMN website_url VARCHAR(2048) NULL,
    ADD COLUMN linkedin_profile_url VARCHAR(2048) NULL,
    ADD COLUMN profile_visibility ENUM('public', 'members') NOT NULL DEFAULT 'members',
    ADD INDEX idx_users_status_created (account_status, created_at);

ALTER TABLE sessions
    ADD COLUMN revoked_at DATETIME(3) NULL,
    ADD COLUMN last_activity_at DATETIME(3) NULL,
    ADD COLUMN login_ip_address VARCHAR(45) NULL,
    ADD COLUMN login_user_agent VARCHAR(1024) NULL,
    ADD INDEX idx_sessions_user_expiration (user_id, expires_at, revoked_at);

ALTER TABLE companies
    ADD COLUMN company_description TEXT NULL,
    ADD COLUMN website_url VARCHAR(2048) NULL,
    ADD COLUMN industry_name VARCHAR(160) NULL,
    ADD COLUMN headquarters_location VARCHAR(160) NULL,
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE uploads
    ADD COLUMN original_file_name VARCHAR(255) NULL,
    ADD COLUMN mime_type VARCHAR(100) NOT NULL DEFAULT 'image/webp',
    ADD COLUMN file_size_bytes BIGINT UNSIGNED NULL,
    ADD COLUMN image_width_pixels INT UNSIGNED NULL,
    ADD COLUMN image_height_pixels INT UNSIGNED NULL,
    ADD COLUMN sha256_checksum CHAR(64) NULL,
    ADD INDEX idx_uploads_owner_created (user_id, created_at);

ALTER TABLE connections
    ADD COLUMN accepted_at DATETIME(3) NULL,
    ADD INDEX idx_connections_recipient_status (recipient_id, connection_status, created_at),
    ADD INDEX idx_connections_requester_status (requester_id, connection_status, created_at);

ALTER TABLE referrals
    ADD COLUMN closed_at DATETIME(3) NULL,
    ADD INDEX idx_referrals_company_status (company_id, referral_status, created_at),
    ADD INDEX idx_referrals_owner_status (user_id, referral_status, created_at);

ALTER TABLE referral_requests
    ADD COLUMN decision_at DATETIME(3) NULL,
    ADD COLUMN decision_by_user_id CHAR(36) NULL,
    ADD CONSTRAINT fk_referral_requests_decision_user FOREIGN KEY (decision_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE community_notes
    ADD COLUMN reviewed_at DATETIME(3) NULL,
    ADD COLUMN reviewed_by_user_id CHAR(36) NULL,
    ADD COLUMN review_reason VARCHAR(2000) NULL,
    ADD CONSTRAINT fk_community_notes_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD INDEX idx_community_notes_review (review_status, created_at);

ALTER TABLE reports
    ADD COLUMN report_status ENUM('pending', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
    ADD COLUMN resolution_summary VARCHAR(2000) NULL,
    ADD COLUMN reviewed_at DATETIME(3) NULL,
    ADD COLUMN reviewed_by_user_id CHAR(36) NULL,
    ADD CONSTRAINT fk_reports_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD INDEX idx_reports_status_created (report_status, created_at);

ALTER TABLE workforce_reports
    ADD COLUMN verified_at DATETIME(3) NULL,
    ADD COLUMN verified_by_user_id CHAR(36) NULL,
    ADD COLUMN verification_summary VARCHAR(2000) NULL,
    ADD CONSTRAINT fk_workforce_reports_verifier FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notifications ADD INDEX idx_notifications_unread (user_id, read_at, created_at);
ALTER TABLE messages ADD INDEX idx_messages_unread (conversation_id, sender_id, read_at);
ALTER TABLE follows ADD INDEX idx_follows_followed_created (followed_id, created_at);
