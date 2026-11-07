import { seedQueries } from "../src/queries/seed.queries.js";
import {
  installConsoleLogging,
  closeLogger,
  applicationLog,
} from "../src/utils/logger.js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pool, query, transaction } from "../src/db/db.js";
import { hashPassword } from "../src/utils/security.js";
import { config } from "../src/config/config.js";
installConsoleLogging();
try {
  if (config.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set SEED_PASSWORD to at least 12 characters");
  const fixtures = JSON.parse(
    await readFile(new URL("./fixtures.json", import.meta.url), "utf8"),
  );
  await transaction(async (c) => {
    for (const name of fixtures.companies)
      await query(seedQueries.createCompany, [randomUUID(), name], c);
    const companies = new Map(
      (await query(seedQueries.listCompanies, [], c)).map((row) => [
        row.name,
        row.id,
      ]),
    );
    const names = [
      ...new Set([
        "Jamie Morgan",
        ...fixtures.posts.map((p) => p.name),
        ...fixtures.referrals.map((r) => r.person),
      ]),
    ];
    const users = new Map();
    const passwordHash = await hashPassword(password);
    for (const name of names) {
      const email = name.toLowerCase().replaceAll(" ", ".") + "@example.test";
      const post = fixtures.posts.find((p) => p.name === name);
      await query(
        seedQueries.createUser,
        [
          randomUUID(),
          email,
          passwordHash,
          name,
          post?.role ?? "Community member",
          "[]",
          Boolean(post?.open),
        ],
        c,
      );
      const [user] = await query(seedQueries.findUserByEmail, [email], c);
      users.set(name, user.id);
    }
    for (const post of fixtures.posts) {
      const existing = await query(
        seedQueries.findSeedPost,
        [users.get(post.name), post.text],
        c,
      );
      if (!existing.length)
        await query(
          seedQueries.createPost,
          [
            randomUUID(),
            users.get(post.name),
            post.text,
            post.topic,
            companies.get(post.company) ?? null,
          ],
          c,
        );
    }
    const parseSkills = (value) => {
      const [skills, rest = ""] = value.split(" · ");
      const years = /(\d+)\+?\s*years/i.exec(rest || value)?.[1];
      return { skills: skills.trim(), years: years ? Number(years) : null };
    };
    for (const referral of fixtures.referrals) {
      const parsed = parseSkills(referral.skills);
      const existing = await query(
        seedQueries.findSeedReferral,
        [users.get(referral.person), referral.title],
        c,
      );
      if (!existing.length)
        await query(
          seedQueries.createReferral,
          [
            randomUUID(),
            users.get(referral.person),
            companies.get(referral.company),
            referral.title,
            referral.location,
            /remote/i.test(referral.location)
              ? "remote"
              : /hybrid/i.test(referral.location)
                ? "hybrid"
                : "onsite",
            parsed.years === null
              ? null
              : parsed.years >= 8
                ? "lead"
                : parsed.years >= 5
                  ? "senior"
                  : parsed.years >= 2
                    ? "mid"
                    : "entry",
            parsed.years,
            parsed.skills,
            "Fictional development opportunity.",
          ],
          c,
        );
    }
  });
  console.log(
    "Seeded fictional companies, people, posts, and referrals. Login: jamie.morgan@example.test with your SEED_PASSWORD.",
  );
} catch (error) {
  await applicationLog(
    "error",
    "seed.failed",
    "Development seed failed",
    { errorCode: error.code ?? error.name },
    error,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
  await closeLogger();
}
