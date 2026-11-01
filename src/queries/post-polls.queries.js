// Placeholders are generated from a validated count; ids stay bind parameters.
function marks(count) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new TypeError("Invalid post count");
  return Array(count).fill("?").join(",");
}
export const postPollQueries = {
  createPoll:
    "INSERT INTO post_polls(post_id,allow_multiple,closes_at) VALUES(?,?,IF(? IS NULL,NULL,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? HOUR)))",
  addOption:
    "INSERT INTO post_poll_options(id,post_id,option_text,display_position) VALUES(?,?,?,?)",
  findPoll:
    "SELECT allow_multiple AS allowMultiple,(closes_at IS NOT NULL AND closes_at<=UTC_TIMESTAMP(3)) AS closed FROM post_polls WHERE post_id=? FOR UPDATE",
  listOptionIds: "SELECT id FROM post_poll_options WHERE post_id=?",
  addVote:
    "INSERT INTO post_poll_votes(option_id,post_id,user_id) VALUES(?,?,?)",
  clearVotes: "DELETE FROM post_poll_votes WHERE post_id=? AND user_id=?",
  listPolls: ({ count }) =>
    `SELECT post_id AS postId,allow_multiple AS allowMultiple,closes_at AS closesAt,(closes_at IS NOT NULL AND closes_at<=UTC_TIMESTAMP(3)) AS closed FROM post_polls WHERE post_id IN (${marks(count)})`,
  listOptions: ({ count }) =>
    `SELECT o.id,o.post_id AS postId,o.option_text AS text,(SELECT COUNT(*) FROM post_poll_votes v WHERE v.option_id=o.id) AS votes FROM post_poll_options o WHERE o.post_id IN (${marks(count)}) ORDER BY o.post_id,o.display_position`,
  listVoters: ({ count }) =>
    `SELECT post_id AS postId,COUNT(DISTINCT user_id) AS voters FROM post_poll_votes WHERE post_id IN (${marks(count)}) GROUP BY post_id`,
  listMyVotes: ({ count }) =>
    `SELECT option_id AS optionId,post_id AS postId FROM post_poll_votes WHERE user_id=? AND post_id IN (${marks(count)})`,
};
