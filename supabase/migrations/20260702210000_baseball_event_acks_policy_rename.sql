-- Renames the 4 baseball_event_acknowledgements policies restored by
-- 20260702100100_baseball_event_acks_policy_restore.sql (already applied to
-- prod; not touched here) from the legacy "baseball_event_acks_*" naming to
-- the "baseball_event_acknowledgements_*" convention that every other Wave 1+
-- RLS suite uses -- which is what
-- supabase/tests/rls/baseball_event_acknowledgements.sql actually asserts
-- against (it looks up policies by the *_acknowledgements_* names, not
-- *_acks_*).
--
-- Rename only -- policy bodies (USING / WITH CHECK) are untouched, so this
-- does not change who can read/write what.
--
-- Idempotent both ways:
--   - legacy name present  -> rename it (first run, or replaying on a fresh DB
--     where migrations up through 20260702100100 already ran).
--   - canonical name already present, legacy name gone -> no-op (re-run, or
--     this migration already applied).
--   - neither name present -> fail loudly. Something dropped the policy
--     entirely and the table would otherwise sit RLS-enabled with zero
--     policies for that command (locked out, not just misnamed).

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.baseball_event_acknowledgements') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('select', 'baseball_event_acks_select', 'baseball_event_acknowledgements_select'),
      ('insert', 'baseball_event_acks_insert', 'baseball_event_acknowledgements_insert'),
      ('update', 'baseball_event_acks_update', 'baseball_event_acknowledgements_update'),
      ('delete', 'baseball_event_acks_delete', 'baseball_event_acknowledgements_delete')
    ) AS t(cmd, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'baseball_event_acknowledgements'
        AND policyname = r.old_name
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.baseball_event_acknowledgements RENAME TO %I',
        r.old_name, r.new_name
      );
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'baseball_event_acknowledgements'
        AND policyname = r.new_name
    ) THEN
      RAISE EXCEPTION
        'baseball_event_acknowledgements: neither % nor % policy exists'
        ' for % -- table has no policy for this command',
        r.old_name, r.new_name, r.cmd;
    END IF;
  END LOOP;
END $$;

-- Rollback: rename baseball_event_acknowledgements_{select,insert,update,
-- delete} back to baseball_event_acks_{select,insert,update,delete} (not
-- recommended -- that's the state
-- supabase/tests/rls/baseball_event_acknowledgements.sql fails against; file
-- a new fix instead of rolling back).
