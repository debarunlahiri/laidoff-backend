export const migrationQueries = {
  acquireLock: "SELECT GET_LOCK('laidoff_migrations', 15) AS acquired",
  createMigrationTable:
    "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
  findMigration: "SELECT checksum FROM schema_migrations WHERE name=?",
  listAppliedMigrations: "SELECT name FROM schema_migrations",
  recordMigration: "INSERT INTO schema_migrations(name,checksum) VALUES (?,?)",
  releaseLock: "SELECT RELEASE_LOCK('laidoff_migrations')",
};
