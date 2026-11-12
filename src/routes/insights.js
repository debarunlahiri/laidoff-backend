import { clearResponseCache } from "../middleware/response-cache.js";
import { insightQueries } from "../queries/insights.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query } from "../db/db.js";
import { page, mustExist } from "../utils/http.js";
import { yearlyInsights } from "../services/workforce-insights.js";
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
  res.json(await yearlyInsights(req.query.year));
});
insights.get("/reports", async (req, res) => {
  const { limit, offset } = page(req);
  res.json(await query(insightQueries.listReports({ limit, offset })));
});
