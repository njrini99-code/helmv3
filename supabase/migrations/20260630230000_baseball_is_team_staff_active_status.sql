-- ============================================================================
-- Migration: 20260630230000_baseball_is_team_staff_active_status.sql
-- Issue: #405 — inactive/suspended/removed staff retain full RLS read/write
--        access via public.is_baseball_team_staff(), even though the app layer
--        (src/lib/baseball/active-context.ts loadMemberships) and the sibling
--        RLS helpers has_baseball_staff_capability() / can_view_baseball_player()
--        already exclude status IN ('suspended','removed','invited').
--
-- Root cause: the original is_baseball_team_staff() (20260624000050, lines 50-62)
--        is a bare membership-existence check with NO status filter. Because a
--        removed staffer is soft-removed (row retained with status='removed', per
--        20260624000030 comment), their still-valid JWT continues to pass this
--        function — which gates ~20 USING/WITH CHECK clauses across the baseball_*
--        schema (roster, lifting/performance, signals, postgame, settings-os,
--        insights attribution, elite stat events, …). RLS is the real boundary,
--        so tightening this one function fixes every table at once.
--
-- Fix: CREATE OR REPLACE with a status guard mirroring the already-active-aware
--        sibling helpers. NULL/missing status is treated as active (column
--        DEFAULT 'active'), so active coaches are unaffected.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY — CREATE OR REPLACE FUNCTION, no DROP, no policy DDL.
--   * Same signature / LANGUAGE sql / STABLE / SECURITY DEFINER / search_path.
--   * EXECUTE re-granted to authenticated + service_role ONLY; explicitly
--     revoked from PUBLIC and anon so CREATE OR REPLACE can never silently
--     re-expose it to anon (Supabase re-grant gotcha).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_baseball_team_staff(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_team_coach_staff tcs
    WHERE tcs.team_id = p_team_id
      AND tcs.coach_id = public.get_my_coach_id()
      AND COALESCE(tcs.status, 'active') NOT IN ('suspended', 'removed', 'invited')
  );
$$;

REVOKE ALL ON FUNCTION public.is_baseball_team_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_baseball_team_staff(uuid) TO authenticated, service_role;
