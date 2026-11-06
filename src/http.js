import { resourceQueries } from "./queries/resources.queries.js";
import { z } from "zod";
export class HttpError extends Error {
  // appCode: stable machine-readable reason the frontend can react to.
  constructor(status, message, appCode) {
    super(message);
    this.status = status;
    this.appCode = appCode;
  }
}
export const id = z.string().uuid();
export const text = (max) => z.string().trim().min(1).max(max);
export const paging = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const page = (req) => paging.parse(req.query);
export function uuid(value) {
  return id.parse(value);
}
export async function mustExist(db, table, value, connection) {
  const allowed = ["users", "posts", "referrals", "companies", "conversations"];
  if (!allowed.includes(table)) throw new Error("Invalid table");
  const rows = await db(
    resourceQueries.findById({ table }),
    [uuid(value)],
    connection,
  );
  if (!rows.length) throw new HttpError(404, "Not found");
}
