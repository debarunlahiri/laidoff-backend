import { assertTable } from "./query-guards.js";

export const resourceQueries = {
  findById: ({ table }) => {
    assertTable(table, [
      "users",
      "posts",
      "referrals",
      "companies",
      "conversations",
    ]);
    return `SELECT id FROM ${table} WHERE id=?`;
  },
};
