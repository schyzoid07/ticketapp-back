ALTER TABLE companies ADD COLUMN IF NOT EXISTS alerts JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN companies.alerts IS 'Config de alertas en tiempo real: { "email_enabled": bool, "email_recipients": ["a@b.com"], "telegram_token": "", "telegram_chat_id": "" }';
