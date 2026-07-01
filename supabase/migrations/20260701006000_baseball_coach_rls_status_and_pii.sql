-- Net-new security fix (2026-07-01): coach RLS status-check gap + PII policy leak.
--
-- Verified live against the DB via Supabase MCP (pg_policies / pg_get_functiondef)
-- before writing this migration. Additive + re-runnable: CREATE OR REPLACE and
-- DROP POLICY IF EXISTS only. No GRANTs added, no data touched.
--
-- ---------------------------------------------------------------------------
-- Issue 1 [HIGH]: public.is_baseball_team_coach(uuid) and
-- public.is_baseball_team_coach_v2(uuid) are SECURITY DEFINER RLS helper
-- functions used across ~15 baseball_* tables (academics, announcements,
-- documents, events, tasks, travel, videos, box scores, aggregates, etc).
-- Their EXISTS check against baseball_team_coach_staff did NOT filter on
-- `status`, so a coach who has been removed from a team (row retained with
-- status = 'removed' for audit purposes) still satisfied the membership
-- check and kept full RLS access to that team's data.
--
-- Sibling helpers public.is_baseball_team_staff(uuid) and
-- public.has_baseball_staff_capability(uuid, text) already guard membership
-- with `AND COALESCE(status, 'active') = 'active'`. This migration brings
-- is_baseball_team_coach / is_baseball_team_coach_v2 in line with that
-- existing, already-battle-tested pattern. Signature, language, volatility,
-- SECURITY DEFINER, and search_path are all unchanged -- only the WHERE
-- clause gains the status guard. Active coaches (status = 'active' or NULL)
-- are completely unaffected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_baseball_team_coach(team_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff tcs
    WHERE tcs.team_id = team_uuid
    AND tcs.coach_id = get_my_coach_id()
    AND COALESCE(tcs.status, 'active') = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_baseball_team_coach_v2(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff
    WHERE team_id = p_team_id
      AND coach_id = (SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1)
      AND COALESCE(status, 'active') = 'active'
  );
$function$;

-- ---------------------------------------------------------------------------
-- Issue 2 [CRIT]: public.baseball_coaches carried a stray, fully-permissive
-- SELECT policy `baseball_coaches_select_all` (USING (true)) alongside the
-- intended `baseball_coaches_select` policy. RLS policies are OR'd together
-- (permissive by default), so this stray policy alone made every coach's
-- name/email/phone readable by ANY authenticated user -- including players,
-- who have no legitimate reason to browse the coach directory.
--
-- Verified live pg_policies before dropping:
--   baseball_coaches_select:
--     USING ((auth.uid() = user_id) OR (get_my_coach_id() IS NOT NULL))
--   baseball_coaches_select_all:
--     USING (true)   <-- the leak; strictly broader than the policy above
--
-- The remaining `baseball_coaches_select` policy already covers every
-- legitimate read path once `baseball_coaches_select_all` is gone:
--   - self-reads (auth.uid() = user_id), used throughout onboarding/staff/
--     watchlist/discover action files, and
--   - the cross-program coach-directory read needed by the recruiting
--     feature (any signed-in coach -- college/juco -- can read another
--     program's coaching staff, including email, via
--     src/app/baseball/(public)/program/[id]/page.tsx and
--     src/app/baseball/(public)/team/[id]/page.tsx), gated by
--     `get_my_coach_id() IS NOT NULL`.
-- It does NOT extend that directory read to non-coach authenticated users
-- (players), which is exactly the excess `baseball_coaches_select_all`
-- introduced. No legitimate coach self-read or team/coach-directory lookup
-- is broken by this drop, so `baseball_coaches_select` is left as-is rather
-- than additionally narrowed or widened.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "baseball_coaches_select_all" ON public.baseball_coaches;
