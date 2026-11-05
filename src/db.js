import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { correlation, recordLog, applicationLog } from "./logger.js";
import { logContext } from "./log-context.js";
import { config } from "./config.js";
import { createPool, run } from "./pg-support.js";
export const pool = createPool();
export async function query(sql, params = [], connection = pool) {
  const startedAt = new Date();
  const started = performance.now();
  let result;
  let failure;
  try {
    result = await run(connection, sql, params);
    return result;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    void recordLog("database_query_logs", {
      ...correlation(),
      database_name: config.DB_NAME,
      sql_operation: sql.trim().split(/\s+/)[0].toUpperCase(),
      sql_statement_template: sql,
      parameter_count: params.length,
      parameter_types: JSON.stringify(
        params.map((value) =>
          value === null
            ? "null"
            : value instanceof Date
              ? "date"
              : Buffer.isBuffer(value)
                ? "buffer"
                : typeof value,
        ),
      ),
      affected_row_count: result?.affectedRows ?? null,
      returned_row_count: Array.isArray(result) ? result.length : null,
      duration_milliseconds: Number((performance.now() - started).toFixed(3)),
      was_successful: !failure,
      error_code: failure?.code ?? null,
      error_message: failure
        ? `Database execution failed (SQLSTATE ${failure.code ?? "unknown"})`
        : null,
      transaction_id: logContext.getStore()?.transactionId ?? null,
      started_at: startedAt,
      completed_at: new Date(),
    });
  }
}
export async function transaction(fn) {
  const connection = await pool.connect();
  const transactionId = randomUUID();
  return logContext.run(
    { ...logContext.getStore(), transactionId },
    async () => {
      try {
        await connection.query("BEGIN");
        const result = await fn(connection);
        await connection.query("COMMIT");
        void applicationLog(
          "debug",
          "database.transaction.committed",
          "Database transaction committed",
          { transactionId },
        );
        return result;
      } catch (error) {
        await connection.query("ROLLBACK").catch(() => {});
        void applicationLog(
          "warn",
          "database.transaction.rolled_back",
          "Database transaction rolled back",
          { transactionId, errorCode: error.code ?? error.name },
        );
        throw error;
      } finally {
        connection.release();
      }
    },
  );
}
