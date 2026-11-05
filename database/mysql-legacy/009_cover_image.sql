-- Profile cover image (an uploaded file path, or NULL for the default banner).
ALTER TABLE users
    ADD COLUMN cover_image_url VARCHAR(2048) NULL AFTER profile_image_url;
