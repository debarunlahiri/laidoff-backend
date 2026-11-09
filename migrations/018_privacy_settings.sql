-- Per-member privacy controls. A missing row means every setting is 'everyone'.
-- Levels: everyone | members (signed-in only) | connections | only_me.
-- 'connect' is who may send this member a connection request: everyone | only_me (nobody).
CREATE TABLE user_privacy (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_visibility VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (profile_visibility IN ('everyone','members','connections','only_me')),
  followers_visibility VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (followers_visibility IN ('everyone','members','connections','only_me')),
  following_visibility VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (following_visibility IN ('everyone','members','connections','only_me')),
  connections_visibility VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (connections_visibility IN ('everyone','members','connections','only_me')),
  likes_visibility VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (likes_visibility IN ('everyone','members','connections','only_me')),
  dislikes_visibility VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (dislikes_visibility IN ('everyone','members','connections','only_me')),
  referrals_visibility VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (referrals_visibility IN ('everyone','members','connections','only_me')),
  connect_permission VARCHAR(12) NOT NULL DEFAULT 'everyone' CHECK (connect_permission IN ('everyone','only_me')),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
