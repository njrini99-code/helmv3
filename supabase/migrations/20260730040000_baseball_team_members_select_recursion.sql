-- =============================================================================
-- `baseball_team_members_select` recurses infinitely on any database built from
-- these migrations. Production does not, because it was fixed out of band.
--
-- WHAT IS WRONG. The 2026-05-27 baseline creates the SELECT policy with a
-- subquery that reads THE TABLE THE POLICY IS ON:
--
--   OR EXISTS (
--     SELECT 1 FROM baseball_players bp
--     JOIN baseball_team_members btm ON btm.player_id = bp.id   -- <-- own table
--     WHERE btm.team_id = baseball_team_members.team_id
--       AND bp.user_id = auth.uid())
--
-- Evaluating the policy requires reading `baseball_team_members`, which
-- re-applies the policy. Postgres aborts with:
--
--   infinite recursion detected in policy for relation "baseball_team_members"
--
-- No later migration replaces it — the baseline is the ONLY file that creates
-- this policy.
--
-- PRODUCTION IS HEALTHY, WHICH IS EXACTLY WHY NOBODY SAW IT. Read live from
-- production on 2026-07-30, `pg_policies.qual` for this policy is:
--
--   (EXISTS (SELECT 1 FROM baseball_team_coach_staff btcs
--            JOIN baseball_coaches bc ON bc.id = btcs.coach_id
--            WHERE btcs.team_id = baseball_team_members.team_id
--              AND bc.user_id = (SELECT auth.uid())))
--   OR is_baseball_team_member(team_id)
--
-- The recursive inline subquery was replaced with a call to
-- `is_baseball_team_member(uuid)` — `STABLE SECURITY DEFINER` with `search_path`
-- pinned, so it reads the table WITHOUT re-entering RLS and the cycle is broken.
-- That change was never committed as a migration.
--
-- WHY IT MATTERS BEYOND CI. Every database built from `supabase/migrations/`
-- has a broken roster read:
--   - `supabase start` — found this way; the smoke gate's console showed
--     "Error fetching player teams: infinite recursion detected in policy for
--     relation baseball_team_members" behind a 500.
--   - a Supabase preview branch.
--   - ⚠️ A RESTORE OR REBUILD OF PRODUCTION FROM MIGRATIONS. That is the
--     disaster-recovery path, and it currently produces a database where every
--     `baseball_team_members` SELECT errors.
--
-- Fifth instance of one class found tonight: production carries objects or fixes
-- that no tracked migration contains (see 20260730020000 for the auth.users
-- trigger and 20260730030000 for the `avatars` bucket). The others were
-- absences; this one is worse, because the migrations actively create something
-- broken.
--
-- WHY THE REPLACE IS GUARDED. It runs ONLY when the live policy still contains
-- the recursive self-join, so applying this to production — which has the fixed
-- predicate — changes nothing. Without the guard this would overwrite whatever
-- production actually has with what is written here, which is the mistake
-- 20260730020000's header warns about. The rebuilt predicate is copied from
-- production's live `qual`, not invented.
--
-- `auth.uid()` is wrapped as `(SELECT auth.uid())` in the coach branch to match
-- production exactly; the initplan form is also what lets Postgres evaluate it
-- once per query rather than per row.
--
-- NOT APPLIED BY THE AUTHOR. Production already has the correct predicate.
-- =============================================================================

DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'baseball_team_members'
    AND policyname = 'baseball_team_members_select';

  IF v_qual IS NULL THEN
    RAISE NOTICE 'baseball_team_members_select not present — nothing to repair';
    RETURN;
  END IF;

  -- The recursive shape is a join against the policy's own table inside its
  -- USING clause. Production's fixed predicate calls is_baseball_team_member()
  -- instead and contains no such join.
  IF position('baseball_team_members btm' in v_qual) = 0 THEN
    RAISE NOTICE 'baseball_team_members_select already non-recursive — no change';
    RETURN;
  END IF;

  DROP POLICY "baseball_team_members_select" ON public.baseball_team_members;

  CREATE POLICY "baseball_team_members_select"
    ON public.baseball_team_members
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.baseball_team_coach_staff btcs
        JOIN public.baseball_coaches bc ON bc.id = btcs.coach_id
        WHERE btcs.team_id = baseball_team_members.team_id
          AND bc.user_id = (SELECT auth.uid())
      )
      OR public.is_baseball_team_member(team_id)
    );

  RAISE NOTICE 'baseball_team_members_select repaired: recursive self-join replaced with is_baseball_team_member()';
END
$$;
