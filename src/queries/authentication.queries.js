export const authenticationQueries = {
  createSession:
    "INSERT INTO sessions(token_hash,user_id,expires_at,login_ip_address,login_user_agent,last_activity_at,authentication_provider,authentication_identity_id) VALUES(?,?,?,?,?,utc_now(),?,?)",
  createUser:
    "INSERT INTO users(id,email,password_hash,full_name,professional_skills) VALUES(?,?,?,?,?)",
  findLoginAccount:
    'SELECT id,email,full_name AS name,profile_image_url AS "profileImageUrl",EXISTS(SELECT 1 FROM authentication_identities gi WHERE gi.user_id=users.id AND gi.provider_name=\'google.com\') AS "googleLinked",password_hash,account_status,(email_verified_at IS NOT NULL) AS "emailVerified",is_admin AS "isAdmin",created_at AS "createdAt" FROM users WHERE email=?',
  recordLogin: "UPDATE users SET last_login_at=utc_now() WHERE id=?",
  revokeSession: "UPDATE sessions SET revoked_at=utc_now() WHERE token_hash=?",
  findCurrentProfile:
    'SELECT id,email,full_name AS name,professional_headline AS role,biography AS about,professional_skills AS skills,career_objective AS "nextChapter",open_to_work AS "openToWork",profile_location AS location,profile_image_url AS "profileImageUrl",cover_image_url AS "coverImageUrl",website_url AS "websiteUrl",linkedin_profile_url AS "linkedinProfileUrl",EXISTS(SELECT 1 FROM authentication_identities gi WHERE gi.user_id=users.id AND gi.provider_name=\'google.com\') AS "googleLinked",(email_verified_at IS NOT NULL) AS "emailVerified",is_admin AS "isAdmin",created_at AS "createdAt" FROM users WHERE id=?',
};
