CREATE TABLE daily_reminders (
    id CHAR(36) NOT NULL PRIMARY KEY,
    reminder_quote VARCHAR(300) NOT NULL,
    reminder_supporting_text VARCHAR(300) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_daily_reminders_quote (reminder_quote),
    KEY idx_daily_reminders_active_order (is_active, display_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO daily_reminders (id, reminder_quote, reminder_supporting_text, display_order) VALUES
    (UUID(), 'Your worth doesn’t change when your job does.', 'One chapter closes. You’re still the author.', 1),
    (UUID(), 'A setback is a detour, not a destination.', 'The next step doesn’t have to be a big one.', 2),
    (UUID(), 'Asking for help is a strength, not a weakness.', 'Someone in this circle has been exactly where you are.', 3),
    (UUID(), 'You are more than your last job title.', 'Your skills, your story and your people go with you.', 4),
    (UUID(), 'Progress counts, even when it’s quiet.', 'One message, one application, one conversation at a time.', 5),
    (UUID(), 'Rest is part of the plan.', 'Take the pause you need, then take the next small step.', 6),
    (UUID(), 'Your next chapter is still unwritten.', 'Good things start with a connection.', 7);
