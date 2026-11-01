import { serverQueries } from "./queries/server.queries.js";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime.js";
import { config } from "./config.js";
import { pool, query } from "./db.js";
import { pendingMigrations } from "./pending-migrations.js";
import {
  applicationLog,
  closeLogger,
  installConsoleLogging,
} from "./logger.js";
installConsoleLogging();
let server;
let stopping = false;
async function shutdown(reason, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 15000);
  timeout.unref();
  await applicationLog(
    exitCode ? "fatal" : "info",
    "server.stopping",
    "API process stopping",
    { reason, exitCode },
  );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await closeLogger();
  clearTimeout(timeout);
  process.exit(exitCode);
}
process.on("warning", (warning) => {
  void applicationLog("warn", "process.warning", warning.message, {}, warning);
});
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  void applicationLog(
    "fatal",
    "process.uncaught_exception",
    error.message,
    {},
    error,
  ).then(() => shutdown("uncaughtException", 1));
});
process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  void applicationLog(
    "fatal",
    "process.unhandled_rejection",
    error.message,
    {},
    error,
  ).then(() => shutdown("unhandledRejection", 1));
});
try {
  await query(serverQueries.checkDatabase);
  // Refuse to accept traffic before the schema and log tables are migrated.
  await query(serverQueries.checkLoggingSchema);
  const pending = await pendingMigrations();
  if (pending.length) {
    console.error(
      `Database is not up to date. Run "npm run db:migrate" first. Pending: ${pending.join(", ")}`,
    );
    throw Object.assign(new Error("Pending database migrations"), {
      code: "PENDING_MIGRATIONS",
    });
  }
  server = createApp().listen(config.PORT, config.HOST, () => {
    console.info(
      `LayoffCircle API listening on http://${config.HOST}:${config.PORT}`,
    );
    void applicationLog("info", "server.started", "API ready", {
      host: config.HOST,
      port: config.PORT,
      environment: config.NODE_ENV,
    });
  });
  attachRealtime(server);
  server.on("error", (error) => {
    void applicationLog(
      "fatal",
      "server.listen_error",
      error.message,
      {},
      error,
    ).then(() => shutdown("listenError", 1));
  });
} catch (error) {
  await applicationLog(
    "fatal",
    "server.startup_failed",
    "API startup failed",
    { errorCode: error.code ?? error.name },
    error,
  );
  await shutdown("startupFailure", 1);
}
