-- Unique, case-insensitive @usernames (stored lowercase: a-z, 0-9, underscore, 3-30 chars).
ALTER TABLE users ADD COLUMN username VARCHAR(30);

CREATE FUNCTION generate_username(source_name TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  suffix INTEGER := 0;
BEGIN
  base := lower(regexp_replace(coalesce(source_name, ''), '[^a-zA-Z0-9]+', '_', 'g'));
  base := trim(both '_' from base);
  IF length(base) < 3 THEN base := 'user'; END IF;
  base := left(base, 24);
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM users WHERE lower(username) = candidate) LOOP
    suffix := suffix + 1;
    candidate := left(base, 24) || '_' || suffix;
  END LOOP;
  RETURN candidate;
END $$;

-- Backfill one row at a time so each generated name sees the ones before it.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, full_name FROM users WHERE username IS NULL ORDER BY created_at, id LOOP
    UPDATE users SET username = generate_username(r.full_name) WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$');
CREATE UNIQUE INDEX idx_users_username ON users(lower(username));

-- Any insert path that does not pass a username (Google sign-in, admin-created users) gets one.
CREATE FUNCTION users_default_username() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.username IS NULL THEN NEW.username := generate_username(NEW.full_name); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_default_username BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION users_default_username();
