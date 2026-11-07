import { loggingQueries } from "./queries/logging.queries.js";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  mkdir,
  writeFile,
  rename,
  readdir,
  readFile,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import { config } from "./config.js";
import { logContext } from "./log-context.js";
import { createPool, run } from "./pg-support.js";

const secretKey =
  /password|passwd|secret|token|authorization|cookie|credential|api.?key|session.?id/i;
export function redact(value, depth = 0, seen = new WeakSet()) {
  if (depth > 12) return "[MAX_DEPTH]";
  if (value === undefined) return null;
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return value;
  if (typeof value === "string")
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
      .slice(0, config.LOG_MAX_FIELD_CHARACTERS);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { binaryBytes: value.length };
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => redact(item, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        secretKey.test(key) ? "[REDACTED]" : redact(item, depth + 1, seen),
      ]),
  );
}
export function logJson(value) {
  const serialized = JSON.stringify(redact(value));
  return serialized.length <= config.LOG_MAX_PAYLOAD_CHARACTERS
    ? serialized
    : JSON.stringify({
        truncated: true,
        originalCharacters: serialized.length,
        preview: serialized.slice(0, config.LOG_MAX_PAYLOAD_CHARACTERS),
      });
}
export function correlation() {
  const context = logContext.getStore();
  return {
    request_id: context?.requestId ?? null,
    actor_user_id: context?.userId ?? null,
  };
}
const allowedTables = new Set([
  "api_request_logs",
  "application_logs",
  "database_query_logs",
  "audit_logs",
]);
const loggingPool = createPool({ max: 2, connectionTimeoutMillis: 1500 });
const pendingWrites = new Set();
let flushing;
let closed = false;
let lastDeliveryWarning = 0;
const emergency = (message) => process.stderr.write(`[logging] ${message}\n`);

export function recordLog(table, fields) {
  if (!config.LOGGING_ENABLED || closed) return Promise.resolve();
  if (!allowedTables.has(table)) throw new Error("Unsupported log table");
  const row = { id: randomUUID(), ...fields };
  const write = (async () => {
    await mkdir(config.logOutboxDir, { recursive: true, mode: 0o700 });
    const filename = path.join(config.logOutboxDir, `${row.id}.json`);
    const temporary = `${filename}.pending`;
    await writeFile(temporary, JSON.stringify({ table, row }), { mode: 0o600 });
    await rename(temporary, filename);
  })().catch((error) =>
    emergency(
      `Could not persist log outbox record: ${error.code ?? "unknown"}`,
    ),
  );
  pendingWrites.add(write);
  void write.finally(() => {
    pendingWrites.delete(write);
    void flushLogs();
  });
  return write;
}

export function flushLogs() {
  if (!config.LOGGING_ENABLED || closed) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    await Promise.all([...pendingWrites]);
    await mkdir(config.logOutboxDir, { recursive: true, mode: 0o700 });
    const files = (await readdir(config.logOutboxDir)).filter((name) =>
      /^[0-9a-f-]{36}\.json$/.test(name),
    );
    for (const file of files) {
      const target = path.join(config.logOutboxDir, file);
      const { table, row } = JSON.parse(await readFile(target, "utf8"));
      if (
        !allowedTables.has(table) ||
        !Object.keys(row).every((key) => /^[a-z_]+$/.test(key))
      )
        throw new Error("Invalid log outbox record");
      const columns = Object.keys(row);
      await run(
        loggingPool,
        loggingQueries.insertRecord({ table, columns }),
        columns.map((key) =>
          /_at$/.test(key) && typeof row[key] === "string"
            ? new Date(row[key])
            : row[key],
        ),
      );
      await unlink(target);
    }
  })()
    .catch((error) => {
      // Keep durable outbox files for retry. Never log the log writer's SQL recursively.
      if (
        config.NODE_ENV !== "test" &&
        Date.now() - lastDeliveryWarning > 30000
      ) {
        lastDeliveryWarning = Date.now();
        emergency(
          `Database log delivery deferred (${error.code ?? "outbox_error"}); records remain in the outbox.`,
        );
      }
    })
    .finally(() => {
      flushing = null;
    });
  return flushing;
}
const timer = setInterval(() => void flushLogs(), 5000);
timer.unref();
export async function closeLogger() {
  clearInterval(timer);
  await Promise.all([...pendingWrites]);
  await flushLogs();
  await flushLogs();
  closed = true;
  await loggingPool.end();
}
export function applicationLog(level, eventName, message, context = {}, error) {
  return recordLog("application_logs", {
    ...correlation(),
    log_level: level,
    event_name: eventName,
    log_message: String(redact(message)),
    log_context: logJson(context),
    error_name: error?.name?.slice(0, 160) ?? null,
    error_code: String(error?.code ?? "").slice(0, 160) || null,
    error_stack_trace: error?.stack ? String(redact(error.stack)) : null,
    process_identifier: process.pid,
    host_name: hostname(),
    occurred_at: new Date(),
  });
}
let consoleInstalled = false;
export function installConsoleLogging() {
  if (consoleInstalled) return;
  consoleInstalled = true;
  for (const [method, level] of [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
    ["debug", "debug"],
  ]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(
        ...args.map((item) =>
          item instanceof Error
            ? {
                name: item.name,
                message: redact(item.message),
                stack: redact(item.stack),
              }
            : redact(item),
        ),
      );
      const error = args.find((item) => item instanceof Error);
      void applicationLog(
        level,
        `console.${method}`,
        error?.message ??
          args
            .map((item) =>
              typeof item === "string"
                ? String(redact(item))
                : inspect(redact(item)),
            )
            .join(" "),
        {
          arguments: args
            .filter((item) => !(item instanceof Error))
            .map((item) => redact(item)),
        },
        error,
      );
    };
  }
}
