// Read-mostly queries behind the admin console. Filters are appended by the
// routes as bound `?` placeholders; only validated identifiers are interpolated.
const series = (table, column = "created_at") =>
  `SELECT d::date AS day,count(t.*)::int AS total FROM generate_series((utc_now()::date-(?::int-1)),utc_now()::date,interval '1 day') d LEFT JOIN ${table} t ON t.${column}::date=d::date GROUP BY d ORDER BY d`;
const windowCount = (table, column = "created_at") =>
  `SELECT count(*) FILTER (WHERE ${column}>=utc_now()-(?::int*interval '1 day'))::int AS current,count(*) FILTER (WHERE ${column}<utc_now()-(?::int*interval '1 day') AND ${column}>=utc_now()-(2*?::int*interval '1 day'))::int AS previous FROM ${table}`;

export const adminConsoleQueries = {
  totals: `SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM users WHERE account_status='active') AS "activeUsers",
    (SELECT count(*)::int FROM users WHERE account_status<>'active') AS "suspendedUsers",
    (SELECT count(*)::int FROM users WHERE last_login_at>utc_now()-interval '7 days') AS "activeLast7Days",
    (SELECT count(*)::int FROM posts) AS posts,
    (SELECT count(*)::int FROM comments) AS comments,
    (SELECT count(*)::int FROM referrals WHERE referral_status='open') AS "openReferrals",
    (SELECT count(*)::int FROM messages) AS messages,
    (SELECT count(*)::int FROM companies) AS companies`,
  pending: `SELECT
    (SELECT count(*)::int FROM reports WHERE report_status IN ('pending','reviewing')) AS "postReports",
    (SELECT count(*)::int FROM comment_reports WHERE report_status IN ('pending','reviewing')) AS "commentReports",
    (SELECT count(*)::int FROM workforce_reports WHERE verification_status='user_reported') AS "workforceReports",
    (SELECT count(*)::int FROM community_notes WHERE review_status='pending') AS "pendingNotes"`,
  usersWindow: windowCount("users"),
  postsWindow: windowCount("posts"),
  commentsWindow: windowCount("comments"),
  referralsWindow: windowCount("referrals"),
  usersSeries: series("users"),
  postsSeries: series("posts"),
  commentsSeries: series("comments"),
  referralsSeries: series("referrals"),
  topTopics:
    "SELECT post_topic AS topic,count(*)::int AS total FROM posts WHERE created_at>=utc_now()-(?::int*interval '1 day') GROUP BY post_topic ORDER BY total DESC LIMIT 6",

  apiHealth: `SELECT count(*)::int AS requests,
    count(*) FILTER (WHERE http_status_code>=500)::int AS "serverErrors",
    count(*) FILTER (WHERE http_status_code BETWEEN 400 AND 499)::int AS "clientErrors",
    COALESCE(round(avg(duration_milliseconds)::numeric,1),0)::float AS "avgMs",
    COALESCE(round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_milliseconds))::numeric,1),0)::float AS "p95Ms"
    FROM api_request_logs WHERE started_at>=utc_now()-interval '24 hours'`,
  slowRoutes: `SELECT http_method AS method,COALESCE(route_pattern,request_path) AS route,count(*)::int AS requests,round(avg(duration_milliseconds)::numeric,1)::float AS "avgMs" FROM api_request_logs WHERE started_at>=utc_now()-interval '24 hours' GROUP BY 1,2 HAVING count(*)>=3 ORDER BY avg(duration_milliseconds) DESC LIMIT 6`,
  recentErrors: `SELECT id,log_level AS level,event_name AS event,log_message AS message,occurred_at AS "occurredAt" FROM application_logs WHERE log_level IN ('error','fatal') ORDER BY occurred_at DESC LIMIT 8`,
  dbFailures:
    "SELECT count(*)::int AS total FROM database_query_logs WHERE was_successful=false AND started_at>=utc_now()-interval '24 hours'",

  userDetail: `SELECT u.id,u.email,u.full_name AS name,u.professional_headline AS headline,u.profile_location AS location,u.profile_image_url AS "profileImageUrl",u.verified_badge AS badge,u.is_admin AS "isAdmin",u.email_verified_at AS "emailVerifiedAt",u.account_status AS "accountStatus",u.created_at AS "createdAt",u.last_login_at AS "lastLoginAt",u.open_to_work AS "openToWork",
    (SELECT count(*)::int FROM posts WHERE user_id=u.id) AS posts,
    (SELECT count(*)::int FROM comments WHERE user_id=u.id) AS comments,
    (SELECT count(*)::int FROM referrals WHERE user_id=u.id) AS referrals,
    (SELECT count(*)::int FROM follows WHERE followed_id=u.id) AS followers,
    (SELECT count(*)::int FROM reports r JOIN posts p ON p.id=r.post_id WHERE p.user_id=u.id) AS "reportsAgainst",
    (SELECT count(*)::int FROM sessions WHERE user_id=u.id AND revoked_at IS NULL AND expires_at>utc_now()) AS "activeSessions"
    FROM users u WHERE u.id=?`,
  setPassword: "UPDATE users SET password_hash=? WHERE id=?",
  revokeSessions:
    "UPDATE sessions SET revoked_at=utc_now() WHERE user_id=? AND revoked_at IS NULL",
  userPosts: `SELECT id,left(post_content,160) AS excerpt,created_at AS "createdAt" FROM posts WHERE user_id=? ORDER BY created_at DESC LIMIT 5`,

  listPosts: (where, order = "p.created_at DESC") =>
    `SELECT p.id,left(p.post_content,500) AS excerpt,p.post_topic AS topic,
    c.company_name AS company,
    p.is_anonymous AS "isAnonymous",
    EXISTS(SELECT 1 FROM referrals r WHERE r.user_id=p.user_id AND r.created_at::date=p.created_at::date) AS "hasReferral",
    EXISTS(SELECT 1 FROM post_polls pp WHERE pp.post_id=p.id) AS "hasPoll",
    p.created_at AS "createdAt",u.id AS "authorId",u.full_name AS "authorName",u.email AS "authorEmail",
    (SELECT count(*)::int FROM comments cm WHERE cm.post_id=p.id) AS comments,
    (SELECT count(*)::int FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='like') AS likes,
    (SELECT count(*)::int FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='dislike') AS dislikes,
    (SELECT count(*)::int FROM reposts rp WHERE rp.post_id=p.id) AS reposts,
    (SELECT count(*)::int FROM post_shares ps WHERE ps.post_id=p.id) AS shares,
    (SELECT count(*)::int FROM reports r WHERE r.post_id=p.id) AS reports,
    COALESCE((SELECT json_agg(up.stored_file_name ORDER BY pi.display_position) FROM post_images pi JOIN uploads up ON up.id=pi.upload_id WHERE pi.post_id=p.id),'[]'::json) AS images
    FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN companies c ON c.id=p.company_id ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
  countPosts: (where) =>
    `SELECT count(*)::int AS total FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN companies c ON c.id=p.company_id ${where}`,
  deletePost: "DELETE FROM posts WHERE id=?",
  postDetail: `SELECT p.id,p.post_content AS text,p.post_topic AS topic,p.created_at AS "createdAt",p.updated_at AS "updatedAt",
    u.id AS "authorId",u.full_name AS "authorName",u.email AS "authorEmail",u.account_status AS "authorStatus",u.is_admin AS "authorIsAdmin"
    FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?`,
  insertWarning:
    "INSERT INTO user_warnings(user_id,post_id,issued_by_user_id,warning_reason,warning_note,post_excerpt,warning_type) VALUES(?,?,?,?,?,?,?)",
  warningCount:
    "SELECT count(*)::int AS total FROM user_warnings WHERE user_id=?",
  userWarnings: `SELECT w.id,w.warning_reason AS reason,w.warning_type AS type,w.warning_note AS note,w.created_at AS "createdAt",w.post_id AS "postId",a.full_name AS "issuedBy"
    FROM user_warnings w LEFT JOIN users a ON a.id=w.issued_by_user_id WHERE w.user_id=? ORDER BY w.created_at DESC LIMIT 20`,
  postReports: `SELECT r.id,r.report_category AS category,r.report_reason AS reason,r.report_status AS status,r.resolution_summary AS "resolutionSummary",r.created_at AS "createdAt",ru.full_name AS "reporterName"
    FROM reports r JOIN users ru ON ru.id=r.user_id WHERE r.post_id=? ORDER BY r.created_at DESC LIMIT 50`,
  postComments: `SELECT c.id,c.comment_content AS text,c.parent_comment_id AS "parentId",c.created_at AS "createdAt",u.id AS "authorId",u.full_name AS "authorName"
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at DESC LIMIT 100`,
  updatePostTopic:
    "UPDATE posts SET post_topic=?,updated_at=utc_now() WHERE id=?",
  resolvePostReports:
    "UPDATE reports SET report_status=?,resolution_summary=?,reviewed_at=utc_now(),reviewed_by_user_id=? WHERE post_id=? AND report_status IN ('pending','reviewing')",
  deletePosts: "DELETE FROM posts WHERE id = ANY(?::uuid[])",
  deleteComment: "DELETE FROM comments WHERE id=?",

  listPostReports: (where) =>
    `SELECT r.id,'post' AS kind,r.report_category AS category,r.report_reason AS reason,r.report_status AS status,r.resolution_summary AS "resolutionSummary",r.created_at AS "createdAt",r.reviewed_at AS "reviewedAt",
    p.id AS "contentId",left(p.post_content,400) AS excerpt,au.full_name AS "authorName",au.id AS "authorId",ru.full_name AS "reporterName"
    FROM reports r JOIN posts p ON p.id=r.post_id JOIN users au ON au.id=p.user_id JOIN users ru ON ru.id=r.user_id ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
  countPostReports: (where) =>
    `SELECT count(*)::int AS total FROM reports r ${where}`,
  listCommentReports: (where) =>
    `SELECT r.id,'comment' AS kind,r.report_category AS category,r.report_reason AS reason,r.report_status AS status,NULL AS "resolutionSummary",r.created_at AS "createdAt",NULL AS "reviewedAt",
    c.id AS "contentId",left(c.comment_content,400) AS excerpt,au.full_name AS "authorName",au.id AS "authorId",ru.full_name AS "reporterName"
    FROM comment_reports r JOIN comments c ON c.id=r.comment_id JOIN users au ON au.id=c.user_id JOIN users ru ON ru.id=r.user_id ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
  countCommentReports: (where) =>
    `SELECT count(*)::int AS total FROM comment_reports r ${where}`,
  findPostReport: 'SELECT post_id AS "contentId" FROM reports WHERE id=?',
  findCommentReport:
    'SELECT comment_id AS "contentId" FROM comment_reports WHERE id=?',
  updatePostReport:
    "UPDATE reports SET report_status=?,resolution_summary=?,reviewed_at=utc_now(),reviewed_by_user_id=? WHERE id=?",
  updateCommentReport: "UPDATE comment_reports SET report_status=? WHERE id=?",

  listWorkforce: (where) =>
    `SELECT w.id,c.company_name AS company,w.event_date AS "eventDate",w.reported_roles_affected AS "rolesAffected",w.reported_headcount AS headcount,w.source_url AS "sourceUrl",w.verification_status AS status,w.verification_summary AS summary,w.created_at AS "createdAt",u.full_name AS "reporterName"
    FROM workforce_reports w JOIN companies c ON c.id=w.company_id JOIN users u ON u.id=w.user_id ${where} ORDER BY w.created_at DESC LIMIT ? OFFSET ?`,
  countWorkforce: (where) =>
    `SELECT count(*)::int AS total FROM workforce_reports w ${where}`,
  updateWorkforce:
    "UPDATE workforce_reports SET verification_status=?,verification_summary=?,verified_at=CASE WHEN ?='verified' THEN utc_now() ELSE NULL END,verified_by_user_id=CASE WHEN ?='verified' THEN ?::uuid ELSE NULL END WHERE id=?",

  listCompanies: (where) =>
    `SELECT c.id,c.company_name AS name,c.industry_name AS industry,c.headquarters_location AS headquarters,c.website_url AS website,c.is_active AS active,c.created_at AS "createdAt",
    u.full_name AS "createdByName",
    (SELECT count(*)::int FROM posts p WHERE p.company_id=c.id) AS posts,
    (SELECT count(*)::int FROM referrals r WHERE r.company_id=c.id) AS referrals,
    (SELECT count(*)::int FROM workforce_reports w WHERE w.company_id=c.id) AS "layoffReports"
    FROM companies c LEFT JOIN users u ON u.id=c.created_by_user_id ${where} ORDER BY c.company_name LIMIT ? OFFSET ?`,
  countCompanies: (where) =>
    `SELECT count(*)::int AS total FROM companies c ${where}`,

  // ---------- Hashtags ----------
  topHashtags: `SELECT tag,count(*)::int AS total,max(latest)::timestamptz AS "lastUsed" FROM (
      SELECT lower(m[1]) AS tag, p.created_at AS latest
      FROM posts p, regexp_matches(p.post_content, '#([A-Za-z][A-Za-z0-9_]{1,49})', 'g') m
      WHERE p.created_at >= utc_now() - (?::int * interval '1 day')
    ) sub GROUP BY tag ORDER BY total DESC LIMIT ?`,
  allTimeHashtags: `SELECT tag,count(*)::int AS total FROM (
      SELECT lower(m[1]) AS tag FROM posts p, regexp_matches(p.post_content, '#([A-Za-z][A-Za-z0-9_]{1,49})', 'g') m
    ) sub GROUP BY tag ORDER BY total DESC LIMIT ?`,

  hashtagStats: `SELECT count(*)::int AS posts,count(DISTINCT p.user_id)::int AS authors,
    min(p.created_at) AS "firstUsed",max(p.created_at) AS "lastUsed",
    count(*) FILTER (WHERE p.created_at >= utc_now() - interval '7 days')::int AS "last7",
    COALESCE(sum((SELECT count(*) FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='like')),0)::int AS likes,
    COALESCE(sum((SELECT count(*) FROM comments cm WHERE cm.post_id=p.id)),0)::int AS comments
    FROM posts p WHERE p.post_content ~* ?`,

  // ---------- Referrals (admin) ----------
  listReferrals: (where) =>
    `SELECT r.id,r.job_title AS title,r.job_location AS location,r.work_mode AS "workMode",r.experience_level AS level,r.required_skills AS skills,r.referral_status AS status,r.created_at AS "createdAt",r.closed_at AS "closedAt",r.company_link_url AS "companyLink",r.job_description_url AS "jobLink",c.company_name AS company,u.full_name AS "ownerName",u.email AS "ownerEmail",
    (SELECT count(*)::int FROM referral_requests rq WHERE rq.referral_id=r.id) AS requests,
    (SELECT count(*)::int FROM referral_requests rq WHERE rq.referral_id=r.id AND rq.request_status='accepted') AS accepted
    FROM referrals r JOIN companies c ON c.id=r.company_id JOIN users u ON u.id=r.user_id ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
  countReferrals: (where) =>
    `SELECT count(*)::int AS total FROM referrals r JOIN companies c ON c.id=r.company_id JOIN users u ON u.id=r.user_id ${where}`,
  updateReferralStatus: `UPDATE referrals SET referral_status=?,closed_at=CASE WHEN ?='closed' THEN utc_now() ELSE NULL END,updated_at=utc_now() WHERE id=? RETURNING id,referral_status AS status`,

  // ---------- Community notes ----------
  listNotes: (where) =>
    `SELECT n.id,n.note_content AS content,n.source_url AS "sourceUrl",n.review_status AS status,n.review_reason AS reason,n.created_at AS "createdAt",n.reviewed_at AS "reviewedAt",
    left(p.post_content,200) AS "postExcerpt",p.id AS "postId",
    u.full_name AS "authorName",u.email AS "authorEmail",
    ru.full_name AS "reviewerName"
    FROM community_notes n JOIN posts p ON p.id=n.post_id JOIN users u ON u.id=n.user_id LEFT JOIN users ru ON ru.id=n.reviewed_by_user_id ${where} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
  countNotes: (where) =>
    `SELECT count(*)::int AS total FROM community_notes n ${where}`,
  updateNote: `UPDATE community_notes SET review_status=?,review_reason=?,reviewed_at=utc_now(),reviewed_by_user_id=? WHERE id=?`,
  findNote: `SELECT id FROM community_notes WHERE id=?`,

  listAudit: (where) =>
    `SELECT a.id,a.action_name AS action,a.resource_type AS "resourceType",a.resource_identifier AS "resourceId",a.outcome,a.client_ip_address AS ip,a.occurred_at AS "occurredAt",a.change_summary->'requestedChanges' AS changes,u.full_name AS "actorName",u.email AS "actorEmail"
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ${where} ORDER BY a.occurred_at DESC LIMIT ? OFFSET ?`,
  countAudit: (where) =>
    `SELECT count(*)::int AS total FROM audit_logs a ${where}`,
};
