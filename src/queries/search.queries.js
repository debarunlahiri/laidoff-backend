import { assertPagination } from "./query-guards.js";
export const searchQueries = {
  // Params: viewerId (following flag), viewerId (exclude self), contains, contains, prefix.
  users: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT u.id,u.full_name AS name,u.professional_headline AS role,u.profile_image_url AS profileImageUrl,u.open_to_work AS openToWork,EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followed_id=u.id) AS following FROM users u WHERE u.account_status='active' AND NOT (u.id <=> ?) AND (u.full_name LIKE ? OR u.professional_headline LIKE ?) ORDER BY (u.full_name LIKE ?) DESC,u.full_name LIMIT ${limit} OFFSET ${offset}`;
  },
  // Params: contains, prefix.
  companies: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT id,company_name AS name FROM companies WHERE is_active=TRUE AND company_name LIKE ? ORDER BY (company_name LIKE ?) DESC,company_name LIMIT ${limit} OFFSET ${offset}`;
  },
};
