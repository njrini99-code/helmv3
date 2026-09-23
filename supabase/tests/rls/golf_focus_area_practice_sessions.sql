-- A8 slice 2 (addendum "collect only useful context and complete the
-- coaching action", folded into Pkg 9): RLS contract for the new
-- golf_focus_area_practice_sessions table
-- (migration 20260923110000_golf_focus_area_practice_log.sql).
--
-- Visibility mirrors golf_player_focus_areas exactly: a session row is
-- visible only through the "re-run the caller's own golf_player_focus_areas
-- RLS" EXISTS subquery, so this suite pins that a session is readable by
-- the owning player and a coach on the player's active team, and NOT by a
-- different player or an off-team coach. INSERT follows the same
-- visibility gate plus a WITH CHECK pinning logged_by_user_id to the
-- caller and player_id to the parent focus area's own player_id. The table
-- is append-only: no UPDATE/DELETE policy exists for authenticated, and
-- anon has no grant on the table at all.
--
-- This table ships behind config/feature-flags.yml's
-- coachhelm_focus_area_practice_log flag (default off everywhere); this
-- suite exercises the database contract directly and is independent of
-- that flag's state.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

-- Returns the number of rows a statement affects, or 0 when the role lacks
-- the table privilege outright (RLS denial and missing grant both mean
-- "this user cannot do that"). SECURITY INVOKER on purpose: it runs as the
-- role under test so RLS applies. Lives in public because `authenticated`
-- cannot see the `tests` schema; the surrounding ROLLBACK removes it.
CREATE OR REPLACE FUNCTION public.pgtap_affected_rows(p_sql text) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END $$;
GRANT EXECUTE ON FUNCTION public.pgtap_affected_rows(text) TO authenticated;

DO $$
DECLARE
  v_coach_user     uuid := '00000000-0000-0000-0000-0000000000e1';
  v_coach_id       uuid := '00000000-0000-0000-0000-0000000000e2';
  v_offteam_user   uuid := '00000000-0000-0000-0000-0000000000e3';
  v_offteam_coach  uuid := '00000000-0000-0000-0000-0000000000e4';
  v_team_id        uuid := '00000000-0000-0000-0000-0000000000e5';
  v_offteam_id     uuid := '00000000-0000-0000-0000-0000000000e6';
  v_puser_a        uuid := '00000000-0000-0000-0000-0000000000e7';
  v_puser_b        uuid := '00000000-0000-0000-0000-0000000000e8';
  v_player_a       uuid := '00000000-0000-0000-0000-0000000000e9';
  v_player_b       uuid := '00000000-0000-0000-0000-0000000000ea';
  v_focus_area     uuid := '00000000-0000-0000-0000-0000000000eb';
  v_session_seed   uuid := '00000000-0000-0000-0000-0000000000ec';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_coach_user,    'fasafe-coach@helm.test',    'authenticated'),
    (v_offteam_user,  'fasafe-offcoach@helm.test', 'authenticated'),
    (v_puser_a,       'fasafe-player-a@helm.test', 'authenticated'),
    (v_puser_b,       'fasafe-player-b@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (v_coach_user,    'fasafe-coach@helm.test',    'coach'),
    (v_offteam_user,  'fasafe-offcoach@helm.test', 'coach'),
    (v_puser_a,       'fasafe-player-a@helm.test', 'player'),
    (v_puser_b,       'fasafe-player-b@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id) VALUES
    (v_coach_id, v_coach_user),
    (v_offteam_coach, v_offteam_user)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player_a, v_puser_a),
    (v_player_b, v_puser_b)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (v_team_id, 'pgtap-fasafe', 'FASAFE'),
    (v_offteam_id, 'pgtap-fasafe-off', 'FASAF2')
  ON CONFLICT DO NOTHING;
  -- The off-team coach staffs a DIFFERENT team than the focus area's owner.
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (v_team_id, v_coach_id, 'head_coach', true),
    (v_offteam_id, v_offteam_coach, 'head_coach', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team_id, v_player_a, 'active'),
    (v_team_id, v_player_b, 'active')
  ON CONFLICT DO NOTHING;

  -- Player A's focus area, coached by the on-team coach.
  INSERT INTO public.golf_player_focus_areas
    (id, player_id, team_id, coach_id, area_type, title, status) VALUES
    (v_focus_area, v_player_a, v_team_id, v_coach_id, 'skill', 'FASAFE putting', 'active')
  ON CONFLICT DO NOTHING;

  -- One session seeded as the table owner (RLS bypassed), so the SELECT
  -- visibility assertions below have a row to find or not find.
  INSERT INTO public.golf_focus_area_practice_sessions
    (id, focus_area_id, player_id, logged_by_user_id, logged_by_role,
     practiced_at, client_request_id) VALUES
    (v_session_seed, v_focus_area, v_player_a, v_puser_a, 'player',
     '2026-09-20T10:00:00Z', '00000000-0000-0000-0000-0000000000ed')
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 1. RLS enabled; anon locked out entirely; authenticated has no UPDATE/DELETE.
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'golf_focus_area_practice_sessions'),
  'RLS is ENABLED on golf_focus_area_practice_sessions'
);

SELECT isnt(has_table_privilege('anon', 'public.golf_focus_area_practice_sessions', 'SELECT'), true, 'anon cannot SELECT golf_focus_area_practice_sessions');
SELECT isnt(has_table_privilege('anon', 'public.golf_focus_area_practice_sessions', 'INSERT'), true, 'anon cannot INSERT golf_focus_area_practice_sessions');
SELECT isnt(has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'UPDATE'), true, 'authenticated cannot UPDATE golf_focus_area_practice_sessions (append-only)');
SELECT isnt(has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'DELETE'), true, 'authenticated cannot DELETE golf_focus_area_practice_sessions (append-only)');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_focus_area_practice_sessions_focus_area_id_client_reque_key'),
  'UNIQUE(focus_area_id, client_request_id) constraint exists'
);

-- ---------------------------------------------------------------------------
-- 2. SELECT visibility mirrors golf_player_focus_areas.
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e7", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_practice_sessions
    WHERE id = '00000000-0000-0000-0000-0000000000ec'::uuid),
  1,
  'player A (owner) can read their own practice session'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e8", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_practice_sessions
    WHERE id = '00000000-0000-0000-0000-0000000000ec'::uuid),
  0,
  'player B (a different player) cannot read player A''s practice session'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_practice_sessions
    WHERE id = '00000000-0000-0000-0000-0000000000ec'::uuid),
  1,
  'the on-team coach can read the practice session'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e3", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_practice_sessions
    WHERE id = '00000000-0000-0000-0000-0000000000ec'::uuid),
  0,
  'an off-team coach cannot read the practice session'
);

RESET role;
RESET request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 3. INSERT follows the same visibility gate, plus the WITH CHECK pin.
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e7", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e7'::uuid,
       'player', now(), '00000000-0000-0000-0000-0000000000f1'::uuid)
  $q$),
  1,
  'player A can log their own practice session'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e8", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e8'::uuid,
       'player', now(), '00000000-0000-0000-0000-0000000000f2'::uuid)
  $q$),
  0,
  'player B cannot log a session against player A''s focus area'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e3", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e3'::uuid,
       'coach', now(), '00000000-0000-0000-0000-0000000000f3'::uuid)
  $q$),
  0,
  'an off-team coach cannot log a session against the focus area'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e1'::uuid,
       'coach', now(), '00000000-0000-0000-0000-0000000000f4'::uuid)
  $q$),
  1,
  'the on-team coach can log a session against the focus area'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
