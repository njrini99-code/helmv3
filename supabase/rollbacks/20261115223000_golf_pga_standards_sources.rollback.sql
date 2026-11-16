-- Rollback for 20261115223000_golf_pga_standards_sources.sql (SC-08).
--
-- Forward change: branch claude/project-thread-5yymil (PR #2536).
-- Drops the two columns and their constraints. Any source_url / as_of filled
-- since is lost with them, so save it first:
--   select metric_id, season, tour, source_url, as_of from public.golf_pga_standards where source_url is not null;
-- The app needs no rollback: with the column gone its rows carry no
-- source_url key and every row grades as it did before the forward file.
--
-- Run as postgres, in one transaction.
--
-- VERIFY (after): returns one row.
--   select 1 where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'golf_pga_standards' and column_name in ('source_url', 'as_of'));

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.golf_pga_standards
  DROP CONSTRAINT IF EXISTS golf_pga_standards_source_dated,
  DROP CONSTRAINT IF EXISTS golf_pga_standards_source_url_https,
  DROP COLUMN IF EXISTS as_of,
  DROP COLUMN IF EXISTS source_url;
