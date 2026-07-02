-- Restore baseball_event_acknowledgements RLS policies dropped without
-- replacement by 20260630165403_normalize_baseball_event_ack_policies.sql.
--
-- Root cause (confirmed via live pg_policies query — the table currently has
-- RLS enabled and 0 policies, fully locked out for every role except
-- service_role): that migration's comment claimed a
-- "baseball_event_acknowledgements_*" policy set from
-- 20260624000050_baseball_rls_helpers_and_policies.sql would remain live
-- after its DROPs. No such policies were ever created under that name —
-- 20260624000050 only ever created baseball_event_acks_select/insert/update/
-- delete, and 20260630165403 dropped exactly those, leaving zero policies.
--
-- This migration recreates the original 20260624000050 definitions verbatim
-- (own rows readable/writable by user_id = auth.uid(); staff can read all
-- team rows via is_baseball_team_coach_v2, confirmed live in
-- 20260701006000_baseball_coach_rls_status_guard.sql, SECURITY DEFINER STABLE
-- with search_path set).
--
-- Additive-only: DROP POLICY IF EXISTS + CREATE POLICY, no table/column
-- changes, no grants introduced.

DROP POLICY IF EXISTS "baseball_event_acks_select" ON public.baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_select" ON public.baseball_event_acknowledgements
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.baseball_events e
      WHERE e.id = baseball_event_acknowledgements.event_id
        AND public.is_baseball_team_coach_v2(e.team_id)
    )
  );

DROP POLICY IF EXISTS "baseball_event_acks_insert" ON public.baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_insert" ON public.baseball_event_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "baseball_event_acks_update" ON public.baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_update" ON public.baseball_event_acknowledgements
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "baseball_event_acks_delete" ON public.baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_delete" ON public.baseball_event_acknowledgements
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Rollback: DROP POLICY IF EXISTS on all four names above (returns the table
-- to the current locked-out state — additive-safe, but not recommended).
