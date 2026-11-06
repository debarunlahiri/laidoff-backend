export const emailVerificationQueries = {
  deleteUnusedTokens:
    "DELETE FROM email_verification_tokens WHERE user_id=? AND used_at IS NULL",
  createToken:
    "INSERT INTO email_verification_tokens(id,user_id,token_hash,email,expires_at) VALUES(?,?,?,?,?)",
  findToken:
    'SELECT t.id,t.user_id AS "userId",t.used_at AS "usedAt",t.expires_at>utc_now() AS "isCurrent",u.email_verified_at AS "verifiedAt",u.account_status AS "accountStatus" FROM email_verification_tokens t JOIN users u ON u.id=t.user_id AND u.email=t.email WHERE t.token_hash=? FOR UPDATE OF t',
  markTokenUsed:
    "UPDATE email_verification_tokens SET used_at=utc_now() WHERE id=?",
  markEmailVerified:
    "UPDATE users SET email_verified_at=COALESCE(email_verified_at,utc_now()) WHERE id=?",
  findAccount:
    'SELECT id,email,full_name AS name,email_verified_at AS "verifiedAt",password_hash IS NOT NULL AS "hasPassword" FROM users WHERE id=?',
  lastTokenAge:
    "SELECT EXTRACT(EPOCH FROM (utc_now()-max(created_at)))::int AS seconds FROM email_verification_tokens WHERE user_id=?",
  // Atomically claims due accounts so several API instances never double-send.
  claimDueReminders: `UPDATE users SET verification_reminder_sent_at=utc_now(),verification_reminder_count=verification_reminder_count+1
    WHERE id IN (
      SELECT id FROM users
      WHERE email_verified_at IS NULL AND account_status='active' AND password_hash IS NOT NULL
        AND email NOT LIKE '%.test' AND email NOT LIKE '%@example.%'
        AND verification_reminder_count<?
        AND COALESCE(verification_reminder_sent_at,created_at)<=utc_now()-make_interval(hours=>CASE WHEN verification_reminder_count=0 THEN ?::int ELSE ?::int END)
      ORDER BY created_at LIMIT ? FOR UPDATE SKIP LOCKED)
    RETURNING id,email,full_name AS name`,
  // Undo a claim when the email could not be sent, so the next pass retries it.
  releaseReminder:
    "UPDATE users SET verification_reminder_count=GREATEST(verification_reminder_count-1,0),verification_reminder_sent_at=NULL WHERE id=?",
  deleteExpiredTokens:
    "DELETE FROM email_verification_tokens WHERE expires_at<utc_now()-interval '7 days'",
};
