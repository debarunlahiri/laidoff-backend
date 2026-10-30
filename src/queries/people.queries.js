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
    return `SELECT u.id,u.full_name AS name,u.professional_headline AS role,u.open_to_work AS openToWork, EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followed_id=u.id) AS following FROM users u WHERE u.account_status='active' AND NOT (u.id <=> ?) AND (u.full_name LIKE ? OR u.professional_headline LIKE ?) ORDER BY u.full_name LIMIT ${limit} OFFSET ${offset}`;
  },
  findPublicProfile:
    "SELECT id,full_name AS name,professional_headline AS role,biography AS about,professional_skills AS skills,career_objective AS nextChapter,open_to_work AS openToWork,profile_location AS location,website_url AS websiteUrl,linkedin_profile_url AS linkedinProfileUrl FROM users WHERE id=?",
  createFollow:
    "INSERT IGNORE INTO follows(follower_id,followed_id) VALUES(?,?)",
  deleteFollow: "DELETE FROM follows WHERE follower_id=? AND followed_id=?",
  listConnections: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT c.*,c.connection_status AS status,u.full_name AS name,u.professional_headline AS role FROM connections c JOIN users u ON u.id=IF(c.requester_id=?,c.recipient_id,c.requester_id) WHERE c.requester_id=? OR c.recipient_id=? ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
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
};
