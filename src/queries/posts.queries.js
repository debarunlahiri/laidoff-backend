import { assertPagination, assertTable } from "./query-guards.js";

export const postQueries = {
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
  listComments: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT c.id,c.comment_content AS text,c.created_at AS createdAt,u.id AS authorId,u.full_name AS name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at,c.id LIMIT ${limit} OFFSET ${offset}`;
  },
  createComment:
    "INSERT INTO comments(id,post_id,user_id,comment_content) VALUES(?,?,?,?)",
  listVisibleNotes: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT id,note_content AS text,source_url AS sourceUrl,review_status AS status,created_at AS createdAt FROM community_notes WHERE post_id=? AND (review_status='approved' OR user_id=?) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  },
  createNote:
    "INSERT INTO community_notes(id,post_id,user_id,note_content,source_url) VALUES(?,?,?,?,?)",
  upsertReport:
    "INSERT INTO reports(id,post_id,user_id,report_reason) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE report_reason=VALUES(report_reason)",
};
