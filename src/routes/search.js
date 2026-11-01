import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { page } from "../http.js";
import { attachPostImages } from "../post-images.js";
import { attachPolls } from "../post-polls.js";
import { buildPostFeedQuery } from "../queries/post-feed.queries.js";
import { buildReferralListQuery } from "../queries/referral-list.queries.js";
import { escapeLike } from "../queries/query-guards.js";
import { searchQueries } from "../queries/search.queries.js";
import { topics } from "./posts.js";

export const search = Router();

const params = z.object({
  q: z.string().trim().max(100).default(""),
  type: z
    .enum(["all", "users", "posts", "referrals", "companies", "topics"])
    .default("all"),
  // Per-group size for type=all (autocomplete). Single types use limit/offset.
  perGroup: z.coerce.number().int().min(1).max(10).default(5),
});

// Global search across people, posts, referrals, companies and topics.
search.get("/", async (req, res) => {
  const { q, type, perGroup } = params.parse(req.query);
  const results = {
    users: [],
    posts: [],
    referrals: [],
    companies: [],
    topics: [],
  };
  if (q.length < 2) return res.json(results);

  const term = escapeLike(q);
  const contains = `%${term}%`;
  const prefix = `${term}%`;
  const viewer = req.user.id;
  const paging = type === "all" ? { limit: perGroup, offset: 0 } : page(req);
  const wants = (name) => type === "all" || type === name;

  const [users, posts, referrals, companies] = await Promise.all([
    wants("users")
      ? query(searchQueries.users(paging), [
          viewer,
          viewer,
          contains,
          contains,
          prefix,
        ])
      : [],
    wants("posts")
      ? (() => {
          const built = buildPostFeedQuery({
            filters: { search: term, tab: "all", sort: "latest" },
            userId: viewer,
            ...paging,
          });
          return query(built.sql, built.params)
            .then(attachPostImages)
            .then((rows) => attachPolls(rows, viewer));
        })()
      : [],
    wants("referrals")
      ? (() => {
          const built = buildReferralListQuery({
            filters: { search: term, status: "open" },
            userId: viewer,
            ...paging,
          });
          return query(built.sql, built.params);
        })()
      : [],
    wants("companies")
      ? query(searchQueries.companies(paging), [contains, prefix])
      : [],
  ]);

  results.users = users;
  results.posts = posts.map((p) => ({
    ...p,
    image: p.image ? `/uploads/${p.image}` : null,
  }));
  results.referrals = referrals;
  results.companies = companies;
  if (wants("topics"))
    results.topics = topics
      .filter((topic) => topic.toLowerCase().includes(q.toLowerCase()))
      .slice(0, type === "all" ? perGroup : paging.limit);
  res.json(results);
});
