-- ============================================================================
-- Migration A of 2 — 20260729000100_baseball_tenant_isolation_rls_a_additive
--
-- PURELY ADDITIVE. This file creates functions and grants EXECUTE on them.
-- It changes no policy, revokes nothing, and alters no table. Applying it
-- cannot change the behaviour of any existing query — it only makes new
-- server-side entry points available for the app to start calling.
--
-- WHY THIS IS SPLIT FROM THE POLICY CHANGE
-- ----------------------------------------------------------------------------
-- The tenant-isolation fix (migration B, 20260729000200) closes two confirmed
-- cross-tenant leaks by replacing USING(true) SELECT policies on
-- baseball_players and baseball_teams. Applied on its own it would break three
-- live flows that legitimately read across tenants today — join-by-code,
-- recruiting Discover/Compare browse, and roster "Add existing player" — so
-- the app has to learn the new, narrower entry points FIRST.
--
-- That gives a three-step sequence in which every step is independently safe
-- and independently reversible:
--
--   1. Apply THIS file (A). Nothing changes for anyone; the new RPCs exist
--      but nothing calls them yet.
--   2. Deploy the companion app changes. They call the RPCs and the existing
--      public view instead of reading the base tables directly. Still safe:
--      the old permissive policies are untouched, so both the old and new
--      code paths work.
--   3. Apply migration B. The leaks close. The app is already speaking the
--      narrower dialect, so nothing regresses.
--
-- Doing 3 before 2 is an outage. Doing 2 before 1 breaks the app (the RPCs
-- would not exist). The order above is the only safe one, and step 1 has no
-- blast radius at all — which is why it is a separate file rather than a
-- section of a larger one that a reviewer has to trust as a whole.
--
-- WHAT THE LEAKS ARE (context for the reviewer; the fix itself is in B):
--
--   supabase/migrations/20260527000000_prod_public_baseline.sql:18179
--     CREATE POLICY "baseball_players_select" ON public.baseball_players
--       FOR SELECT TO authenticated USING (true);
--
--   supabase/migrations/20260527000000_prod_public_baseline.sql:18377
--     CREATE POLICY "baseball_teams_select" ON public.baseball_teams
--       FOR SELECT TO authenticated USING (true);
--
-- Any authenticated user on any team reads every other program's roster PII
-- (email, phone, GPA, SAT/ACT) and every team's secret join_code. Live since
-- 2026-05-27; no later migration replaces either policy.
--
-- ⚠️ NOT APPLIED BY THIS FILE. No migration in this pair has been executed
-- against any database by the authoring session. A human applies them, in the
-- order above.
--
-- ROLLBACK for this file (safe at any time — nothing depends on these until
-- migration B is applied, and after that only B's policies do):
--   DROP FUNCTION IF EXISTS public.is_baseball_player_recruiting_discoverable(uuid, public.baseball_player_type, boolean);
--   DROP FUNCTION IF EXISTS public.resolve_baseball_team_by_join_code(text);
--   DROP FUNCTION IF EXISTS public.find_baseball_player_by_email_for_roster(uuid, text);
--   DROP FUNCTION IF EXISTS public.get_baseball_team_join_context(uuid);
--   DROP FUNCTION IF EXISTS public.has_any_baseball_team_membership(uuid);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — helper: recruiting-discoverability backstop for baseball_players
-- ----------------------------------------------------------------------------
-- Re-implements, at the DB layer, the SAME predicate already enforced
-- independently (and identically) by:
--   - src/app/baseball/actions/discover.ts (getDiscoverPlayersImpl /
--     getStateCountsImpl)
--   - src/lib/baseball/recruitability.ts (assertCoachCanRecruitPlayer)
--   - src/app/baseball/actions/player-peek.ts (via assertCoachCanRecruitPlayer)
--   - src/app/baseball/(dashboard)/dashboard/compare/actions.ts
-- This is a backstop, not a new business rule: a request that the app-layer
-- code would already deny is now ALSO denied at the RLS layer, and a request
-- the app-layer code would already allow continues to be allowed.
--
-- SECURITY DEFINER (search_path pinned) so its internal reads of
-- baseball_coaches / baseball_players / baseball_player_settings /
-- baseball_team_members / baseball_teams / organizations are evaluated with
-- the function owner's privileges, not the caller's RLS-restricted view —
-- the exact same pattern already used by public.can_view_baseball_player /
-- public.has_baseball_staff_capability (20260624000050). This is why
-- tightening baseball_teams_select in SECTION 2 below does not break this
-- function's own internal organization-type lookup.
-- ⚠️ THE SIGNATURE IS LOAD-BEARING. This takes the player's `player_type` and
-- `recruiting_activated` as ARGUMENTS rather than re-reading them by id.
--
-- The obvious version — `is_..._discoverable(p_player_id uuid)`, reading the
-- row itself — was written first and CI rejected it:
--
--   ERROR: infinite recursion detected in policy for relation "baseball_players"
--
-- The function is called FROM baseball_players_select, so its own
-- `SELECT ... FROM baseball_players` re-enters that policy, which calls the
-- function again. SECURITY DEFINER does not save it: Supabase applies
-- migrations as a role for which row security is still in force here, so the
-- definer's read is policy-checked like any other.
--
-- `SET row_security = off` would silence it, but it is the wrong instrument —
-- it disables RLS for every read in the body, including the settings and
-- team-membership lookups that have nothing to do with the recursion.
--
-- Passing the columns in is strictly better anyway: the policy already has the
-- row in scope, so re-reading it was both a cycle and a wasted lookup. The
-- remaining reads (baseball_coaches, baseball_player_settings,
-- baseball_team_members, baseball_teams, organizations) touch OTHER relations
-- and cannot recurse into this policy.
--
-- Caught only because the migration was executed. It is not visible by reading.
CREATE OR REPLACE FUNCTION public.is_baseball_player_recruiting_discoverable(
  p_player_id   uuid,
  p_player_type public.baseball_player_type,
  p_activated   boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_coach_id    uuid := public.get_my_coach_id();
  v_coach_type  public.baseball_coach_type;
  v_player_type public.baseball_player_type := p_player_type;
  v_activated   boolean := p_activated;
BEGIN
  IF v_coach_id IS NULL OR p_player_id IS NULL THEN
    RETURN false;
  END IF;

  -- Only college/juco coach_type recruits (matches recruitability.ts's
  -- coach_type_mismatch for high_school/showcase, and discover.ts's
  -- getStateCountsImpl "non-recruiting coach types see nothing").
  SELECT coach_type INTO v_coach_type
    FROM public.baseball_coaches
   WHERE id = v_coach_id;

  IF v_coach_type IS NULL OR v_coach_type NOT IN ('college', 'juco') THEN
    RETURN false;
  END IF;

  -- Supplied by the policy from the row being tested — deliberately NOT read
  -- back from baseball_players; see the recursion note on the signature.
  IF v_activated IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- College players are never recruitable (also enforced by CHECK
  -- constraints baseball_players_college_no_recruiting /
  -- baseball_players_college_recruiting_check — restated here as a
  -- defense-in-depth read-side mirror of that write-side rule).
  IF v_player_type = 'college'::public.baseball_player_type THEN
    RETURN false;
  END IF;

  -- A JUCO coach may not recruit another JUCO player (discover.ts:
  -- `serverCoachType === 'juco' -> query.in('player_type', ['high_school','showcase'])`;
  -- recruitability.ts's identical coach_type_mismatch branch).
  IF v_coach_type = 'juco' AND v_player_type = 'juco'::public.baseball_player_type THEN
    RETURN false;
  END IF;

  -- profile_visibility: only an explicit 'private' row denies visibility —
  -- a missing settings row defaults to visible (matches
  -- src/lib/baseball/player-visibility.ts's PRIVATE_PROFILE_VISIBILITY
  -- semantics, the repo's single source of truth for this predicate).
  IF EXISTS (
    SELECT 1 FROM public.baseball_player_settings s
     WHERE s.player_id = p_player_id
       AND s.profile_visibility = 'private'
  ) THEN
    RETURN false;
  END IF;

  -- Must be on a team belonging to a discoverable (high_school / showcase /
  -- juco) organization — matches discover.ts's getDiscoverableTeamPlayerIds
  -- filter ("Players with no team assignment are not surfaced in Discover").
  RETURN EXISTS (
    SELECT 1
    FROM public.baseball_team_members btm
    JOIN public.baseball_teams bt ON bt.id = btm.team_id
    JOIN public.organizations o ON o.id = bt.organization_id
    WHERE btm.player_id = p_player_id
      AND o.type IN ('high_school', 'showcase', 'juco')
  );
END;
$$;

-- Drop the id-only signature if a prior attempt created it: leaving both
-- overloads in place makes the policy's call ambiguous to resolve and leaves a
-- recursing function reachable.
DROP FUNCTION IF EXISTS public.is_baseball_player_recruiting_discoverable(uuid);

COMMENT ON FUNCTION public.is_baseball_player_recruiting_discoverable(uuid, public.baseball_player_type, boolean) IS
  'RLS backstop for baseball_players_select (#CRIT tenant-isolation fix, 2026-07-29): re-implements the recruiting-discoverability predicate already independently enforced in discover.ts / recruitability.ts / player-peek.ts / compare/actions.ts at the DB layer. Takes player_type and recruiting_activated as ARGUMENTS, supplied by the policy from the row under test — reading them back from baseball_players re-enters the very policy that calls this function (verified: "infinite recursion detected in policy for relation baseball_players").';

REVOKE ALL ON FUNCTION public.is_baseball_player_recruiting_discoverable(uuid, public.baseball_player_type, boolean) FROM PUBLIC;
-- Explicit REVOKE FROM anon: Supabase's default privileges grant EXECUTE on
-- new public functions to anon, and REVOKE ... FROM PUBLIC does not remove a
-- role-specific grant. Without this the function is anon-callable. Matches the
-- idiom in 20260625000030_helm_lifting_accept_invite_rpc.sql.
REVOKE EXECUTE ON FUNCTION public.is_baseball_player_recruiting_discoverable(uuid, public.baseball_player_type, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_baseball_player_recruiting_discoverable(uuid, public.baseball_player_type, boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 3 — join-by-code RPC (the join_code case needs an RPC, not a
-- SELECT policy)
-- ----------------------------------------------------------------------------
-- WHY THIS CANNOT BE A SELECT POLICY: a user redeeming a join code does not
-- yet have ANY relationship to the target team (that is the entire point of
-- the flow) — no row-level predicate over auth.uid()/team membership can
-- distinguish "this caller already knows the correct code" from "this
-- caller is browsing." RLS's USING() clause has no visibility into the
-- query's own WHERE-clause literal (`.eq('join_code', code)`), so the only
-- way to gate on "matches a code you already possess" is to accept the code
-- as an explicit RPC ARGUMENT and compare it server-side inside a
-- SECURITY DEFINER function — the function bypasses the caller's
-- restricted view of the row precisely BECAUSE the caller had to supply the
-- matching secret as input; it never lists or enumerates rows, only checks
-- one candidate value per call, so a caller can verify a code they possess
-- but can never browse/list codes they don't. Enumeration/brute-force
-- throttling of the code space itself is an application-rate-limiting
-- concern, not something RLS/SQL can provide — that risk is UNCHANGED from
-- today (the current USING(true) policy has the exact same brute-forceable
-- property; this RPC does not make it worse, it only removes the
-- bulk/browse leak of every OTHER team's join_code and full row).
--
-- Returns ONLY non-sensitive identity columns — deliberately does NOT echo
-- join_code back (the caller already has it; no reason to round-trip it
-- through a response body/log).
CREATE OR REPLACE FUNCTION public.resolve_baseball_team_by_join_code(
  p_join_code text
)
RETURNS TABLE (
  id uuid,
  name text,
  team_type public.baseball_coach_type,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT bt.id, bt.name, bt.team_type, bt.organization_id
  FROM public.baseball_teams bt
  WHERE bt.join_code = p_join_code
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_baseball_team_by_join_code(text) IS
  'Join-by-code resolver (#CRIT tenant-isolation fix, 2026-07-29). Required companion RPC for the join_code redemption flow now that baseball_teams_select is tenant-scoped — a non-member cannot satisfy any row-level predicate, so the code must be validated as an explicit argument inside a SECURITY DEFINER function instead. Returns id/name/team_type/organization_id only (never join_code itself). REQUIRED APP CHANGE (not made by this migration — outside this file''s ownership): src/app/baseball/join/[code]/page.tsx (~lines 107-124) and src/app/baseball/actions/teams.ts joinTeamByCodeImpl (~lines 920-935) must call supabase.rpc(''resolve_baseball_team_by_join_code'', { p_join_code: code }) instead of `.from(''baseball_teams'').select(...).eq(''join_code'', code)` — the latter will return 0 rows for any pre-membership caller once this migration is applied.';

REVOKE ALL ON FUNCTION public.resolve_baseball_team_by_join_code(text) FROM PUBLIC;
-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon, and REVOKE ... FROM PUBLIC does not remove a role-specific grant.
REVOKE EXECUTE ON FUNCTION public.resolve_baseball_team_by_join_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_baseball_team_by_join_code(text) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- SECTION 4 — roster "Add existing player" lookup
-- ----------------------------------------------------------------------------
-- THE PROBLEM THIS SOLVES. src/app/baseball/actions/roster.ts's
-- searchAssignablePlayers() backs the "Add existing player" flow (a mid-season
-- transfer arrives; the coach adds a player who already has an account rather
-- than creating a duplicate). It runs an unscoped ILIKE substring search over
-- name AND email across EVERY row of baseball_players, gated only on the
-- caller holding can_manage_roster on some team. Typing "sm" returns strangers'
-- names and email addresses from every program in the database. That is not a
-- side effect of the USING(true) policy — it is the policy's leak expressed as
-- a product feature, and it is the single call site migration B cannot simply
-- tighten around.
--
-- WHY NOT SPECIAL-CASE IT IN THE POLICY. The obvious "fix" — let a
-- can_manage_roster holder read any player — is the leak again with extra
-- steps: every coach has that capability on their own team, so the predicate
-- admits everyone. Preserving a browse capability by re-opening cross-tenant
-- PII reads defeats the entire migration.
--
-- WHAT REPLACES IT. The legitimate capability is "add a player I already know
-- of", not "browse players I don't". A coach taking a transfer has the
-- player's email — it is on the transfer paperwork, or the player gave it to
-- them. So the cross-tenant half of the lookup becomes an EXACT match on a
-- unique identifier the caller must already possess, supplied as an argument,
-- exactly like the join-code RPC above and for the same reason: RLS cannot see
-- a query's own WHERE-clause literal, so "prove you already know it" can only
-- be expressed as a function argument compared server-side.
--
-- The narrowing is deliberate and is the point:
--   - EXACT email, case-insensitive. No substring, no name search, no wildcard
--     — a caller can confirm an address they hold but can never enumerate.
--   - At most one row.
--   - Returns identity columns needed to confirm the right person
--     (name, position, grad year). Never email, phone, GPA, or test scores —
--     the caller supplied the email and needs none of the rest to decide.
--   - Re-checks can_manage_roster on the SPECIFIC team being added to, inside
--     the definer body. Capability on some other team is not authority here.
--
-- Rate-limiting the guess space is an application concern, unchanged from
-- today and not made worse: an attacker who already knows an email address
-- learns only that it exists and whose name is on it, which the current
-- USING(true) policy hands over in bulk without needing to guess at all.
CREATE OR REPLACE FUNCTION public.find_baseball_player_by_email_for_roster(
  p_team_id uuid,
  p_email   text
)
RETURNS TABLE (
  id               uuid,
  first_name       text,
  last_name        text,
  primary_position text,
  grad_year        integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF p_team_id IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN;
  END IF;

  -- Authority is per-team: the caller must be able to manage the roster of
  -- the team they are adding to. Reuses the existing capability helper
  -- (20260624000050) rather than re-deriving staff membership here.
  IF NOT public.has_baseball_staff_capability(p_team_id, 'can_manage_roster') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, p.primary_position, p.grad_year
  FROM public.baseball_players p
  WHERE lower(btrim(p.email)) = v_email
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.find_baseball_player_by_email_for_roster(uuid, text) IS
  'Exact-email player lookup for the roster "Add existing player" (mid-season transfer) flow, companion to the tenant-isolation fix (2026-07-29). Replaces the cross-tenant ILIKE substring browse in roster.ts searchAssignablePlayers(), which returned strangers'' names and email addresses from every program. Exact match only, at most one row, and never returns email/phone/GPA/test scores — the caller already holds the email and needs only enough to confirm the person. Re-checks can_manage_roster on the specific target team inside the definer body.';

REVOKE ALL ON FUNCTION public.find_baseball_player_by_email_for_roster(uuid, text) FROM PUBLIC;
-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon, and REVOKE ... FROM PUBLIC does not remove a role-specific grant.
REVOKE EXECUTE ON FUNCTION public.find_baseball_player_by_email_for_roster(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_baseball_player_by_email_for_roster(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 5 — team join context (the rest of the join-by-code chain)
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS. Resolving the join code (SECTION 3) is only the FIRST of
-- three pre-membership reads of baseball_teams in the join chain. An
-- adversarial review of the companion app change caught the other two:
--
--   src/app/baseball/actions/teams.ts:84   validatePlayerCanJoinTeamImpl
--     .from('baseball_teams').select('id, name, team_type').eq('id', teamId)
--   src/app/baseball/actions/teams.ts:317  joinTeamImpl
--     .from('baseball_teams')
--     .select('team_type, invite_policy, require_coach_approval')
--     .eq('id', teamId)
--
-- Both run on the RLS-bound session client, for a caller who by definition has
-- no membership yet. After migration B they return zero rows, and the user is
-- told "Team not found" — so repointing only the code lookup would have left
-- join-by-code just as broken, with a more confusing error. Migration B's
-- precondition list is not satisfied without this.
--
-- WHY IT IS SAFE TO EXPOSE THESE FIELDS. This function deliberately does NOT
-- take a code or prove possession of one, so it is readable by any
-- authenticated user for any team id. That is a real widening compared to the
-- policy alone, and it is bounded on purpose:
--
--   - It returns name, team_type, invite_policy and require_coach_approval.
--     None is a secret. They answer "may I join this team, and what happens if
--     I do" — the question the join screen exists to answer.
--   - It never returns join_code (the actual secret), created_by, or any other
--     column.
--   - It is a strict reduction from today, where USING(true) hands every
--     authenticated user every column of every team including join_code.
--
-- The alternative — threading the resolved team object down from the code
-- lookup — was rejected because joinTeam() is also reached from the
-- invitation flow, so the fields would have to be plumbed through two callers
-- and a public function signature to avoid one function. That trades a small,
-- reviewable read surface for a larger, less obvious refactor of a security-
-- sensitive path at the exact moment it is being tightened.
CREATE OR REPLACE FUNCTION public.get_baseball_team_join_context(
  p_team_id uuid
)
RETURNS TABLE (
  id                     uuid,
  name                   text,
  team_type              public.baseball_coach_type,
  invite_policy          text,
  require_coach_approval boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT bt.id, bt.name, bt.team_type, bt.invite_policy, bt.require_coach_approval
  FROM public.baseball_teams bt
  WHERE bt.id = p_team_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_baseball_team_join_context(uuid) IS
  'Non-secret join-flow context for a team (name, team_type, invite_policy, require_coach_approval), companion to the tenant-isolation fix (2026-07-29). Required because validatePlayerCanJoinTeamImpl and joinTeamImpl both read baseball_teams for a caller who has no membership yet — after the tightened policy those reads return zero rows and the join fails with "Team not found". Never returns join_code or created_by. A strict reduction from the USING(true) policy it replaces, which exposed every column of every team.';

REVOKE ALL ON FUNCTION public.get_baseball_team_join_context(uuid) FROM PUBLIC;
-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon, and REVOKE ... FROM PUBLIC does not remove a role-specific grant.
REVOKE EXECUTE ON FUNCTION public.get_baseball_team_join_context(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_baseball_team_join_context(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 6 — a pending member must still see their own team
-- ----------------------------------------------------------------------------
-- public.is_baseball_team_member() requires status = 'active'
-- (20260624000050:250-266). But joinTeamImpl inserts status = 'pending'
-- whenever require_coach_approval is not explicitly false — which is the
-- fail-closed DEFAULT. So under migration B's policy, a player who has just
-- successfully joined a team cannot read that team's row until a coach
-- approves them: their own pending-approval screen would render nothing.
--
-- That is a bug in the new policy, not in the helper. `is_baseball_team_member`
-- means "is an ACTIVE member" and is used elsewhere to gate real team data —
-- widening it would silently grant pending players access across every policy
-- that calls it. So this adds a SEPARATE, narrower predicate used only by the
-- baseball_teams SELECT policy: you may read the team row you have ANY
-- membership row for, including pending or inactive.
--
-- Reading the name of a team you have applied to is not a leak — you had to
-- possess its join code or an invitation to create that row at all.
CREATE OR REPLACE FUNCTION public.has_any_baseball_team_membership(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_team_members btm
    JOIN public.baseball_players bp ON bp.id = btm.player_id
    WHERE btm.team_id = p_team_id
      AND bp.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.has_any_baseball_team_membership(uuid) IS
  'True when the caller has ANY baseball_team_members row for the team, regardless of status — unlike is_baseball_team_member(), which requires status = ''active''. Used ONLY by baseball_teams_select (2026-07-29 tenant-isolation fix) so a player awaiting coach approval can still see the team they joined. Deliberately separate from is_baseball_team_member so widening it here cannot leak into the many other policies that call that helper to gate real team data.';

REVOKE ALL ON FUNCTION public.has_any_baseball_team_membership(uuid) FROM PUBLIC;
-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon, and REVOKE ... FROM PUBLIC does not remove a role-specific grant.
REVOKE EXECUTE ON FUNCTION public.has_any_baseball_team_membership(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_any_baseball_team_membership(uuid) TO authenticated, service_role;

-- ============================================================================
-- END migration A (additive). Nothing here changes existing behaviour.
-- Next: deploy the companion app changes, THEN apply migration B
-- (20260729000200_baseball_tenant_isolation_rls_b_policies.sql).
-- ============================================================================
