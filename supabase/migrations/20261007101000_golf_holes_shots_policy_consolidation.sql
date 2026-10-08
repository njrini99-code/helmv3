-- STATUS: WRITTEN, NOT APPLIED. Prepared by plan phase 6 item 6.1.
-- Apply: npm run db:apply --
-- supabase/migrations/20261007101000_golf_holes_shots_policy_consolidation.sql
-- Risk: MEDIUM-HIGH (RLS on the two hottest golf tables). Needs the
-- local-stack proof
-- (supabase/tests/rls/golf_holes_shots_policy_consolidation.sql)
-- before it is applied. Independent of 20261007100000 and of the held
-- 20261005120000: it applies cleanly with or without either of them.
--
-- Collapses the permissive RLS policies on golf_holes (9) and golf_shots (12,
-- of which admin_read_all is kept) into one policy per command, with the same
-- effective access, and replaces the per-row nested-RLS SELECT predicate with a
-- once-per-statement set lookup.
--
-- ---------------------------------------------------------------------------
-- BEFORE (production, read 2026-10-07 from pg_policies)
-- ---------------------------------------------------------------------------
-- golf_holes (9)                            roles
--   SELECT  golf_holes_select               authenticated  owner | coach |
--   teammate
--   SELECT  golf_holes_select_team          authenticated  coach (subset of the
--   one above)
--   INSERT  golf_holes_insert               authenticated  owner
--   INSERT  golf_holes_insert_coach         public         coach
--   UPDATE  golf_holes_update               authenticated  owner
--   UPDATE  golf_holes_update_coach         public         coach
--   UPDATE  golf_holes_update_team          authenticated  org coach of an
--   active team member
--   DELETE  golf_holes_delete               authenticated  owner
--   DELETE  golf_holes_delete_coach         public         head coach
-- golf_shots (12)
--   SELECT  golf_shots_select               authenticated  owner | coach |
--   teammate
--   SELECT  admin_read_all                  authenticated  is_admin()
--   (KEPT, untouched)
--   INSERT  golf_shots_insert               authenticated  owner via round
--   INSERT  golf_shots_insert_own           authenticated  owner via hole or
--   round
--   INSERT  golf_shots_insert_coach         public         coach
--   UPDATE  golf_shots_update               authenticated  owner via round
--   UPDATE  golf_shots_update_own           authenticated  owner via hole or
--   round
--   UPDATE  golf_shots_update_coach         public         coach
--   UPDATE  golf_shots_update_team          authenticated  org coach of an
--   active team member
--   DELETE  golf_shots_delete               authenticated  owner via round
--   DELETE  golf_shots_delete_own           authenticated  owner via hole or
--   round
--   DELETE  golf_shots_delete_coach         public         head coach
--
-- AFTER
-- golf_holes (4): golf_holes_select, _insert, _update, _delete   all
-- authenticated
-- golf_shots (5): golf_shots_select, _insert, _update, _delete   all
-- authenticated
--                 + admin_read_all (unchanged)
--
-- ---------------------------------------------------------------------------
-- Why each merge is access-neutral
-- ---------------------------------------------------------------------------
-- Permissive policies for one command are OR-ed: USING is the OR of the USINGs
-- and WITH CHECK is the OR of the WITH CHECKs (a policy without WITH CHECK
-- contributes its USING). Every UPDATE policy here has WITH CHECK null or
-- equal to its USING, so the merged policy is USING (a OR b OR c) with
-- WITH CHECK (a OR b OR c). Where one branch is a subset of another, the
-- subset branch is dropped (golf_holes_select_team, golf_shots_*_owner via
-- round only). The hole_id OR round_id owner branch of the *_own policies is
-- KEPT, including its quirk that a shot may be written when only its hole,
-- not its round_id, belongs to the caller: that is live behaviour, and this
-- file changes performance and policy count, not access.
-- The update_team branches keep their original subqueries verbatim. Those
-- subqueries read golf_team_members, golf_teams, golf_coaches and golf_rounds
-- under the CALLER's RLS, which narrows "any org coach" to "a coach who can see
-- the member row", i.e. staff of that team. Replacing them with a definer
-- helper would widen access, so they are not replaced.
--
-- Roles: the three *_coach policies were TO public. They are now TO
-- authenticated. anon evaluated them with auth.uid() = null, so the result
-- was already "no row"; anon additionally lacks EXECUTE on is_golf_team_coach
-- and is_golf_team_head_coach, so an anon write failed with permission denied
-- on the function. After this file the failure is the plain RLS denial.
--
-- ---------------------------------------------------------------------------
-- Truth table (identical before and after; proven by an old-vs-new oracle in
-- supabase/tests/rls/golf_holes_shots_policy_consolidation.sql)
-- ---------------------------------------------------------------------------
-- round R1: team round (team X), player P, in progress
--                                    SELECT  INSERT  UPDATE  DELETE
--   player P (owner)                 yes     yes     yes     yes
--   head coach of X                  yes     yes     yes     yes
--   assistant coach of X             yes     yes     yes     no
--   active teammate of P on X        yes     no      no      no
--   coach of Y (same org, not X)     no      no      no      no
--   coach in another org             no      no      no      no
--   admin (holes)                    no      no      no      no
--   admin (shots)                    yes     no      no      no
--   anon                             no      no      no      no
-- The "player P" and "head/assistant coach" rows are the lead's five personas.
-- The extra rows cover: an active teammate, an org coach who is not on staff,
-- an admin, a personal round (team_id null) and a round whose team_id differs
-- from the player's current team. The test file asserts each of them.
--
-- ---------------------------------------------------------------------------
-- The SELECT predicate
-- ---------------------------------------------------------------------------
-- Old: EXISTS (select 1 from golf_rounds gr where gr.id = round_id and (owner
--   or is_golf_team_coach(team_id) or is_golf_team_player(team_id))). That is
--   a correlated subquery whose golf_rounds read fires golf_rounds RLS (three
--   SELECT policies, five helper calls) and golf_players RLS per probe. The
--   planner hid some of this behind a hashed SubPlan from
--   golf_holes_select_team
--   that still called a helper once per round (SubPlan 14: 99 ms and 5,387
--   buffer hits for a coach with 279 rounds).
-- New: round_id IN (select public.golf_readable_round_ids()). The function is
--   a SECURITY DEFINER set-returning lookup of the caller's rounds using set
--   predicates (my players, my coached teams, my teams) and no per-row helper
--   call. It takes no argument and derives the caller from auth.uid(), so it
--   cannot be asked about someone else. Because the inner predicate of the old
--   policy (owner or coach or teammate) is exactly the SELECT predicate of
--   golf_rounds, the nested golf_rounds RLS added nothing for SELECT other
--   than admin, and the old policy ANDed admin away again. The visible set is
--   unchanged.
--   golf_shots_select uses the same lookup. Its old text read the same round
--   predicate. admin_read_all stays a separate policy because the schema
--   guard test src/test/schema/golf-shots-select-policy-count.test.ts budgets
--   golf_shots at two SELECT policies.
--
-- EXPLAIN evidence is in the PR body (production read-only plan for the old
-- shape, read-only proxy for the new shape, local-stack plan if available).
--
-- ROLLBACK: recreate the old policies. This file's header only summarises
-- them; the executable CREATE POLICY text (verbatim from production,
-- 2026-10-07) is the "Swap the OLD helpers and policies back in" section of
-- supabase/tests/rls/golf_holes_shots_policy_consolidation.sql, which can be
-- copied as is. Drop the four new golf_holes policies, drop the four new
-- golf_shots policies and restore golf_shots_select's old USING with ALTER
-- POLICY, then
--   DROP FUNCTION public.golf_readable_round_ids();
--
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'public' and tablename = 'golf_holes') = 4;
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'public' and tablename = 'golf_shots') = 5;
-- VERIFY: select 1 where not exists (select 1 from pg_policies where schemaname
-- VERIFY: = 'public' and tablename in ('golf_holes', 'golf_shots') and 'public'
-- VERIFY: = any (roles));
-- VERIFY: select 1 where exists (select 1 from pg_policies where schemaname =
-- VERIFY: 'public' and tablename = 'golf_shots' and policyname =
-- VERIFY: 'admin_read_all');
-- VERIFY: select 1 where has_function_privilege('authenticated',
-- VERIFY: 'public.golf_readable_round_ids()', 'EXECUTE') and not
-- VERIFY: has_function_privilege('anon', 'public.golf_readable_round_ids()',
-- VERIFY: 'EXECUTE');

-- ---------------------------------------------------------------------------
-- Once-per-statement lookup of the caller's readable rounds
-- ---------------------------------------------------------------------------
-- COUPLING: this function restates the golf_rounds SELECT predicate (own
-- player, coached team, active member of the team). golf_holes and golf_shots
-- used to inherit golf_rounds RLS through their subquery; they now copy its
-- result through this function instead. A future change to who may see a
-- golf_rounds row does not reach holes and shots unless this function changes
-- with it. The oracle test fails if the two ever disagree for the covered
-- personas.
CREATE OR REPLACE FUNCTION public.golf_readable_round_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT gr.id
  FROM public.golf_rounds gr
  WHERE gr.player_id IN (
          SELECT gp.id
          FROM public.golf_players gp
          WHERE gp.user_id = (SELECT auth.uid())
        )
     OR gr.team_id IN (
          SELECT gtcs.team_id
          FROM public.golf_team_coach_staff gtcs
          JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
          WHERE gc.user_id = (SELECT auth.uid())
        )
     OR gr.team_id IN (
          SELECT gtm.team_id
          FROM public.golf_team_members gtm
          JOIN public.golf_players gp ON gp.id = gtm.player_id
          WHERE gp.user_id = (SELECT auth.uid())
            AND gtm.status = 'active'::public.team_member_status
        );
$function$;

REVOKE ALL ON FUNCTION public.golf_readable_round_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_readable_round_ids() TO authenticated,
service_role;

-- ---------------------------------------------------------------------------
-- golf_holes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS golf_holes_select ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_select_team ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_insert ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_insert_coach ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_update ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_update_coach ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_update_team ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_delete ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_delete_coach ON public.golf_holes;

CREATE POLICY golf_holes_select ON public.golf_holes
FOR SELECT TO authenticated
USING (round_id IN (SELECT public.golf_readable_round_ids()));

CREATE POLICY golf_holes_insert ON public.golf_holes
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE
            gr.id = golf_holes.round_id
            AND gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_holes.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_coach(gr.team_id)
    )
);

CREATE POLICY golf_holes_update ON public.golf_holes
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE
            gr.id = golf_holes.round_id
            AND gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_holes.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_coach(gr.team_id)
    )
    OR round_id IN (
        SELECT gr.id
        FROM public.golf_rounds gr
        JOIN public.golf_team_members gtm ON gtm.player_id = gr.player_id
        JOIN public.golf_teams gt ON gt.id = gtm.team_id
        JOIN public.golf_coaches gc ON gc.organization_id = gt.organization_id
        WHERE
            gc.user_id = (SELECT auth.uid())
            AND gtm.status = 'active'::public.team_member_status
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE
            gr.id = golf_holes.round_id
            AND gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_holes.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_coach(gr.team_id)
    )
    OR round_id IN (
        SELECT gr.id
        FROM public.golf_rounds gr
        JOIN public.golf_team_members gtm ON gtm.player_id = gr.player_id
        JOIN public.golf_teams gt ON gt.id = gtm.team_id
        JOIN public.golf_coaches gc ON gc.organization_id = gt.organization_id
        WHERE
            gc.user_id = (SELECT auth.uid())
            AND gtm.status = 'active'::public.team_member_status
    )
);

CREATE POLICY golf_holes_delete ON public.golf_holes
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE
            gr.id = golf_holes.round_id
            AND gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_holes.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_head_coach(gr.team_id)
    )
);

-- ---------------------------------------------------------------------------
-- golf_shots (admin_read_all is deliberately not touched)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS golf_shots_insert ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_insert_own ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_insert_coach ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_update ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_update_own ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_update_coach ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_update_team ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_delete ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_delete_own ON public.golf_shots;
DROP POLICY IF EXISTS golf_shots_delete_coach ON public.golf_shots;

-- ALTER, not DROP + CREATE: the schema guard
-- src/test/schema/golf-shots-select-policy-count.test.ts replays CREATE and
-- DROP statements per file (all CREATEs, then all DROPs) and would read a
-- drop-and-recreate of golf_shots_select as the policy being removed.
ALTER POLICY golf_shots_select ON public.golf_shots
USING (round_id IN (SELECT public.golf_readable_round_ids()));

CREATE POLICY golf_shots_insert ON public.golf_shots
FOR INSERT TO authenticated
WITH CHECK (
    hole_id IN (
        SELECT gh.id
        FROM public.golf_holes gh
        JOIN public.golf_rounds gr ON gr.id = gh.round_id
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR round_id IN (
        SELECT gr.id
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_shots.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_coach(gr.team_id)
    )
);

CREATE POLICY golf_shots_update ON public.golf_shots
FOR UPDATE TO authenticated
USING (
    hole_id IN (
        SELECT gh.id
        FROM public.golf_holes gh
        JOIN public.golf_rounds gr ON gr.id = gh.round_id
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR round_id IN (
        SELECT gr.id
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_shots.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_coach(gr.team_id)
    )
    OR hole_id IN (
        SELECT gh.id
        FROM public.golf_holes gh
        JOIN public.golf_rounds gr ON gr.id = gh.round_id
        JOIN public.golf_team_members gtm ON gtm.player_id = gr.player_id
        JOIN public.golf_teams gt ON gt.id = gtm.team_id
        JOIN public.golf_coaches gc ON gc.organization_id = gt.organization_id
        WHERE
            gc.user_id = (SELECT auth.uid())
            AND gtm.status = 'active'::public.team_member_status
    )
)
WITH CHECK (
    hole_id IN (
        SELECT gh.id
        FROM public.golf_holes gh
        JOIN public.golf_rounds gr ON gr.id = gh.round_id
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR round_id IN (
        SELECT gr.id
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_shots.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_coach(gr.team_id)
    )
    OR hole_id IN (
        SELECT gh.id
        FROM public.golf_holes gh
        JOIN public.golf_rounds gr ON gr.id = gh.round_id
        JOIN public.golf_team_members gtm ON gtm.player_id = gr.player_id
        JOIN public.golf_teams gt ON gt.id = gtm.team_id
        JOIN public.golf_coaches gc ON gc.organization_id = gt.organization_id
        WHERE
            gc.user_id = (SELECT auth.uid())
            AND gtm.status = 'active'::public.team_member_status
    )
);

CREATE POLICY golf_shots_delete ON public.golf_shots
FOR DELETE TO authenticated
USING (
    hole_id IN (
        SELECT gh.id
        FROM public.golf_holes gh
        JOIN public.golf_rounds gr ON gr.id = gh.round_id
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR round_id IN (
        SELECT gr.id
        FROM public.golf_rounds gr
        JOIN public.golf_players gp ON gp.id = gr.player_id
        WHERE gp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.golf_rounds gr
        WHERE
            gr.id = golf_shots.round_id
            AND gr.team_id IS NOT NULL
            AND public.is_golf_team_head_coach(gr.team_id)
    )
);
