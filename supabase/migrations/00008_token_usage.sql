ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_token_usage JSONB;

COMMENT ON COLUMN tickets.ai_token_usage IS 'Almacena el conteo de tokens usados por Gemini (prompt, output, total) para cada llamada del pipeline de agentes.';
