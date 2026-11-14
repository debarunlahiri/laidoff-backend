import { config } from "../config/config.js";
import { query } from "../db/db.js";
import { adminQueries as sql } from "../queries/admin.queries.js";

const BRAND = "#3159df";
const INK = "#182338";
const MUTED = "#64748b";
const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const appUrl = () => config.APP_URL.replace(/\/+$/, "");

// Icon fonts don't work in email clients, so a feature's icon is the name of a
// PNG served by the web app (public/email-icons/<name>.png). Anything else,
// such as an emoji from an edited template, is shown as plain text.
const featureIcon = (icon = "") =>
  /^[a-z][a-z0-9-]*$/.test(icon)
    ? `<img src="${appUrl()}/email-icons/${icon}.png" width="20" height="20" alt="" style="display:inline-block;vertical-align:middle;margin-top:-2px;border:0">`
    : escapeHtml(icon);

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const firstNameOf = (name) =>
  String(name).trim().split(/\s+/)[0] || "there";

// ---- Default content (what admins can override, field by field) ----
export const templateKeys = ["verification", "reminder", "welcome"];
export const templateMeta = {
  verification: {
    label: "Verification email",
    description: "Sent right after sign-up with the confirmation link.",
    variables: ["name", "firstName", "email", "link", "appUrl", "hours"],
  },
  reminder: {
    label: "Verification reminder",
    description: "Sent to members who still haven't confirmed their email.",
    variables: ["name", "firstName", "email", "link", "appUrl", "hours"],
  },
  welcome: {
    label: "Welcome email",
    description: "Greeting sent after the account is created.",
    variables: ["name", "firstName", "email", "appUrl"],
  },
};
export const defaultTemplates = {
  verification: {
    subject:
      "{{firstName}}, confirm your email to finish joining LaidOffCircle",
    preheader: "One click and your account is secured.",
    heading: "Confirm your email, {{firstName}}",
    intro:
      "You're one click away from joining the circle. Confirming your email keeps your account secure and makes sure referral updates, messages and replies from people in your network actually reach you.",
    buttonLabel: "Confirm my email",
    footerNote:
      "Didn't create an account? You can safely ignore this email and nothing will happen.",
    htmlOverride: "",
  },
  reminder: {
    subject: "{{firstName}}, your LaidOffCircle email still needs confirming",
    preheader: "It takes one click. Here's a fresh link.",
    heading: "Still there, {{firstName}}?",
    intro:
      "Your LaidOffCircle account is set up, but your email address isn't confirmed yet. Until it is, you could miss referral replies, connection requests and messages, and we can't help you recover your account if you're ever locked out.\n\nHere's a fresh link. It takes about five seconds.",
    buttonLabel: "Confirm my email",
    footerNote:
      "Didn't create an account? You can safely ignore this email and nothing will happen.",
    htmlOverride: "",
  },
  welcome: {
    subject: "Welcome to the circle, {{firstName}} 👋",
    preheader: "You're in. Here's how to get the most out of LaidOffCircle.",
    heading: "Welcome, {{firstName}}. You're not figuring this out alone.",
    intro:
      "A layoff can feel isolating, but you've just joined a community of people who understand, share leads, and open doors for each other. Your account is ready.",
    notice:
      "**One quick thing:** we've sent a separate email asking you to confirm your address. Please click the link in it so you don't miss referral replies and messages.",
    featuresTitle: "What you can do here",
    features: [
      {
        icon: "comment-dots",
        title: "Share your story",
        text: "Post updates, photos or polls, anonymously if you prefer. Comment, repost and bookmark what helps.",
      },
      {
        icon: "handshake",
        title: "Ask for and offer referrals",
        text: "Browse openings from people on the inside, request a referral with your documents, or list one you can give.",
      },
      {
        icon: "globe",
        title: "Build your network",
        text: "Follow members, send connection requests, and search people and companies that matter to your next move.",
      },
      {
        icon: "lock",
        title: "Talk privately",
        text: "One-to-one conversations with read receipts, so the right introductions turn into real conversations.",
      },
      {
        icon: "chart-column",
        title: "See the bigger picture",
        text: "Explore layoff insights by company and month, and add your own report so others aren't navigating blind.",
      },
    ],
    stepsTitle: "Get started in three steps",
    steps: [
      {
        title: "Finish your profile",
        text: "Add a headline, your skills and your location. Switch on **Open to work** so people know how to help.",
      },
      {
        title: "Say hello",
        text: "Introduce yourself in a first post. Most members find the circle opens up fast once they do.",
      },
      {
        title: "Make one connection",
        text: "Follow a few people or request a referral. One real conversation beats a hundred applications.",
      },
    ],
    buttonLabel: "Open LaidOffCircle",
    signoff: "Wishing you a great next chapter,\nThe LaidOffCircle team",
    htmlOverride: "",
  },
};

// ---- Stored overrides (cached briefly) ----
let cache = null;
let loadedAt = 0;
export const clearTemplateCache = () => (cache = null);
export async function loadStoredTemplates() {
  if (cache && Date.now() - loadedAt < 15000) return cache;
  let rows = [];
  try {
    rows = await query(sql.listTemplates);
  } catch {
    // Table missing or database unavailable: use built-in defaults.
  }
  cache = Object.fromEntries(
    rows.map((row) => [
      row.key,
      { content: row.content, updatedAt: row.updatedAt },
    ]),
  );
  loadedAt = Date.now();
  return cache;
}
export const effectiveContent = (key, stored = {}) => ({
  ...defaultTemplates[key],
  ...stored,
});

// ---- Rendering ----
const fill = (text, vars) =>
  String(text ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) =>
    name in vars ? String(vars[name]) : "",
  );
// Plain text field -> safe HTML: escape, then allow **bold** and line breaks.
const rich = (text, vars) =>
  escapeHtml(fill(text, vars))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
const plain = (text, vars) => fill(text, vars).replace(/\*\*(.+?)\*\*/g, "$1");
const paragraphs = (text, vars) =>
  fill(text, vars)
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 14px">${escapeHtml(p)
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

const button = (label, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="background:${BRAND};border-radius:10px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 30px;font-family:${font};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;

function layout({ preheader, bodyHtml, footer }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:${font};color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${BRAND};padding:26px 36px">
<div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.3px"><img src="${appUrl()}/email-icons/logo-white.png" width="30" height="30" alt="" style="display:inline-block;vertical-align:middle;margin:-4px 10px 0 0;border:0">LaidOffCircle</div>
<div style="font-size:13px;color:#d6defa;margin-top:4px">Laid off, not disconnected.</div>
</td></tr>
<tr><td style="padding:36px 36px 32px;font-size:16px;line-height:1.65">${bodyHtml}</td></tr>
<tr><td style="padding:0 36px 32px;font-size:12px;line-height:1.6;color:${MUTED}">${footer ?? ""}</td></tr>
</table>
<p style="font-size:12px;color:#94a3b8;margin:18px 0 0;line-height:1.6">You're receiving this because an account was created with this email address on LaidOffCircle.<br>This is an automated message, please do not reply.</p>
</td></tr></table></body></html>`;
}

export const verificationLink = (token) =>
  `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;

const h1 = (html) =>
  `<h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;letter-spacing:-0.4px">${html}</h1>`;

export function emailVariables({
  name,
  email = "",
  token = "SAMPLE_TOKEN",
  hours,
}) {
  return {
    name,
    firstName: firstNameOf(name),
    email,
    link: verificationLink(token),
    appUrl: appUrl(),
    hours: hours ?? config.EMAIL_VERIFICATION_HOURS,
  };
}

// Pure render: content (defaults + overrides) + variables -> { subject, html, text }.
export function renderEmail(key, content, vars, { verified = false } = {}) {
  const subject = plain(content.subject, vars).replace(/\s+/g, " ").trim();
  if (content.htmlOverride?.trim()) {
    const safe = Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]),
    );
    const html = fill(content.htmlOverride, safe);
    return {
      subject,
      html,
      text: html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    };
  }
  if (key === "welcome") {
    const features = (content.features ?? [])
      .map(
        (f) =>
          `<tr><td width="48" valign="top" style="padding:0 0 18px"><div style="width:40px;height:40px;line-height:40px;text-align:center;font-size:20px;background:#eef2ff;border-radius:10px">${featureIcon(f.icon)}</div></td><td valign="top" style="padding:0 0 18px 6px"><div style="font-weight:700;font-size:16px">${rich(f.title, vars)}</div><div style="color:${MUTED};font-size:15px;line-height:1.55;margin-top:2px">${rich(f.text, vars)}</div></td></tr>`,
      )
      .join("");
    const steps = (content.steps ?? [])
      .map(
        (s, i) =>
          `<tr><td width="36" valign="top" style="padding:0 0 14px"><div style="width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:${BRAND};color:#fff;font-weight:700;font-size:13px">${i + 1}</div></td><td valign="top" style="padding:0 0 14px 4px;font-size:15px;line-height:1.55"><strong>${rich(s.title, vars)}.</strong> <span style="color:${MUTED}">${rich(s.text, vars)}</span></td></tr>`,
      )
      .join("");
    const notice =
      verified || !content.notice?.trim()
        ? ""
        : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tr><td style="background:#fff8e6;border:1px solid #f0d28a;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;color:#6b4a00">${rich(content.notice, vars)}</td></tr></table>`;
    const html = layout({
      preheader: plain(content.preheader, vars),
      bodyHtml: `${h1(rich(content.heading, vars))}
<div style="margin:0 0 22px">${paragraphs(content.intro, vars)}</div>
${notice}
${features ? `<h2 style="margin:0 0 16px;font-size:18px">${rich(content.featuresTitle, vars)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${features}</table>` : ""}
${steps ? `<h2 style="margin:12px 0 16px;font-size:18px">${rich(content.stepsTitle, vars)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps}</table>` : ""}
${content.buttonLabel ? button(plain(content.buttonLabel, vars), vars.appUrl) : ""}
<p style="margin:20px 0 0;color:${MUTED};font-size:14px">${rich(content.signoff, vars)}</p>`,
    });
    const text = [
      plain(content.heading, vars),
      "",
      plain(content.intro, vars),
      "",
      !verified && content.notice?.trim()
        ? `${plain(content.notice, vars)}\n`
        : "",
      plain(content.featuresTitle, vars) + ":",
      ...(content.features ?? []).map(
        (f) => `- ${plain(f.title, vars)}: ${plain(f.text, vars)}`,
      ),
      "",
      plain(content.stepsTitle, vars) + ":",
      ...(content.steps ?? []).map(
        (s, i) => `${i + 1}. ${plain(s.title, vars)}. ${plain(s.text, vars)}`,
      ),
      "",
      `${plain(content.buttonLabel, vars)}: ${vars.appUrl}`,
      "",
      plain(content.signoff, vars),
    ].join("\n");
    return { subject, html, text };
  }
  // verification + reminder
  const footer = `This link expires in ${escapeHtml(vars.hours)} hours. Button not working? Paste this address into your browser:<br><a href="${escapeHtml(vars.link)}" style="color:${BRAND};word-break:break-all">${escapeHtml(vars.link)}</a>${content.footerNote?.trim() ? `<br><br>${rich(content.footerNote, vars)}` : ""}`;
  const html = layout({
    preheader: plain(content.preheader, vars),
    bodyHtml: `${h1(rich(content.heading, vars))}
${paragraphs(content.intro, vars)}
${button(plain(content.buttonLabel, vars), vars.link)}`,
    footer,
  });
  const text = `${plain(content.heading, vars)}\n\n${plain(content.intro, vars)}\n\n${plain(content.buttonLabel, vars)}: ${vars.link}\n\nThis link expires in ${vars.hours} hours.${content.footerNote?.trim() ? `\n${plain(content.footerNote, vars)}` : ""}`;
  return { subject, html, text };
}

// Loads any admin overrides and renders. Used when actually sending.
export async function buildEmail(key, user, options = {}) {
  const stored = (await loadStoredTemplates())[key]?.content;
  const vars = emailVariables({
    name: user.name,
    email: user.email,
    token: options.token,
    hours: options.hours,
  });
  return renderEmail(key, effectiveContent(key, stored), vars, options);
}

// ---- Community warning (sent by an administrator; not an editable template) ----
export const warningReasons = {
  language: {
    label: "Language that doesn't fit our community",
    text: "Your post uses language that isn't appropriate for LaidOffCircle. We want every conversation here to stay respectful, so please avoid abusive or offensive words.",
  },
  harassment: {
    label: "Targeting or harassing others",
    text: "Your post appears to target or put down other members. Please keep the focus on sharing and supporting each other.",
  },
  spam: {
    label: "Spam or unwanted promotion",
    text: "Your post looks like spam or unrequested promotion. Please share things that are useful to the people in this community.",
  },
  misleading: {
    label: "Misleading information",
    text: "Your post may contain information that could mislead other members. Please double-check facts before sharing.",
  },
  off_topic: {
    label: "Off-topic content",
    text: "Your post doesn't fit what this community is for. Posts about careers, layoffs, referrals and support are the best fit.",
  },
  other: {
    label: "Community guidelines",
    text: "Your post doesn't follow our community guidelines.",
  },
};

export const warningTypes = {
  reminder: {
    label: "Friendly reminder",
    subject: "A friendly reminder about your recent post on LaidOffCircle",
    preheader: "A gentle reminder about our community guidelines.",
    closing:
      "This is just a friendly reminder, so no action is needed beyond reading our guidelines.",
  },
  warning: {
    label: "Warning",
    subject: "A note about your recent post on LaidOffCircle",
    preheader: "A friendly reminder about our community guidelines.",
    closing:
      "This is a friendly warning. Repeated issues can lead to content being removed or the account being restricted, so please take a moment to read our guidelines.",
  },
  final: {
    label: "Final warning",
    subject: "Final warning about your recent post on LaidOffCircle",
    preheader: "Please read this: further issues can limit your account.",
    closing:
      "This is a final warning. If this happens again, your content may be removed and your account may be restricted, so please read our guidelines carefully.",
  },
};

export function renderWarningEmail({
  name,
  reason,
  excerpt,
  note,
  type = "warning",
}) {
  const kind = warningTypes[type] ?? warningTypes.warning;
  const info = warningReasons[reason] ?? warningReasons.other;
  const first = firstNameOf(name);
  const guidelines = `${appUrl()}/community-guidelines`;
  const quote = String(excerpt ?? "")
    .trim()
    .slice(0, 280);
  const subject = kind.subject;
  const html = layout({
    preheader: kind.preheader,
    bodyHtml: `${h1(`A quick note, ${escapeHtml(first)}`)}
<p style="margin:0 0 14px">We're writing about a recent post of yours. <strong>${escapeHtml(info.label)}</strong></p>
<p style="margin:0 0 14px">${escapeHtml(info.text)}</p>
${
  quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="background:#f3f5f9;border-left:4px solid ${BRAND};border-radius:6px;padding:12px 14px;font-size:14px;color:${MUTED}">${escapeHtml(quote)}${String(excerpt).trim().length > 280 ? "…" : ""}</td></tr></table>`
    : ""
}
${note?.trim() ? `<p style="margin:0 0 14px"><strong>A note from our team:</strong><br>${escapeHtml(note.trim()).replace(/\n/g, "<br>")}</p>` : ""}
<p style="margin:0 0 14px">${escapeHtml(kind.closing)}</p>
${button("Read the community guidelines", guidelines)}
<p style="margin:20px 0 0;color:${MUTED};font-size:14px">Thank you for helping keep the circle a kind place,<br>The LaidOffCircle team</p>`,
  });
  const text = [
    `A quick note, ${first}`,
    "",
    `We're writing about a recent post of yours. ${info.label}`,
    info.text,
    quote ? `\n"${quote}"` : "",
    note?.trim() ? `\nA note from our team: ${note.trim()}` : "",
    "",
    kind.closing,
    `Community guidelines: ${guidelines}`,
    "",
    "Thank you for helping keep the circle a kind place,",
    "The LaidOffCircle team",
  ].join("\n");
  return { subject, html, text };
}

// Security notice sent whenever a password changes. `by` is "user" (the member
// changed it themselves) or "admin" (an administrator set a new one). The
// password itself is never included.
export function renderPasswordChangedEmail({ name, by = "user" }) {
  const first = firstNameOf(name);
  const byAdmin = by === "admin";
  const subject = byAdmin
    ? "An administrator changed your LaidOffCircle password"
    : "Your LaidOffCircle password was changed";
  const what = byAdmin
    ? "A LaidOffCircle administrator set a new password for your account. You have been signed out on all devices."
    : "The password for your LaidOffCircle account was just changed. Your other devices have been signed out.";
  const next = byAdmin
    ? "Sign in with the new password you were given. If you were not expecting this, reply to this email so we can look into it."
    : "If this was you, there is nothing more to do. If it was not, reply to this email right away so we can secure your account.";
  const when = `${new Date().toUTCString()}`;
  const html = layout({
    preheader: subject,
    bodyHtml: `${h1(`Your password was changed, ${escapeHtml(first)}`)}
<p style="margin:0 0 14px">${escapeHtml(what)}</p>
<p style="margin:0 0 14px;color:${MUTED};font-size:14px">${escapeHtml(when)}</p>
<p style="margin:0 0 14px">${escapeHtml(next)}</p>
${button("Sign in", `${appUrl()}/login`)}
<p style="margin:20px 0 0;color:${MUTED};font-size:14px">The LaidOffCircle team</p>`,
  });
  const text = [
    `Your password was changed, ${first}`,
    "",
    what,
    when,
    "",
    next,
    `Sign in: ${appUrl()}/login`,
    "",
    "The LaidOffCircle team",
  ].join("\n");
  return { subject, html, text };
}
