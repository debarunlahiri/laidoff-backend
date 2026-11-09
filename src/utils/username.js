import { z } from "zod";
import { query } from "../db/db.js";
import { HttpError } from "./http.js";

// Stored lowercase; letters, digits and underscore only.
export const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, "").toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9_]{3,30}$/,
        "Username must be 3-30 characters: letters, numbers or underscores",
      ),
  );

const reserved = new Set([
  "admin",
  "administrator",
  "support",
  "help",
  "laidoff",
  "moderator",
  "system",
  "root",
  "api",
  "me",
  "null",
  "undefined",
  "username_available",
]);

export async function usernameProblem(username, exceptUserId = null) {
  if (reserved.has(username)) return "That username is reserved";
  const rows = await query(
    "SELECT id FROM users WHERE lower(username)=? AND id IS DISTINCT FROM ?",
    [username, exceptUserId],
  );
  return rows.length ? "That username is already taken" : null;
}

export async function assertUsernameFree(username, exceptUserId = null) {
  const problem = await usernameProblem(username, exceptUserId);
  if (problem) throw new HttpError(409, problem);
}
