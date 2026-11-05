-- Polls attached to posts: 2-6 options, optional end time, single or multiple answers.
CREATE TABLE post_polls (
    post_id CHAR(36) NOT NULL PRIMARY KEY,
    allow_multiple TINYINT(1) NOT NULL DEFAULT 0,
    closes_at DATETIME(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE post_poll_options (
    id CHAR(36) NOT NULL PRIMARY KEY,
    post_id CHAR(36) NOT NULL,
    option_text VARCHAR(100) NOT NULL,
    display_position TINYINT UNSIGNED NOT NULL,
    FOREIGN KEY (post_id) REFERENCES post_polls(post_id) ON DELETE CASCADE,
    INDEX idx_poll_options_post (post_id, display_position)
) ENGINE=InnoDB;

CREATE TABLE post_poll_votes (
    option_id CHAR(36) NOT NULL,
    post_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (option_id, user_id),
    FOREIGN KEY (option_id) REFERENCES post_poll_options(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_poll_votes_user (post_id, user_id)
) ENGINE=InnoDB
