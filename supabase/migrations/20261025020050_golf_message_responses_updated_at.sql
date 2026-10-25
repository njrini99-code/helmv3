-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). RECOMMENDED.
-- Apply: npm run db:apply --
-- supabase/migrations/20261025020050_golf_message_responses_updated_at.sql
-- Risk: LOW. Adds one BEFORE INSERT OR UPDATE trigger on
-- golf_message_responses that sets updated_at to the database clock; no data
-- changes to existing rows.
--
-- Why: golf_message_responses.updated_at is written by the client (the poll
-- vote upsert), so it is the voter's device clock, which can be wrong or
-- hand-set. Clubhouse polls (P-2, D29) show no vote times in See votes until
-- the time is the server's. This uses the existing public.touch_updated_at()
-- (golf_global_patterns_touch uses it too). Kept out of 20261025020000, which
-- is the PR's reviewed file.
-- Order: after 20261024090000 on any fresh database (the table as production
-- has it); on production either order. Independent of 20261025020100.
-- Desired schema: supabase/schemas/triggers/golf.sql.
--
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname = 'golf_message_responses_touch' and tgrelid = 'public.golf_message_responses'::regclass and tgfoid = 'public.touch_updated_at()'::regprocedure and not tgisinternal);
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_message_responses_touch ON public.golf_message_responses;

SET lock_timeout = '3s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'golf_message_responses_touch'
      AND tgrelid = 'public.golf_message_responses'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER golf_message_responses_touch
      BEFORE INSERT OR UPDATE ON public.golf_message_responses
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END;
$$;
