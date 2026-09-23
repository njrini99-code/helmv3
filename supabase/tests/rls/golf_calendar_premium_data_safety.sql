-- Calendar premium (PR #1911) data-safety contract.
--
-- The PR adds no migration; it adds UI that reaches existing coach-only
-- mutations (soft-cancel, restore, hard-delete, attendance notes) and reads
-- that must never leak a teammate's class. These assertions pin, at the
-- database layer, that:
--   * a player cannot read another player's golf_player_classes row, and a
--     coach of that player's active team can (what class-detail relies on);
--   * a player cannot delete or re-status any golf_events row, nor touch a
--     teammate's attendance row;
--   * a coach's hard delete of ONE cancelled event removes exactly that
--     event and its own attendance rows — golf_players, golf_team_members,
--     golf_player_classes, the class occurrence and every other event's
--     attendance are untouched.
BEGIN;
\ir _helpers.sql

SELECT plan(12);

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
  v_coach_user   uuid := '00000000-0000-0000-0000-0000000000d1';
  v_coach_id     uuid := '00000000-0000-0000-0000-0000000000d2';
  v_team_id      uuid := '00000000-0000-0000-0000-0000000000d3';
  v_puser_a      uuid := '00000000-0000-0000-0000-0000000000d4';
  v_puser_b      uuid := '00000000-0000-0000-0000-0000000000d5';
  v_player_a     uuid := '00000000-0000-0000-0000-0000000000d6';
  v_player_b     uuid := '00000000-0000-0000-0000-0000000000d7';
  v_class_id     uuid := '00000000-0000-0000-0000-0000000000d8';
  v_class_event  uuid := '00000000-0000-0000-0000-0000000000d9';
  v_practice     uuid := '00000000-0000-0000-0000-0000000000da';
  v_cancelled    uuid := '00000000-0000-0000-0000-0000000000db';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_coach_user, 'calsafe-coach@helm.test',   'authenticated'),
    (v_puser_a,    'calsafe-player-a@helm.test','authenticated'),
    (v_puser_b,    'calsafe-player-b@helm.test','authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (v_coach_user, 'calsafe-coach@helm.test',   'coach'),
    (v_puser_a,    'calsafe-player-a@helm.test','player'),
    (v_puser_b,    'calsafe-player-b@helm.test','player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id) VALUES (v_coach_id, v_coach_user)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player_a, v_puser_a),
    (v_player_b, v_puser_b)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (v_team_id, 'pgtap-calsafe', 'CALSAF')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (v_team_id, v_coach_id, 'head_coach', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team_id, v_player_a, 'active'),
    (v_team_id, v_player_b, 'active')
  ON CONFLICT DO NOTHING;

  -- Player B's class and its synced occurrence on the team calendar.
  INSERT INTO public.golf_player_classes (id, player_id, class_name) VALUES
    (v_class_id, v_player_b, 'CALSAFE Organic Chemistry')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_events (id, team_id, title, event_type, description, start_time, end_time, status) VALUES
    (v_class_event, v_team_id, 'CALSAFE Organic Chemistry', 'class',
     '[class:00000000-0000-0000-0000-0000000000d8]',
     '2026-10-01T14:00:00Z', '2026-10-01T15:00:00Z', 'confirmed'),
    (v_practice, v_team_id, 'CALSAFE Practice', 'practice', NULL,
     '2026-10-02T14:00:00Z', '2026-10-02T16:00:00Z', 'confirmed'),
    (v_cancelled, v_team_id, 'CALSAFE Cancelled Meeting', 'meeting', NULL,
     '2026-10-03T14:00:00Z', '2026-10-03T15:00:00Z', 'cancelled')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_event_attendance (event_id, player_id, status) VALUES
    (v_practice,  v_player_a, 'accepted'),
    (v_practice,  v_player_b, 'pending'),
    (v_cancelled, v_player_a, 'accepted')
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Player A: read boundary on classes
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000d4", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_classes
    WHERE id = '00000000-0000-0000-0000-0000000000d8'::uuid),
  0,
  'player A cannot read a teammate''s golf_player_classes row');

SELECT is(
  public.pgtap_affected_rows($q$
    DELETE FROM public.golf_events
     WHERE team_id = '00000000-0000-0000-0000-0000000000d3'::uuid
  $q$),
  0,
  'player A cannot delete any golf_events row');

SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_events SET status = 'cancelled'
     WHERE id = '00000000-0000-0000-0000-0000000000da'::uuid
  $q$),
  0,
  'player A cannot cancel (re-status) a team event');

SELECT is(
  public.pgtap_affected_rows($q$
    UPDATE public.golf_event_attendance SET status = 'declined'
     WHERE event_id = '00000000-0000-0000-0000-0000000000da'::uuid
       AND player_id = '00000000-0000-0000-0000-0000000000d7'::uuid
  $q$),
  0,
  'player A cannot change a teammate''s attendance row');

SELECT is(
  public.pgtap_affected_rows($q$
    DELETE FROM public.golf_event_attendance
     WHERE event_id = '00000000-0000-0000-0000-0000000000da'::uuid
  $q$),
  0,
  'player A cannot delete attendance rows');

RESET role;
RESET request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Coach: can read the class (what class-detail grants "detail" access on)
-- ---------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_classes
    WHERE id = '00000000-0000-0000-0000-0000000000d8'::uuid),
  1,
  'coach of the player''s active team can read the golf_player_classes row');

-- ---------------------------------------------------------------------------
-- Coach hard-deletes ONE cancelled event (deleteGolfEvent hard path)
-- ---------------------------------------------------------------------------
SELECT is(
  public.pgtap_affected_rows($q$
    DELETE FROM public.golf_events
     WHERE id = '00000000-0000-0000-0000-0000000000db'::uuid
       AND team_id = '00000000-0000-0000-0000-0000000000d3'::uuid
  $q$),
  1,
  'coach hard-delete removes exactly the one cancelled event');

RESET role;
RESET request.jwt.claims;

-- Blast radius, checked as the test owner (no RLS in the way).
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-0000000000db'::uuid),
  0,
  'the deleted event''s own attendance rows cascade away');

SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-0000000000da'::uuid),
  2,
  'the practice event keeps both attendance rows');

SELECT is(
  (SELECT count(*)::int FROM public.golf_events
    WHERE id IN ('00000000-0000-0000-0000-0000000000d9'::uuid,
                 '00000000-0000-0000-0000-0000000000da'::uuid)),
  2,
  'the class occurrence and the practice event are still there');

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_classes
    WHERE id = '00000000-0000-0000-0000-0000000000d8'::uuid),
  1,
  'golf_player_classes is untouched by an event delete');

SELECT is(
  (SELECT count(*)::int FROM public.golf_team_members
    WHERE team_id = '00000000-0000-0000-0000-0000000000d3'::uuid
      AND status = 'active')
  + (SELECT count(*)::int FROM public.golf_players
      WHERE id IN ('00000000-0000-0000-0000-0000000000d6'::uuid,
                   '00000000-0000-0000-0000-0000000000d7'::uuid)),
  4,
  'both players and both memberships are untouched by an event delete');

SELECT * FROM finish();
ROLLBACK;
