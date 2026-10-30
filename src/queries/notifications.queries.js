export const notificationQueries = {
  createNotification:
    "INSERT INTO notifications(id,user_id,actor_id,notification_type,resource_id,notification_message) VALUES(?,?,?,?,?,?)",
};
