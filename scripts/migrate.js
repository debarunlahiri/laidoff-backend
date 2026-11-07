import {
  installConsoleLogging,
  closeLogger,
  applicationLog,
} from "../src/utils/logger.js";
import { pool } from "../src/db/db.js";
import { runMigrations } from "../src/db/migrate.js";
installConsoleLogging();
try {
  const applied = await runMigrations();
  if (!applied.length) console.log("Database is already up to date");
} catch (error) {
  // Show the failure in the terminal too; it is otherwise only written to the log tables.
  console.error(`Migration failed: ${error.message}`);
  await applicationLog("fatal", "migration.failed", "Database migration failed", { errorCode: error.code ?? error.name }, error);
  process.exitCode = 1;
} finally {
  await pool.end();
  await closeLogger();
}
