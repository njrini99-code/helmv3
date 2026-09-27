-- OD-03 follow-up (GolfHelm UI/UX baseline, 2026-09-27): the is_test hide
-- flag on four team-content tables.
--
-- Why. 20260924130000_golf_is_test_flag.sql (applied 2026-09-27) put the
-- flag on golf_rounds, golf_teams, golf_players and golf_qualifiers. The
-- demo team also carries one QA announcement, task, document and trip that
-- show on the Team screens; those tables had no flag, so the rows could not
-- be hidden. Owner decision 2026-09-27: add the column in a follow-up that
-- is reviewed and merged first, then applied; the list reads filter on it
-- in a later change, after the apply.
--
-- What. Additive only, same shape as 20260924130000: one NOT NULL boolean,
-- default false. Every existing row reads false, so nothing changes until
-- rows are flagged AND the reads filter on it. No RLS change: no policy
-- reads the column. ADD COLUMN with a constant default is catalog-only (no
-- table rewrite), and the update_*_updated_at triggers fire on UPDATE, not
-- on ALTER. No partial index (unlike 20260924130000): these tables hold tens
-- of rows.
--
-- Order. Apply before any code that filters on the column is deployed: the
-- app reads production, and a filter on a missing column fails the query.
--
-- ROLLBACK: drop the four columns (no data depends on them):
-- ROLLBACK:   ALTER TABLE public.golf_announcements DROP COLUMN is_test;
-- ROLLBACK:   ALTER TABLE public.golf_tasks DROP COLUMN is_test;
-- ROLLBACK:   ALTER TABLE public.golf_documents DROP COLUMN is_test;
-- ROLLBACK:   ALTER TABLE public.golf_travel_itineraries DROP COLUMN is_test;
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public' and column_name = 'is_test'
-- VERIFY:    and table_name in ('golf_announcements', 'golf_tasks',
-- VERIFY:                       'golf_documents', 'golf_travel_itineraries')
-- VERIFY: having count(*) = 4;

ALTER TABLE public.golf_announcements
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.golf_tasks
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.golf_documents
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.golf_travel_itineraries
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.golf_announcements.is_test IS
'QA/demo row: hidden from team reads (OD-03).';
COMMENT ON COLUMN public.golf_tasks.is_test IS
'QA/demo row: hidden from team reads (OD-03).';
COMMENT ON COLUMN public.golf_documents.is_test IS
'QA/demo row: hidden from team reads (OD-03).';
COMMENT ON COLUMN public.golf_travel_itineraries.is_test IS
'QA/demo row: hidden from team reads (OD-03).';
