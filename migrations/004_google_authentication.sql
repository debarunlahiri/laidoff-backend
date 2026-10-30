ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;

CREATE TABLE authentication_identities (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    provider_name VARCHAR(80) NOT NULL,
    provider_subject_identifier VARCHAR(255) NOT NULL,
    firebase_user_identifier VARCHAR(128) NOT NULL,
    verified_email_address VARCHAR(254) NOT NULL,
    last_authenticated_at DATETIME(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_authentication_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_authentication_provider_subject (provider_name, provider_subject_identifier),
    UNIQUE KEY uq_authentication_firebase_identifier (firebase_user_identifier),
    UNIQUE KEY uq_authentication_user_provider (user_id, provider_name)
) ENGINE=InnoDB;

ALTER TABLE sessions
    ADD COLUMN authentication_provider VARCHAR(80) NOT NULL DEFAULT 'password',
    ADD COLUMN authentication_identity_id CHAR(36) NULL,
    ADD CONSTRAINT fk_sessions_authentication_identity FOREIGN KEY (authentication_identity_id) REFERENCES authentication_identities(id) ON DELETE SET NULL;
