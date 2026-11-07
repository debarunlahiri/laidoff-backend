import { query } from "../db/db.js";
import { postImageQueries } from "../queries/post-images.queries.js";

// Adds `images` (ordered /uploads paths) and a first-image `image` to feed rows.
export async function attachPostImages(rows) {
  if (!rows.length) return rows;
  const images = await query(
    postImageQueries.listImages({ count: rows.length }),
    rows.map((row) => row.id),
  );
  const byPost = new Map();
  for (const { postId, file } of images) {
    if (!byPost.has(postId)) byPost.set(postId, []);
    byPost.get(postId).push(`/uploads/${file}`);
  }
  return rows.map((row) => {
    const list =
      byPost.get(row.id) ?? (row.image ? [`/uploads/${row.image}`] : []);
    return { ...row, images: list, image: list[0] ?? null };
  });
}
