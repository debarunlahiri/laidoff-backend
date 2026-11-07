// Usage: npm run admin:make -- you@example.com        (add --remove to revoke)
import { pool, query } from "../src/db/db.js";
const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error("Usage: npm run admin:make -- <email> [--remove]");
  process.exit(1);
}
try {
  const result = await query("UPDATE users SET is_admin=? WHERE email=?", [
    flag !== "--remove",
    email.toLowerCase(),
  ]);
  console.log(
    result.affectedRows
      ? `${email} is ${flag === "--remove" ? "no longer" : "now"} an admin.`
      : `No account found for ${email}.`,
  );
} finally {
  await pool.end();
}
