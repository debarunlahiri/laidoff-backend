import { Router } from "express";
import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { config } from "../config/config.js";
import { query, transaction } from "../db/db.js";
import { agentQueries } from "../queries/agent.queries.js";
import { insightQueries } from "../queries/insights.queries.js";
import { peopleQueries } from "../queries/people.queries.js";
import { postQueries } from "../queries/posts.queries.js";
import { escapeLike } from "../queries/query-guards.js";
import { clearResponseCache } from "../middleware/response-cache.js";
import { yearlyInsights } from "../services/workforce-insights.js";
import { logContext } from "../utils/log-context.js";
import { paging } from "../utils/http.js";
import { tokenHash } from "../utils/security.js";
import { topics } from "./posts.js";

// Public API for trusted AI agents (docs: AGENT_API.md). An agent authenticates
// with an API key (see scripts/agent-key.js) and acts as the one member account
// that key belongs to, normally the official "LaidOff News" account.
export const agent = Router();

export class AgentError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// ---- Request validation ----
export const keyPattern = /^lak_[A-Za-z0-9_-]{43}$/;
const idempotencyPattern = /^[\x21-\x7e]{1,200}$/;
const maxPostText = 5000;
const company = {
  companyId: z.uuid().nullable().default(null),
  company: z.string().trim().min(1).max(160).optional(),
};
export const postBody = z.strictObject({
  text: z.string().trim().min(1).max(maxPostText),
  topic: z.enum(topics).default("General discussion"),
  ...company,
});
const count = z.number().int().nonnegative().max(10000000);
export const reportBody = z
  .strictObject({
    ...company,
    eventDate: z.iso
      .date()
      .refine((date) => date >= "2000-01-01", "Must be 2000-01-01 or later")
      .refine(
        (date) => date <= new Date().toISOString().slice(0, 10),
        "Must not be in the future",
      ),
    rolesAffected: count.min(1),
    sourceUrl: z
      .url()
      .max(2048)
      .refine((value) => /^https?:\/\//i.test(value), "Must be an http(s) URL"),
    headcount: count.nullable().default(null),
    hires: count.nullable().default(null),
  })
  .refine((body) => body.companyId || body.company, {
    message: "Send companyId or company (a name)",
    path: ["company"],
  });
const listQuery = paging.extend({
  search: z.string().trim().max(160).default(""),
});

// ---- Description (no key needed) ----
agent.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
agent.get("/", (req, res) => {
  res.json({
    name: "LaidOffCircle agent API",
    version: "v1",
    baseUrl: `${config.APP_URL}${req.baseUrl}`,
    authentication:
      "Authorization: Bearer <API key> (or X-API-Key). Keys are issued by the site owner.",
    notes: [
      "Everything is published under the account the key belongs to, never anonymously.",
      "Only post information backed by a public source, and include the link.",
      "Send an Idempotency-Key header on writes so a retry does not publish twice.",
      "Errors look like { error: { code, message } }.",
    ],
    endpoints: [
      { method: "GET", path: "/topics" },
      { method: "GET", path: "/companies?search=&limit=&offset=" },
      { method: "POST", path: "/posts" },
      { method: "GET", path: "/insights?year=" },
      { method: "POST", path: "/insights/reports" },
    ],
  });
});

// ---- Authentication ----
agent.use(async (req, _res, next) => {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const given = (bearer ?? req.headers["x-api-key"] ?? "").toString().trim();
  const unauthorized = new AgentError(
    401,
    "UNAUTHORIZED",
    "Send a valid API key as 'Authorization: Bearer <key>'.",
  );
  // The format check rejects member session tokens and junk without a database read.
  if (!keyPattern.test(given)) throw unauthorized;
  const [key] = await query(agentQueries.findKey, [tokenHash(given)]);
  if (!key) throw unauthorized;
  req.agent = key;
  const context = logContext.getStore();
  if (context) context.userId = key.userId;
  await query(agentQueries.touchKey, [key.id]).catch(() => undefined);
  next();
});
agent.use(express.json({ limit: "32kb" }));

// ---- Reads ----
agent.get("/topics", (_req, res) => res.json({ topics }));
agent.get("/companies", async (req, res) => {
  const { limit, offset, search } = listQuery.parse(req.query);
  const companies = await query(
    peopleQueries.searchCompanies({ limit, offset }),
    [`%${escapeLike(search)}%`],
  );
  res.json({ companies });
});
agent.get("/insights", async (req, res) => {
  res.json(await yearlyInsights(req.query.year));
});

// ---- Writes ----
// At most `writes_per_hour` (set per key) successful or replayed writes an hour.
const writeLimit = rateLimit({
  windowMs: 3600000,
  limit: (req) => req.agent.writesPerHour,
  keyGenerator: (req) => req.agent.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    const seconds = Math.max(
      1,
      Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000),
    );
    res.set("Retry-After", String(seconds));
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: `Write limit of ${req.rateLimit.limit} per hour reached.`,
      },
    });
  },
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function idempotencyKey(req) {
  const value = req.headers["idempotency-key"];
  if (value === undefined) return null;
  if (typeof value !== "string" || !idempotencyPattern.test(value))
    throw new AgentError(
      400,
      "INVALID_REQUEST",
      "Idempotency-Key must be 1-200 printable characters.",
    );
  return value;
}
// Runs `perform` once per idempotency key. A retry with the same key and body
// replays the first answer; the same key with a different body is refused.
async function writeOnce(req, res, route, body, perform) {
  const key = idempotencyKey(req);
  const requestHash = sha256(`${route}\n${JSON.stringify(body)}`);
  const result = await transaction(async (c) => {
    if (key) {
      await query(agentQueries.lockRequest, [`${req.agent.id}:${key}`], c);
      const [seen] = await query(
        agentQueries.findRequest,
        [req.agent.id, key],
        c,
      );
      if (seen) {
        if (seen.route !== route || seen.requestHash !== requestHash)
          throw new AgentError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This Idempotency-Key was already used for a different request.",
          );
        return { replay: true, status: seen.status, body: seen.body };
      }
      await query(agentQueries.purgeRequests, [], c);
    }
    const answer = await perform(c);
    if (key)
      await query(
        agentQueries.saveRequest,
        [req.agent.id, key, route, requestHash, 201, JSON.stringify(answer)],
        c,
      );
    return { replay: false, status: 201, body: answer };
  });
  if (result.replay) res.set("Idempotent-Replay", "true");
  res.status(result.status).json(result.body);
}
// Finds the company by id or by name (case-insensitive), creating it by name
// when it does not exist yet.
async function resolveCompany(body, userId, c) {
  let found;
  if (body.companyId) {
    [found] = await query(agentQueries.findCompany, [body.companyId], c);
    if (!found)
      throw new AgentError(404, "COMPANY_NOT_FOUND", "No company has that id.");
  } else if (body.company) {
    [found] = await query(agentQueries.findCompanyByName, [body.company], c);
    if (!found) {
      await query(
        agentQueries.createCompany,
        [randomUUID(), body.company, userId],
        c,
      );
      [found] = await query(agentQueries.findCompanyByName, [body.company], c);
    }
  } else return null;
  if (!found?.active)
    throw new AgentError(
      409,
      "COMPANY_UNAVAILABLE",
      "That company is not available for posts or reports.",
    );
  return { id: found.id, name: found.name };
}

agent.post("/posts", writeLimit, async (req, res) => {
  const body = postBody.parse(req.body);
  await writeOnce(req, res, "posts", body, async (c) => {
    const target = await resolveCompany(body, req.agent.userId, c);
    const id = randomUUID();
    await query(
      postQueries.createPost,
      [
        id,
        req.agent.userId,
        body.text,
        body.topic,
        target?.id ?? null,
        false,
        null,
        null,
      ],
      c,
    );
    return {
      id,
      url: `${config.APP_URL}/posts/${id}`,
      text: body.text,
      topic: body.topic,
      company: target,
      author: { id: req.agent.userId, name: req.agent.authorName },
    };
  });
});

agent.post("/insights/reports", writeLimit, async (req, res) => {
  const body = reportBody.parse(req.body);
  await writeOnce(req, res, "reports", body, async (c) => {
    const target = await resolveCompany(body, req.agent.userId, c);
    // The same event reported twice would inflate the totals.
    const [duplicate] = await query(
      agentQueries.findDuplicateReport,
      [target.id, req.agent.userId, body.eventDate, body.rolesAffected],
      c,
    );
    if (duplicate)
      throw new AgentError(
        409,
        "DUPLICATE_REPORT",
        "A report for this company, date and number of roles already exists.",
        { existingId: duplicate.id },
      );
    const id = randomUUID();
    await query(
      insightQueries.createReport,
      [
        id,
        target.id,
        req.agent.userId,
        body.eventDate,
        body.rolesAffected,
        body.headcount,
        body.hires,
        body.sourceUrl,
      ],
      c,
    );
    return {
      id,
      status: "user_reported",
      company: target,
      eventDate: body.eventDate,
      rolesAffected: body.rolesAffected,
      sourceUrl: body.sourceUrl,
      headcount: body.headcount,
      hires: body.hires,
    };
  });
  clearResponseCache("/insights");
});

// ---- Errors: always { error: { code, message } } ----
agent.use((_req, res) =>
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Unknown endpoint or method. See GET /api/v1/agent.",
    },
  }),
);
agent.use((error, _req, res, next) => {
  const fail = (status, code, message, extra = {}) =>
    res.status(status).json({ error: { code, message, ...extra } });
  if (error instanceof AgentError)
    return fail(error.status, error.code, error.message, error.extra);
  if (error instanceof ZodError)
    return fail(400, "INVALID_REQUEST", "Request validation failed", {
      issues: error.issues.map(({ path, message }) => ({ path, message })),
    });
  if (error.type === "entity.parse.failed")
    return fail(400, "INVALID_REQUEST", "The body must be a JSON object.");
  if (error.type === "entity.too.large")
    return fail(413, "TOO_LARGE", "The request body is too large.");
  next(error);
});
