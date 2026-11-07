// One-time data copy: existing MySQL database -> new PostgreSQL database.
//
//   1. Create the Postgres database and run `npm run db:migrate` against it (empty schema).
//   2. Put the Postgres target in DB_* and the MySQL source in MYSQL_* (see .env.example).
//   3. Stop writes to the old API, then: npm run db:copy-from-mysql [-- --skip-logs]
//
// The whole copy runs in ONE Postgres transaction: any error rolls everything back, so
// you can fix the cause and simply run it again. It refuses to run if the target already
// has users. mysql2 is a devDependency used only by this script.
import mysql from "mysql2/promise";
import { createPool } from "../src/db/pg-support.js";
import { config } from "../src/config/config.js";

const skipLogs = process.argv.includes("--skip-logs");
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parents before children. comments is copied in two passes (parents, then replies).
const tables = [
  "users",
  "companies",
  "authentication_identities",
  "sessions",
  "uploads",
  "posts",
  "post_images",
  "reactions",
  "bookmarks",
  "reposts",
  "hidden_posts",
  "comments",
  "comment_reactions",
  "follows",
  "connections",
  "referrals",
  "referral_requests",
  "referral_feedback",
  "referral_documents",
  "referral_request_documents",
  "referral_shares",
  "conversations",
  "messages",
  "message_attachments",
  "notifications",
  "community_notes",
  "reports",
  "comment_reports",
  "post_polls",
  "post_poll_options",
  "post_poll_votes",
  "post_shares",
  "post_views",
  "workforce_reports",
  "daily_reminders",
  ...(skipLogs
    ? []
    : [
        "api_request_logs",
        "application_logs",
        "database_query_logs",
        "audit_logs",
      ]),
];

const source = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  database: process.env.MYSQL_DATABASE ?? "laidoff",
  user: process.env.MYSQL_USER ?? "laidoff",
  password: process.env.MYSQL_PASSWORD ?? "",
  dateStrings: true,
  timezone: "Z",
  charset: "utf8mb4",
});
await source.query("SET time_zone = '+00:00'");
const pool = createPool();
const target = await pool.connect();

function convert(value, type, context) {
  if (value === null || value === undefined) return null;
  if (type === "boolean") return Boolean(Number(value));
  if (type === "jsonb") return JSON.stringify(value);
  if (type === "uuid") {
    if (!uuidPattern.test(value))
      throw new Error(`${context}: "${value}" is not a valid UUID`);
    return value.toLowerCase();
  }
  if (type.startsWith("timestamp") || type === "date")
    return /^0000-00-00/.test(String(value)) ? null : String(value);
  if (typeof value === "string") return value.replaceAll("\u0000", "");
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return value;
}

async function copyTable(table, where = "") {
  const { rows: columns } = await target.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position",
    [table],
  );
  const [mysqlColumns] = await source.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    [table],
  );
  const present = new Set(mysqlColumns.map((row) => row.name));
  const used = columns.filter((column) => present.has(column.column_name));
  const names = used.map((column) => column.column_name);
  const batchSize = Math.min(500, Math.floor(60000 / names.length));
  const sql = `SELECT ${names.map((n) => `\`${n}\``).join(",")} FROM \`${table}\` ${where}`;
  const [rows] = await source.query(sql);
  let copied = 0;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const params = [];
    const tuples = batch.map(
      (row, r) =>
        `(${used
          .map((column, c) => {
            params.push(
              convert(
                row[column.column_name],
                column.data_type,
                `${table}.${column.column_name} row ${start + r + 1}`,
              ),
            );
            return `$${r * used.length + c + 1}`;
          })
          .join(",")})`,
    );
    const result = await target.query(
      `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(",")}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`,
      params,
    );
    copied += result.rowCount;
  }
  return { read: rows.length, copied };
}

let failed = false;
try {
  const { rows } = await target.query("SELECT 1 FROM users LIMIT 1");
  if (rows.length)
    throw new Error(
      "Target Postgres database already has users; refusing to copy into it.",
    );
  await target.query("BEGIN");
  // The migration seeds default reminders; the MySQL rows replace them.
  await target.query("DELETE FROM daily_reminders");
  const summary = [];
  for (const table of tables) {
    let result;
    if (table === "comments") {
      const parents = await copyTable(table, "WHERE parent_comment_id IS NULL");
      const replies = await copyTable(
        table,
        "WHERE parent_comment_id IS NOT NULL ORDER BY created_at",
      );
      result = {
        read: parents.read + replies.read,
        copied: parents.copied + replies.copied,
      };
    } else result = await copyTable(table);
    if (result.read !== result.copied) failed = true;
    summary.push({
      table,
      mysql_rows: result.read,
      postgres_rows: result.copied,
      ok: result.read === result.copied ? "" : "MISMATCH",
    });
  }
  console.table(summary);
  if (failed)
    throw new Error(
      "Some rows were skipped (duplicate keys, e.g. company names differing only by case). Rolled back; fix the source data and rerun.",
    );
  await target.query("COMMIT");
  console.log(
    "Copy complete. Next: run the API, then retire the MySQL database after verifying.",
  );
} catch (error) {
  await target.query("ROLLBACK").catch(() => {});
  console.error(`Copy failed, nothing was written: ${error.message}`);
  process.exitCode = 1;
} finally {
  target.release();
  await pool.end();
  await source.end();
}
void config;
