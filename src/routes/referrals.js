import { referralQueries } from "../queries/referrals.queries.js";
import {
  buildReferralListQuery,
  referralSorts,
} from "../queries/referral-list.queries.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db/db.js";
import { HttpError, page, text, uuid, mustExist } from "../utils/http.js";
import { notify } from "../services/notifications.js";
import multer from "multer";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config/config.js";
import {
  fieldDefinitions,
  withFieldIds,
  parseJson,
  checkAnswers,
} from "../utils/referral-fields.js";
export const referrals = Router();
referrals.get("/", async (req, res) => {
  const { limit, offset } = page(req);
  const filters = z
    .object({
      search: z.string().max(200).default(""),
      id: z.uuid().optional(),
      companyId: z.uuid().optional(),
      authorId: z.uuid().optional(),
      status: z.enum(["open", "closed", "all"]).default("open"),
      view: z.enum(["all", "available", "mine", "requested"]).default("all"),
      workMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
      level: z.enum(["entry", "mid", "senior", "lead"]).optional(),
      location: z.string().trim().max(100).optional(),
      skill: z.string().trim().max(60).optional(),
      experience: z.coerce.number().int().min(0).max(60).optional(),
      requestStatus: z.enum(["pending", "accepted", "declined"]).optional(),
      postedWithin: z.coerce
        .number()
        .int()
        .refine((n) => [1, 7, 30, 90].includes(n))
        .optional(),
      topRated: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional(),
      sort: z.enum(referralSorts).default("newest"),
    })
    .parse(req.query);
  // Personal views only make sense for a signed-in member.
  // A shared link must still open a referral that has since been closed.
  if (filters.id) filters.status = "all";
  if (!req.user.id && filters.view !== "all")
    throw new HttpError(401, "Sign in to use this filter");
  const referralQuery = buildReferralListQuery({
    filters,
    userId: req.user.id,
    limit,
    offset,
  });
  const rows = await query(referralQuery.sql, referralQuery.params);
  res.json(
    rows.map((row) => ({
      ...row,
      requestFields: parseJson(row.requestFields, []),
    })),
  );
});

// Resumes and similar files live outside the public uploads folder and are
// only readable by their owner or the referrer they were sent to.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
});
const documentTypes = [
  {
    ext: "pdf",
    mime: "application/pdf",
    match: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  },
  {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    match: (b) =>
      b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  {
    ext: "doc",
    mime: "application/msword",
    match: (b) => b.subarray(0, 4).toString("hex") === "d0cf11e0",
  },
];
referrals.post(
  "/documents",
  documentUpload.single("document"),
  async (req, res) => {
    if (!req.file) throw new HttpError(400, "Attach a PDF or Word document");
    const original = req.file.originalname.slice(0, 255);
    const ext = path.extname(original).slice(1).toLowerCase();
    const kind = documentTypes.find(
      (t) => t.ext === ext && t.match(req.file.buffer),
    );
    if (!kind) throw new HttpError(400, "Upload a PDF, DOC or DOCX file");
    const id = randomUUID();
    const stored = `${id}.${kind.ext}`;
    await mkdir(config.privateUploadDir, { recursive: true });
    const target = path.join(config.privateUploadDir, stored);
    await writeFile(target, req.file.buffer);
    try {
      await query(referralQueries.createDocument, [
        id,
        req.user.id,
        stored,
        original,
        kind.mime,
        req.file.size,
      ]);
    } catch (error) {
      await unlink(target).catch(() => {});
      throw error;
    }
    res.status(201).json({ id, name: original, size: req.file.size });
  },
);
referrals.get("/documents/:docId", async (req, res) => {
  const [doc] = await query(referralQueries.findReadableDocument, [
    uuid(req.params.docId),
    req.user.id,
    req.user.id,
  ]);
  if (!doc) throw new HttpError(404, "Document not found");
  res.set({
    "Content-Type": doc.mime,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  res.sendFile(path.join(config.privateUploadDir, doc.storedName));
});
// Optional http(s) link; blank means none.
const webLink = z
  .union([
    z.literal(""),
    z.url().max(2048).refine((v) => /^https?:\/\//i.test(v), "Use an http(s) link"),
  ])
  .default("")
  .transform((v) => v || null);
referrals.post("/", async (req, res) => {
  const body = z
    .object({
      companyId: z.uuid(),
      title: text(120),
      location: text(160),
      workMode: z.enum(["remote", "hybrid", "onsite"]).default("onsite"),
      level: z
        .enum(["entry", "mid", "senior", "lead"])
        .nullable()
        .default(null),
      minExperience: z.number().int().min(0).max(60).nullable().default(null),
      skills: text(200),
      description: z.string().trim().max(10000).default(""),
      companyLink: webLink,
      jobLink: webLink,
      requestFields: fieldDefinitions,
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
    body.workMode,
    body.level,
    body.minExperience,
    body.skills,
    body.description,
    JSON.stringify(withFieldIds(body.requestFields)),
    body.companyLink,
    body.jobLink,
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
referrals.put("/:id/share", async (req, res) => {
  const [found] = await query("SELECT id FROM referrals WHERE id=?", [
    uuid(req.params.id),
  ]);
  if (!found) throw new HttpError(404, "Referral not found");
  await query(
    "INSERT INTO referral_shares(referral_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",
    [req.params.id, req.user.id],
  );
  const [{ shares }] = await query(
    "SELECT COUNT(*) AS shares FROM referral_shares WHERE referral_id=?",
    [req.params.id],
  );
  res.json({ shares });
});
referrals.delete("/:id", async (req, res) => {
  const result = await query(referralQueries.deleteReferral, [
    uuid(req.params.id),
    req.user.id,
  ]);
  if (!result.affectedRows)
    throw new HttpError(404, "Referral not found or not owned by you");
  res.status(204).end();
});
referrals.post("/:id/requests", async (req, res) => {
  const id = uuid(req.params.id);
  const { message, answers, documents } = z
    .object({
      message: z.string().trim().max(500).default(""),
      answers: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .default({}),
      documents: z.record(z.string(), z.uuid()).default({}),
    })
    .parse(req.body ?? {});
  await transaction(async (c) => {
    const [row] = await query(referralQueries.lockReferral, [id], c);
    if (!row) throw new HttpError(404, "Referral not found");
    if (row.user_id === req.user.id)
      throw new HttpError(400, "Cannot request your own referral");
    if (row.status !== "open") throw new HttpError(409, "Referral is closed");
    const fields = parseJson(row.requestFields, []);
    const { values, files } = checkAnswers(fields, answers, documents);
    for (const documentId of Object.values(files)) {
      const [owned] = await query(
        referralQueries.findOwnedDocument,
        [documentId, req.user.id],
        c,
      );
      if (!owned) throw new HttpError(400, "Attached file was not found");
    }
    const result = await query(
      referralQueries.createRequest,
      [id, req.user.id, message || null, JSON.stringify(values)],
      c,
    );
    if (result.affectedRows)
      for (const [fieldId, documentId] of Object.entries(files))
        await query(
          referralQueries.linkDocument,
          [id, req.user.id, fieldId, documentId],
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
  const id = uuid(req.params.id);
  const [row] = await query(referralQueries.findOwner, [id]);
  if (!row || row.user_id !== req.user.id)
    throw new HttpError(404, "Referral not found");
  const [{ requestFields }] = await query(
    'SELECT request_fields AS "requestFields" FROM referrals WHERE id=?',
    [id],
  );
  const fields = parseJson(requestFields, []);
  const [requests, documents] = await Promise.all([
    query(referralQueries.listRequests({ limit, offset }), [id]),
    query(referralQueries.listRequestDocuments, [id]),
  ]);
  // Join each answer to the question the referrer asked.
  res.json(
    requests.map((request) => {
      const values = parseJson(request.answers, {});
      return {
        ...request,
        answers: fields.flatMap((field) => {
          if (field.type === "file") {
            const file = documents.find(
              (d) => d.userId === request.userId && d.fieldId === field.id,
            );
            return file
              ? [
                  {
                    label: field.label,
                    type: "file",
                    file: {
                      id: file.documentId,
                      name: file.name,
                      size: file.size,
                    },
                  },
                ]
              : [];
          }
          return values[field.id]
            ? [
                {
                  label: field.label,
                  type: field.type,
                  value: values[field.id],
                },
              ]
            : [];
        }),
      };
    }),
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
referrals.delete("/:id/requests", async (req, res) => {
  const result = await query(referralQueries.withdrawRequest, [
    uuid(req.params.id),
    req.user.id,
  ]);
  if (!result.affectedRows)
    throw new HttpError(404, "No pending request to withdraw");
  res.status(204).end();
});
// Only people who asked for this referral can say whether it helped.
referrals.put("/:id/feedback", async (req, res) => {
  const id = uuid(req.params.id);
  const { helpful } = z.object({ helpful: z.boolean() }).parse(req.body);
  const [referral] = await query(referralQueries.findOwner, [id]);
  if (!referral) throw new HttpError(404, "Referral not found");
  if (referral.user_id === req.user.id)
    throw new HttpError(400, "You cannot rate your own referral");
  const [request] = await query(referralQueries.findRequest, [id, req.user.id]);
  if (!request)
    throw new HttpError(403, "Request this referral before rating it");
  await query(referralQueries.upsertFeedback, [
    id,
    req.user.id,
    helpful ? "helpful" : "not_helpful",
  ]);
  const [totals] = await query(referralQueries.feedbackTotals, [id]);
  res.json({
    myFeedback: helpful ? "helpful" : "not_helpful",
    helpfulCount: Number(totals.helpfulCount ?? 0),
    notHelpfulCount: Number(totals.notHelpfulCount ?? 0),
  });
});
referrals.delete("/:id/feedback", async (req, res) => {
  const id = uuid(req.params.id);
  await query(referralQueries.deleteFeedback, [id, req.user.id]);
  const [totals] = await query(referralQueries.feedbackTotals, [id]);
  res.json({
    myFeedback: null,
    helpfulCount: Number(totals.helpfulCount ?? 0),
    notHelpfulCount: Number(totals.notHelpfulCount ?? 0),
  });
});
