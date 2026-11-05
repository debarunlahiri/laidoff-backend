export const migrationQueries = {
  // Session-level advisory lock: held on the migration connection until released.
  acquireLock:
    "SELECT pg_try_advisory_lock(hashtext('laidoff_migrations')) AS acquired",
  createMigrationTable:
    "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'))",
  findMigration: "SELECT checksum FROM schema_migrations WHERE name=?",
  listAppliedMigrations: "SELECT name FROM schema_migrations",
  recordMigration: "INSERT INTO schema_migrations(name,checksum) VALUES (?,?)",
  releaseLock:
    "SELECT pg_advisory_unlock(hashtext('laidoff_migrations')) AS released",
};
