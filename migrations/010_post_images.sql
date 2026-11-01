-- A post can carry several photos, in display order. posts.upload_id keeps the
-- first one for older clients. New code reads this table.
CREATE TABLE post_images (
    post_id CHAR(36) NOT NULL,
    upload_id CHAR(36) NOT NULL,
    display_position TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (post_id, upload_id),
    UNIQUE KEY uq_post_images_position (post_id, display_position),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO post_images (post_id, upload_id, display_position)
SELECT id, upload_id, 0 FROM posts WHERE upload_id IS NOT NULL;
