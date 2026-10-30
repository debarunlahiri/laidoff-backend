import { referralQueries } from "../queries/referrals.queries.js";
import { buildReferralListQuery } from "../queries/referral-list.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { HttpError, page, text, uuid, mustExist } from "../http.js";
import { notify } from "../notifications.js";
export const referrals = Router();
referrals.get("/", async (req, res) => {
  const { limit, offset } = page(req);
  const filters = z
    .object({
      search: z.string().max(200).default(""),
      companyId: z.uuid().optional(),
      status: z.enum(["open", "closed", "all"]).default("open"),
    })
    .parse(req.query);
  const referralQuery = buildReferralListQuery({
    filters,
    userId: req.user.id,
    limit,
    offset,
  });
  res.json(await query(referralQuery.sql, referralQuery.params));
});
referrals.post("/", async (req, res) => {
  const body = z
    .object({
      companyId: z.uuid(),
      title: text(120),
      location: text(160),
      skills: text(200),
      description: z.string().trim().max(5000).default(""),
    })
    .parse(req.body);
  await mustExist(query, "companies", body.companyId);
  const id = randomUUID();
  await query(referralQueries.createReferral, [
    id,
    req.user.id,
    body.companyId,
    body.title,
    body.location,
    body.skills,
    body.description,
  ]);
  res.status(201).json({ id, ...body });
});
referrals.patch("/:id", async (req, res) => {
  const { status } = z
    .object({ status: z.enum(["open", "closed"]) })
    .parse(req.body);
  const result = await query(referralQueries.updateStatus, [
    status,
    status,
    uuid(req.params.id),
    req.user.id,
  ]);
  if (!result.affectedRows)
    throw new HttpError(404, "Referral not found or not owned by you");
  res.json({ status });
});
referrals.post("/:id/requests", async (req, res) => {
  const id = uuid(req.params.id);
  await transaction(async (c) => {
    const [row] = await query(referralQueries.lockReferral, [id], c);
    if (!row) throw new HttpError(404, "Referral not found");
    if (row.user_id === req.user.id)
      throw new HttpError(400, "Cannot request your own referral");
    if (row.status !== "open") throw new HttpError(409, "Referral is closed");
    const result = await query(
      referralQueries.createRequest,
      [id, req.user.id],
      c,
    );
    if (result.affectedRows)
      await notify(
        c,
        row.user_id,
        req.user,
        "referral_request",
        id,
        `${req.user.name} requested a referral.`,
      );
  });
  res.status(201).json({ requested: true });
});
referrals.get("/:id/requests", async (req, res) => {
  const { limit, offset } = page(req);
  const [row] = await query(referralQueries.findOwner, [uuid(req.params.id)]);
  if (!row || row.user_id !== req.user.id)
    throw new HttpError(404, "Referral not found");
  res.json(
    await query(referralQueries.listRequests({ limit, offset }), [
      req.params.id,
    ]),
  );
});
referrals.patch("/:id/requests/:userId", async (req, res) => {
  const { status } = z
    .object({ status: z.enum(["accepted", "declined"]) })
    .parse(req.body);
  await transaction(async (c) => {
    const [row] = await query(
      referralQueries.lockOwner,
      [uuid(req.params.id)],
      c,
    );
    if (!row || row.user_id !== req.user.id)
      throw new HttpError(404, "Referral not found");
    const result = await query(
      referralQueries.updateRequestDecision,
      [status, req.user.id, req.params.id, uuid(req.params.userId)],
      c,
    );
    if (!result.affectedRows) throw new HttpError(404, "Request not found");
    await notify(
      c,
      req.params.userId,
      req.user,
      "referral_update",
      req.params.id,
      `Your referral request was ${status}.`,
    );
  });
  res.json({ status });
});
