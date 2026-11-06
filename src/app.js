import { applicationQueries } from "./queries/application.queries.js";
import { dailyReminderQueries } from "./queries/daily-reminders.queries.js";
import { requestLogging } from "./request-logging.js";
import { applicationLog } from "./logger.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import multer from "multer";
import { config } from "./config.js";
import { query } from "./db.js";
import { authenticate } from "./auth.js";
import { issueTicket } from "./realtime.js";
import { HttpError, page, uuid } from "./http.js";
import { createAuthenticationRouter } from "./routes/auth.js";
import { people } from "./routes/people.js";
import { posts } from "./routes/posts.js";
import { referrals } from "./routes/referrals.js";
import { messages } from "./routes/messages.js";
import { insights } from "./routes/insights.js";
import { uploads } from "./routes/uploads.js";
import { search } from "./routes/search.js";
import { admin } from "./routes/admin.js";
import { enforceVerification } from "./verification-gate.js";
import { cacheResponses } from "./response-cache.js";
export function createApp({ verifyGoogle } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.use(requestLogging);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.origins.includes(origin))
          return callback(null, true);
        callback(new HttpError(403, "Origin not allowed"));
      },
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { message: "Too many requests" } },
    }),
  );
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    await query(applicationQueries.checkDatabase);
    res.json({ status: "ready" });
  });
  app.use(
    "/uploads",
    express.static(config.uploadDir, {
      dotfiles: "deny",
      index: false,
      immutable: true,
      maxAge: "7d",
    }),
  );
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { message: "Too many authentication attempts" } },
  });
  app.use(
    "/api/v1/auth",
    authLimiter,
    createAuthenticationRouter({ verifyGoogle }),
  );
  app.use("/api/v1", async (req, res, next) => {
    const publicRead =
      req.method === "GET" &&
      /^(\/daily-reminder|\/search|\/posts(?:\/topics|\/topic-options|\/[a-zA-Z0-9-]+(?:\/comments)?)?|\/referrals|\/companies(?:\/[a-zA-Z0-9-]+)?|\/users(?:\/[a-zA-Z0-9-]+(?:\/stats)?)?|\/insights(?:\/[-a-zA-Z0-9_]+)*)\/?$/.test(
        req.path,
      );
    if (publicRead && !req.headers.authorization) {
      req.user = { id: null };
      return next();
    }
    let signedIn = false;
    await authenticate(req, res, () => (signedIn = true));
    if (!signedIn) return;
    // Unverified members: read-only for the grace period, then locked out.
    await enforceVerification(req);
    next();
  });
  // Same answer for everyone, so a short shared cache removes repeat database work.
  app.use("/api/v1/insights", cacheResponses(60000));
  app.use("/api/v1/posts/topic-options", cacheResponses(300000));
  app.use("/api/v1/daily-reminder", cacheResponses(300000));
  // One-time ticket for opening the WebSocket (see realtime.js).
  app.post("/api/v1/ws-ticket", (req, res) => {
    res.json({ ticket: issueTicket(req.user.id), expiresIn: 30 });
  });
  // One reminder per UTC day, rotating through the active rows.
  app.get("/api/v1/daily-reminder", async (_req, res) => {
    const rows = await query(dailyReminderQueries.listActive);
    if (!rows.length) return res.status(204).end();
    res.json(rows[Math.floor(Date.now() / 86400000) % rows.length]);
  });
  app.use("/api/v1/admin", admin);
  app.use("/api/v1", people);
  app.use("/api/v1/posts", posts);
  app.use("/api/v1/referrals", referrals);
  app.use("/api/v1/conversations", messages);
  app.use("/api/v1/insights", insights);
  app.use("/api/v1/uploads", uploads);
  app.use(
    "/api/v1/search",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { message: "Too many searches. Slow down a little." } },
    }),
    search,
  );
  app.get("/api/v1/notifications/summary", async (req, res) => {
    const [summary] = await query(
      applicationQueries.notificationSummary,
      Array(4).fill(req.user.id),
    );
    res.json(summary);
  });
  app.get("/api/v1/notifications", async (req, res) => {
    const { limit, offset } = page(req);
    res.json(
      await query(applicationQueries.listNotifications({ limit, offset }), [
        req.user.id,
      ]),
    );
  });
  app.put("/api/v1/notifications/read", async (req, res) => {
    await query(applicationQueries.markAllNotificationsRead, [req.user.id]);
    res.status(204).end();
  });
  app.put("/api/v1/notifications/:id/read", async (req, res) => {
    const result = await query(applicationQueries.markNotificationRead, [
      uuid(req.params.id),
      req.user.id,
    ]);
    if (!result.affectedRows)
      throw new HttpError(404, "Notification not found");
    res.status(204).end();
  });
  app.use((_req, res) =>
    res.status(404).json({ error: { message: "Route not found" } }),
  );
  app.use((error, _req, res, _next) => {
    const safeErrorMessage =
      error instanceof ZodError
        ? "Request validation failed"
        : error.type === "entity.parse.failed"
          ? "Invalid JSON request body"
          : error.message;
    const loggedError = {
      name: error.name,
      code: error.code,
      stack: `${error.name}: ${safeErrorMessage}\n${(error.stack ?? "")
        .split("\n")
        .filter((line) => /^\s+at /.test(line))
        .join("\n")}`,
    };
    void applicationLog(
      (error instanceof HttpError && error.status < 500) ||
        error instanceof ZodError
        ? "warn"
        : "error",
      "http.request.error",
      safeErrorMessage,
      { method: _req.method, path: _req.path, errorCode: error.code ?? null },
      loggedError,
    );
    if (error instanceof ZodError)
      return res.status(400).json({
        error: {
          message: "Validation failed",
          issues: error.issues.map(({ path, message }) => ({
            path,
            message,
          })),
        },
      });
    if (error instanceof multer.MulterError)
      return res
        .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        .json({ error: { message: "Upload rejected: " + error.message } });
    if (error.code === "23505")
      /* unique_violation */
      return res
        .status(409)
        .json({ error: { message: "This record already exists" } });
    if (error.code === "23503")
      /* foreign_key_violation */
      return res
        .status(400)
        .json({ error: { message: "Referenced record no longer exists" } });
    const status =
      error instanceof HttpError
        ? error.status
        : error.type === "entity.too.large"
          ? 413
          : error.type === "entity.parse.failed"
            ? 400
            : 500;

    // Development only: print and return the real error (never in production).
    const debug =
      status === 500 && config.NODE_ENV === "development"
        ? {
            name: error.name,
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            stack: (error.stack ?? "").split("\n").slice(0, 12),
          }
        : undefined;
    if (debug)
      console.error(`[dev] ${_req.method} ${_req.originalUrl} -> 500`, error);

    res.status(status).json({
      error: {
        ...(error.appCode && { code: error.appCode }),
        message:
          status === 500
            ? "Internal server error"
            : error.type === "entity.parse.failed"
              ? "Invalid JSON"
              : error.message,
        ...(debug && { debug }),
      },
    });
  });
  return app;
}
