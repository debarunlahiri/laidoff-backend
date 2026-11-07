-- How serious a warning was: a friendly reminder, a warning, or a final warning.
ALTER TABLE user_warnings
  ADD COLUMN warning_type VARCHAR(20) NOT NULL DEFAULT 'warning'
  CHECK (warning_type IN ('reminder','warning','final'));
