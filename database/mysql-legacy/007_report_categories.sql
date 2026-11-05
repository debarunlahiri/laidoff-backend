ALTER TABLE reports
    ADD COLUMN report_category ENUM('spam','harassment','misinformation','inappropriate','other') NOT NULL DEFAULT 'other' AFTER user_id,
    ADD INDEX idx_reports_category (report_category);
