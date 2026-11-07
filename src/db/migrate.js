import { migrationQueries } from "../queries/migrations.queries.js";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool, query } from "./db.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Applies every migration in /migrations that is not recorded yet, in name
 * order. Safe to call on every start: nothing runs when the schema is current,
 * and an advisory lock keeps two processes from migrating at once.
 * Returns the names that were applied.
 */
export async function runMigrations({ log = console.log } = {}) {
  const connection = await pool.connect();
  const applied = [];
  try {
    // Another instance may be migrating right now; wait for it instead of failing.
    let locked = false;
    for (let attempt = 0; attempt < 30 && !locked; attempt++) {
      [{ acquired: locked }] = await query(migrationQueries.acquireLock, [], connection);
      if (!locked) await wait(1000);
    }
    if (!locked) throw new Error("Another migration is running");
    await query(migrationQueries.createMigrationTable, [], connection);
    const dir = new URL("../../migrations/", import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
      const sql = await readFile(new URL(name, dir), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const found = await query(migrationQueries.findMigration, [name], connection);
      if (found.length) {
        if (found[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      // PostgreSQL DDL is transactional: a failed migration rolls back completely.
      await connection.query("BEGIN");
      try {
        await query(sql, [], connection);
        await query(migrationQueries.recordMigration, [name, checksum], connection);
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        throw new Error(`${name}: ${error.message}`, { cause: error });
      }
      applied.push(name);
      log(`Applied ${name}`);
    }
    return applied;
  } finally {
    try {
      await query(migrationQueries.releaseLock, [], connection);
    } finally {
      connection.release();
    }
  }
}
