import { z } from "zod";
import { query } from "../db/db.js";

export const visibilityLevels = ["everyone", "members", "connections", "only_me"];
const visibility = z.enum(visibilityLevels);

// API key -> column. `connect` takes everyone | only_me only.
const columns = {
  profile: "profile_visibility",
  followers: "followers_visibility",
  following: "following_visibility",
  connections: "connections_visibility",
  likes: "likes_visibility",
  dislikes: "dislikes_visibility",
  referrals: "referrals_visibility",
  connect: "connect_permission",
};
export const privacyKeys = Object.keys(columns);
export const defaultPrivacy = Object.fromEntries(
  privacyKeys.map((key) => [key, "everyone"]),
);
export const privacySchema = z
  .object({
    profile: visibility,
    followers: visibility,
    following: visibility,
    connections: visibility,
    likes: visibility,
    dislikes: visibility,
    referrals: visibility,
    connect: z.enum(["everyone", "only_me"]),
  })
  .partial()
  .strict();

export async function getPrivacy(userId, db) {
  const [row] = await query(
    "SELECT * FROM user_privacy WHERE user_id=?",
    [userId],
    db,
  );
  if (!row) return { ...defaultPrivacy };
  return Object.fromEntries(
    privacyKeys.map((key) => [key, row[columns[key]]]),
  );
}

export async function savePrivacy(userId, patch) {
  const entries = Object.entries(patch);
  if (!entries.length) return getPrivacy(userId);
  const cols = entries.map(([key]) => columns[key]);
  await query(
    `INSERT INTO user_privacy(user_id,${cols.join(",")}) VALUES(?${",?".repeat(cols.length)})
     ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c}=EXCLUDED.${c}`).join(",")},updated_at=utc_now()`,
    [userId, ...entries.map(([, value]) => value)],
  );
  return getPrivacy(userId);
}

export async function areConnected(a, b) {
  if (!a || !b) return false;
  const rows = await query(
    "SELECT 1 FROM connections WHERE participant_pair_key=? AND connection_status='accepted'",
    [[a, b].sort().join(":")],
  );
  return rows.length > 0;
}

// Owner and administrators can always see; otherwise the level decides.
export async function canView(viewer, ownerId, level) {
  if (viewer?.id && (viewer.id === ownerId || viewer.isAdmin)) return true;
  if (level === "everyone") return true;
  if (level === "members") return Boolean(viewer?.id);
  if (level === "connections") return areConnected(viewer?.id, ownerId);
  return false;
}
