export const agentQueries = {
  findKey:
    'SELECT k.id,k.user_id AS "userId",k.writes_per_hour AS "writesPerHour",u.full_name AS "authorName" FROM agent_api_keys k JOIN users u ON u.id=k.user_id WHERE k.key_hash=? AND k.revoked_at IS NULL AND u.account_status=\'active\'',
  touchKey: "UPDATE agent_api_keys SET last_used_at=utc_now() WHERE id=?",
  createKey:
    "INSERT INTO agent_api_keys(id,key_name,key_hash,key_hint,user_id,writes_per_hour) VALUES(?,?,?,?,?,?)",
  listKeys:
    'SELECT k.id,k.key_name AS name,k.key_hint AS hint,u.email AS account,k.writes_per_hour AS "writesPerHour",k.created_at AS "createdAt",k.last_used_at AS "lastUsedAt",k.revoked_at AS "revokedAt" FROM agent_api_keys k JOIN users u ON u.id=k.user_id ORDER BY k.created_at',
  revokeKey:
    "UPDATE agent_api_keys SET revoked_at=utc_now() WHERE id=? AND revoked_at IS NULL",
  findAccount:
    'SELECT id,full_name AS name,(email_verified_at IS NOT NULL) AS "emailVerified",account_status AS status FROM users WHERE email=?',
  // Serialises concurrent requests that share an idempotency key.
  lockRequest: "SELECT pg_advisory_xact_lock(hashtext(?))",
  findRequest:
    'SELECT route,request_hash AS "requestHash",response_status AS status,response_body AS body FROM agent_requests WHERE key_id=? AND idempotency_key=?',
  saveRequest:
    "INSERT INTO agent_requests(key_id,idempotency_key,route,request_hash,response_status,response_body) VALUES(?,?,?,?,?,?::jsonb)",
  purgeRequests:
    "DELETE FROM agent_requests WHERE created_at < utc_now() - interval '1 day'",
  findCompany:
    "SELECT id,company_name AS name,is_active AS active FROM companies WHERE id=?",
  findCompanyByName:
    "SELECT id,company_name AS name,is_active AS active FROM companies WHERE lower(company_name)=lower(?)",
  // The name index is unique ignoring case, so two requests creating the same
  // company at once cannot make a duplicate.
  createCompany:
    "INSERT INTO companies(id,company_name,created_by_user_id) VALUES(?,?,?) ON CONFLICT (lower(company_name)) DO NOTHING",
  findDuplicateReport:
    "SELECT id FROM workforce_reports WHERE company_id=? AND user_id=? AND event_date=? AND reported_roles_affected=?",
};
