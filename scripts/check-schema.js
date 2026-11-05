// Prints which referral columns and tables exist and runs the referral list
// query once, so a 500 from GET /referrals can be traced to its cause.
import { pool, query } from "../src/db.js";
import { buildReferralListQuery } from "../src/queries/referral-list.queries.js";

const expected = {
  referrals: [
    "work_mode",
    "experience_level",
    "min_experience_years",
    "request_fields",
  ],
  referral_requests: ["request_message", "request_answers"],
  referral_feedback: ["feedback_type"],
  referral_documents: ["stored_file_name"],
  referral_request_documents: ["document_id"],
  message_attachments: ["stored_file_name"],
  post_polls: ["allow_multiple"],
  post_poll_options: ["option_text"],
  post_poll_votes: ["option_id"],
  post_shares: ["created_at"],
  post_views: ["view_count"],
  referral_shares: ["created_at"],
  comment_reports: ["report_category"],
};
let missing = 0;
for (const [table, columns] of Object.entries(expected)) {
  const rows = await query(
    "SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?",
    [table],
  );
  const have = new Set(rows.map((row) => row.name));
  for (const column of columns)
    if (!have.has(column)) {
      missing++;
      console.log(`MISSING  ${table}.${column}`);
    }
}
const applied = await query("SELECT name FROM schema_migrations ORDER BY name");
console.log("Applied migrations:", applied.map((r) => r.name).join(", "));
const built = buildReferralListQuery({
  filters: { search: "", status: "all", sort: "newest", view: "all" },
  userId: "00000000-0000-4000-8000-000000000000",
  limit: 5,
  offset: 0,
});
try {
  const rows = await query(built.sql, built.params);
  console.log(`List query OK (${rows.length} rows)`);
} catch (error) {
  console.log(`List query FAILED: ${error.message}`);
}
console.log(
  missing ? `${missing} column(s) missing.` : "Schema looks complete.",
);
process.exit(0);
