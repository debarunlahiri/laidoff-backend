const imageColumns = (alias) =>
  `jsonb_build_object('id', ${alias}.id, 'name', ${alias}.original_file_name, 'size', ${alias}.size_bytes, 'width', ${alias}.width, 'height', ${alias}.height)`;
const ticketColumns = `t.id, t.user_id AS "userId", t.subject, t.category, t.priority,
  t.status, t.description,
  COALESCE((SELECT jsonb_agg(${imageColumns("i")} ORDER BY i.position) FROM support_images i WHERE i.ticket_id=t.id AND i.message_id IS NULL), '[]'::jsonb) AS images,
  t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;

export const supportQueries = {
  list: ({
    admin,
  }) => `SELECT ${ticketColumns}${admin ? ', u.full_name AS "requesterName", u.email AS "requesterEmail"' : ""}
    FROM support_tickets t ${admin ? "JOIN users u ON u.id=t.user_id" : ""}
    WHERE (?::uuid IS NULL OR t.user_id=?::uuid) AND (?::text IS NULL OR t.status=?)
    ORDER BY t.updated_at DESC, t.id DESC LIMIT ? OFFSET ?`,
  count: `SELECT count(*) AS total FROM support_tickets t
    WHERE (?::uuid IS NULL OR t.user_id=?::uuid) AND (?::text IS NULL OR t.status=?)`,
  find: ({
    admin,
    lock = false,
  }) => `SELECT ${ticketColumns}${admin ? ', u.full_name AS "requesterName", u.email AS "requesterEmail"' : ""}
    FROM support_tickets t ${admin ? "JOIN users u ON u.id=t.user_id" : ""}
    WHERE t.id=? AND (?::uuid IS NULL OR t.user_id=?::uuid) ${lock ? "FOR UPDATE OF t" : ""}`,
  create: `INSERT INTO support_tickets(id,user_id,subject,category,priority,description)
    VALUES(?,?,?,?,?,?)`,
  messages: `SELECT m.id, m.ticket_id AS "ticketId", m.user_id AS "userId",
    m.is_staff AS "isStaff", m.kind, m.body, m.created_at AS "createdAt",
    COALESCE(u.full_name, 'Former member') AS "authorName",
    COALESCE((SELECT jsonb_agg(${imageColumns("i")} ORDER BY i.position) FROM support_images i WHERE i.message_id=m.id), '[]'::jsonb) AS images
    FROM support_messages m LEFT JOIN users u ON u.id=m.user_id
    WHERE m.ticket_id=? ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
  addMessage: `INSERT INTO support_messages(id,ticket_id,user_id,is_staff,kind,body)
    VALUES(?,?,?,?,?,?)`,
  addImage: `INSERT INTO support_images(id,ticket_id,message_id,stored_file_name,original_file_name,size_bytes,width,height,position) VALUES(?,?,?,?,?,?,?,?,?)`,
  findImage: `SELECT stored_file_name AS "storedName" FROM support_images WHERE id=? AND ticket_id=?`,
  updateStatus: `UPDATE support_tickets SET status=?, updated_at=utc_now() WHERE id=?`,
};
