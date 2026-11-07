import { query } from "../db/db.js";
import { postPollQueries } from "../queries/post-polls.queries.js";

// Adds `poll` to post rows: options with vote counts, the viewer's own votes,
// and whether the poll has closed. Posts without a poll get `poll: null`.
export async function attachPolls(rows, userId = null) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id);
  const count = ids.length;
  const polls = await query(postPollQueries.listPolls({ count }), ids);
  if (!polls.length) return rows.map((row) => ({ ...row, poll: null }));
  const [options, voters, mine] = await Promise.all([
    query(postPollQueries.listOptions({ count }), ids),
    query(postPollQueries.listVoters({ count }), ids),
    query(postPollQueries.listMyVotes({ count }), [userId, ...ids]),
  ]);
  const byPost = new Map(polls.map((poll) => [poll.postId, poll]));
  return rows.map((row) => {
    const poll = byPost.get(row.id);
    if (!poll) return { ...row, poll: null };
    const list = options
      .filter((option) => option.postId === row.id)
      .map(({ postId: _postId, ...option }) => ({
        ...option,
        votes: Number(option.votes),
      }));
    return {
      ...row,
      poll: {
        allowMultiple: Boolean(poll.allowMultiple),
        closesAt: poll.closesAt,
        closed: Boolean(poll.closed),
        options: list,
        totalVotes: list.reduce((sum, option) => sum + option.votes, 0),
        voters: Number(
          voters.find((item) => item.postId === row.id)?.voters ?? 0,
        ),
        myVotes: mine
          .filter((vote) => vote.postId === row.id)
          .map((vote) => vote.optionId),
      },
    };
  });
}
