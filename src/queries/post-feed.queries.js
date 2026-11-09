import { assertPagination } from "./query-guards.js";
export function buildPostFeedQuery({ filters, userId, limit, offset }) {
  assertPagination(limit, offset);
  const conditions = ["1=1"];
  const params = [];
  const user = userId;
  if (filters.id) {
    // A single post is always reachable by link, even if the viewer hid it.
    conditions.push("p.id=?");
    params.push(filters.id);
  } else {
    conditions.push(
      `${filters.tab === "hidden" ? "" : "NOT "}EXISTS(SELECT 1 FROM hidden_posts h WHERE h.post_id=p.id AND h.user_id=?)`,
    );
    params.push(user);
    // Hide non-anonymous posts whose author's account has been deactivated or deleted.
    conditions.push("(p.is_anonymous OR u.account_status != 'deactivated')");
  }
  if (filters.authorId) {
    // Anonymous posts are never attributed to their author.
    conditions.push("p.user_id=? AND p.is_anonymous=FALSE");
    params.push(filters.authorId);
  }
  if (filters.topic) {
    conditions.push("p.post_topic=?");
    params.push(filters.topic);
  }
  if (filters.companyId) {
    conditions.push("p.company_id=?");
    params.push(filters.companyId);
  }
  if (filters.hashtag) {
    conditions.push("p.post_content ~* ?");
    params.push(`(^|[^[:alnum:]_#/])${filters.hashtag}([^[:alnum:]_]|$)`);
  } else if (filters.search) {
    conditions.push(
      "(p.post_content ILIKE ? OR c.company_name ILIKE ? OR (p.is_anonymous=FALSE AND u.full_name ILIKE ?))",
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
    sql: `SELECT p.id,p.post_content AS text,p.post_topic AS topic,p.company_id AS "companyId",COALESCE(c.company_name,'') AS company,p.is_anonymous AS anonymous,p.created_at AS "createdAt",p.edited_at AS "editedAt",CASE WHEN p.is_anonymous THEN NULL ELSE u.id END AS "authorId",CASE WHEN p.is_anonymous THEN 'Anonymous member' ELSE u.full_name END AS name,CASE WHEN p.is_anonymous THEN NULL ELSE u.username END AS username,CASE WHEN p.is_anonymous THEN 'Community member' ELSE u.professional_headline END AS role,CASE WHEN p.is_anonymous THEN FALSE ELSE u.open_to_work END AS "openToWork",CASE WHEN p.is_anonymous THEN NULL ELSE u.profile_image_url END AS "profileImageUrl",CASE WHEN p.is_anonymous THEN NULL ELSE u.verified_badge END AS badge,(p.user_id=?) AS own,up.stored_file_name AS image,
 (SELECT note_content FROM community_notes WHERE post_id=p.id AND review_status='approved' ORDER BY created_at DESC,id DESC LIMIT 1) AS note,
 (SELECT source_url FROM community_notes WHERE post_id=p.id AND review_status='approved' ORDER BY created_at DESC,id DESC LIMIT 1) AS "noteSource",
 CASE WHEN p.is_anonymous THEN FALSE ELSE EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followed_id=p.user_id) END AS following,
 (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='like') AS likes,
 (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.reaction_type='dislike') AS dislikes,
 (SELECT COUNT(*) FROM comments cm WHERE cm.post_id=p.id) AS comments,
 (SELECT COUNT(*) FROM reposts rp WHERE rp.post_id=p.id) AS reposts,
 (SELECT COUNT(*) FROM post_shares ps WHERE ps.post_id=p.id) AS shares,
 (SELECT COUNT(*) FROM post_views pv WHERE pv.post_id=p.id) AS views,
 (SELECT reaction_type AS reaction FROM reactions r WHERE r.post_id=p.id AND r.user_id=?) AS reaction,
 EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id AND b.user_id=?) AS saved,
 EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id=p.id AND rp.user_id=?) AS reposted,
 (SELECT json_build_object('id',q.id,'text',LEFT(q.post_content,600),'topic',q.post_topic,'createdAt',q.created_at,'anonymous',q.is_anonymous,
   'authorId',CASE WHEN q.is_anonymous THEN NULL ELSE qu.id END,
   'name',CASE WHEN q.is_anonymous THEN 'Anonymous member' ELSE qu.full_name END,
   'username',CASE WHEN q.is_anonymous THEN NULL ELSE qu.username END,
   'badge',CASE WHEN q.is_anonymous THEN NULL ELSE qu.verified_badge END,
   'image',(SELECT upl.stored_file_name FROM post_images pim JOIN uploads upl ON upl.id=pim.upload_id WHERE pim.post_id=q.id ORDER BY pim.display_position LIMIT 1))
  FROM posts q JOIN users qu ON qu.id=q.user_id WHERE q.id=p.quoted_post_id) AS quoted
 FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN companies c ON c.id=p.company_id LEFT JOIN uploads up ON up.id=p.upload_id WHERE ${conditions.join(" AND ")} ORDER BY ${filters.sort === "most-liked" ? "likes DESC," : ""}p.created_at DESC,p.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params: [user, user, user, user, user, ...params],
  };
}
