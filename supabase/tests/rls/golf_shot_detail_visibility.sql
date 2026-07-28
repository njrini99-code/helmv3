-- Shot-detail access isolation: putt_details / approach_miss_details.
--
-- 20260728030000 replaced every uncorrelated `shot_id IN (SELECT ...)` policy
-- on these two tables with correlated predicates backed by two helpers:
-- `public.can_read_golf_shot_detail(uuid)` for SELECT and
-- `public.owns_golf_shot(uuid)` for INSERT/UPDATE/DELETE. That migration was a
-- PERFORMANCE fix (a production read went 6.2s -> 0.6s) but it rewrote a
-- security boundary to get there, and the old policies had no behavioral test
-- at all — only the coach-insights suite did. A future edit that simplified
-- either helper would ship green.
--
-- This is a BEHAVIORAL test. It seeds two organisations, and inside the
-- FIRST organisation two teams with different coaching staff, so it can
-- distinguish the cases the helpers must keep apart.
--
-- READ:
--   * the player themself                    -> CAN read
--   * a coach who staffs the player's team    -> CAN read
--   * a coach in the same organisation who
--     does NOT staff the player's team        -> CANNOT read
--   * a coach in a different organisation     -> CANNOT read
--
-- The same-org / different-team case is the one that regressed most easily:
-- the detail tables' own qual only checks organisation membership, and it is
-- the inherited golf_shots readability check that narrows it to the staffing
-- coach. Both conjuncts have to survive for that row to stay hidden.
--
-- WRITE (owner-only — strictly narrower than read):
--   * the player themself                    -> CAN insert/update/delete
--   * a coach who staffs the player's team    -> CANNOT, despite CAN read
--
-- That last pair is the point of the two-helper split. Read and write differ
-- on exactly one actor, so a future refactor that collapsed them into one
-- helper for tidiness would silently hand every staffing coach write access to
-- their players' shot detail. These assertions are what makes that fail.
--
-- Pattern mirrors golf_coach_insights_cross_tenant_select.sql.

BEGIN;
\ir _helpers.sql

SELECT plan(20);

-- ============================================================================
-- Seed as service_role (RLS bypassed for setup).
-- ============================================================================
DO $$
DECLARE
  v_org_1     uuid := '00000000-0000-0000-0000-00000000d001';
  v_org_2     uuid := '00000000-0000-0000-0000-00000000d002';

  -- org 1, team X: player + the coach who staffs that team
  v_userc_x   uuid := '00000000-0000-0000-0000-00000000d011';
  v_coach_x   uuid := '00000000-0000-0000-0000-00000000d012';
  v_team_x    uuid := '00000000-0000-0000-0000-00000000d013';
  v_userp     uuid := '00000000-0000-0000-0000-00000000d014';
  v_player    uuid := '00000000-0000-0000-0000-00000000d015';

  -- org 1, team Y: a coach in the SAME organisation, different team
  v_userc_y   uuid := '00000000-0000-0000-0000-00000000d021';
  v_coach_y   uuid := '00000000-0000-0000-0000-00000000d022';
  v_team_y    uuid := '00000000-0000-0000-0000-00000000d023';

  -- org 2: an unrelated coach
  v_userc_z   uuid := '00000000-0000-0000-0000-00000000d031';
  v_coach_z   uuid := '00000000-0000-0000-0000-00000000d032';
  v_team_z    uuid := '00000000-0000-0000-0000-00000000d033';

  v_round     uuid := '00000000-0000-0000-0000-00000000d041';
  v_hole      uuid := '00000000-0000-0000-0000-00000000d042';
  v_shot_putt uuid := '00000000-0000-0000-0000-00000000d043';
  v_shot_appr uuid := '00000000-0000-0000-0000-00000000d044';
  -- Deliberately left WITHOUT a putt_details row: the write assertions need a
  -- shot that is free to insert against, and putt_details.shot_id is UNIQUE.
  v_shot_free uuid := '00000000-0000-0000-0000-00000000d045';
  -- Compatibility fixture: the schema has independent round_id and hole_id
  -- foreign keys, so legacy rows can point at a hole from another round.
  v_round_y   uuid := '00000000-0000-0000-0000-00000000d046';
  v_shot_cross uuid := '00000000-0000-0000-0000-00000000d047';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_userc_x, 'shotdetail-coach-x@helm.test', 'authenticated'),
    (v_userc_y, 'shotdetail-coach-y@helm.test', 'authenticated'),
    (v_userc_z, 'shotdetail-coach-z@helm.test', 'authenticated'),
    (v_userp,   'shotdetail-player@helm.test',  'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (v_userc_x, 'shotdetail-coach-x@helm.test', 'coach'),
    (v_userc_y, 'shotdetail-coach-y@helm.test', 'coach'),
    (v_userc_z, 'shotdetail-coach-z@helm.test', 'coach'),
    (v_userp,   'shotdetail-player@helm.test',  'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    (v_org_1, 'pgtap-shotdetail-org-1', 'college'),
    (v_org_2, 'pgtap-shotdetail-org-2', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (v_coach_x, v_userc_x, v_org_1),
    (v_coach_y, v_userc_y, v_org_1),
    (v_coach_z, v_userc_z, v_org_2)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player, v_userp)
  ON CONFLICT DO NOTHING;

  -- golf_teams_org_gender_uidx is UNIQUE (organization_id, gender), so the two
  -- teams inside org 1 have to differ on gender to coexist.
  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (v_team_x, 'pgtap-shotdetail-team-X', 'PGSDX1', v_org_1, 'mens'),
    (v_team_y, 'pgtap-shotdetail-team-Y', 'PGSDY1', v_org_1, 'womens'),
    (v_team_z, 'pgtap-shotdetail-team-Z', 'PGSDZ1', v_org_2, 'mens')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (v_team_x, v_coach_x, 'head_coach', true),
    (v_team_y, v_coach_y, 'head_coach', true),
    (v_team_z, v_coach_z, 'head_coach', true)
  ON CONFLICT DO NOTHING;

  -- The player is on team X only.
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team_x, v_player, 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status) VALUES
    (v_round,   v_player, v_team_x, CURRENT_DATE, 'completed'),
    (v_round_y, v_player, v_team_y, CURRENT_DATE, 'completed')
  ON CONFLICT DO NOTHING;

  -- golf_holes fires golf_holes_recompute_round_totals_fn ->
  -- recompute_golf_round_totals, which RAISEs 'Forbidden' unless auth.uid() is
  -- the round's player or a coach of its team. Seeding runs as service_role
  -- with no JWT, so claim the player's identity for this insert only.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_userp::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES
    (v_hole, v_round, 1, 4)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type) VALUES
    (v_shot_putt, v_round, v_hole, 1, 4, 'putting'),
    (v_shot_appr, v_round, v_hole, 1, 2, 'approach'),
    (v_shot_free, v_round, v_hole, 1, 5, 'putting'),
    (v_shot_cross, v_round_y, v_hole, 1, 6, 'putting')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.putt_details (shot_id, made) VALUES
    (v_shot_putt, false),
    (v_shot_cross, false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.approach_miss_details (shot_id, miss_direction) VALUES
    (v_shot_appr, 'long')
  ON CONFLICT DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- Row-count probes for the write assertions.
--
-- A blocked UPDATE/DELETE under RLS is not an error — the USING qual simply
-- matches nothing and the statement reports zero rows. Counting those rows is
-- the only way to tell "policy refused" from "policy allowed", and it cannot be
-- done inline: a data-modifying CTE is illegal inside a scalar subquery, which
-- is what pgTAP's `is(...)` takes.
--
-- These are SECURITY INVOKER (the default) on purpose: they must run with the
-- caller's identity so the policies under test still apply.
-- ----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.update_putt_rows(p_shot uuid, p_made boolean)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE public.putt_details SET made = p_made WHERE shot_id = p_shot;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION pg_temp.delete_putt_rows(p_shot uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.putt_details WHERE shot_id = p_shot;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ============================================================================
-- The player reads their own shot details.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d014", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.putt_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d043'),
  1,
  'player CAN read their own putt_details'
);

SELECT is(
  (SELECT count(*)::int FROM public.approach_miss_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d044'),
  1,
  'player CAN read their own approach_miss_details'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- The coach who staffs the player's team reads them too.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d011", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.putt_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d043'),
  1,
  'staffing coach CAN read the player putt_details'
);

SELECT is(
  (SELECT count(*)::int FROM public.approach_miss_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d044'),
  1,
  'staffing coach CAN read the player approach_miss_details'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Same organisation, different team — must NOT read.
--
-- This is the assertion that fails if the helper ever drops the inherited
-- golf_shots readability conjunct: the detail tables' own qual is satisfied
-- for this coach (they ARE in the player's organisation), and only the
-- is_golf_team_coach check on the round's team keeps them out.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d021", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.putt_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d043'),
  0,
  'same-org coach who does NOT staff the team CANNOT read putt_details'
);

SELECT is(
  (SELECT count(*)::int FROM public.approach_miss_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d044'),
  0,
  'same-org coach who does NOT staff the team CANNOT read approach_miss_details'
);

-- The old detail policy also inherited golf_shots' round_id-based team branch.
-- Preserve that behavior for a legacy inconsistent row whose shot.round_id is
-- on team Y while its hole belongs to team X. Without the explicit round path
-- in can_read_golf_shot_detail, this row is incorrectly hidden from coach Y.
SELECT is(
  (SELECT count(*)::int FROM public.putt_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d047'),
  1,
  'round-team coach retains legacy read access when shot and hole rounds differ'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Different organisation — must NOT read.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d031", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.putt_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d043'),
  0,
  'cross-org coach CANNOT read putt_details'
);

SELECT is(
  (SELECT count(*)::int FROM public.approach_miss_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d044'),
  0,
  'cross-org coach CANNOT read approach_miss_details'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- WRITE: owner-only, and strictly narrower than read.
--
-- The staffing coach passes every read assertion above. Each "coach CANNOT"
-- assertion below therefore fails the moment the write policies are pointed at
-- the read helper — which is the single most likely way this migration gets
-- undone by a later tidy-up.
-- ============================================================================

-- The player owns the round, so they may create detail on their own shot.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d014", "role": "authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.putt_details (shot_id, made)
    VALUES ('00000000-0000-0000-0000-00000000d045', false)$$,
  'player CAN insert putt_details on their own shot'
);

SELECT is(
  pg_temp.update_putt_rows('00000000-0000-0000-0000-00000000d045', true),
  1,
  'player CAN update their own putt_details'
);

RESET role;
RESET request.jwt.claims;

-- The staffing coach: reads yes (asserted above), writes no.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d011", "role": "authenticated"}';

-- Sanity: this actor really can see the row it is about to fail to change,
-- so the two assertions after it are about the WRITE boundary and not about
-- the coach simply having no visibility.
SELECT is(
  (SELECT count(*)::int FROM public.putt_details
   WHERE shot_id = '00000000-0000-0000-0000-00000000d045'),
  1,
  'staffing coach CAN read the row it must not write'
);

SELECT throws_ok(
  $$INSERT INTO public.putt_details (shot_id, made)
    VALUES ('00000000-0000-0000-0000-00000000d044', false)$$,
  '42501',
  NULL,
  'staffing coach CANNOT insert putt_details for their player'
);

-- No error for UPDATE/DELETE: the USING qual simply matches nothing, so the
-- statement succeeds having touched zero rows. Asserting 0 is the only way to
-- catch a widened qual here.
SELECT is(
  pg_temp.update_putt_rows('00000000-0000-0000-0000-00000000d045', false),
  0,
  'staffing coach CANNOT update their player putt_details'
);

SELECT is(
  pg_temp.delete_putt_rows('00000000-0000-0000-0000-00000000d045'),
  0,
  'staffing coach CANNOT delete their player putt_details'
);

RESET role;
RESET request.jwt.claims;

-- Cross-org coach cannot write either.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d031", "role": "authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.approach_miss_details (shot_id, miss_direction)
    VALUES ('00000000-0000-0000-0000-00000000d045', 'long')$$,
  '42501',
  NULL,
  'cross-org coach CANNOT insert approach_miss_details'
);

RESET role;
RESET request.jwt.claims;

-- The owner can still remove it, so the coach's failed DELETE above was the
-- policy and not a missing row.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000d014", "role": "authenticated"}';

SELECT is(
  pg_temp.delete_putt_rows('00000000-0000-0000-0000-00000000d045'),
  1,
  'player CAN delete their own putt_details'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Both helpers must stay SECURITY DEFINER with a pinned search_path. Without
-- the pin, a caller-controlled search_path could shadow the tables they join.
-- ============================================================================
SELECT is(
  (SELECT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'can_read_golf_shot_detail'),
  true,
  'can_read_golf_shot_detail is SECURITY DEFINER with a pinned search_path'
);

SELECT is(
  (SELECT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'owns_golf_shot'),
  true,
  'owns_golf_shot is SECURITY DEFINER with a pinned search_path'
);

-- Neither helper may be callable by anon: they are SECURITY DEFINER readers of
-- the whole shot graph, so a direct anon call is an information leak even
-- though the policies that use them are scoped TO authenticated.
SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('can_read_golf_shot_detail', 'owns_golf_shot')),
  false,
  'neither shot-detail RLS helper is executable by anon'
);

SELECT * FROM finish();
ROLLBACK;
