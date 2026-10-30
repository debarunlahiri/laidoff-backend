export function buildProfileUpdateQuery(body, userId) {
  const map = {
    name: "full_name",
    role: "professional_headline",
    about: "biography",
    skills: "professional_skills",
    nextChapter: "career_objective",
    openToWork: "open_to_work",
    location: "profile_location",
    websiteUrl: "website_url",
    linkedinProfileUrl: "linkedin_profile_url",
  };
  const entries = Object.entries(body);
  if (!entries.length || entries.some(([key]) => !Object.hasOwn(map, key)))
    throw new TypeError("Unsupported profile fields");
  return {
    sql: `UPDATE users SET ${entries.map(([key]) => `${map[key]}=?`).join(",")} WHERE id=?`,
    params: [
      ...entries.map(([key, value]) =>
        key === "skills" ? JSON.stringify(value) : value,
      ),
      userId,
    ],
  };
}
