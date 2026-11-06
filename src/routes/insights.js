import { clearResponseCache } from "../response-cache.js";
import { insightQueries } from "../queries/insights.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query } from "../db.js";
import { page, mustExist } from "../http.js";
export const insights = Router();
const source = z
  .url()
  .max(2048)
  .refine((v) => /^https?:\/\//.test(v));
insights.post("/reports", async (req, res) => {
  const body = z
    .object({
      companyId: z.uuid(),
      eventDate: z.iso.date(),
      rolesAffected: z.number().int().min(1).max(10000000),
      headcount: z
        .number()
        .int()
        .nonnegative()
        .max(10000000)
        .nullable()
        .default(null),
      hires: z
        .number()
        .int()
        .nonnegative()
        .max(10000000)
        .nullable()
        .default(null),
      sourceUrl: source,
    })
    .parse(req.body);
  await mustExist(query, "companies", body.companyId);
  const id = randomUUID();
  await query(insightQueries.createReport, [
    id,
    body.companyId,
    req.user.id,
    body.eventDate,
    body.rolesAffected,
    body.headcount,
    body.hires,
    body.sourceUrl,
  ]);
  clearResponseCache("/insights");
  res.status(201).json({ id, status: "user_reported" });
});
insights.get("/", async (req, res) => {
  const year = z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .parse(req.query.year ?? new Date().getUTCFullYear());
  const params = [`${year}-01-01`, `${year + 1}-01-01`];
  const monthly = await query(insightQueries.monthlyTotals, params);
  const companies = await query(insightQueries.companyTotals, params);
  res.json({
    year,
    status: "user_reported",
    notice:
      "Unverified user reports may overlap. Totals are reported figures, not independently confirmed unique job losses.",
    monthly,
    companies,
  });
});
insights.get("/reports", async (req, res) => {
  const { limit, offset } = page(req);
  res.json(await query(insightQueries.listReports({ limit, offset })));
});
