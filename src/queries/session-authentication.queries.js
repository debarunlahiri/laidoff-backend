export const sessionQueries = {
  findActiveSession:
    'SELECT u.id,u.full_name AS name,(u.email_verified_at IS NOT NULL) AS "emailVerified",u.created_at AS "createdAt",u.is_admin AS "isAdmin" FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>utc_now() AND s.revoked_at IS NULL AND u.account_status=\'active\'',
  recordActivity:
    "UPDATE sessions SET last_activity_at=utc_now() WHERE token_hash=?",
};
