import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config/config.js";
import { HttpError } from "../utils/http.js";

export const maxSupportImages = 5;
export const supportImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: maxSupportImages,
    // Busboy reports a limit at equality; normalizeSupportImage enforces 5 MB.
    fileSize: 5 * 1024 * 1024 + 1,
    fields: 4,
    fieldSize: 40000,
    // Four fields + five files, with room for Busboy's closing boundary count.
    parts: 10,
  },
}).array("images", maxSupportImages);
const directory = path.join(config.privateUploadDir, "support");

// Decode and re-encode rather than trusting a filename or declared MIME type.
export async function normalizeSupportImage(file) {
  if (file.size > 5 * 1024 * 1024)
    throw new HttpError(413, "Each image must be 5 MB or smaller.");
  let result;
  try {
    const image = sharp(file.buffer, { limitInputPixels: 25000000 });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp", "gif"].includes(metadata.format))
      throw new Error("Unsupported format");
    result = await image
      .rotate()
      .resize({
        width: 2560,
        height: 2560,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new HttpError(
      400,
      "Use valid JPG, PNG, WebP, or GIF images, up to 5 MB each.",
    );
  }
  return result;
}

export const supportImageStore = {
  path(storedName) {
    if (!/^[0-9a-f-]{36}\.webp$/.test(storedName))
      throw new HttpError(404, "Image not found");
    return path.join(directory, storedName);
  },
  async remove(images) {
    await Promise.all(
      images.map((image) =>
        unlink(path.join(directory, image.storedName)).catch(() => {}),
      ),
    );
  },
  async save(files) {
    if (!files.length) return [];
    if (files.length > maxSupportImages)
      throw new HttpError(400, "Attach up to 5 images.");
    const saved = [];
    try {
      await mkdir(directory, { recursive: true });
      for (const file of files) {
        const result = await normalizeSupportImage(file);
        const id = randomUUID();
        const image = {
          id,
          storedName: `${id}.webp`,
          name: file.originalname.slice(0, 255),
          size: result.info.size,
          width: result.info.width,
          height: result.info.height,
        };
        saved.push(image);
        await writeFile(path.join(directory, image.storedName), result.data, {
          flag: "wx",
          mode: 0o600,
        });
      }
      return saved;
    } catch (error) {
      await supportImageStore.remove(saved);
      throw error;
    }
  },
};
