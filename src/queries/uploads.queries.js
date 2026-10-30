export const uploadQueries = {
  createUpload:
    "INSERT INTO uploads(id,user_id,stored_file_name,original_file_name,mime_type,file_size_bytes,image_width_pixels,image_height_pixels,sha256_checksum) VALUES(?,?,?,?,?,?,?,?,?)",
};
