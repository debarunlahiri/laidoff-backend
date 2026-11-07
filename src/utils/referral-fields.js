import { z } from "zod";
import { HttpError } from "./http.js";

// What a referrer can ask for when someone requests a referral.
export const fieldTypes = [
  "text",
  "textarea",
  "url",
  "number",
  "select",
  "file",
];
export const fieldDefinitions = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(80),
      type: z.enum(fieldTypes),
      required: z.boolean().default(true),
      options: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    }),
  )
  .max(8)
  .default([])
  .superRefine((fields, ctx) => {
    fields.forEach((field, index) => {
      if (field.type === "select" && field.options.length < 2)
        ctx.addIssue({
          code: "custom",
          path: [index, "options"],
          message: `"${field.label}" needs at least two options`,
        });
    });
  });

// Ids are positional so a stored answer always lines up with its question.
export function withFieldIds(fields) {
  return fields.map((field, index) => ({
    id: `f${index + 1}`,
    ...field,
    options: field.type === "select" ? field.options : [],
  }));
}

export function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Checks a requester's answers against the fields the referrer asked for.
// Returns the plain answers plus the document ids chosen for file fields.
export function checkAnswers(fields, answers, documents) {
  const values = {};
  const files = {};
  for (const field of fields) {
    if (field.type === "file") {
      const documentId = documents?.[field.id];
      if (documentId) files[field.id] = documentId;
      else if (field.required)
        throw new HttpError(400, `Attach a file for "${field.label}"`);
      continue;
    }
    const raw = answers?.[field.id];
    const value =
      typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
    if (!value) {
      if (field.required)
        throw new HttpError(400, `"${field.label}" is required`);
      continue;
    }
    const limit = field.type === "textarea" ? 1500 : 300;
    if (value.length > limit)
      throw new HttpError(400, `"${field.label}" is too long`);
    if (field.type === "url" && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(value))
      throw new HttpError(
        400,
        `"${field.label}" must be a web address starting with http`,
      );
    if (field.type === "number" && !Number.isFinite(Number(value)))
      throw new HttpError(400, `"${field.label}" must be a number`);
    if (field.type === "select" && !field.options.includes(value))
      throw new HttpError(
        400,
        `Choose one of the options for "${field.label}"`,
      );
    values[field.id] = value;
  }
  return { values, files };
}
