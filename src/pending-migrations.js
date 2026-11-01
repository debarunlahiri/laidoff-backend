import { readdir } from "node:fs/promises";
import { query } from "./db.js";
import { migrationQueries } from "./queries/migrations.queries.js";

// Names of migration files that have not been applied to this database yet.
export async function pendingMigrations() {
  const files = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let applied = [];
  try {
    applied = (await query(migrationQueries.listAppliedMigrations)).map(
      (row) => row.name,
    );
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE") throw error;
  }
  return files.filter((name) => !applied.includes(name));
}
