// Placeholders are generated from a validated count; ids stay bind parameters.
export const postImageQueries = {
  addImage:
    "INSERT INTO post_images(post_id,upload_id,display_position) VALUES(?,?,?)",
  findOwnedUploads: ({ count }) => {
    if (!Number.isInteger(count) || count < 1 || count > 6)
      throw new TypeError("Invalid upload count");
    return `SELECT id FROM uploads WHERE user_id=? AND id IN (${Array(count).fill("?").join(",")})`;
  },
  listImages: ({ count }) => {
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw new TypeError("Invalid post count");
    return `SELECT pi.post_id AS "postId",u.stored_file_name AS file FROM post_images pi JOIN uploads u ON u.id=pi.upload_id WHERE pi.post_id IN (${Array(count).fill("?").join(",")}) ORDER BY pi.post_id,pi.display_position`;
  },
};
