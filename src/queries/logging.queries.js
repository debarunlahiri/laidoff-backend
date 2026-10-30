import { assertTable, assertColumns } from "./query-guards.js";

export const loggingQueries = {
  setUtcTimezone: "SET time_zone = '+00:00'",
  insertRecord: ({ table, columns }) => {
    assertTable(table, [
      "api_request_logs",
      "application_logs",
      "database_query_logs",
      "audit_logs",
    ]);
    assertColumns(columns);
    return `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON DUPLICATE KEY UPDATE id=id`;
  },
};
