ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- El status ahora acepta IN_PROGRESS ademas de PENDING_TRIAGE, OPEN, RESOLVED, CLOSED
-- Como la columna es TEXT no requiere ALTER TABLE para el nuevo valor
