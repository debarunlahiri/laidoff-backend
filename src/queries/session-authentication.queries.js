export const sessionQueries = {
  findActiveSession:
    "SELECT u.id,u.full_name AS name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND s.revoked_at IS NULL AND u.account_status='active'",
  recordActivity:
    "UPDATE sessions SET last_activity_at=UTC_TIMESTAMP(3) WHERE token_hash=?",
};
