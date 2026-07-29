-- ============================================================================
-- Migration B of 2 — 20260729000200_baseball_tenant_isolation_rls_b_policies
--
-- 🔴 THIS IS THE FILE THAT CLOSES THE LEAKS. It is also the only one of the
-- pair that can break production, so read the preconditions before applying.
--
-- ⛔ DO NOT APPLY UNTIL BOTH ARE TRUE:
--   1. Migration A (20260729000100_..._a_additive.sql) is applied. It creates
--      the three functions this file's policies and the app depend on.
--   2. The companion app changes are DEPLOYED, not merely merged. They are:
--        - join-by-code -> public.resolve_baseball_team_by_join_code()
--            src/app/baseball/join/[code]/page.tsx
--            src/app/baseball/actions/teams.ts joinTeamByCodeImpl
--          AND the rest of that chain ->
--          public.get_baseball_team_join_context()
--            src/app/baseball/actions/teams.ts validatePlayerCanJoinTeamImpl
--            src/app/baseball/actions/teams.ts joinTeamImpl
--          Resolving the code is only the FIRST of three pre-membership reads
--          of baseball_teams. Repointing just the code lookup leaves join-by-
--          code equally broken, reporting "Team not found" instead.
--        - cross-org team browse -> public.baseball_teams_public_profile
--            src/app/baseball/actions/discover.ts
--            src/lib/baseball/recruitability.ts
--            src/app/baseball/(dashboard)/dashboard/compare/actions.ts
--        - roster "Add existing player" ->
--          public.find_baseball_player_by_email_for_roster()
--            src/app/baseball/actions/roster.ts searchAssignablePlayers
--      Verify by EXERCISING each flow, not by reading the diff — a
--      merged-but-undeployed change looks identical in git and fails
--      identically to no change at all. Concretely:
--        - Join a team with a code as a player who is not yet a member, and
--          confirm the pending-approval screen still names the team.
--        - Search a transfer's FULL email address in roster "Add existing
--          player" and confirm the exact-email result appears. A substring
--          search silently returning fewer rows is exactly the "quietly
--          stopped working" symptom this file warns about.
--
-- WHAT BREAKS IF YOU APPLY THIS EARLY: joining a team by code returns
-- "Invalid invite code" for every code (the pre-membership caller can satisfy
-- no row-level predicate); recruiting Discover/Compare return zero players;
-- roster "Add existing player" finds nobody outside your own roster. All three
-- fail silently as empty results, not as errors — so the symptom is "the
-- product quietly stopped working", which is worse to diagnose than a crash.
--
-- THE FIX
-- ----------------------------------------------------------------------------
--   supabase/migrations/20260527000000_prod_public_baseline.sql:18179
--     CREATE POLICY "baseball_players_select" ON public.baseball_players
--       FOR SELECT TO authenticated USING (true);
--   supabase/migrations/20260527000000_prod_public_baseline.sql:18377
--     CREATE POLICY "baseball_teams_select" ON public.baseball_teams
--       FOR SELECT TO authenticated USING (true);
--
-- Live since 2026-05-27. USING(true) means any authenticated user on any team
-- reads every other program's full roster — email, phone, GPA, SAT/ACT — and
-- every team's join_code, the secret that gates membership. The 2026-07-09
-- baseball_players_recruiting_guard migration does not help: it raises 42501
-- on writes, and this is a read.
--
-- Both are replaced with tenant-scoped policies built from EXISTING helpers
-- (can_view_baseball_player, is_baseball_team_staff, is_baseball_team_member)
-- plus the recruiting-discoverability backstop added in migration A.
--
-- RESIDUAL GAP, documented not hidden: Postgres RLS is row-level. Once the
-- recruiting predicate admits a row, every column of that row is selectable,
-- including contact and academic PII the recruiting UI does not display.
-- Closing that needs a curated view plus migrating every recruiting read to
-- it — out of scope here. This is still strictly better than today, where
-- every authenticated user sees every column of every player regardless of
-- role or recruiting eligibility.
--
-- ⚠️ NOT APPLIED BY THIS FILE.
--
-- ROLLBACK (restores the pre-migration state exactly):
--   DROP POLICY IF EXISTS "baseball_players_select" ON public.baseball_players;
--   CREATE POLICY "baseball_players_select" ON public.baseball_players
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS "baseball_teams_select" ON public.baseball_teams;
--   CREATE POLICY "baseball_teams_select" ON public.baseball_teams
--     FOR SELECT TO authenticated USING (true);
--   GRANT ALL ON TABLE public.baseball_players TO anon;
--   GRANT ALL ON TABLE public.baseball_teams TO anon;
-- (Migration A's functions can stay — they are additive and nothing else
-- references them once these policies are back to USING(true).)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 2 — tenant-scoped SELECT policies (the actual fix)
-- ----------------------------------------------------------------------------

-- baseball_players: self, OR team staff who can view this player on a team
-- they staff (existing capability/scope-aware helper — reused, not
-- reinvented, per the task's explicit instruction to match an existing
-- idiom), OR the recruiting-discoverability backstop
-- public.is_baseball_player_recruiting_discoverable(), created by migration A.
DROP POLICY IF EXISTS "baseball_players_select" ON public.baseball_players;
CREATE POLICY "baseball_players_select" ON public.baseball_players
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    -- The ONE-ARG can_view_baseball_player (20260624000050:230), not an inline
    -- EXISTS over baseball_team_members.
    --
    -- ⚠️ SECOND RECURSION CYCLE, also found only by executing this. The inline
    -- subquery is not SECURITY DEFINER, so it is filtered by
    -- baseball_team_members_select — which itself contains
    -- `EXISTS (SELECT 1 FROM baseball_players bp JOIN ...)`
    -- (20260527000000_prod_public_baseline.sql:18350-18353). That re-enters
    -- THIS policy:
    --
    --   baseball_players_select
    --     -> EXISTS over baseball_team_members
    --       -> baseball_team_members_select
    --         -> reads baseball_players
    --           -> baseball_players_select   ← loop
    --
    -- Postgres rejects the whole policy: "infinite recursion detected in
    -- policy for relation baseball_players", i.e. EVERY query against the
    -- table fails, not just the recruiting branch.
    --
    -- The one-arg definer form does the identical work — self-check, then the
    -- same team_members lookup deferring to the two-arg authority function —
    -- but under definer rights, so it never re-enters either policy. Two
    -- independent line-by-line reviews of this policy missed this. Reading
    -- cannot find it; running it does immediately.
    OR public.can_view_baseball_player(baseball_players.id)
    -- Columns passed IN, not re-read. The function is called from this very
    -- policy, so a `SELECT ... FROM baseball_players` inside it re-enters here
    -- and Postgres rejects the whole policy with "infinite recursion detected
    -- in policy for relation baseball_players" — verified in CI, invisible on
    -- inspection. The row is already in scope here; handing over the two
    -- columns it needs is both the fix and one fewer lookup.
    OR public.is_baseball_player_recruiting_discoverable(
         baseball_players.id,
         baseball_players.player_type,
         baseball_players.recruiting_activated
       )
  );

-- baseball_teams: team staff OR team member, own team(s) only. join_code
-- (and every other column) is no longer bulk-readable outside the team.
-- Cross-tenant discovery of non-sensitive team identity (id/org/name/logo)
-- for recruiting browse flows continues to be served by the EXISTING
-- anon-readable public.baseball_teams_public_profile view (unaffected by
-- this migration — that view already excludes join_code and reads the base
-- table with security_invoker = false, i.e. as its owner, not the caller);
-- see the DO NOT APPLY UNTIL preconditions at the top of this file for the
-- call sites that must move to it.
DROP POLICY IF EXISTS "baseball_teams_select" ON public.baseball_teams;
CREATE POLICY "baseball_teams_select" ON public.baseball_teams
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(id)
    -- has_any_baseball_team_membership, NOT is_baseball_team_member: the
    -- latter requires status = 'active' (20260624000050:250-266), but
    -- joinTeamImpl inserts 'pending' whenever require_coach_approval is not
    -- explicitly false — the fail-closed DEFAULT. Using the active-only helper
    -- here would mean a player who just joined cannot see the team they joined
    -- until a coach approves them, so their own pending-approval screen would
    -- render nothing. See migration A SECTION 6 for why this is a separate
    -- predicate rather than a widening of is_baseball_team_member (which many
    -- other policies call to gate real team data).
    OR public.has_any_baseball_team_membership(id)
  );

-- ----------------------------------------------------------------------------
-- SECTION 4 — defense in depth: anon has no matching policy on either table
-- today (before or after this migration — RLS-enabled-with-no-matching-
-- policy already denies anon all rows), so this REVOKE is a no-op on live
-- behavior. It closes the blanket `GRANT ALL ... TO anon` (including
-- INSERT/UPDATE/DELETE, not just SELECT) left over from the 2026-05-27
-- baseline, matching the same REVOKE-ALL-FROM-anon idiom already applied to
-- baseball_team_members (20260630233000) and
-- baseball_event_acknowledgements (20260624000050).
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.baseball_players FROM anon;
REVOKE ALL ON public.baseball_teams FROM anon;

-- ============================================================================
-- END migration B. Leaks closed. NOT applied to any DB by this file.
-- ============================================================================
