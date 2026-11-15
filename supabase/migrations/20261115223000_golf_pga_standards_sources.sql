-- Tour benchmarks: a row grades a figure only when it names the page its value
-- comes from (SC-08).
-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md). No migration prerequisite.
--
-- WHAT IS WRONG TODAY. Clubhouse grades par 3, 4 and 5 scoring, sand saves,
-- greens and the putting bands against golf_pga_standards.pga_tour_value, but
-- no row cites a page: the `source` text points into the research doc, reads
-- "~", or on LPGA rows says the PGA estimate is reused. A grade against an
-- unsourced number reads as a fact it is not.
--
-- WHAT CHANGES. Two nullable columns: source_url (an https page that publishes
-- the value) and as_of (the date the value was read from it). A row with a
-- source_url must carry its as_of. No row is filled here: none of the 2024 rows
-- cites a page today, and a URL is not invented in a migration.
--
-- WHAT MOVES. Nothing in the database. The app (same PR,
-- src/clubhouse/data/stats-common.ts readTourStandards) grades a figure only
-- when its row's source_url is set; before this file is applied the column is
-- missing and every row grades as it does today. Once applied, every Tour
-- grade in Clubhouse (Stats, Home, CoachHelm) is withdrawn and the figures stay,
-- until rows are filled from cited Tour pages. The standing refresh functions,
-- the leak maps and team intelligence read the table as before.
--
-- FILLING A ROW (owner's data step, one statement a row):
--   UPDATE public.golf_pga_standards
--   SET pga_tour_value = <the page's value>, source_url = 'https://...',
--       as_of = '<date read>', source = '<site, stat name, season>', updated_at = now()
--   WHERE metric_id = '<id>' AND season = '<season>' AND tour = '<pga|lpga>';
--
-- ROLLBACK: supabase/rollbacks/20261115223000_golf_pga_standards_sources.rollback.sql
-- (drops the two columns; save any filled source_url / as_of first).
-- VERIFY: select 1 where (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'golf_pga_standards' and column_name in ('source_url', 'as_of')) = 2;
-- VERIFY: select 1 where (select count(*) from pg_constraint where conrelid = 'public.golf_pga_standards'::regclass and conname in ('golf_pga_standards_source_url_https', 'golf_pga_standards_source_dated')) = 2;

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.golf_pga_standards
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS as_of date;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.golf_pga_standards'::regclass AND conname = 'golf_pga_standards_source_url_https') THEN
    ALTER TABLE public.golf_pga_standards
      ADD CONSTRAINT golf_pga_standards_source_url_https CHECK (source_url IS NULL OR source_url ~ '^https://[^[:space:]]+$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.golf_pga_standards'::regclass AND conname = 'golf_pga_standards_source_dated') THEN
    ALTER TABLE public.golf_pga_standards
      ADD CONSTRAINT golf_pga_standards_source_dated CHECK (source_url IS NULL OR as_of IS NOT NULL);
  END IF;
END
$constraints$;

COMMENT ON COLUMN public.golf_pga_standards.source_url IS 'The https page that publishes pga_tour_value (SC-08). Clubhouse grades a figure against this row only when it is set; a row without one shows the figure with no Tour grade.';
COMMENT ON COLUMN public.golf_pga_standards.as_of IS 'The date pga_tour_value was read from source_url. Required whenever source_url is set.';
