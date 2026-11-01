// Only validated identifiers/pagination may be interpolated into SQL.
// User-provided search strings, IDs, and body values stay as bind parameters.
export function assertPagination(limit, offset) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new TypeError("Invalid query pagination");
}
export function assertTable(table, allowed) {
  if (!allowed.includes(table)) throw new TypeError("Unsupported query table");
}
export function assertColumns(columns) {
  if (
    !Array.isArray(columns) ||
    !columns.length ||
    columns.some((column) => !/^[a-z_]+$/.test(column))
  )
    throw new TypeError("Invalid query columns");
}
// Escapes LIKE wildcards so a search term is matched literally.
export function escapeLike(term) {
  return String(term).replace(/[\\%_]/g, "\\$&");
}
