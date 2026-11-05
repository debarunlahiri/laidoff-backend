ALTER TABLE comments
  ADD COLUMN upload_id CHAR(36) NULL,
  ADD CONSTRAINT fk_comments_upload FOREIGN KEY(upload_id) REFERENCES uploads(id) ON DELETE SET NULL;
CREATE TABLE comment_reports (
  id CHAR(36) PRIMARY KEY,
  comment_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  report_category ENUM('spam','harassment','misinformation','inappropriate','other') NOT NULL DEFAULT 'other',
  report_reason VARCHAR(1000) NOT NULL,
  report_status ENUM('pending','reviewing','resolved','dismissed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(comment_id,user_id),
  INDEX idx_comment_reports_status_created (report_status,created_at),
  FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
