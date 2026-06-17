-- crm_contact_log.metadata — structured send context (jsonb).
-- The sequence cron (src/app/api/cron/process-sequences/route.ts) already WRITES
-- this column (sequence_id / enrollment_id / step) and COUNTS its daily cap from
-- it (`metadata->>sequence_id`). The column never existed, so those statements
-- were a latent runtime failure that only stayed dormant because the cron was
-- never registered. Add it so the sequence sender is correct whenever it runs,
-- and so the bulk send route can attribute campaign/template for analytics.
ALTER TABLE crm_contact_log ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Partial index for the cron's daily-cap count (rows tagged with a sequence_id).
CREATE INDEX IF NOT EXISTS idx_crm_contact_log_metadata_sequence
  ON crm_contact_log ((metadata->>'sequence_id'))
  WHERE metadata->>'sequence_id' IS NOT NULL;
