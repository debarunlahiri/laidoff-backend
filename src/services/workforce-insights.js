import { z } from "zod";
import { query } from "../db/db.js";
import { insightQueries } from "../queries/insights.queries.js";

export const insightYear = z.coerce.number().int().min(2000).max(2100);
export const insightNotice =
  "Unverified user reports may overlap. Totals are reported figures, not independently confirmed unique job losses.";

// Monthly and per-company totals for one calendar year.
export async function yearlyInsights(requestedYear) {
  const year = insightYear.parse(requestedYear ?? new Date().getUTCFullYear());
  const params = [`${year}-01-01`, `${year + 1}-01-01`];
  const monthly = await query(insightQueries.monthlyTotals, params);
  const companies = await query(insightQueries.companyTotals, params);
  return {
    year,
    status: "user_reported",
    notice: insightNotice,
    monthly,
    companies,
  };
}
