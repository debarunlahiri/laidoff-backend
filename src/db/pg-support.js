import pg from "pg";
import { config } from "./config.js";

// Keep the wire formats the API used with MySQL (mysql2 `dateStrings: true`):
// timestamps/dates stay UTC strings ("2026-11-01 08:18:00.123", "2026-11-01"),
// COUNT/SUM come back as numbers instead of bigint/numeric strings.
const { types } = pg;
const withMilliseconds = (value) => {
  const [seconds, fraction = ""] = value.split(".");
  return `${seconds}.${fraction.padEnd(3, "0")}`;
};
types.setTypeParser(types.builtins.TIMESTAMP, withMilliseconds);
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.NUMERIC, (value) =>
  Number.parseFloat(value),
);

export function createPool(overrides = {}) {
  const pool = new pg.Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    max: config.DB_CONNECTION_LIMIT,
    ssl: config.DB_SSL
      ? { rejectUnauthorized: config.DB_SSL_REJECT_UNAUTHORIZED }
      : undefined,
    ...overrides,
  });
  // Session time zone is irrelevant: every timestamp is produced by utc_now() and
  // stored as UTC `timestamp` values. Without a handler an idle-client error (server restart) would crash the process.
  pool.on("error", (error) =>
    process.stderr.write(
      `[database] idle client error: ${error.code ?? error.message}\n`,
    ),
  );
  return pool;
}

// Query files keep `?` placeholders; PostgreSQL wants $1, $2, ... Quoted strings,
// quoted identifiers and comments are skipped so a literal "?" is never rewritten.
export function toPositional(sql) {
  let out = "";
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const end = sql.indexOf(c, i + 1);
      // '' and "" escapes simply re-enter the quote on the next loop pass.
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop - 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop - 1;
    } else if (c === "?") out += `$${++n}`;
    else out += c;
  }
  return out;
}

// node-pg would send JS Dates in the process time zone; the schema stores UTC.
export function toBindValue(value) {
  return value instanceof Date
    ? value.toISOString().replace("T", " ").replace("Z", "")
    : value;
}

export async function run(executor, sql, params = []) {
  const values = params.map(toBindValue);
  // No values -> simple protocol, which also allows multi-statement migration files.
  const result = await executor.query(
    toPositional(sql),
    values.length ? values : undefined,
  );
  // Multi-statement text returns one result per statement; use the last.
  const last = Array.isArray(result) ? result.at(-1) : result;
  // Mimic mysql2: SELECT / RETURNING give rows, writes give { affectedRows }.
  if (last.fields?.length) {
    Object.defineProperty(last.rows, "affectedRows", { value: last.rowCount });
    return last.rows;
  }
  return { affectedRows: last.rowCount ?? 0 };
}
