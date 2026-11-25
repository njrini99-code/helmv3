-- Rollback for 20261115211000_golf_demo_generator.sql (demo team generator, DD-01).
--
-- Every object the migration creates is new: there is no prior definition to
-- restore. Run as postgres, in one transaction (db query --linked does that).
--
-- What rolling back costs: the generator can no longer write (the cron and
-- scripts/seed/golf-demo-refresh.ts stop at golf_demo_begin with "plumbing
-- missing"). Rows it already wrote stay on the demo team; the ledger that
-- marks them as generated goes, so a later re-apply treats them as not its own
-- and skips them. Save the ledger first if the generator will come back:
--
--   create table helm_private.golf_demo_ledger_saved as
--     select * from helm_private.golf_demo_ledger;
--
-- Rows the generator wrote, per table (run before rolling back):
--
--   select table_name, count(*) from helm_private.golf_demo_ledger
--    group by 1 order by 1;

SET LOCAL lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.golf_demo_finish_rounds(uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.golf_demo_remove(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.golf_demo_apply(uuid, text, jsonb, integer);
DROP FUNCTION IF EXISTS public.golf_demo_begin(uuid, boolean);
DROP FUNCTION IF EXISTS helm_private.golf_demo_marks(text);
DROP FUNCTION IF EXISTS helm_private.golf_demo_check(uuid, text);
DROP FUNCTION IF EXISTS helm_private.golf_demo_key_sql(text, text);
DROP FUNCTION IF EXISTS helm_private.golf_demo_pk(text);
DROP FUNCTION IF EXISTS helm_private.golf_demo_parent(text);
DROP FUNCTION IF EXISTS helm_private.golf_demo_tables();
DROP TABLE IF EXISTS helm_private.golf_demo_ledger;

-- The demo write guard (20261115211100) calls golf_demo_team_id(): drop it
-- only when that migration is not applied (or was rolled back first).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'helm_private' AND p.proname = 'golf_demo_write_guard'
  ) THEN
    DROP FUNCTION IF EXISTS helm_private.golf_demo_team_id();
  END IF;
END
$$;

-- VERIFY: no generator function is left.
--   select count(*) = 0 from pg_catalog.pg_proc
--    where proname in ('golf_demo_begin', 'golf_demo_apply', 'golf_demo_remove', 'golf_demo_finish_rounds');
