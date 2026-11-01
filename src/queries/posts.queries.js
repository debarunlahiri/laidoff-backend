import { assertPagination, assertTable } from "./query-guards.js";

// Viewer id is the first bind parameter (for myReaction); post id follows.
const commentColumns = `c.id,c.parent_comment_id AS parentId,c.comment_content AS text,c.created_at AS createdAt,u.id AS authorId,u.full_name AS name,u.profile_image_url AS profileImageUrl,
 (SELECT COUNT(*) FROM comment_reactions r WHERE r.comment_id=c.id AND r.reaction_type='like') AS likes,
 (SELECT COUNT(*) FROM comment_reactions r WHERE r.comment_id=c.id AND r.reaction_type='dislike') AS dislikes,
 (SELECT r.reaction_type FROM comment_reactions r WHERE r.comment_id=c.id AND r.user_id=?) AS myReaction,
 (SELECT up.stored_file_name FROM uploads up WHERE up.id=c.upload_id) AS media`;

export const postQueries = {
  trendingTopics:
    "SELECT post_topic AS topic,COUNT(*) AS posts FROM posts WHERE NOT EXISTS(SELECT 1 FROM hidden_posts WHERE hidden_posts.post_id=posts.id AND hidden_posts.user_id=?) GROUP BY post_topic ORDER BY posts DESC,post_topic LIMIT 4",
  findAuthor: "SELECT user_id,is_anonymous AS anonymous FROM posts WHERE id=?",
  findOwnedUpload: "SELECT id FROM uploads WHERE id=? AND user_id=?",
  createPost:
    "INSERT INTO posts(id,user_id,post_content,post_topic,company_id,is_anonymous,upload_id) VALUES(?,?,?,?,?,?,?)",
  deletePost: "DELETE FROM posts WHERE id=?",
  findReaction:
    "SELECT reaction_type AS reaction FROM reactions WHERE post_id=? AND user_id=?",
  upsertReaction:
    "INSERT INTO reactions(post_id,user_id,reaction_type) VALUES(?,?,?) ON DUPLICATE KEY UPDATE reaction_type=VALUES(reaction_type)",
  deleteReaction: "DELETE FROM reactions WHERE post_id=? AND user_id=?",
  addPostAction: ({ table }) => {
    assertTable(table, ["bookmarks", "reposts", "hidden_posts"]);
    return `INSERT IGNORE INTO ${table}(post_id,user_id) VALUES(?,?)`;
  },
  removePostAction: ({ table }) => {
    assertTable(table, ["bookmarks", "reposts", "hidden_posts"]);
    return `DELETE FROM ${table} WHERE post_id=? AND user_id=?`;
  },
  restoreHiddenPosts: "DELETE FROM hidden_posts WHERE user_id=?",
  // Params: [viewerId, postId]. Top-level comments only; replies are loaded
  // separately so pagination counts threads, not individual replies.
  // filter "mine" adds a third bind parameter (viewer id). sort/filter are
  // looked up in fixed maps, never interpolated from user text.
  listComments: ({ limit, offset, sort = "oldest", filter = "all" }) => {
    assertPagination(limit, offset);
    const orders = {
      oldest: "c.created_at,c.id",
      newest: "c.created_at DESC,c.id DESC",
      top: "likes DESC,c.created_at,c.id",
    };
    const filters = {
      all: "",
      mine: " AND c.user_id=?",
      replied:
        " AND EXISTS(SELECT 1 FROM comments rc WHERE rc.parent_comment_id=c.id)",
    };
    if (!(sort in orders) || !(filter in filters))
      throw new TypeError("Invalid comment sort or filter");
    return `SELECT ${commentColumns} FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? AND c.parent_comment_id IS NULL${filters[filter]} ORDER BY ${orders[sort]} LIMIT ${limit} OFFSET ${offset}`;
  },
  // Params: [postId, userId, device, source]. A repeat visit within 30 minutes
  // refreshes the timestamp but is not counted as a new view.
  recordView: `INSERT INTO post_views(post_id,user_id,device,source) VALUES(?,?,?,?)
 ON DUPLICATE KEY UPDATE view_count=IF(last_viewed_at < NOW(3) - INTERVAL 30 MINUTE,view_count+1,view_count),device=VALUES(device),source=VALUES(source),last_viewed_at=NOW(3)`,
  countViews: "SELECT COUNT(*) AS views FROM post_views WHERE post_id=?",
  addShare: "INSERT IGNORE INTO post_shares(post_id,user_id) VALUES(?,?)",
  countShares: "SELECT COUNT(*) AS shares FROM post_shares WHERE post_id=?",
  // Params: [postId]. Each query returns people who engaged, newest first.
  listEngagement: ({ type, limit, offset }) => {
    assertPagination(limit, offset);
    const person =
      "u.id,u.full_name AS name,u.professional_headline AS role,u.profile_image_url AS profileImageUrl";
    const sources = {
      likes: `SELECT ${person},r.created_at AS at,NULL AS count FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.post_id=? AND r.reaction_type='like' ORDER BY r.created_at DESC`,
      dislikes: `SELECT ${person},r.created_at AS at,NULL AS count FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.post_id=? AND r.reaction_type='dislike' ORDER BY r.created_at DESC`,
      comments: `SELECT ${person},MAX(c.created_at) AS at,COUNT(*) AS count FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? GROUP BY u.id,u.full_name,u.professional_headline,u.profile_image_url ORDER BY at DESC`,
      shares: `SELECT ${person},s.created_at AS at,NULL AS count FROM post_shares s JOIN users u ON u.id=s.user_id WHERE s.post_id=? ORDER BY s.created_at DESC`,
      views: `SELECT ${person},v.last_viewed_at AS at,v.view_count AS count,v.first_viewed_at AS firstViewedAt,v.device,v.source FROM post_views v JOIN users u ON u.id=v.user_id WHERE v.post_id=? ORDER BY v.last_viewed_at DESC`,
      reposts: `SELECT ${person},s.created_at AS at,NULL AS count FROM reposts s JOIN users u ON u.id=s.user_id WHERE s.post_id=? ORDER BY s.created_at DESC`,
    };
    if (!(type in sources)) throw new TypeError("Invalid engagement type");
    return `${sources[type]} LIMIT ${limit} OFFSET ${offset}`;
  },
  // Params: [viewerId, postId, ...parentIds]; placeholders are generated, never user text.
  listReplies: ({ count }) => {
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw new TypeError("Invalid reply parent count");
    return `SELECT ${commentColumns} FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? AND c.parent_comment_id IN (${Array(count).fill("?").join(",")}) ORDER BY c.created_at,c.id`;
  },
  findComment:
    "SELECT id,user_id,post_id,parent_comment_id AS parentId FROM comments WHERE id=? AND post_id=?",
  createComment:
    "INSERT INTO comments(id,post_id,parent_comment_id,user_id,comment_content,upload_id) VALUES(?,?,?,?,?,?)",
  findCommentReaction:
    "SELECT reaction_type AS reaction FROM comment_reactions WHERE comment_id=? AND user_id=?",
  upsertCommentReaction:
    "INSERT INTO comment_reactions(comment_id,user_id,reaction_type) VALUES(?,?,?) ON DUPLICATE KEY UPDATE reaction_type=VALUES(reaction_type)",
  deleteCommentReaction:
    "DELETE FROM comment_reactions WHERE comment_id=? AND user_id=?",
  listVisibleNotes: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT id,note_content AS text,source_url AS sourceUrl,review_status AS status,created_at AS createdAt FROM community_notes WHERE post_id=? AND (review_status='approved' OR user_id=?) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  createNote:
    "INSERT INTO community_notes(id,post_id,user_id,note_content,source_url) VALUES(?,?,?,?,?)",
  findCommentAuthor: "SELECT user_id FROM comments WHERE id=? AND post_id=?",
  upsertCommentReport:
    "INSERT INTO comment_reports(id,comment_id,user_id,report_category,report_reason) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE report_category=VALUES(report_category),report_reason=VALUES(report_reason)",
  upsertReport:
    "INSERT INTO reports(id,post_id,user_id,report_category,report_reason) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE report_category=VALUES(report_category),report_reason=VALUES(report_reason)",
};
