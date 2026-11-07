export const adminQueries = {
  isAdmin:
    "SELECT is_admin AS \"isAdmin\" FROM users WHERE id=? AND account_status='active'",
  userStats:
    "SELECT count(*) AS total,count(email_verified_at) AS verified,count(*)-count(email_verified_at) AS unverified FROM users",
  emailStats:
    "SELECT status,count(*) AS total FROM email_logs WHERE created_at>utc_now()-interval '7 days' GROUP BY status",
  emailStatsByTemplate:
    "SELECT template_key AS \"template\",count(*) AS total FROM email_logs WHERE created_at>utc_now()-interval '7 days' AND status='sent' GROUP BY template_key",
  listTemplates:
    'SELECT template_key AS key,content,updated_at AS "updatedAt" FROM email_templates',
  findTemplate: "SELECT content FROM email_templates WHERE template_key=?",
  saveTemplate:
    "INSERT INTO email_templates(template_key,content,updated_by_user_id) VALUES(?,?::jsonb,?) ON CONFLICT (template_key) DO UPDATE SET content=EXCLUDED.content,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=utc_now()",
  deleteTemplate: "DELETE FROM email_templates WHERE template_key=?",
  listSettings:
    "SELECT setting_key AS key,setting_value AS value FROM email_settings",
  saveSetting:
    "INSERT INTO email_settings(setting_key,setting_value,updated_by_user_id) VALUES(?,?::jsonb,?) ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=utc_now()",
  deleteSettings: "DELETE FROM email_settings",
  insertLog:
    "INSERT INTO email_logs(id,user_id,recipient,template_key,subject,status,error_code) VALUES(?,?,?,?,?,?,?)",
  // Filters are appended by the route using bound placeholders only.
  listLogs: (where) =>
    `SELECT id,user_id AS "userId",recipient,template_key AS "template",subject,status,error_code AS "errorCode",created_at AS "createdAt" FROM email_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  countLogs: (where) => `SELECT count(*) AS total FROM email_logs ${where}`,
  listUsers: (where) =>
    `SELECT id,email,full_name AS name,is_admin AS "isAdmin",email_verified_at AS "emailVerifiedAt",account_status AS "accountStatus",(SELECT count(*)::int FROM user_warnings w WHERE w.user_id=users.id) AS "warningCount",created_at AS "createdAt",last_login_at AS "lastLoginAt",verification_reminder_count AS "reminderCount",verification_reminder_sent_at AS "reminderSentAt",password_hash IS NOT NULL AS "hasPassword" FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  countUsers: (where) => `SELECT count(*) AS total FROM users ${where}`,
  findUser:
    'SELECT id,email,full_name AS name,is_admin AS "isAdmin",email_verified_at AS "emailVerifiedAt",account_status AS "accountStatus",(SELECT count(*)::int FROM user_warnings w WHERE w.user_id=users.id) AS "warningCount",created_at AS "createdAt",last_login_at AS "lastLoginAt",verification_reminder_count AS "reminderCount",verification_reminder_sent_at AS "reminderSentAt",password_hash IS NOT NULL AS "hasPassword" FROM users WHERE id=?',
  updateUser: (assignments) =>
    `UPDATE users SET ${assignments.join(",")} WHERE id=?`,
  userEmail: "SELECT email,full_name AS name FROM users WHERE id=?",
};
