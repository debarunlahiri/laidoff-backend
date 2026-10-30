export const authenticationQueries = {
  createSession:
    "INSERT INTO sessions(token_hash,user_id,expires_at,login_ip_address,login_user_agent,last_activity_at,authentication_provider,authentication_identity_id) VALUES(?,?,?,?,?,UTC_TIMESTAMP(3),?,?)",
  createUser:
    "INSERT INTO users(id,email,password_hash,full_name,professional_skills) VALUES(?,?,?,?,?)",
  findLoginAccount:
    "SELECT id,email,full_name AS name,password_hash,account_status FROM users WHERE email=?",
  recordLogin: "UPDATE users SET last_login_at=UTC_TIMESTAMP(3) WHERE id=?",
  revokeSession:
    "UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE token_hash=?",
  findCurrentProfile:
    "SELECT id,email,full_name AS name,professional_headline AS role,biography AS about,professional_skills AS skills,career_objective AS nextChapter,open_to_work AS openToWork,profile_location AS location,website_url AS websiteUrl,linkedin_profile_url AS linkedinProfileUrl FROM users WHERE id=?",
};
