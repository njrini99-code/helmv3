-- STATUS: WRITTEN, HOLD, NOT APPLIED. Written 2026-10-23 for the rolling
-- health report (#2061, Sentry JAVASCRIPT-NEXTJS-15D). Registered in
-- supabase/migrations/HELD.md; applied by the Production rollout thread when
-- the owner lifts the migration freeze.
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261023150000_golf_prediction_perf_extended_columns.sql
-- Risk: LOW. Three nullable columns with no default on a 685-row table
-- (304 kB, 2026-10-23). No data, no index, no policy or grant change.
--
-- ORDER: no prerequisite. The writer
-- (src/lib/coachhelm/v2/analytics/prediction-performance-writer.ts,
-- rollupPredictionPerformanceRolling30d, run daily at 04:00 UTC by
-- /api/cron/coachhelm-insight-lifecycle) already sends these columns and
-- retries without them on PGRST204, so the cron completes either way. It may
-- ship before or after this apply.
--
-- WHY: the writer has sent naive_mean_absolute_error, naive_sample_count and
-- interval_coverage since #2101 (audit row 57), but no migration ever added
-- them. Every nightly run's first upsert fails with PGRST204 before the
-- fallback succeeds; the Sentry Supabase integration reports that failure as
-- JAVASCRIPT-NEXTJS-15D (19 events, 2026-10-01 to 2026-10-22), and the three
-- figures are thrown away each night.
--
-- Types: numeric with no precision. mean_absolute_error is numeric(6,2) and
-- accuracy_rate numeric(5,4), but the writer stores unrounded ratios and
-- means, and a typmod here would round them silently.
--
-- After applying: npm run db:types (the generated Row gains the three
-- columns) and resolve JAVASCRIPT-NEXTJS-15D once the next 04:00 UTC run is
-- clean.
--
-- ROLLBACK: alter table public.golf_prediction_model_performance
--   drop column if exists naive_mean_absolute_error,
--   drop column if exists naive_sample_count,
--   drop column if exists interval_coverage;
-- (loses only the three figures; the writer falls back without them.)
--
-- VERIFY: select 1 where (select count(*) from information_schema.columns
-- VERIFY: where table_schema = 'public'
-- VERIFY: and table_name = 'golf_prediction_model_performance'
-- VERIFY: and column_name in ('naive_mean_absolute_error',
-- VERIFY: 'naive_sample_count', 'interval_coverage')) = 3;

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.golf_prediction_model_performance
ADD COLUMN IF NOT EXISTS naive_mean_absolute_error numeric,
ADD COLUMN IF NOT EXISTS naive_sample_count bigint,
ADD COLUMN IF NOT EXISTS interval_coverage numeric;

COMMENT ON COLUMN public.golf_prediction_model_performance.naive_mean_absolute_error
IS 'MAE of the naive comparator (mean of the last 5 countable rounds) over the same graded predictions; read beside mean_absolute_error.';
COMMENT ON COLUMN public.golf_prediction_model_performance.naive_sample_count
IS 'Graded predictions that carried a naive comparator.';
COMMENT ON COLUMN public.golf_prediction_model_performance.interval_coverage
IS 'Share of graded predictions whose actual landed inside the stored band (0 to 1); null when none were graded.';
