import { sessionQueries } from "../queries/session-authentication.queries.js";
import { logContext } from "../utils/log-context.js";
import { query } from "../db/db.js";
import { tokenHash } from "../utils/security.js";
import { HttpError } from "../utils/http.js";
export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.match(
    /^Bearer ([A-Za-z0-9_-]{43})$/,
  )?.[1];
  if (!token) throw new HttpError(401, "Authentication required");
  const rows = await query(sessionQueries.findActiveSession, [
    tokenHash(token),
  ]);
  if (!rows.length) throw new HttpError(401, "Session expired or invalid");
  req.user = rows[0];
  req.tokenHash = tokenHash(token);
  const context = logContext.getStore();
  if (context) context.userId = req.user.id;
  await query(sessionQueries.recordActivity, [req.tokenHash]);
  next();
}
