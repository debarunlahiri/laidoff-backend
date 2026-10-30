import { uploadQueries } from "../queries/uploads.queries.js";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "../http.js";
export const uploads = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
});
uploads.post("/", upload.single("photo"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Attach a photo");
  const id = randomUUID();
  const filename = `${id}.webp`;
  await mkdir(config.uploadDir, { recursive: true });
  const target = path.join(config.uploadDir, filename);
  let storedImage;
  try {
    const image = sharp(req.file.buffer, { limitInputPixels: 25000000 });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
      throw new Error("Unsupported image format");
    }
    storedImage = await image
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toFile(target);
  } catch {
    await unlink(target).catch(() => {});
    throw new HttpError(400, "Invalid or oversized image");
  }
  try {
    await query(uploadQueries.createUpload, [
      id,
      req.user.id,
      filename,
      req.file.originalname.slice(0, 255),
      "image/webp",
      storedImage.size,
      storedImage.width,
      storedImage.height,
      createHash("sha256")
        .update(await readFile(target))
        .digest("hex"),
    ]);
  } catch (error) {
    await unlink(target).catch(() => {});
    throw error;
  }
  res.status(201).json({ id, url: `/uploads/${filename}` });
});
