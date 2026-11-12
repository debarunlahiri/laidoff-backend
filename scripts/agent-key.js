// Manage API keys for AI agents (see AGENT_API.md).
//   npm run agent:key -- create --name news-bot [--account news@laidoffcircle.com] [--writes-per-hour 60]
//   npm run agent:key -- list
//   npm run agent:key -- revoke <key-id>
// A new key is printed once and cannot be shown again: only its hash is stored.
import { randomUUID } from "node:crypto";
import { pool, query } from "../src/db/db.js";
import { agentQueries } from "../src/queries/agent.queries.js";
import { newToken, tokenHash } from "../src/utils/security.js";

const usage = `Usage:
  npm run agent:key -- create --name <label> [--account <email>] [--writes-per-hour <1-1000>]
  npm run agent:key -- list
  npm run agent:key -- revoke <key-id>`;
const [command, ...args] = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

try {
  if (command === "create") {
    const name = flag("name")?.trim();
    // Default: the official news account created by migration 014.
    const email = (flag("account") ?? "news@laidoffcircle.com").toLowerCase();
    const writes = Number(flag("writes-per-hour") ?? 60);
    if (!name || name.length > 80)
      fail(`--name is required (up to 80 characters).\n${usage}`);
    else if (!Number.isInteger(writes) || writes < 1 || writes > 1000)
      fail("--writes-per-hour must be a whole number from 1 to 1000.");
    else {
      const [account] = await query(agentQueries.findAccount, [email]);
      if (!account) fail(`No account found for ${email}.`);
      else if (account.status !== "active")
        fail(`${email} is not an active account.`);
      else {
        const key = `lak_${newToken()}`;
        const id = randomUUID();
        await query(agentQueries.createKey, [
          id,
          name,
          tokenHash(key),
          key.slice(0, 8),
          account.id,
          writes,
        ]);
        console.log(`Created key "${name}" (id ${id}).`);
        console.log(
          `It publishes as "${account.name}" (${email}), up to ${writes} writes per hour.`,
        );
        if (!account.emailVerified)
          console.log("Note: this account's email is not verified yet.");
        console.log("\nAPI key (shown once, store it now):\n");
        console.log(`  ${key}\n`);
      }
    }
  } else if (command === "list") {
    const keys = await query(agentQueries.listKeys);
    if (!keys.length) console.log("No agent keys yet.");
    for (const k of keys)
      console.log(
        `${k.id}  ${k.hint}…  ${k.name}  as ${k.account}  ${k.writesPerHour}/h  last used ${k.lastUsedAt ?? "never"}${k.revokedAt ? `  REVOKED ${k.revokedAt}` : ""}`,
      );
  } else if (command === "revoke") {
    const id = args[0];
    if (!id) fail(usage);
    else {
      const result = await query(agentQueries.revokeKey, [id]);
      console.log(
        result.affectedRows
          ? `Revoked key ${id}.`
          : `No active key with id ${id}.`,
      );
    }
  } else fail(usage);
} finally {
  await pool.end();
}
