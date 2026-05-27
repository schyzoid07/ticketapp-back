ALTER TABLE companies ADD COLUMN IF NOT EXISTS webhook_url TEXT;

COMMENT ON COLUMN companies.webhook_url IS 'URL del webhook de salida para notificar cuando un ticket es resuelto. La empresa configura esta URL en /profile.';
