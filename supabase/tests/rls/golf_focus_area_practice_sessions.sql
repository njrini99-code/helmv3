-- A8 slice 2 (addendum "collect only useful context and complete the
-- coaching action", folded into Pkg 9): RLS contract for the two new
-- tables added by migration 20260923110000_golf_focus_area_practice_log.sql
-- -- golf_focus_area_practice_sessions (append-only practice log) and
-- golf_focus_area_criteria (coach-authored "done" definitions, replacing
-- the originally-planned jsonb column on golf_player_focus_areas per the
-- db-migration-reviewer's design change: see this migration's own header).
--
-- Sessions: visibility mirrors golf_player_focus_areas exactly: a session
-- row is visible only through the "re-run the caller's own
-- golf_player_focus_areas RLS" EXISTS subquery, so this suite pins that a
-- session is readable by the owning player and a coach on the player's
-- active team, and NOT by a different player or an off-team coach. INSERT
-- binds the CLAIMED logged_by_role to what the database can verify (a
-- forged logged_by_user_id or logged_by_role must be denied, as must a
-- player_id that doesn't match the parent focus area's own player_id, even
-- for an otherwise-valid on-team coach). The table is append-only: no
-- UPDATE/DELETE policy exists for authenticated, and anon has no grant on
-- the table at all. The dedupe key (client_request_id) makes a repeat
-- ON CONFLICT DO NOTHING a no-op, while a plain duplicate (no ON CONFLICT
-- clause) raises 23505.
--
-- Criteria: SELECT mirrors the same focus-area visibility. INSERT and
-- UPDATE are coach-only (a player, and an off-team coach, must be denied
-- both); INSERT additionally pins created_by_user_id to the caller and
-- requires the focus area's own player_id to match, so a coach cannot
-- forge authorship or attach a criterion to the wrong player. UPDATE is
-- column-restricted via GRANT to (met, met_at, updated_at) -- label and
-- source are immutable after INSERT even for an on-team coach.
--
-- Both tables ship behind config/feature-flags.yml's
-- coachhelm_focus_area_practice_log flag (default off everywhere); this
-- suite exercises the database contract directly and is independent of
-- that flag's state.

BEGIN;
\ir _helpers.sql

SELECT plan(45);

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
  v_criterion_seed uuid := '00000000-0000-0000-0000-0000000000ee';
  v_fa_proposed    uuid := '00000000-0000-0000-0000-0000000000f8';
  v_fa_declined    uuid := '00000000-0000-0000-0000-0000000000f9';
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

  -- Two more of player A's focus areas, NOT in an actionable lifecycle
  -- state, for the "session against a non-actionable focus area is denied"
  -- assertions below (S4).
  INSERT INTO public.golf_player_focus_areas
    (id, player_id, team_id, coach_id, area_type, title, status) VALUES
    (v_fa_proposed, v_player_a, v_team_id, v_coach_id, 'skill', 'FASAFE proposed', 'proposed'),
    (v_fa_declined, v_player_a, v_team_id, v_coach_id, 'skill', 'FASAFE declined', 'declined')
  ON CONFLICT DO NOTHING;

  -- One session seeded as the table owner (RLS bypassed), so the SELECT
  -- visibility assertions below have a row to find or not find.
  INSERT INTO public.golf_focus_area_practice_sessions
    (id, focus_area_id, player_id, logged_by_user_id, logged_by_role,
     practiced_at, client_request_id) VALUES
    (v_session_seed, v_focus_area, v_player_a, v_puser_a, 'player',
     '2026-09-20T10:00:00Z', '00000000-0000-0000-0000-0000000000ed')
  ON CONFLICT DO NOTHING;

  -- One criterion seeded as the table owner, likewise for the criteria
  -- SELECT/UPDATE visibility assertions below.
  INSERT INTO public.golf_focus_area_criteria
    (id, focus_area_id, player_id, label, source, created_by_user_id) VALUES
    (v_criterion_seed, v_focus_area, v_player_a, 'FASAFE checkpoint', 'coach', v_coach_user)
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Sessions: RLS enabled; anon locked out entirely; authenticated has no
--    UPDATE/DELETE; the dedupe UNIQUE constraint exists.
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
    WHERE conname = 'golf_focus_area_practice_sessions_dedupe_key'),
  'UNIQUE(focus_area_id, client_request_id) dedupe constraint exists'
);

-- ---------------------------------------------------------------------------
-- 2. Sessions: SELECT visibility mirrors golf_player_focus_areas.
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
-- 3. Sessions: INSERT follows the same visibility gate, plus the role-bound
--    WITH CHECK.
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

-- ---------------------------------------------------------------------------
-- 4. Sessions: dedupe (ON CONFLICT DO NOTHING is a no-op; a plain duplicate
--    throws 23505), plus forged-identity and mismatched-player denials.
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
    ON CONFLICT (focus_area_id, client_request_id) DO NOTHING
  $q$),
  0,
  'repeating the same (focus_area_id, client_request_id) with ON CONFLICT DO NOTHING affects 0 rows'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_practice_sessions
    WHERE client_request_id = '00000000-0000-0000-0000-0000000000f1'::uuid),
  1,
  'the row count for that client_request_id stays at 1 after the repeat'
);

SELECT throws_ok(
  $q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e7'::uuid,
       'player', now(), '00000000-0000-0000-0000-0000000000f1'::uuid)
  $q$,
  '23505',
  'a plain duplicate (focus_area_id, client_request_id), no ON CONFLICT clause, raises 23505'
);

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e8'::uuid,
       'player', now(), '00000000-0000-0000-0000-0000000000f5'::uuid)
  $q$),
  0,
  'a forged logged_by_user_id (not the caller''s own uid) is denied'
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
       '00000000-0000-0000-0000-0000000000ea'::uuid,
       '00000000-0000-0000-0000-0000000000e1'::uuid,
       'coach', now(), '00000000-0000-0000-0000-0000000000f6'::uuid)
  $q$),
  0,
  'a mismatched player_id (not the focus area''s own player) is denied, even for the on-team coach'
);

RESET role;
RESET request.jwt.claims;

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
       'coach', now(), '00000000-0000-0000-0000-0000000000f7'::uuid)
  $q$),
  0,
  'a forged logged_by_role (player claiming coach) is denied'
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
       'player', now(), '00000000-0000-0000-0000-0000000000fa'::uuid)
  $q$),
  0,
  'an on-team coach claiming logged_by_role = player is denied'
);

RESET role;
RESET request.jwt.claims;

-- S4: a session can't be logged against a focus area that isn't in an
-- actionable lifecycle state, for either role, even by an otherwise-valid
-- on-team coach against their own player.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000f8'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e1'::uuid,
       'coach', now(), '00000000-0000-0000-0000-0000000000fb'::uuid)
  $q$),
  0,
  'a session cannot be logged against a proposed (not yet accepted) focus area'
);

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_practice_sessions
      (focus_area_id, player_id, logged_by_user_id, logged_by_role,
       practiced_at, client_request_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000f9'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       '00000000-0000-0000-0000-0000000000e1'::uuid,
       'coach', now(), '00000000-0000-0000-0000-0000000000fc'::uuid)
  $q$),
  0,
  'a session cannot be logged against a declined focus area'
);

RESET role;
RESET request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 5. Criteria: RLS enabled; anon locked out; authenticated has no DELETE;
--    UPDATE is column-restricted to (met, met_at, updated_at); the label
--    unique index exists.
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'golf_focus_area_criteria'),
  'RLS is ENABLED on golf_focus_area_criteria'
);

SELECT isnt(has_table_privilege('anon', 'public.golf_focus_area_criteria', 'SELECT'), true, 'anon cannot SELECT golf_focus_area_criteria');
SELECT isnt(has_table_privilege('anon', 'public.golf_focus_area_criteria', 'INSERT'), true, 'anon cannot INSERT golf_focus_area_criteria');
SELECT isnt(has_table_privilege('authenticated', 'public.golf_focus_area_criteria', 'DELETE'), true, 'authenticated cannot DELETE golf_focus_area_criteria');

SELECT ok(
  has_column_privilege('authenticated', 'public.golf_focus_area_criteria', 'met', 'UPDATE'),
  'authenticated can UPDATE golf_focus_area_criteria.met'
);
SELECT isnt(
  has_column_privilege('authenticated', 'public.golf_focus_area_criteria', 'label', 'UPDATE'),
  true,
  'authenticated cannot UPDATE golf_focus_area_criteria.label'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'golf_focus_area_criteria'
      AND indexname = 'golf_focus_area_criteria_label_unique_idx'),
  'UNIQUE(focus_area_id, lower(label)) index exists'
);

-- ---------------------------------------------------------------------------
-- 6. Criteria: SELECT visibility mirrors golf_player_focus_areas.
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e7", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_criteria
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid),
  1,
  'player A (owner) can read their own criterion'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e8", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_criteria
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid),
  0,
  'player B (a different player) cannot read player A''s criterion'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_criteria
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid),
  1,
  'the on-team coach can read the criterion'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e3", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_focus_area_criteria
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid),
  0,
  'an off-team coach cannot read the criterion'
);

RESET role;
RESET request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 7. Criteria: INSERT is coach-only, pins created_by_user_id, and requires
--    the focus area's own player_id to match.
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e7", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_criteria
      (focus_area_id, player_id, label, source, created_by_user_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       'player-authored attempt', 'coach',
       '00000000-0000-0000-0000-0000000000e7'::uuid)
  $q$),
  0,
  'a player cannot INSERT a criterion'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e3", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_criteria
      (focus_area_id, player_id, label, source, created_by_user_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       'off-team attempt', 'coach',
       '00000000-0000-0000-0000-0000000000e3'::uuid)
  $q$),
  0,
  'an off-team coach cannot INSERT a criterion'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_criteria
      (focus_area_id, player_id, label, source, created_by_user_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       'stance at address', 'coach',
       '00000000-0000-0000-0000-0000000000e1'::uuid)
  $q$),
  1,
  'the on-team coach can INSERT a criterion'
);

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_criteria
      (focus_area_id, player_id, label, source, created_by_user_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000e9'::uuid,
       'forged authorship attempt', 'coach',
       '00000000-0000-0000-0000-0000000000e3'::uuid)
  $q$),
  0,
  'a forged created_by_user_id (not the caller''s own uid) is denied'
);

SELECT is(
  public.pgtap_affected_rows($q$
    INSERT INTO public.golf_focus_area_criteria
      (focus_area_id, player_id, label, source, created_by_user_id)
    VALUES
      ('00000000-0000-0000-0000-0000000000eb'::uuid,
       '00000000-0000-0000-0000-0000000000ea'::uuid,
       'mismatched player attempt', 'coach',
       '00000000-0000-0000-0000-0000000000e1'::uuid)
  $q$),
  0,
  'a mismatched player_id (not the focus area''s own player) is denied, even for the on-team coach'
);

RESET role;
RESET request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 8. Criteria: UPDATE (met) is coach-only; label stays immutable even for
--    the on-team coach, enforced by the column grant.
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e7", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_focus_area_criteria SET met = true
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid
  $q$),
  0,
  'a player cannot UPDATE met on a criterion'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e3", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_focus_area_criteria SET met = true
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid
  $q$),
  0,
  'an off-team coach cannot UPDATE met on a criterion'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_focus_area_criteria SET label = 'rewritten label'
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid
  $q$),
  0,
  'the on-team coach cannot UPDATE label (column-grant enforced)'
);

SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_focus_area_criteria SET met = true
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid
  $q$),
  1,
  'the on-team coach can UPDATE met on a criterion'
);

-- S4: focus_area_id and created_by_user_id are outside the column-restricted
-- UPDATE grant (met, met_at, updated_at only) -- an UPDATE statement whose
-- SET list includes either is rejected at the GRANT/privilege layer, before
-- the WITH CHECK even runs, same as label above.
SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_focus_area_criteria
    SET focus_area_id = '00000000-0000-0000-0000-0000000000f8'::uuid
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid
  $q$),
  0,
  'the on-team coach cannot UPDATE focus_area_id (column-grant enforced)'
);

SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_focus_area_criteria
    SET created_by_user_id = '00000000-0000-0000-0000-0000000000e3'::uuid
    WHERE id = '00000000-0000-0000-0000-0000000000ee'::uuid
  $q$),
  0,
  'the on-team coach cannot UPDATE created_by_user_id (column-grant enforced)'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
