-- Work arrangement and experience level for filtering referrals, an optional note on a request, and helpful or not helpful votes on referral offers.
ALTER TABLE referrals
    ADD COLUMN work_mode ENUM('remote','hybrid','onsite') NOT NULL DEFAULT 'onsite' AFTER job_location,
    ADD COLUMN experience_level ENUM('entry','mid','senior','lead') NULL AFTER work_mode,
    ADD INDEX idx_referrals_status_created (referral_status, created_at);

UPDATE referrals SET work_mode = 'remote' WHERE job_location LIKE '%remote%';

UPDATE referrals SET work_mode = 'hybrid' WHERE job_location LIKE '%hybrid%';

ALTER TABLE referral_requests
    ADD COLUMN request_message VARCHAR(500) NULL AFTER request_status;

CREATE TABLE referral_feedback (
    referral_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    feedback_type ENUM('helpful','not_helpful') NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (referral_id, user_id),
    FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_referral_feedback_type (referral_id, feedback_type)
) ENGINE=InnoDB;

ALTER TABLE referrals
    ADD COLUMN request_fields JSON NULL AFTER job_description;

ALTER TABLE referral_requests
    ADD COLUMN request_answers JSON NULL AFTER request_message;

CREATE TABLE referral_documents (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    stored_file_name VARCHAR(100) NOT NULL UNIQUE,
    original_file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes INT UNSIGNED NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_referral_documents_owner (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE referral_request_documents (
    referral_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    field_id VARCHAR(30) NOT NULL,
    document_id CHAR(36) NOT NULL,
    PRIMARY KEY (referral_id, user_id, field_id),
    FOREIGN KEY (referral_id, user_id) REFERENCES referral_requests(referral_id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES referral_documents(id) ON DELETE CASCADE,
    INDEX idx_request_documents_document (document_id)
) ENGINE=InnoDB;
