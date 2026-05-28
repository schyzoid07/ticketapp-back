ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basic';

COMMENT ON COLUMN companies.plan IS 'Plan de suscripción de la empresa: basic (solo Minimal AI) o complete (Minimal + Complete AI)';
