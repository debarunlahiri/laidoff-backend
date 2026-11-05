-- Two-level comment threads (comment -> reply) and per-comment reactions.
ALTER TABLE comments
    ADD COLUMN parent_comment_id CHAR(36) NULL AFTER post_id,
    ADD CONSTRAINT fk_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    ADD INDEX idx_comments_parent (parent_comment_id, created_at);

CREATE TABLE comment_reactions (
    comment_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    reaction_type ENUM('like','dislike') NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
