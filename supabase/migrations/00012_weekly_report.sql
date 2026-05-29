ALTER TABLE companies ADD COLUMN IF NOT EXISTS weekly_report JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN companies.weekly_report IS 'Config del reporte semanal: { "enabled": bool, "recipients": ["email1", "email2"] }';
