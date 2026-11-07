import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultTemplates,
  effectiveContent,
  emailVariables,
  renderEmail,
} from "../src/services/email-templates.js";
import { sendMail, emailConfigured } from "../src/services/email.js";
import { emailVerificationQueries } from "../src/queries/email-verification.queries.js";
import { toPositional } from "../src/db/pg-support.js";

const render = (key, name, extra = {}, options) =>
  renderEmail(
    key,
    effectiveContent(key, extra),
    emailVariables({ name, token: "abc_DEF-123" }),
    options,
  );

test("verification and reminder emails carry a tokenised link and escape names", () => {
  for (const key of ["verification", "reminder"]) {
    const mail = render(key, '<b>Ann</b> "Lee"');
    assert.match(mail.html, /\/verify-email\?token=abc_DEF-123/);
    assert.match(mail.text, /\/verify-email\?token=abc_DEF-123/);
    assert.ok(!mail.html.includes("<b>Ann</b>"));
  }
});

test("welcome email lists features and only asks unverified users to confirm", () => {
  const unverified = render("welcome", "Ann Lee");
  const verified = render("welcome", "Ann Lee", {}, { verified: true });
  assert.match(unverified.html, /referral/i);
  assert.match(unverified.html, /confirm your address/);
  assert.ok(!verified.html.includes("confirm your address"));
});

test("admin overrides replace defaults and variables are escaped", () => {
  const mail = render("welcome", "Ann <script>", {
    subject: "Hi {{firstName}}!",
    features: [],
  });
  assert.equal(mail.subject, "Hi Ann!");
  assert.ok(!mail.html.includes("What you can do here</h2><table"));
  const custom = render("verification", "Ann", {
    htmlOverride: '<a href="{{link}}">Go {{name}}</a>',
  });
  assert.match(
    custom.html,
    /^<a href="[^"]*verify-email\?token=abc_DEF-123">Go Ann<\/a>$/,
  );
  assert.ok(defaultTemplates.welcome.features.length > 0);
});

test("sending is skipped, not thrown, when SMTP is not configured", async () => {
  assert.equal(emailConfigured(), false);
  assert.equal(
    await sendMail({ to: "a@b.co", subject: "x", html: "x" }),
    false,
  );
});

test("reminder query binds all placeholders", () => {
  const sql = toPositional(emailVerificationQueries.claimDueReminders);
  assert.match(sql, /\$4/);
  assert.ok(!sql.includes("?"));
});

import { passwordProblem } from "../src/utils/password-strength.js";
test("password strength rules", () => {
  const who = { email: "ann.lee@mail.com", name: "Ann Lee" };
  assert.ok(passwordProblem("alllowercaseletters", who));
  assert.ok(passwordProblem("Password12345!", who));
  assert.ok(passwordProblem("Xaaaa9#kLmnop", who));
  assert.ok(passwordProblem("Ann.Lee-2026!xyz", who));
  assert.equal(passwordProblem("Rv7#kLm2$qZp9", who), "");
});
