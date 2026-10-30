import { assertPagination } from "./query-guards.js";
export function buildPostFeedQuery({ filters, userId, limit, offset }) {
  assertPagination(limit, offset);
  const conditions = ["1=1"];
  const params = [];
  const user = userId;
  conditions.push(
    `${filters.tab === "hidden" ? "" : "NOT "}EXISTS(SELECT 1 FROM hidden_posts h WHERE h.post_id=p.id AND h.user_id=?)`,
  );
  params.push(user);
  if (filters.topic) {
    conditions.push("p.post_topic=?");
    params.push(filters.topic);
  }
  if (filters.companyId) {
    conditions.push("p.company_id=?");
    params.push(filters.companyId);
  }
  if (filters.search) {
    conditions.push(
      "(p.post_content LIKE ? OR c.company_name LIKE ? OR (p.is_anonymous=FALSE AND u.full_name LIKE ?))",
    );
    params.push(...Array(3).fill("%" + filters.search + "%"));
  }
  if (filters.tab === "following") {
    conditions.push(
      "p.is_anonymous=FALSE AND EXISTS(SELECT 1 FROM follows f WHERE f.followed_id=p.user_id AND f.follower_id=?)",
    );
    params.push(user);
  }
  if (filters.tab === "referrals")
    conditions.push("p.post_topic='Offering referrals'");
  if (filters.tab === "bookmarks") {
    conditions.push(
      "EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id AND b.user_id=?)",
    );
    params.push(user);
  }

  return {
    sql: `SELECT p.id,p.post_content AS text,p.post_topic AS topic,p.company_id AS companyId,COALESCE(c.company_name,'') AS company,p.is_anonymous AS anonymous,p.created_at AS createdAt,IF(p.is_anonymous,NULL,u.id) AS authorId,IF(p.is_anonymous,'Anonymous member',u.full_name) AS name,IF(p.is_anonymous,'Community member',u.professional_headline) AS role,IF(p.is_anonymous,FALSE,u.open_to_work) AS openToWork,IF(p.user_id=?,TRUE,FALSE) AS own,up.stored_file_name AS image,
 (SELECT note_content FROM community_notes WHERE post_id=p.id AND review_status='approved' ORDER BY created_at DESC,id DESC LIMIT 1) AS note,
 (SELECT source_url FROM community_notes WHERE post_id=p.id AND review_status='approved' ORDER BY created_at DESC,id DESC LIMIT 1) AS noteSource,
 IF(p.is_anonymous,FALSE,EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followed_id=p.user_id)) AS following,
 (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='like') AS likes,
 (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='dislike') AS dislikes,
 (SELECT COUNT(*) FROM comments cm WHERE cm.post_id=p.id) AS comments,
 (SELECT COUNT(*) FROM reposts rp WHERE rp.post_id=p.id) AS reposts,
 (SELECT reaction_type AS reaction FROM reactions r WHERE r.post_id=p.id AND r.user_id=?) AS reaction,
 EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id AND b.user_id=?) AS saved,
 EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id=p.id AND rp.user_id=?) AS reposted
 FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN companies c ON c.id=p.company_id LEFT JOIN uploads up ON up.id=p.upload_id WHERE ${conditions.join(" AND ")} ORDER BY ${filters.sort === "most-liked" ? "likes DESC," : ""}p.created_at DESC,p.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params: [user, user, user, user, user, ...params],
  };
}
