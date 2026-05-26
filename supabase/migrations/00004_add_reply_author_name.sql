-- Add author_name to ticket_replies for tracking which agent responded
ALTER TABLE ticket_replies ADD COLUMN author_name TEXT;

-- Add assigned_to tracking for ticket resolution
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id);
