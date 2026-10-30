import { assertPagination } from "./query-guards.js";
export function buildReferralListQuery({ filters, userId, limit, offset }) {
  assertPagination(limit, offset);
  const params = [
    userId,
    userId,
    "%" + filters.search + "%",
    "%" + filters.search + "%",
  ];
  let where = "(r.job_title LIKE ? OR c.company_name LIKE ?)";
  if (filters.companyId) {
    where += " AND r.company_id=?";
    params.push(filters.companyId);
  }
  if (filters.status !== "all") {
    where += " AND r.referral_status=?";
    params.push(filters.status);
  }

  return {
    sql: `SELECT r.id,r.job_title AS title,r.job_location AS location,r.required_skills AS skills,r.job_description AS description,r.referral_status AS status,r.created_at AS createdAt,c.id AS companyId,c.company_name AS company,u.id AS authorId,u.full_name AS person,(r.user_id=?) AS own,(SELECT request_status AS status FROM referral_requests rr WHERE rr.referral_id=r.id AND rr.user_id=?) AS requestStatus FROM referrals r JOIN companies c ON c.id=r.company_id JOIN users u ON u.id=r.user_id WHERE ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  };
}
