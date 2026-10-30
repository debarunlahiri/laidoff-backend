import { assertPagination } from "./query-guards.js";

export const referralQueries = {
  createReferral:
    "INSERT INTO referrals(id,user_id,company_id,job_title,job_location,required_skills,job_description) VALUES(?,?,?,?,?,?,?)",
  updateStatus:
    "UPDATE referrals SET referral_status=?,closed_at=IF(?='closed',UTC_TIMESTAMP(3),NULL) WHERE id=? AND user_id=?",
  lockReferral:
    "SELECT user_id,referral_status AS status FROM referrals WHERE id=? FOR UPDATE",
  createRequest:
    "INSERT IGNORE INTO referral_requests(referral_id,user_id) VALUES(?,?)",
  findOwner: "SELECT user_id FROM referrals WHERE id=?",
  listRequests: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT rr.user_id AS userId,rr.request_status AS status,rr.created_at AS createdAt,u.full_name AS name,u.professional_headline AS role FROM referral_requests rr JOIN users u ON u.id=rr.user_id WHERE rr.referral_id=? ORDER BY rr.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  lockOwner: "SELECT user_id FROM referrals WHERE id=? FOR UPDATE",
  updateRequestDecision:
    "UPDATE referral_requests SET request_status=?,decision_at=UTC_TIMESTAMP(3),decision_by_user_id=? WHERE referral_id=? AND user_id=?",
};
