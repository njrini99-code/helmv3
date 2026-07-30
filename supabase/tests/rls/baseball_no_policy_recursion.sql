-- ============================================================================
-- pgTAP: no RLS policy on the context-resolution path recurses.
--
-- WHY THIS SUITE EXISTS. `20260527000000_prod_public_baseline.sql` creates
-- `baseball_team_members_select` with a subquery over the table the policy is ON:
--
--   OR EXISTS (SELECT 1 FROM baseball_players bp
--              JOIN baseball_team_members btm ON btm.player_id = bp.id
--              WHERE btm.team_id = baseball_team_members.team_id
--                AND bp.user_id = auth.uid())
--
-- so any database built from the tracked migrations answers
-- `infinite recursion detected in policy for relation "baseball_team_members"`
-- for EVERY select against it — not just that branch. Production does not,
-- because the predicate was replaced out of band with a `SECURITY DEFINER` call
-- and that fix was never committed. `20260730040000` finally commits it; this
-- suite is what proves the repair landed.
--
-- WHY pgTAP AND NOT ONLY THE STATIC GUARD.
-- `src/test/schema/no-self-referencing-rls-policy.test.ts` greps migrations for a
-- policy whose predicate joins its own table. That catches the single-hop shape,
-- and it is where a NEW mistake gets caught cheaply. It cannot see a MULTI-HOP
-- cycle — A's policy reads B, B's policy reads A — which is exactly the shape
-- `20260729000200`'s comments describe:
--
--   baseball_players_select -> baseball_team_members
--     -> baseball_team_members_select -> baseball_players
--       -> baseball_players_select   <- loop
--
-- Only executing a query can catch that, and only against a database built from
-- the migrations. Running the same query against production proves nothing here,
-- because production was patched by hand.
--
-- HOW IT DETECTS RECURSION. Postgres raises SQLSTATE 42P17
-- (invalid_object_definition) for policy recursion. `lives_ok` fails on ANY
-- exception and prints it, so a recursion cycle surfaces with its own message
-- rather than as a bare count mismatch. Each `lives_ok` is paired with a count
-- assertion, because a policy can be non-recursive and still wrong.
--
-- FIXTURES: reuses the id family and insert idiom of
-- baseball_tenant_isolation.sql. Inserts run as the suite owner (before any
-- `SET LOCAL role`), so RLS does not filter the setup itself.
-- ============================================================================

-- `BEGIN;` before `\ir`, matching baseball_coaches_org_scope.sql: _helpers.sql
-- does `CREATE SCHEMA IF NOT EXISTS tests` plus function DDL, and sourcing it
-- outside the transaction would leave that behind after the ROLLBACK. (CI's
-- harness concatenates the helpers ahead of this file and strips the `\ir` line,
-- so this only matters when running the suite directly via `supabase test db`.)
BEGIN;
\ir _helpers.sql

SELECT plan(10);

-- --- Fixtures: one team, one staff coach, one rostered player ---------------
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000cr101', 'reccoach@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000cr201', 'recplayer@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000cr101', 'reccoach@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000cr201', 'recplayer@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name)
    VALUES ('00000000-0000-0000-0000-0000000cr102',
            '00000000-0000-0000-0000-0000000cr101', 'college', 'Recursion Coach')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000cr103', 'Recursion Team', 'college', 'CODERECU')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status)
  VALUES ('00000000-0000-0000-0000-0000000cr103',
          '00000000-0000-0000-0000-0000000cr102', 'head_coach', true, true, 'active')
  ON CONFLICT (team_id, coach_id)
    DO UPDATE SET is_primary = true, is_head_coach = true, status = 'active';

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000cr202',
            '00000000-0000-0000-0000-0000000cr201', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000cr103',
            '00000000-0000-0000-0000-0000000cr202', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 1 — the PLAYER path. This is the one that was broken: the app's
-- `loadMemberships` reads baseball_players then baseball_team_members, and the
-- smoke gate's console showed
--   "Error fetching player teams: infinite recursion detected in policy for
--    relation baseball_team_members"
-- behind a 500 on every authenticated page.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000cr201", "role": "authenticated"}';

SELECT lives_ok(
  $$ SELECT count(*) FROM public.baseball_team_members $$,
  'player: SELECT on baseball_team_members does not recurse'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_team_members
    WHERE team_id = '00000000-0000-0000-0000-0000000cr103'),
  1,
  'player: sees their own team membership row (not merely non-erroring)'
);

SELECT lives_ok(
  $$ SELECT count(*) FROM public.baseball_players $$,
  'player: SELECT on baseball_players does not recurse'
);

-- The multi-hop cycle in 20260729000200's comments runs through the JOIN of these
-- two tables, so exercise them together rather than only one at a time.
SELECT lives_ok(
  $$ SELECT count(*)
       FROM public.baseball_team_members btm
       JOIN public.baseball_players bp ON bp.id = btm.player_id $$,
  'player: the team_members <-> players JOIN does not recurse (multi-hop cycle)'
);

SELECT lives_ok(
  $$ SELECT count(*) FROM public.baseball_teams $$,
  'player: SELECT on baseball_teams does not recurse'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 2 — the COACH path. Every context-resolution policy on this side calls
-- only definer helpers, so it should already be acyclic; asserted so a future
-- change to any of them cannot quietly reintroduce a cycle here.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000cr101", "role": "authenticated"}';

SELECT lives_ok(
  $$ SELECT count(*) FROM public.baseball_team_coach_staff $$,
  'coach: SELECT on baseball_team_coach_staff does not recurse'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_team_coach_staff
    WHERE team_id = '00000000-0000-0000-0000-0000000cr103'),
  1,
  'coach: sees their own staff row (not merely non-erroring)'
);

SELECT lives_ok(
  $$ SELECT count(*) FROM public.baseball_team_members $$,
  'coach: SELECT on baseball_team_members does not recurse'
);

SELECT lives_ok(
  $$ SELECT count(*) FROM public.baseball_coaches $$,
  'coach: SELECT on baseball_coaches does not recurse'
);

-- The full shape `getActiveBaseballContext` issues for a coach: staff row joined
-- to the coach profile, which is where an inline (non-definer) EXISTS would drag
-- another policy in.
SELECT lives_ok(
  $$ SELECT count(*)
       FROM public.baseball_team_coach_staff btcs
       JOIN public.baseball_coaches bc ON bc.id = btcs.coach_id $$,
  'coach: the staff <-> coaches JOIN does not recurse'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
