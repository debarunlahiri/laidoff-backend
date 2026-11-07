import { authenticationQueries } from "../queries/authentication.queries.js";
import { config } from "../config/config.js";
import { query } from "../db/db.js";
import { newToken, tokenHash } from "../utils/security.js";
export async function createSession(
  userId,
  req,
  connection,
  provider = "password",
  identityId = null,
) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 86400000);
  await query(
    authenticationQueries.createSession,
    [
      tokenHash(token),
      userId,
      expiresAt,
      req.ip?.slice(0, 45) ?? null,
      req.headers["user-agent"]?.slice(0, 1024) ?? null,
      provider,
      identityId,
    ],
    connection,
  );
  return { token, expiresAt };
}
