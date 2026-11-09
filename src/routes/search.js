import { Router } from "express";
import { z } from "zod";
import { query } from "../db/db.js";
import { page } from "../utils/http.js";
import { attachPostImages } from "../services/post-images.js";
import { attachPolls } from "../services/post-polls.js";
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
  const hashtag = /^#[\p{L}\p{N}_]+$/u.test(q) ? q : undefined;
  // "#CareerSupport" also looks for the plain word "careersupport" everywhere
  // else (referral titles/skills, company names, headlines, topics).
  const bare = hashtag ? escapeLike(hashtag.slice(1)) : term;
  const contains = `%${bare}%`;
  const prefix = `${bare}%`;
  const nameContains = hashtag ? `%${term}%` : contains; // names rarely contain "#tag"
  const viewer = req.user.id;
  const paging = type === "all" ? { limit: perGroup, offset: 0 } : page(req);
  // A hashtag only relates to content: posts, referrals and topics.
  const wants = (name) =>
    (type === "all" || type === name) &&
    !(hashtag && (name === "users" || name === "companies"));

  const [users, posts, referrals, companies] = await Promise.all([
    wants("users")
      ? query(searchQueries.users(paging), [
          viewer,
          viewer,
          nameContains,
          contains,
          nameContains,
          prefix,
          prefix,
        ])
      : [],
    wants("posts")
      ? (() => {
          const built = buildPostFeedQuery({
            filters: {
              search: hashtag ? undefined : term,
              hashtag,
              tab: "all",
              sort: "latest",
            },
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
            filters: { search: bare, status: "open" },
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
  if (wants("topics")) {
    const squash = (v) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const needle = squash(hashtag ? hashtag.slice(1) : q);
    const related = (topic) => {
      const whole = squash(topic);
      if (whole.includes(needle) || (hashtag && needle.includes(whole)))
        return true;
      // "#careersupport" relates to "Career advice" through the shared word "career".
      return (
        Boolean(hashtag) &&
        topic
          .toLowerCase()
          .split(/\s+/)
          .some((word) => word.length >= 4 && needle.includes(squash(word)))
      );
    };
    results.topics = topics
      .filter(related)
      .slice(0, type === "all" ? perGroup : paging.limit);
  }
  res.json(results);
});
