-- Official organisation accounts, shown with the gold badge. They have no password,
-- so nobody can sign in as them; admins publish for them from the admin console.
INSERT INTO users (id, email, password_hash, full_name, professional_headline, biography,
                   professional_skills, profile_visibility, verified_badge, email_verified_at)
VALUES
  (gen_random_uuid(), 'news@laidoffcircle.com', NULL, 'LaidOff News',
   'Layoff news and workforce updates',
   'Verified news account of LaidOffCircle. Layoff announcements, hiring trends and workforce updates, with sources.',
   '[]'::jsonb, 'public', 'gold', utc_now()),
  (gen_random_uuid(), 'platform@laidoffcircle.com', NULL, 'Platform Service',
   'Official LaidOffCircle platform updates',
   'Verified account of the LaidOffCircle team. Product updates, maintenance notices and community announcements.',
   '[]'::jsonb, 'public', 'gold', utc_now())
ON CONFLICT (email) DO UPDATE SET verified_badge = 'gold', email_verified_at = COALESCE(users.email_verified_at, utc_now());
