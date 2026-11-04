-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: The builder refreshes when another coach saves (golf_practice_plans),
--   and a player's open plan page refreshes when a new live version appears
--   (golf_practice_plan_versions). Realtime applies each table's RLS, so
--   players receive only live versions and never drafts. Lines and opens are
--   not published.
-- WHO: n/a (publication membership).
-- ORDER: After 20261026010000.
-- RISK: Low (RLS applies to realtime).
-- ROLLBACK: ALTER PUBLICATION supabase_realtime DROP TABLE
--   public.golf_practice_plan_versions; ALTER PUBLICATION supabase_realtime
--   DROP TABLE public.golf_practice_plans;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_publication_tables WHERE pubname =
-- VERIFY: 'supabase_realtime' AND schemaname = 'public' AND tablename IN
-- VERIFY: ('golf_practice_plans', 'golf_practice_plan_versions') HAVING
-- VERIFY: count(*) = 2;

SET lock_timeout = '3s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'golf_practice_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_practice_plans;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'golf_practice_plan_versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime
        ADD TABLE public.golf_practice_plan_versions;
  END IF;
END;
$$;
