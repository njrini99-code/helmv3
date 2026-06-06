-- TS7 (silent-regression gap, COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06
-- §8 + §10.20): cross-tenant SELECT isolation on golf_coach_insights had NO
-- behavioral test. The read-isolation contract was only ever asserted via the
-- column-grant test (coach_insights_player_update.sql); a regression that
-- widened the SELECT policy USING clause (or dropped tenant scoping) would
-- ship green.
--
-- This is a BEHAVIORAL test: it seeds two independent tenants (coach A @ team A
-- and coach B @ team B, each with one player + one player-scoped insight),
-- impersonates coach B via the authenticated role + JWT, and asserts coach B's
-- RLS-filtered SELECT sees ONLY their own tenant's rows — never coach A's.
--
-- Policies under test (20260527000000_prod_public_baseline.sql):
--   "Coaches can view their own insights"        (coach_id / team_id ownership)
--   "coach_insights_select_via_player_team"      (team-member linkage)
--   "admin_read_all"                             (must NOT fire for a non-admin)
--
-- Pattern mirrors baseball_recalc_body_guards.sql (SET LOCAL role + jwt.claims).

BEGIN;
\ir _helpers.sql

SELECT plan(6);

-- ============================================================================
-- Seed two isolated tenants as service_role (RLS bypassed for setup).
-- ============================================================================
DO $$
DECLARE
  v_user_a    uuid := '00000000-0000-0000-0000-0000000000a1'; -- coach A user
  v_user_b    uuid := '00000000-0000-0000-0000-0000000000b1'; -- coach B user
  v_coach_a   uuid := '00000000-0000-0000-0000-0000000000a2';
  v_coach_b   uuid := '00000000-0000-0000-0000-0000000000b2';
  v_team_a    uuid := '00000000-0000-0000-0000-0000000000a3';
  v_team_b    uuid := '00000000-0000-0000-0000-0000000000b3';
  v_puser_a   uuid := '00000000-0000-0000-0000-0000000000a4'; -- player A user
  v_puser_b   uuid := '00000000-0000-0000-0000-0000000000b4';
  v_player_a  uuid := '00000000-0000-0000-0000-0000000000a5';
  v_player_b  uuid := '00000000-0000-0000-0000-0000000000b5';
BEGIN
  -- auth.users + public.users for both coaches and both players.
  INSERT INTO auth.users (id, email, role) VALUES
    (v_user_a,  'coachA@helm.test',  'authenticated'),
    (v_user_b,  'coachB@helm.test',  'authenticated'),
    (v_puser_a, 'playerA@helm.test', 'authenticated'),
    (v_puser_b, 'playerB@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (v_user_a,  'coachA@helm.test',  'coach'),
    (v_user_b,  'coachB@helm.test',  'coach'),
    (v_puser_a, 'playerA@helm.test', 'player'),
    (v_puser_b, 'playerB@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id) VALUES
    (v_coach_a, v_user_a),
    (v_coach_b, v_user_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player_a, v_puser_a),
    (v_player_b, v_puser_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (v_team_a, 'pgtap-team-A', 'PGTAPA'),
    (v_team_b, 'pgtap-team-B', 'PGTAPB')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (v_team_a, v_coach_a, 'head_coach', true),
    (v_team_b, v_coach_b, 'head_coach', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team_a, v_player_a, 'active'),
    (v_team_b, v_player_b, 'active')
  ON CONFLICT DO NOTHING;

  -- One player-scoped insight per tenant.
  INSERT INTO public.golf_coach_insights
    (id, coach_id, player_id, team_id, insight_type, title, content, priority, category)
  VALUES
    ('00000000-0000-0000-0000-0000000000af', v_coach_a, v_player_a, v_team_a,
       'value_derived', 'A insight', 'tenant A only', 'high', 'putting'),
    ('00000000-0000-0000-0000-0000000000bf', v_coach_b, v_player_b, v_team_b,
       'value_derived', 'B insight', 'tenant B only', 'high', 'putting')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Impersonate coach B (authenticated). RLS now applies.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

-- Coach B sees their own tenant's insight.
SELECT is(
  (SELECT count(*)::int FROM public.golf_coach_insights
   WHERE id = '00000000-0000-0000-0000-0000000000bf'),
  1,
  'coach B CAN read their own tenant insight'
);

-- Coach B is BLOCKED from coach A's insight (the isolation contract).
SELECT is(
  (SELECT count(*)::int FROM public.golf_coach_insights
   WHERE id = '00000000-0000-0000-0000-0000000000af'),
  0,
  'coach B CANNOT read coach A cross-tenant insight'
);

-- A blanket scan returns ONLY coach B's row — never coach A's.
SELECT is(
  (SELECT count(*)::int FROM public.golf_coach_insights
   WHERE id IN ('00000000-0000-0000-0000-0000000000af',
                '00000000-0000-0000-0000-0000000000bf')),
  1,
  'coach B blanket SELECT yields exactly one of the two seeded rows'
);

SELECT is(
  (SELECT coach_id FROM public.golf_coach_insights
   WHERE id IN ('00000000-0000-0000-0000-0000000000af',
                '00000000-0000-0000-0000-0000000000bf')
   LIMIT 1),
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'the only visible row belongs to coach B'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Symmetry check — impersonate coach A; the isolation holds the other way.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_coach_insights
   WHERE id = '00000000-0000-0000-0000-0000000000bf'),
  0,
  'coach A CANNOT read coach B cross-tenant insight (symmetry)'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_coach_insights
   WHERE id = '00000000-0000-0000-0000-0000000000af'),
  1,
  'coach A CAN read their own tenant insight (symmetry)'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
