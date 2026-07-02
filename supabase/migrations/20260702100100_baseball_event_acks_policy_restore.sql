-- baseball_event_acknowledgements is currently LOCKED OUT in prod: RLS is
-- enabled with ZERO policies (verified live via pg_policies, 2026-07-02).
--
-- Root cause: 20260624000050_baseball_rls_helpers_and_policies.sql created 4
-- policies named baseball_event_acks_select/insert/update/delete. The later
-- 20260630165403_normalize_baseball_event_ack_policies.sql DROPped exactly
-- those same 4 policy names, on the mistaken assumption (stated in its own
-- comment) that a differently-named "baseball_event_acknowledgements_*" set
-- from the same source migration would remain as the surviving canonical
-- policies -- but 20260624000050 never created any policy under that other
-- name (it only ever created baseball_event_acks_*, and DROPped that same
-- alternate name defensively in case an even earlier migration had used it).
-- Net effect: the DROP ran, nothing recreated anything, table has 0 policies.
--
-- This migration restores the original, correct baseball_event_acks_*
-- definitions verbatim from 20260624000050 (own rows; staff read all team
-- rows). It does not rename anything, so it cannot repeat the same mistake.

DO $$
BEGIN
  IF to_regclass('public.baseball_event_acknowledgements') IS NOT NULL THEN
    -- idempotent: safe to re-run
    EXECUTE 'ALTER TABLE public.baseball_event_acknowledgements ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.baseball_event_acknowledgements FROM anon';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_select" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_insert" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_update" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_delete" ON public.baseball_event_acknowledgements';

    EXECUTE $p$CREATE POLICY "baseball_event_acks_select" ON public.baseball_event_acknowledgements
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.baseball_events e
          WHERE e.id = baseball_event_acknowledgements.event_id
            AND public.is_baseball_team_coach_v2(e.team_id)
        )
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acks_insert" ON public.baseball_event_acknowledgements
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acks_update" ON public.baseball_event_acknowledgements
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acks_delete" ON public.baseball_event_acknowledgements
      FOR DELETE TO authenticated
      USING (user_id = auth.uid())$p$;
  END IF;
END $$;

-- Rollback: DROP POLICY IF EXISTS the 4 names above (returns to the current
-- locked-out state -- not recommended; file a new fix instead of rolling back).
