import { migrationQueries } from "../src/queries/migrations.queries.js";
import {
  installConsoleLogging,
  closeLogger,
  applicationLog,
} from "../src/logger.js";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool, query } from "../src/db.js";
installConsoleLogging();
let connection;
try {
  connection = await pool.getConnection();
  const locks = await query(migrationQueries.acquireLock, [], connection);
  if (!locks[0].acquired) throw new Error("Another migration is running");
  await query(migrationQueries.createMigrationTable, [], connection);
  for (const name of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../migrations/${name}`, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await query(
      migrationQueries.findMigration,
      [name],
      connection,
    );
    if (applied.length) {
      if (applied[0].checksum !== checksum)
        throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    // MySQL DDL auto-commits: repair a failed migration before rerunning it.
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await query(statement, [], connection);
    await query(migrationQueries.recordMigration, [name, checksum], connection);
    console.log(`Applied ${name}`);
  }
} catch (error) {
  await applicationLog(
    "fatal",
    "migration.failed",
    "Database migration failed",
    { errorCode: error.code ?? error.name },
    error,
  );
  process.exitCode = 1;
} finally {
  if (connection) {
    try {
      await query(migrationQueries.releaseLock, [], connection);
    } catch (error) {
      await applicationLog(
        "error",
        "migration.lock_release_failed",
        "Could not release migration lock",
        { errorCode: error.code },
        error,
      );
    } finally {
      connection.release();
    }
  }
  await pool.end();
  await closeLogger();
}
