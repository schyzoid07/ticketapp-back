ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.blocked IS 'Indica si un agente está bloqueado para tomar/responder tickets';
