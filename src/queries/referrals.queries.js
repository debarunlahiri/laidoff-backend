import { assertPagination } from "./query-guards.js";

export const referralQueries = {
  createReferral:
    "INSERT INTO referrals(id,user_id,company_id,job_title,job_location,work_mode,experience_level,min_experience_years,required_skills,job_description,request_fields,company_link_url,job_description_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
  deleteReferral: "DELETE FROM referrals WHERE id=? AND user_id=?",
  withdrawRequest:
    "DELETE FROM referral_requests WHERE referral_id=? AND user_id=? AND request_status='pending'",
  findRequest:
    "SELECT request_status AS status FROM referral_requests WHERE referral_id=? AND user_id=?",
  upsertFeedback:
    "INSERT INTO referral_feedback(referral_id,user_id,feedback_type) VALUES(?,?,?) ON CONFLICT (referral_id,user_id) DO UPDATE SET feedback_type=EXCLUDED.feedback_type",
  deleteFeedback:
    "DELETE FROM referral_feedback WHERE referral_id=? AND user_id=?",
  feedbackTotals:
    "SELECT COUNT(*) FILTER (WHERE feedback_type='helpful') AS \"helpfulCount\",COUNT(*) FILTER (WHERE feedback_type='not_helpful') AS \"notHelpfulCount\" FROM referral_feedback WHERE referral_id=?",
  updateStatus:
    "UPDATE referrals SET referral_status=?,closed_at=CASE WHEN ?::text='closed' THEN utc_now() ELSE NULL END WHERE id=? AND user_id=?",
  lockReferral:
    'SELECT user_id,referral_status AS status,request_fields AS "requestFields" FROM referrals WHERE id=? FOR UPDATE',
  createDocument:
    "INSERT INTO referral_documents(id,user_id,stored_file_name,original_file_name,mime_type,file_size_bytes) VALUES(?,?,?,?,?,?)",
  findOwnedDocument:
    "SELECT id,original_file_name AS name,file_size_bytes AS size FROM referral_documents WHERE id=? AND user_id=?",
  linkDocument:
    "INSERT INTO referral_request_documents(referral_id,user_id,field_id,document_id) VALUES(?,?,?,?)",
  listRequestDocuments:
    'SELECT d.user_id AS "userId",d.field_id AS "fieldId",f.id AS "documentId",f.original_file_name AS name,f.file_size_bytes AS size FROM referral_request_documents d JOIN referral_documents f ON f.id=d.document_id WHERE d.referral_id=?',
  // A document may be read by its uploader or by the owner of a referral it was submitted to.
  findReadableDocument:
    'SELECT f.stored_file_name AS "storedName",f.original_file_name AS name,f.mime_type AS mime FROM referral_documents f WHERE f.id=? AND (f.user_id=? OR EXISTS (SELECT 1 FROM referral_request_documents d JOIN referrals r ON r.id=d.referral_id WHERE d.document_id=f.id AND r.user_id=?))',
  createRequest:
    "INSERT INTO referral_requests(referral_id,user_id,request_message,request_answers) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
  findOwner: "SELECT user_id FROM referrals WHERE id=?",
  listRequests: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT rr.user_id AS "userId",rr.request_status AS status,rr.request_message AS message,rr.request_answers AS answers,rr.created_at AS "createdAt",u.profile_image_url AS "profileImageUrl",u.full_name AS name,u.professional_headline AS role FROM referral_requests rr JOIN users u ON u.id=rr.user_id WHERE rr.referral_id=? ORDER BY rr.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  lockOwner: "SELECT user_id FROM referrals WHERE id=? FOR UPDATE",
  updateRequestDecision:
    "UPDATE referral_requests SET request_status=?,decision_at=utc_now(),decision_by_user_id=? WHERE referral_id=? AND user_id=?",
};
