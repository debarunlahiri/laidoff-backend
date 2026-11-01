export const googleAuthenticationQueries = {
  findIdentity: `SELECT identity.id AS identityId, identity.user_id AS userId,
    users.email, users.full_name AS name, users.profile_image_url AS profileImageUrl, users.account_status AS accountStatus
    FROM authentication_identities identity JOIN users ON users.id=identity.user_id
    WHERE identity.firebase_user_identifier=? OR (identity.provider_name='google.com' AND identity.provider_subject_identifier=?) FOR UPDATE`,
  findEmailAccount:
    "SELECT id,email,full_name AS name,account_status AS accountStatus FROM users WHERE email=? FOR UPDATE",
  createGoogleUser:
    "INSERT INTO users(id,email,password_hash,full_name,professional_skills,profile_image_url,email_verified_at,last_login_at) VALUES(?,?,NULL,?,'[]',?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",
  createIdentity:
    "INSERT INTO authentication_identities(id,user_id,provider_name,provider_subject_identifier,firebase_user_identifier,verified_email_address,last_authenticated_at) VALUES(?,?,'google.com',?,?,?,UTC_TIMESTAMP(3))",
  recordIdentityLogin:
    "UPDATE authentication_identities SET last_authenticated_at=UTC_TIMESTAMP(3),verified_email_address=? WHERE id=?",
  updateProfileImage: "UPDATE users SET profile_image_url=? WHERE id=?",
  verifyEmail:
    "UPDATE users SET email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP(3)) WHERE id=?",
  listIdentities:
    "SELECT provider_name AS provider,verified_email_address AS email FROM authentication_identities WHERE user_id=?",
};
