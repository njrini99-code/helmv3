-- Shot-detail read isolation: putt_details / approach_miss_details.
--
-- 20260728030000 replaced the four uncorrelated `shot_id IN (SELECT ...)`
-- SELECT policies on these two tables with a single correlated predicate
-- backed by `public.can_read_golf_shot_detail(uuid)`. That migration was a
-- PERFORMANCE fix (a production read went 4.6s -> 0.3s) but it rewrote a
-- security boundary to get there, and the old policies had no behavioral
-- test at all — only the coach-insights suite did. A future edit that
-- simplified the helper (most temptingly: dropping the shot-readability
-- conjunct, or widening the coach branch from "staffs the team" to "is in
-- the organisation") would ship green.
--
-- This is a BEHAVIORAL test. It seeds two organisations, and inside the
-- FIRST organisation two teams with different coaching staff, so it can
-- distinguish the three cases the helper must keep apart:
--
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
-- Pattern mirrors golf_coach_insights_cross_tenant_select.sql.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

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
    (v_round, v_player, v_team_x, CURRENT_DATE, 'completed')
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
    (v_shot_appr, v_round, v_hole, 1, 2, 'approach')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.putt_details (shot_id, made) VALUES
    (v_shot_putt, false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.approach_miss_details (shot_id, miss_direction) VALUES
    (v_shot_appr, 'long')
  ON CONFLICT DO NOTHING;
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
-- The helper must stay SECURITY DEFINER with a pinned search_path. Without
-- the pin, a caller-controlled search_path could shadow the tables it joins.
-- ============================================================================
SELECT is(
  (SELECT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'can_read_golf_shot_detail'),
  true,
  'can_read_golf_shot_detail is SECURITY DEFINER with a pinned search_path'
);

SELECT * FROM finish();
ROLLBACK;
