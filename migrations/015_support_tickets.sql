-- Private support conversations, separate from public community content.
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(160) NOT NULL CHECK (char_length(trim(subject)) > 0),
  category VARCHAR(30) NOT NULL CHECK (category IN ('account','technical','referrals','safety','feedback','other')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_on_you','resolved','closed')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 10000),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_support_tickets_owner ON support_tickets(user_id, updated_at DESC, id DESC);
CREATE INDEX idx_support_tickets_queue ON support_tickets(status, updated_at DESC, id DESC);
CREATE TRIGGER support_tickets_updated BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE support_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_staff BOOLEAN NOT NULL DEFAULT FALSE,
  kind VARCHAR(10) NOT NULL DEFAULT 'reply' CHECK (kind IN ('reply','status')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at TIMESTAMP(3) NOT NULL DEFAULT utc_now()
);
CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id, created_at DESC, id DESC);
