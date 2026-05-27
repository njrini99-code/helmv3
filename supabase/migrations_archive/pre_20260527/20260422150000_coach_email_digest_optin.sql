-- 20260422150000_coach_email_digest_optin.sql
--
-- Wave 1C — daily coach morning digest email.
-- Adds a per-coach opt-in flag to `golf_coach_philosophy` so the 06:30 UTC
-- digest cron (`/api/cron/coach-morning-digest`) can skip coaches who have
-- explicitly opted out. Defaults to `true` so the feature lights up for the
-- existing coaching base without a backfill.

ALTER TABLE public.golf_coach_philosophy
  ADD COLUMN IF NOT EXISTS email_digest_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.golf_coach_philosophy.email_digest_enabled IS
  'Coach opt-in for daily 06:30 UTC morning digest email of top insights.';
