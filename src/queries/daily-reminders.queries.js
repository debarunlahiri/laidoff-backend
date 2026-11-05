export const dailyReminderQueries = {
  listActive:
    'SELECT id,reminder_quote AS quote,reminder_supporting_text AS "supportingText" FROM daily_reminders WHERE is_active ORDER BY display_order,id',
};
