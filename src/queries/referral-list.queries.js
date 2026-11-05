import { assertPagination } from "./query-guards.js";

// Whitelisted ORDER BY clauses, never built from user input.
// "helpful" ranks by a smoothed share of helpful votes the referrer has earned
// across all their offers, so one lucky vote does not outrank a long record.
const sorts = {
  newest: "r.created_at DESC,r.id DESC",
  oldest: "r.created_at ASC,r.id ASC",
  helpful: '"authorScore" DESC,"authorVotes" DESC,r.created_at DESC,r.id DESC',
  requests: '"requestCount" DESC,r.created_at DESC,r.id DESC',
  company: "c.company_name ASC,r.created_at DESC,r.id DESC",
};
export const referralSorts = Object.keys(sorts);

const authorVotes =
  "(SELECT COUNT(*) FROM referral_feedback f JOIN referrals fr ON fr.id=f.referral_id WHERE fr.user_id=r.user_id)";
const authorHelpful =
  "(SELECT COUNT(*) FROM referral_feedback f JOIN referrals fr ON fr.id=f.referral_id WHERE fr.user_id=r.user_id AND f.feedback_type='helpful')";

export function buildReferralListQuery({ filters, userId, limit, offset }) {
  assertPagination(limit, offset);
  const term = "%" + filters.search + "%";
  // Parameters are listed in the order their placeholders appear in the SQL.
  const params = [userId, userId, userId];
  const clauses = [
    "(r.job_title ILIKE ? OR c.company_name ILIKE ? OR r.required_skills ILIKE ? OR r.job_location ILIKE ?)",
  ];
  const whereParams = [term, term, term, term];
  const add = (clause, ...values) => {
    clauses.push(clause);
    whereParams.push(...values);
  };
  if (filters.id) add("r.id=?", filters.id);
  if (filters.companyId) add("r.company_id=?", filters.companyId);
  if (filters.authorId) add("r.user_id=?", filters.authorId);
  if (filters.status !== "all") add("r.referral_status=?", filters.status);
  if (filters.workMode) add("r.work_mode=?", filters.workMode);
  if (filters.level) add("r.experience_level=?", filters.level);
  if (filters.location) add("r.job_location ILIKE ?", `%${filters.location}%`);
  if (filters.skill) add("r.required_skills ILIKE ?", `%${filters.skill}%`);
  // "I have N years" keeps roles asking for N or fewer.
  if (filters.experience !== undefined)
    add(
      "(r.min_experience_years IS NULL OR r.min_experience_years<=?)",
      filters.experience,
    );
  if (filters.postedWithin)
    add(
      "r.created_at >= (utc_now() - (?::int * INTERVAL '1 day'))",
      filters.postedWithin,
    );
  if (filters.topRated)
    add(`(${authorVotes}>=3 AND ${authorHelpful}*100>=${authorVotes}*70)`);
  if (filters.view === "mine") add("r.user_id=?", userId);
  if (filters.view === "available")
    add(
      "(r.user_id<>? AND r.referral_status='open' AND NOT EXISTS (SELECT 1 FROM referral_requests q WHERE q.referral_id=r.id AND q.user_id=?))",
      userId,
      userId,
    );
  if (filters.view === "requested")
    add(
      "EXISTS (SELECT 1 FROM referral_requests q WHERE q.referral_id=r.id AND q.user_id=?)",
      userId,
    );
  if (filters.requestStatus)
    add(
      "EXISTS (SELECT 1 FROM referral_requests q WHERE q.referral_id=r.id AND q.user_id=? AND q.request_status=?)",
      userId,
      filters.requestStatus,
    );

  const sql = `SELECT r.id,r.job_title AS title,r.job_location AS location,r.work_mode AS "workMode",r.experience_level AS level,r.min_experience_years AS "minExperience",r.required_skills AS skills,r.job_description AS description,r.request_fields AS "requestFields",r.referral_status AS status,r.created_at AS "createdAt",c.id AS "companyId",c.company_name AS company,u.id AS "authorId",u.full_name AS person,u.professional_headline AS "personRole",u.profile_image_url AS "personImageUrl",(r.user_id=?) AS own,(SELECT request_status FROM referral_requests rr WHERE rr.referral_id=r.id AND rr.user_id=?) AS "requestStatus",(SELECT feedback_type FROM referral_feedback mf WHERE mf.referral_id=r.id AND mf.user_id=?) AS "myFeedback",(SELECT COUNT(*) FROM referral_requests rc WHERE rc.referral_id=r.id) AS "requestCount",(SELECT COUNT(*) FROM referral_feedback hf WHERE hf.referral_id=r.id AND hf.feedback_type='helpful') AS "helpfulCount",(SELECT COUNT(*) FROM referral_feedback nf WHERE nf.referral_id=r.id AND nf.feedback_type='not_helpful') AS "notHelpfulCount",(SELECT COUNT(*) FROM referral_shares rs WHERE rs.referral_id=r.id) AS shares,${authorVotes} AS "authorVotes",${authorHelpful} AS "authorHelpful",((${authorHelpful}+1)::numeric/(${authorVotes}+2)) AS "authorScore" FROM referrals r JOIN companies c ON c.id=r.company_id JOIN users u ON u.id=r.user_id WHERE ${clauses.join(" AND ")} ORDER BY ${sorts[filters.sort] ?? sorts.newest} LIMIT ${limit} OFFSET ${offset}`;
  return { sql, params: [...params, ...whereParams] };
}
