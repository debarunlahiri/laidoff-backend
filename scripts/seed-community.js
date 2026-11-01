// Fills every user-facing table with fictional development content so the app
// feels alive. Idempotent: ids are deterministic and every insert is IGNORE/upsert.
// Usage: SEED_PASSWORD=... npm run db:seed:community
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  applicationLog,
  closeLogger,
  installConsoleLogging,
} from "../src/logger.js";
import { config } from "../src/config.js";
import { pool, query, transaction } from "../src/db.js";
import { hashPassword } from "../src/security.js";
import {
  comments,
  conversations,
  members,
  notes,
  posts,
  referrals,
  reminders,
  replies,
} from "./community-data.js";
installConsoleLogging();

// RFC 4122-shaped (version 5) ids derived from a key, so re-runs hit the same rows.
function id(key) {
  const h = createHash("sha1").update(`layoffcircle:${key}`).digest("hex");
  const variant = "89ab"[parseInt(h[16], 16) % 4];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
// Small deterministic PRNG so the generated activity is the same every run.
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261101);
const pick = (list) => list[Math.floor(rand() * list.length)];
const sample = (list, count) =>
  [...list].sort(() => rand() - 0.5).slice(0, Math.min(count, list.length));
const ago = (minutes) => new Date(Date.now() - minutes * 60000);
const pair = (a, b) => [a, b].sort().join(":");
const emailFor = (name) =>
  name.toLowerCase().replaceAll(" ", ".") + "@example.test";

try {
  if (config.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set SEED_PASSWORD to at least 12 characters");
  const fixtures = JSON.parse(
    await readFile(new URL("./fixtures.json", import.meta.url), "utf8"),
  );
  const passwordHash = await hashPassword(password);
  const counts = {};
  const count = (name, n = 1) => (counts[name] = (counts[name] ?? 0) + n);

  await transaction(async (c) => {
    const run = (sql, params) => query(sql, params, c);

    // Companies
    for (const name of fixtures.companies)
      await run("INSERT IGNORE INTO companies(id,company_name) VALUES(?,?)", [
        id(`company:${name}`),
        name,
      ]);
    const companyId = new Map(
      (await run("SELECT id,company_name AS name FROM companies")).map((r) => [
        r.name,
        r.id,
      ]),
    );

    // Members (reuse accounts the base seed already created, matched by email)
    const user = new Map();
    for (const [
      name,
      headline,
      location,
      company,
      skills,
      open,
      about,
      next,
    ] of members) {
      const email = emailFor(name);
      let [row] = await run("SELECT id FROM users WHERE email=?", [email]);
      if (!row) {
        await run(
          "INSERT INTO users(id,email,password_hash,full_name,professional_headline,professional_skills,open_to_work,email_verified_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3))",
          [
            id(`user:${email}`),
            email,
            passwordHash,
            name,
            headline,
            "[]",
            open,
          ],
        );
        count("users");
        [row] = await run("SELECT id FROM users WHERE email=?", [email]);
      }
      await run(
        "UPDATE users SET professional_headline=?,profile_location=?,professional_skills=?,open_to_work=?,biography=?,career_objective=?,email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP(3)) WHERE id=?",
        [headline, location, JSON.stringify(skills), open, about, next, row.id],
      );
      user.set(name, { id: row.id, company });
    }
    const names = [...user.keys()];
    const uid = (name) => user.get(name).id;

    // People who signed up for real (not fictional): they get activity too.
    const real = await run(
      "SELECT id,full_name AS name FROM users WHERE email NOT LIKE '%@example.test' AND account_status='active'",
    );

    // Follows and connections
    for (const name of names) {
      for (const other of sample(
        names.filter((n) => n !== name),
        6 + Math.floor(rand() * 4),
      )) {
        await run(
          "INSERT IGNORE INTO follows(follower_id,followed_id,created_at) VALUES(?,?,?)",
          [uid(name), uid(other), ago(rand() * 40000)],
        );
        count("follows");
      }
    }
    const pairs = new Set();
    for (const name of names) {
      for (const other of sample(
        names.filter((n) => n !== name),
        3,
      )) {
        const key = pair(uid(name), uid(other));
        if (pairs.has(key)) continue;
        pairs.add(key);
        const accepted = rand() > 0.2;
        await run(
          "INSERT IGNORE INTO connections(id,requester_id,recipient_id,participant_pair_key,connection_status,created_at,accepted_at) VALUES(?,?,?,?,?,?,?)",
          [
            id(`conn:${key}`),
            uid(name),
            uid(other),
            key,
            accepted ? "accepted" : "pending",
            ago(rand() * 40000),
            accepted ? ago(rand() * 20000) : null,
          ],
        );
        count("connections");
      }
    }
    for (const person of real) {
      for (const other of sample(names, 8)) {
        await run(
          "INSERT IGNORE INTO follows(follower_id,followed_id,created_at) VALUES(?,?,?)",
          [uid(other), person.id, ago(rand() * 30000)],
        );
        count("follows");
      }
      for (const [i, other] of sample(names, 6).entries()) {
        const key = pair(person.id, uid(other));
        await run(
          "INSERT IGNORE INTO connections(id,requester_id,recipient_id,participant_pair_key,connection_status,created_at,accepted_at) VALUES(?,?,?,?,?,?,?)",
          [
            id(`conn:${key}`),
            uid(other),
            person.id,
            key,
            i < 3 ? "pending" : "accepted",
            ago(rand() * 20000),
            i < 3 ? null : ago(rand() * 10000),
          ],
        );
        count("connections");
      }
    }

    // Posts, reactions, comments (two levels), bookmarks, reposts
    const postIds = [];
    for (const [
      i,
      [author, topic, company, text, anonymous],
    ] of posts.entries()) {
      const key = `post:${i}`;
      const pid = id(key);
      // "Anonymous" posts are written by a fixed member but never attributed publicly.
      const owner =
        author === "Anonymous" ? names[(i * 7) % names.length] : author;
      const created = ago(30 + i * 420 + rand() * 300);
      await run(
        "INSERT IGNORE INTO posts(id,user_id,post_content,post_topic,company_id,is_anonymous,created_at) VALUES(?,?,?,?,?,?,?)",
        [
          pid,
          uid(owner),
          text,
          topic,
          company ? (companyId.get(company) ?? null) : null,
          Boolean(anonymous),
          created,
        ],
      );
      count("posts");
      postIds.push({ pid, owner, created });
    }
    for (const [i, post] of postIds.entries()) {
      const others = names.filter((n) => n !== post.owner);
      const popularity = 0.2 + rand() * 0.6;
      for (const name of others) {
        const roll = rand();
        if (roll < popularity) {
          await run(
            "INSERT IGNORE INTO reactions(post_id,user_id,reaction_type,created_at) VALUES(?,?,?,?)",
            [
              post.pid,
              uid(name),
              rand() < 0.06 ? "dislike" : "like",
              ago(rand() * 20000),
            ],
          );
          count("reactions");
        }
        if (rand() < 0.07) {
          await run(
            "INSERT IGNORE INTO bookmarks(post_id,user_id,created_at) VALUES(?,?,?)",
            [post.pid, uid(name), ago(rand() * 20000)],
          );
          count("bookmarks");
        }
        if (rand() < 0.05) {
          await run(
            "INSERT IGNORE INTO reposts(post_id,user_id,created_at) VALUES(?,?,?)",
            [post.pid, uid(name), ago(rand() * 20000)],
          );
          count("reposts");
        }
      }
      // 1–4 comments, some with replies
      const commenters = sample(others, 1 + Math.floor(rand() * 4));
      for (const [j, name] of commenters.entries()) {
        const cid = id(`comment:${i}:${j}`);
        await run(
          "INSERT IGNORE INTO comments(id,post_id,parent_comment_id,user_id,comment_content,created_at) VALUES(?,?,NULL,?,?,?)",
          [
            cid,
            post.pid,
            uid(name),
            pick(comments),
            new Date(post.created.getTime() + (j + 1) * 3600000),
          ],
        );
        count("comments");
        for (const voter of sample(
          names.filter((n) => n !== name),
          Math.floor(rand() * 6),
        )) {
          await run(
            "INSERT IGNORE INTO comment_reactions(comment_id,user_id,reaction_type,created_at) VALUES(?,?,?,?)",
            [
              cid,
              uid(voter),
              rand() < 0.05 ? "dislike" : "like",
              ago(rand() * 10000),
            ],
          );
          count("comment_reactions");
        }
        if (rand() < 0.5) {
          const replier = pick([
            post.owner,
            ...others.filter((n) => n !== name),
          ]);
          await run(
            "INSERT IGNORE INTO comments(id,post_id,parent_comment_id,user_id,comment_content,created_at) VALUES(?,?,?,?,?,?)",
            [
              id(`reply:${i}:${j}`),
              post.pid,
              cid,
              uid(replier),
              pick(replies),
              new Date(post.created.getTime() + (j + 1) * 3600000 + 1800000),
            ],
          );
          count("comments");
        }
      }
    }
    // Real members: give their own posts company, and send them a few notifications.
    for (const person of real) {
      const own = await run(
        "SELECT id FROM posts WHERE user_id=? ORDER BY created_at DESC LIMIT 5",
        [person.id],
      );
      for (const post of own) {
        for (const name of sample(names, 5)) {
          await run(
            "INSERT IGNORE INTO reactions(post_id,user_id,reaction_type,created_at) VALUES(?,?,'like',?)",
            [post.id, uid(name), ago(rand() * 3000)],
          );
          count("reactions");
        }
        for (const [j, name] of sample(names, 2).entries()) {
          await run(
            "INSERT IGNORE INTO comments(id,post_id,parent_comment_id,user_id,comment_content,created_at) VALUES(?,?,NULL,?,?,?)",
            [
              id(`realcomment:${person.id}:${post.id}:${j}`),
              post.id,
              uid(name),
              pick(comments),
              ago(rand() * 2000),
            ],
          );
          count("comments");
        }
      }
      const events = [
        ["connection_request", "wants to connect with you."],
        ["follow", "started following you."],
        ["like", "liked your post."],
        ["comment", "commented on your post."],
        ["message", "sent you a message."],
        ["referral_request", "asked for a referral."],
      ];
      for (const [k, [type, text]] of events.entries()) {
        const actor = names[(k * 5) % names.length];
        await run(
          "INSERT IGNORE INTO notifications(id,user_id,actor_id,notification_type,resource_id,notification_message,read_at,created_at) VALUES(?,?,?,?,NULL,?,?,?)",
          [
            id(`notif:${person.id}:${k}`),
            person.id,
            uid(actor),
            type,
            `${actor} ${text}`,
            k > 3 ? ago(300) : null,
            ago(40 + k * 90),
          ],
        );
        count("notifications");
      }
      // A few conversations with unread messages.
      for (const [k, other] of sample(names, 3).entries()) {
        const key = pair(person.id, uid(other));
        const conv = id(`conv:${key}`);
        await run(
          "INSERT IGNORE INTO conversations(id,first_participant_user_id,second_participant_user_id,participant_pair_key) VALUES(?,?,?,?)",
          [conv, ...[person.id, uid(other)].sort(), key],
        );
        const lines = [
          [
            1,
            `Hi ${person.name.split(" ")[0]}, saw your profile and wanted to say hello.`,
          ],
          [1, "Happy to share anything that’s helped me. Just ask."],
        ];
        for (const [m, [who, text]] of lines.entries()) {
          await run(
            "INSERT IGNORE INTO messages(id,conversation_id,sender_id,message_content,created_at) VALUES(?,?,?,?,?)",
            [
              id(`realmsg:${conv}:${m}`),
              conv,
              who ? uid(other) : person.id,
              text,
              ago(60 + k * 120 - m),
            ],
          );
          count("messages");
        }
      }
    }

    // Community notes and reports
    for (const [
      i,
      [author, fragment, noteBy, text, url, status],
    ] of notes.entries()) {
      const post = postIds.find((p, idx) => posts[idx][3].includes(fragment));
      if (!post) continue;
      await run(
        "INSERT IGNORE INTO community_notes(id,post_id,user_id,note_content,source_url,review_status,reviewed_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
        [
          id(`note:${i}`),
          post.pid,
          uid(noteBy),
          text,
          url,
          status,
          status === "pending" ? null : ago(900),
          ago(2000 + i * 100),
        ],
      );
      count("community_notes");
    }
    for (const [i, [idx, reporter, category, reason, status]] of [
      [
        3,
        "Carlos Mendes",
        "misinformation",
        "Numbers in this update don’t match the announcement.",
        "reviewing",
      ],
      [
        17,
        "Nisha Kapoor",
        "spam",
        "Looks like promotional content.",
        "pending",
      ],
      [
        26,
        "Sofia Marin",
        "inappropriate",
        "Tone isn’t appropriate for this community.",
        "dismissed",
      ],
    ].entries()) {
      const target = postIds[idx];
      if (!target || uid(reporter) === uid(target.owner)) continue;
      await run(
        "INSERT IGNORE INTO reports(id,post_id,user_id,report_category,report_reason,report_status,created_at) VALUES(?,?,?,?,?,?,?)",
        [
          id(`report:${i}`),
          target.pid,
          uid(reporter),
          category,
          reason,
          status,
          ago(1500 + i * 200),
        ],
      );
      count("reports");
    }

    // Referrals and requests
    const workModeOf = (location) =>
      /remote/i.test(location)
        ? "remote"
        : /hybrid/i.test(location)
          ? "hybrid"
          : "onsite";
    const yearsOf = (skills) =>
      Number(/(\d+)\+?\s*years/i.exec(skills)?.[1] ?? 0);
    const skillsOf = (skills) => skills.split(" · ")[0].trim();
    const levelOf = (skills) => {
      const years = yearsOf(skills);
      return years >= 8
        ? "lead"
        : years >= 5
          ? "senior"
          : years >= 2
            ? "mid"
            : "entry";
    };
    const helpfulAuthors = new Set(names.filter((_, n) => n % 4 !== 3));
    for (const [
      i,
      [author, company, title, location, skills, description, status],
    ] of referrals.entries()) {
      const rid = id(`referral:${i}`);
      await run(
        "INSERT IGNORE INTO referrals(id,user_id,company_id,job_title,job_location,required_skills,job_description,referral_status,closed_at,created_at,work_mode,experience_level,min_experience_years) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          rid,
          uid(author),
          companyId.get(company),
          title,
          location,
          skillsOf(skills),
          description,
          status,
          status === "closed" ? ago(600) : null,
          ago(500 + i * 600),
          workModeOf(location),
          levelOf(skills),
          yearsOf(skills) || null,
        ],
      );
      await run(
        "UPDATE referrals SET work_mode=?,experience_level=?,min_experience_years=? WHERE id=?",
        [workModeOf(location), levelOf(skills), yearsOf(skills) || null, rid],
      );
      count("referrals");
      for (const name of sample(
        names.filter((n) => n !== author),
        2 + Math.floor(rand() * 3),
      )) {
        const decision =
          status === "closed"
            ? "accepted"
            : pick(["pending", "pending", "accepted", "declined"]);
        await run(
          "INSERT IGNORE INTO referral_requests(referral_id,user_id,request_status,decision_at,decision_by_user_id,created_at) VALUES(?,?,?,?,?,?)",
          [
            rid,
            uid(name),
            decision,
            decision === "pending" ? null : ago(200),
            decision === "pending" ? null : uid(author),
            ago(rand() * 8000),
          ],
        );
        count("referral_requests");
        // People who were helped mostly say so, others rate less kindly.
        if (decision !== "pending") {
          const helpful =
            decision === "accepted"
              ? helpfulAuthors.has(author) || rand() < 0.2
              : rand() < 0.15;
          if (rand() < 0.85) {
            await run(
              "INSERT IGNORE INTO referral_feedback(referral_id,user_id,feedback_type) VALUES(?,?,?)",
              [rid, uid(name), helpful ? "helpful" : "not_helpful"],
            );
            count("referral_feedback");
          }
        }
      }
      for (const person of real.slice(0, 1)) {
        if (i % 3 === 0)
          await run(
            "INSERT IGNORE INTO referral_requests(referral_id,user_id,request_status,created_at) VALUES(?,?,'pending',?)",
            [rid, person.id, ago(800)],
          );
      }
    }

    // Conversations between members
    for (const [i, [a, b, lines]] of conversations.entries()) {
      const key = pair(uid(a), uid(b));
      const conv = id(`conv:${key}`);
      await run(
        "INSERT IGNORE INTO conversations(id,first_participant_user_id,second_participant_user_id,participant_pair_key) VALUES(?,?,?,?)",
        [conv, ...[uid(a), uid(b)].sort(), key],
      );
      for (const [m, [who, text]] of lines.entries()) {
        await run(
          "INSERT IGNORE INTO messages(id,conversation_id,sender_id,message_content,read_at,created_at) VALUES(?,?,?,?,?,?)",
          [
            id(`msg:${i}:${m}`),
            conv,
            who ? uid(b) : uid(a),
            text,
            ago(100),
            ago(3000 - i * 100 + m * 20),
          ],
        );
        count("messages");
      }
    }

    // Workforce insights across the current year (so the charts have shape)
    const year = new Date().getUTCFullYear();
    const today = new Date();
    const topCompanies = fixtures.companies;
    for (let i = 0; i < 48; i++) {
      const month = i % (today.getUTCMonth() + 1);
      const day = 1 + ((i * 7) % 27);
      const date = new Date(Date.UTC(year, month, day));
      if (date > today) continue;
      const company = topCompanies[(i * 5) % topCompanies.length];
      const reporter = names[(i * 3) % names.length];
      const headcount = 500 + ((i * 937) % 90000);
      const affected = Math.max(
        5,
        Math.round(headcount * (0.01 + rand() * 0.08)),
      );
      const verified = i % 3 === 0;
      await run(
        "INSERT IGNORE INTO workforce_reports(id,company_id,user_id,event_date,reported_roles_affected,reported_headcount,reported_hires,source_url,verification_status,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [
          id(`workforce:${i}`),
          companyId.get(company),
          uid(reporter),
          date.toISOString().slice(0, 10),
          affected,
          headcount,
          Math.round(affected * rand() * 0.6),
          `https://example.test/news/${company.toLowerCase().replaceAll(" ", "-")}-${i}`,
          verified ? "verified" : "user_reported",
          verified ? ago(1000) : null,
          ago(rand() * 40000),
        ],
      );
      count("workforce_reports");
    }

    // More daily reminders
    for (const [i, [quote, text]] of reminders.entries()) {
      await run(
        "INSERT IGNORE INTO daily_reminders(id,reminder_quote,reminder_supporting_text,display_order) VALUES(?,?,?,?)",
        [id(`reminder:${i}`), quote, text, 8 + i],
      );
      count("daily_reminders");
    }
  });
  console.log("Seeded community content:", counts);
  console.log(
    "Fictional members sign in with <first.last>@example.test and your SEED_PASSWORD.",
  );
} catch (error) {
  await applicationLog(
    "error",
    "seed.community.failed",
    "Community seed failed",
    { errorCode: error.code ?? error.name },
    error,
  );
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
  await closeLogger();
}
