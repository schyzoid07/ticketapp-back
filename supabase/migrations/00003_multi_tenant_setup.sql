-- Add slug column to companies for public landing pages
ALTER TABLE companies ADD COLUMN slug TEXT UNIQUE;

-- Add email column to tickets for client contact
ALTER TABLE tickets ADD COLUMN email TEXT;

-- Enable Row Level Security on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;

-- Companies: publicly readable (needed for slug lookup), but only authenticated members can manage
CREATE POLICY "Companies are publicly readable"
  ON companies FOR SELECT
  USING (true);

-- Users: only visible within the same company
CREATE POLICY "Users are visible within same company"
  ON users FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Tickets: agents see only their company tickets; anyone can insert (public form)
CREATE POLICY "Anyone can insert tickets"
  ON tickets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Agents can view their company tickets"
  ON tickets FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Agents can update their company tickets"
  ON tickets FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Ticket replies: agents manage replies for their company's tickets
CREATE POLICY "Agents can view replies for their company tickets"
  ON ticket_replies FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Agents can insert replies for their company tickets"
  ON ticket_replies FOR INSERT
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM tickets WHERE company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Update demo company with a slug
UPDATE companies SET slug = 'demo' WHERE id = '00000000-0000-0000-0000-000000000000';
