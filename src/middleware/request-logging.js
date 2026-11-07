import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { logContext } from "./log-context.js";
import { recordLog, logJson, applicationLog } from "./logger.js";

export function requestLogging(req, res, next) {
  const requestId = randomUUID();
  const startedAt = new Date();
  const started = performance.now();
  const context = { requestId, userId: null };
  res.setHeader("X-Request-Id", requestId);
  let responseBody = null;
  let responseBytes = 0;
  const originalJson = res.json;
  res.json = function (body) {
    responseBody = logJson(body);
    return originalJson.call(this, body);
  };
  const originalWrite = res.write;
  const originalEnd = res.end;
  function size(chunk, encoding) {
    return chunk == null
      ? 0
      : Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(
            String(chunk),
            typeof encoding === "string" ? encoding : "utf8",
          );
  }
  res.write = function (chunk, encoding, callback) {
    responseBytes += size(chunk, encoding);
    return originalWrite.call(this, chunk, encoding, callback);
  };
  res.end = function (chunk, encoding, callback) {
    responseBytes += size(chunk, encoding);
    return originalEnd.call(this, chunk, encoding, callback);
  };
  let recorded = false;
  function complete(completed) {
    if (recorded) return;
    recorded = true;
    const actorId = req.user?.id ?? context.userId;
    const file = req.file
      ? {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        }
      : null;
    void recordLog("api_request_logs", {
      request_id: requestId,
      actor_user_id: actorId,
      http_method: req.method,
      request_path: req.path.slice(0, 2048),
      route_pattern: req.route?.path
        ? `${req.baseUrl ?? ""}${req.route.path}`.slice(0, 512)
        : null,
      request_query: logJson(req.query),
      request_headers: logJson(req.headers),
      request_body: logJson(
        file ? { fields: req.body, attachment: file } : (req.body ?? null),
      ),
      response_headers: logJson(res.getHeaders()),
      response_body: responseBody,
      http_status_code: res.statusCode,
      response_size_bytes: responseBytes,
      request_size_bytes: /^\d+$/.test(req.headers["content-length"] ?? "")
        ? Number(req.headers["content-length"])
        : null,
      duration_milliseconds: Number((performance.now() - started).toFixed(3)),
      client_ip_address: req.ip?.slice(0, 45) ?? null,
      client_user_agent: req.headers["user-agent"]?.slice(0, 1024) ?? null,
      response_completed: completed,
      started_at: startedAt,
      completed_at: new Date(),
    });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      void recordLog("audit_logs", {
        request_id: requestId,
        actor_user_id: actorId,
        action_name: `${req.method} ${req.route?.path ?? req.path}`.slice(
          0,
          160,
        ),
        resource_type:
          req.originalUrl.split("?")[0].split("/")[3]?.slice(0, 100) ??
          "unknown",
        resource_identifier:
          String(
            req.params?.id ??
              req.params?.userId ??
              (responseBody ? JSON.parse(responseBody)?.id : "") ??
              "",
          ).slice(0, 160) || null,
        outcome:
          res.statusCode >= 500 || !completed
            ? "failed"
            : res.statusCode >= 400
              ? "rejected"
              : "succeeded",
        change_summary: logJson({
          fields: Object.keys(req.body ?? {}),
          requestedChanges: req.body ?? null,
          statusCode: res.statusCode,
          response: responseBody ? JSON.parse(responseBody) : null,
        }),
        client_ip_address: req.ip?.slice(0, 45) ?? null,
        occurred_at: new Date(),
      });
    }
    if (!completed)
      void applicationLog(
        "warn",
        "http.response.interrupted",
        "Client connection closed before response completed",
        { requestId, method: req.method, path: req.path },
      );
  }
  res.once("finish", () => complete(true));
  res.once("close", () => complete(res.writableFinished));
  logContext.run(context, next);
}
