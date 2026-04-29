-- ============================================================================
-- Migration: 20260428T5_email_status_enum.sql
-- Purpose: Promote crm_coaches.email_status from TEXT+CHECK to a real ENUM
--          and add the 'unsubscribed' value. Webhook code at
--          src/app/api/webhooks/resend/route.ts writes plain strings; Postgres
--          coerces those to the enum automatically as long as the value is in
--          the allowed list — no webhook code change is needed beyond T7's
--          unsubscribed event addition.
--
-- Risk: ACCESS EXCLUSIVE lock during the swap. crm_coaches is small (<10k rows)
-- so the operation is sub-second; Resend webhooks retry on transient locks.
-- ============================================================================

CREATE TYPE email_status AS ENUM ('valid','bounced','complained','unknown','unsubscribed');

BEGIN;
  LOCK TABLE crm_coaches IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE crm_coaches
    ADD COLUMN email_status_new email_status NOT NULL DEFAULT 'valid';

  UPDATE crm_coaches
    SET email_status_new = email_status::email_status;

  ALTER TABLE crm_coaches DROP CONSTRAINT IF EXISTS crm_coaches_email_status_check;
  ALTER TABLE crm_coaches ALTER COLUMN email_status DROP DEFAULT;
  ALTER TABLE crm_coaches DROP COLUMN email_status;
  ALTER TABLE crm_coaches RENAME COLUMN email_status_new TO email_status;
  ALTER TABLE crm_coaches ALTER COLUMN email_status SET DEFAULT 'valid'::email_status;
COMMIT;
