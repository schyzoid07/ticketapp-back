ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_mode TEXT NOT NULL DEFAULT 'minimal';

COMMENT ON COLUMN tickets.ai_mode IS 'Modo de IA del ticket: minimal (solo TriageAgent) o complete (pipeline completo Triage+Context+Response)';
