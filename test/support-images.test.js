import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  normalizeSupportImage,
  supportImageStore,
} from "../src/services/support-images.js";

test("support screenshots are decoded and normalized to WebP", async () => {
  const buffer = await sharp({
    create: { width: 12, height: 8, channels: 3, background: "#3159df" },
  })
    .png()
    .toBuffer();
  const image = await normalizeSupportImage({ buffer, size: buffer.length });
  assert.equal(image.info.format, "webp");
  assert.equal(image.info.width, 12);
  assert.equal(image.info.height, 8);
  assert.equal((await sharp(image.data).metadata()).format, "webp");
});
test("invalid images and SVG content are rejected", async () => {
  for (const buffer of [
    Buffer.from("not an image"),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" /></svg>',
    ),
  ]) {
    await assert.rejects(
      () => normalizeSupportImage({ buffer, size: buffer.length }),
      (error) => error.status === 400,
    );
  }
});
test("oversized uploads and a sixth image are rejected before disk writes", async () => {
  await assert.rejects(
    () =>
      normalizeSupportImage({
        buffer: Buffer.alloc(0),
        size: 5 * 1024 * 1024 + 1,
      }),
    (error) => error.status === 413,
  );
  await assert.rejects(
    () => supportImageStore.save(Array(6).fill({})),
    (error) => error.status === 400,
  );
});
test("private image paths only accept generated WebP filenames", () => {
  assert.throws(
    () => supportImageStore.path("../../uploads/public.webp"),
    (error) => error.status === 404,
  );
  assert.throws(
    () => supportImageStore.path("image.svg"),
    (error) => error.status === 404,
  );
});
