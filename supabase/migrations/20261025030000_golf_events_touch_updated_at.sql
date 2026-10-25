-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Apply: npm run db:apply --
-- supabase/migrations/20261025030000_golf_events_touch_updated_at.sql
-- Risk: LOW. One BEFORE UPDATE trigger that sets golf_events.updated_at to
-- now() when a row actually changes. No data is rewritten; no policy, grant
-- or publication changes.
--
-- Why: Clubhouse drag and drop (P-4, handoff 4.34.4) sends the updated_at it
-- read with every move and refuses to overwrite a row that changed since
-- (optimistic concurrency: "someone else moved it"). updateGolfEvent sets
-- updated_at by hand, but editRecurringEvent and the series promote path
-- never do, so a series edit by one coach is invisible to another coach's
-- held move, which would then silently overwrite it. A trigger makes the
-- token true for every writer, app or SQL.
--
-- The function is the existing public.touch_updated_at() (baseline
-- 20260527000000, SET search_path public, pg_temp; already used by
-- golf_global_patterns_touch). It is not SECURITY DEFINER and runs as the
-- updating role. The WHEN clause skips no-op updates, and skips the change
-- marks writer (P-14 sets helm.change_mark_writer = 'on' for its settle
-- write, which must not read as a new change). WHEN sees NEW after P-14's
-- earlier BEFORE trigger, so the setting is enough. Apply this before P-14's
-- 20261025080000.
--
-- App side: works before and after apply. Before apply the concurrency check
-- still covers moves made through updateGolfEvent.
--
-- VERIFY: SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.golf_events'::regclass AND tgname = 'golf_events_touch_updated_at' AND NOT tgisinternal AND tgenabled = 'O';
-- VERIFY: SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.golf_events'::regclass AND tgname = 'golf_events_touch_updated_at' AND pg_get_triggerdef(oid) LIKE '%helm.change_mark_writer%';
-- VERIFY: SELECT 1 FROM pg_proc WHERE proname = 'touch_updated_at' AND pronamespace = 'public'::regnamespace;
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_events_touch_updated_at ON public.golf_events;

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure('public.touch_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'public.touch_updated_at() is missing; apply the baseline first';
  END IF;
END $$;

CREATE OR REPLACE TRIGGER golf_events_touch_updated_at
  BEFORE UPDATE ON public.golf_events
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.* AND current_setting('helm.change_mark_writer', true) IS DISTINCT FROM 'on')
  EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TRIGGER golf_events_touch_updated_at ON public.golf_events IS
  'Keeps updated_at true for every writer: the concurrency token Clubhouse calendar moves compare (P-4). Skips no-op updates and the P-14 change marks settle write.';
