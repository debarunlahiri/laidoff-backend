-- Admin-managed report options (category -> sub-options) and hashtag catalog.
CREATE TABLE report_categories (
  id UUID PRIMARY KEY,
  category_key VARCHAR(40) NOT NULL UNIQUE CHECK (category_key ~ '^[a-z0-9_-]+$'),
  category_label VARCHAR(120) NOT NULL,
  category_description VARCHAR(300) NOT NULL DEFAULT '',
  category_icon VARCHAR(16) NOT NULL DEFAULT '',
  display_position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE TABLE report_subcategories (
  id UUID PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES report_categories(id) ON DELETE CASCADE,
  subcategory_key VARCHAR(40) NOT NULL CHECK (subcategory_key ~ '^[a-z0-9_-]+$'),
  subcategory_label VARCHAR(160) NOT NULL,
  display_position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  UNIQUE (category_id, subcategory_key)
);
INSERT INTO report_categories (id, category_key, category_label, display_position) VALUES
  (gen_random_uuid(), 'spam', 'Spam or misleading promotion', 1),
  (gen_random_uuid(), 'harassment', 'Harassment or hate', 2),
  (gen_random_uuid(), 'misinformation', 'False or misleading information', 3),
  (gen_random_uuid(), 'inappropriate', 'Inappropriate or unsafe content', 4),
  (gen_random_uuid(), 'other', 'Something else', 5);

-- Reports keep the chosen key, no longer limited to the original five values.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_report_category_check;
ALTER TABLE reports ALTER COLUMN report_category TYPE VARCHAR(40);
ALTER TABLE reports ADD COLUMN report_subcategory VARCHAR(40);
ALTER TABLE comment_reports DROP CONSTRAINT IF EXISTS comment_reports_report_category_check;
ALTER TABLE comment_reports ALTER COLUMN report_category TYPE VARCHAR(40);
ALTER TABLE comment_reports ADD COLUMN report_subcategory VARCHAR(40);

CREATE TABLE hashtag_catalog (
  tag VARCHAR(50) PRIMARY KEY CHECK (tag ~ '^[a-z][a-z0-9_]+$'),
  display_name VARCHAR(80) NOT NULL DEFAULT '',
  emoji VARCHAR(16) NOT NULL DEFAULT '',
  icon_name VARCHAR(40) NOT NULL DEFAULT '',
  accent_color VARCHAR(7) NOT NULL DEFAULT '' CHECK (accent_color = '' OR accent_color ~ '^#[0-9a-fA-F]{6}$'),
  tag_description VARCHAR(300) NOT NULL DEFAULT '',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
