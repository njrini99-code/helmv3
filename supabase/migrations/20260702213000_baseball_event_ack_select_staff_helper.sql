-- ============================================================================
-- baseball_event_acknowledgements: SELECT staff branch moves to the canonical
-- is_baseball_team_staff helper (from the legacy is_baseball_team_coach_v2).
--
-- WHY: 20260702100100 restored the pre-incident policy bodies VERBATIM to fix
-- the 0-policies lockout, which resurrected the OLD staff-read gate
-- (is_baseball_team_coach_v2). The canonical helper for staff-scoped reads is
-- public.is_baseball_team_staff (hardened 20260630230000: active-status
-- filtering — suspended/removed/invited staff lose access — plus SECURITY
-- DEFINER + pinned search_path + anon-revoked EXECUTE). The pgTAP security
-- contract (supabase/tests/rls/baseball_event_acknowledgements.sql) asserts
-- the staff helper by name; 22 sibling migrations use it. This migration runs
-- AFTER 20260702210000's rename, so it targets the full-word policy name.
--
-- SEMANTICS: own-rows branch unchanged; staff branch still resolves the team
-- via baseball_events. Net access change vs the restored body: staff records
-- with status suspended/removed/invited no longer read team acknowledgements
-- (they shouldn't); active non-coach staff gain read (they should — same
-- model as every other staff-readable baseball table).
--
-- SAFETY CONTRACT: policy DDL only; no grants; no table/function changes.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'baseball_event_acknowledgements'
      AND policyname = 'baseball_event_acknowledgements_select'
  ) THEN
    EXECUTE 'DROP POLICY "baseball_event_acknowledgements_select" ON public.baseball_event_acknowledgements';
  ELSE
    RAISE EXCEPTION 'expected policy baseball_event_acknowledgements_select missing — run 20260702210000 rename first';
  END IF;

  EXECUTE $p$CREATE POLICY "baseball_event_acknowledgements_select" ON public.baseball_event_acknowledgements
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.baseball_events e
        WHERE e.id = baseball_event_acknowledgements.event_id
          AND public.is_baseball_team_staff(e.team_id)
      )
    )$p$;
END $$;
