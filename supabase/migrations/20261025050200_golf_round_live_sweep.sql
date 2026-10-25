-- DECLARATIVE: exempt a pg_cron job (cron.schedule) is not expressible in the declarative schema
-- 20261025050200_golf_round_live_sweep.sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see supabase/migrations/HELD.md). Owner applies. Written 2026-10-25 for Clubhouse P-6 (handoff 4.34.6).
-- Apply: npm run db:apply -- supabase/migrations/20261025050200_golf_round_live_sweep.sql
-- Purpose: P-6 retention. Every 15 minutes, delete live rows 18 hours after the round ended, and rows not heard from for 36 hours.
-- Risk: LOW. Deletes only from golf_round_live (derived data; the round itself is untouched). Skips with a NOTICE where pg_cron is not installed (the VERIFY lines then fail on purpose: nothing was scheduled).
-- ORDER: after 20261025050000.
-- VERIFY: select 1 where (select count(*) from cron.job where jobname = 'golf-round-live-sweep') = 1;
-- VERIFY: select 1 where not exists (select 1 from public.golf_round_live where heard_at < now() - interval '37 hours');
-- ROLLBACK: select cron.unschedule('golf-round-live-sweep');

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regclass('public.golf_round_live') IS NULL THEN
    RAISE EXCEPTION 'apply 20261025050000 first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed here; golf-round-live-sweep not scheduled';
    RETURN;
  END IF;
  -- cron.schedule upserts by job name, so a re-apply replaces the job instead of adding a second one.
  PERFORM cron.schedule(
    'golf-round-live-sweep',
    '*/15 * * * *',
    $job$DELETE FROM public.golf_round_live
          WHERE (ended_at IS NOT NULL AND ended_at < now() - interval '18 hours')
             OR heard_at < now() - interval '36 hours'$job$
  );
END $$;
