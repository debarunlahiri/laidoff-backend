import { assertPagination } from "./query-guards.js";

export const peopleQueries = {
  findCompany:
    "SELECT id,company_name AS name FROM companies WHERE id=? AND is_active=TRUE",
  networkStats: `SELECT
    (SELECT COUNT(*) FROM follows WHERE follower_id=?) AS following,
    (SELECT COUNT(*) FROM connections WHERE (requester_id=? OR recipient_id=?) AND connection_status='accepted') AS connections,
    (SELECT COUNT(*) FROM connections WHERE requester_id=? AND connection_status='pending') AS outgoingRequests,
    (SELECT COUNT(*) FROM connections WHERE recipient_id=? AND connection_status='pending') AS incomingRequests`,
  searchCompanies: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT id,company_name AS name FROM companies WHERE is_active=TRUE AND company_name LIKE ? ORDER BY company_name LIMIT ${limit} OFFSET ${offset}`;
  },
  searchPeople: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT u.id,u.full_name AS name,u.professional_headline AS role,u.open_to_work AS openToWork,u.profile_image_url AS profileImageUrl, EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followed_id=u.id) AS following FROM users u WHERE u.account_status='active' AND NOT (u.id <=> ?) AND (u.full_name LIKE ? OR u.professional_headline LIKE ?) ORDER BY u.full_name LIMIT ${limit} OFFSET ${offset}`;
  },
  findPublicProfile:
    "SELECT id,full_name AS name,professional_headline AS role,biography AS about,professional_skills AS skills,career_objective AS nextChapter,open_to_work AS openToWork,profile_location AS location,profile_image_url AS profileImageUrl,cover_image_url AS coverImageUrl,website_url AS websiteUrl,linkedin_profile_url AS linkedinProfileUrl FROM users WHERE id=?",
  // Public activity totals. Anonymous posts are excluded so they stay unlinked.
  userActivityStats: `SELECT
    (SELECT COUNT(*) FROM posts p WHERE p.user_id=? AND p.is_anonymous=FALSE) AS posts,
    (SELECT COUNT(*) FROM reactions r JOIN posts p ON p.id=r.post_id WHERE p.user_id=? AND p.is_anonymous=FALSE AND r.reaction_type='like') AS likesReceived,
    (SELECT COUNT(*) FROM reactions r JOIN posts p ON p.id=r.post_id WHERE p.user_id=? AND p.is_anonymous=FALSE AND r.reaction_type='dislike') AS dislikesReceived,
    (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.user_id=? AND p.is_anonymous=FALSE) AS commentsReceived,
    (SELECT COUNT(*) FROM referrals r WHERE r.user_id=?) AS referrals,
    (SELECT COUNT(*) FROM referrals r WHERE r.user_id=? AND r.referral_status='open') AS openReferrals,
    (SELECT COUNT(*) FROM follows f WHERE f.followed_id=?) AS followers,
    (SELECT COUNT(*) FROM follows f WHERE f.follower_id=?) AS following,
    (SELECT COUNT(*) FROM connections c WHERE (c.requester_id=? OR c.recipient_id=?) AND c.connection_status='accepted') AS connections`,
  listFollowers: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT u.id,u.full_name AS name,u.professional_headline AS role,u.profile_image_url AS profileImageUrl,u.open_to_work AS openToWork,f.created_at AS since FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.followed_id=? AND u.account_status='active' ORDER BY f.created_at DESC,u.id LIMIT ${limit} OFFSET ${offset}`;
  },
  listAcceptedConnections: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT u.id,u.full_name AS name,u.professional_headline AS role,u.profile_image_url AS profileImageUrl,u.open_to_work AS openToWork,c.accepted_at AS since FROM connections c JOIN users u ON u.id=IF(c.requester_id=?,c.recipient_id,c.requester_id) WHERE (c.requester_id=? OR c.recipient_id=?) AND c.connection_status='accepted' AND u.account_status='active' ORDER BY c.accepted_at DESC,u.id LIMIT ${limit} OFFSET ${offset}`;
  },
  // Who reacted to this member's public posts. Anonymous posts are never listed.
  listReactionsReceived: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT u.id,u.full_name AS name,u.professional_headline AS role,u.profile_image_url AS profileImageUrl,r.post_id AS postId,LEFT(p.post_content,140) AS postPreview,r.created_at AS reactedAt FROM reactions r JOIN posts p ON p.id=r.post_id JOIN users u ON u.id=r.user_id WHERE p.user_id=? AND p.is_anonymous=FALSE AND r.reaction_type=? AND u.account_status='active' ORDER BY r.created_at DESC,r.post_id LIMIT ${limit} OFFSET ${offset}`;
  },
  createFollow:
    "INSERT IGNORE INTO follows(follower_id,followed_id) VALUES(?,?)",
  deleteFollow: "DELETE FROM follows WHERE follower_id=? AND followed_id=?",
  listConnections: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT c.*,c.connection_status AS status,u.full_name AS name,u.professional_headline AS role,u.profile_image_url AS profileImageUrl FROM connections c JOIN users u ON u.id=IF(c.requester_id=?,c.recipient_id,c.requester_id) WHERE c.requester_id=? OR c.recipient_id=? ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  findConnectionByPair:
    "SELECT *,connection_status AS status FROM connections WHERE participant_pair_key=?",
  createConnection:
    "INSERT INTO connections(id,requester_id,recipient_id,participant_pair_key) VALUES(?,?,?,?)",
  lockConnection:
    "SELECT *,connection_status AS status FROM connections WHERE id=? FOR UPDATE",
  acceptConnection:
    "UPDATE connections SET connection_status=?,accepted_at=UTC_TIMESTAMP(3) WHERE id=?",
  deleteConnection:
    "DELETE FROM connections WHERE id=? AND (requester_id=? OR recipient_id=?)",
  findOwnedUploadFile:
    "SELECT stored_file_name AS file FROM uploads WHERE id=? AND user_id=?",
  setProfileImage: "UPDATE users SET profile_image_url=? WHERE id=?",
  setCoverImage: "UPDATE users SET cover_image_url=? WHERE id=?",
};
