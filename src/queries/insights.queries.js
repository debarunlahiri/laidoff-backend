import { assertPagination } from "./query-guards.js";

export const insightQueries = {
  createReport:
    "INSERT INTO workforce_reports(id,company_id,user_id,event_date,reported_roles_affected,reported_headcount,reported_hires,source_url) VALUES(?,?,?,?,?,?,?,?)",
  monthlyTotals:
    "SELECT MONTH(event_date) AS month,SUM(reported_roles_affected) AS rolesAffected,COUNT(*) AS reports FROM workforce_reports WHERE event_date>=? AND event_date<? GROUP BY MONTH(event_date) ORDER BY month",
  companyTotals:
    "SELECT c.id,c.company_name AS name,SUM(w.reported_roles_affected) AS rolesAffected,MAX(w.reported_headcount) AS headcount,MAX(w.reported_hires) AS hires,COUNT(*) AS reports FROM workforce_reports w JOIN companies c ON c.id=w.company_id WHERE event_date>=? AND event_date<? GROUP BY c.id,c.company_name ORDER BY rolesAffected DESC",
  listReports: ({ limit, offset }) => {
    assertPagination(limit, offset);
    return `SELECT w.id,c.company_name AS company,w.event_date AS eventDate,w.reported_roles_affected AS rolesAffected,w.reported_headcount AS headcount,w.reported_hires AS hires,w.source_url AS sourceUrl,w.verification_status AS status FROM workforce_reports w JOIN companies c ON c.id=w.company_id ORDER BY w.event_date DESC,w.id LIMIT ${limit} OFFSET ${offset}`;
  },
};
