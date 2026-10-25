-- pgTAP contract for the golf_events updated_at trigger
-- (20261025030000_golf_events_touch_updated_at.sql, held).
--
-- Clubhouse drag and drop (P-4) sends the updated_at it read with every move
-- and updates only that version. The trigger keeps the token true for every
-- writer: a real change bumps it, a no-op does not, and P-14's change marks
-- settle write (helm.change_mark_writer = 'on') does not either. RLS is
-- unchanged: a player, or a coach of another team, moves nothing.
--
-- The whole file is one transaction, so now() is constant: each bump is
-- checked against a known old value set first (through the writer exemption,
-- which also shows the exemption holds).
--
-- Plan arithmetic: 1 structural + 6 coach + 2 refusals = 9.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- ============================================================================
-- Seed. Ids use the 0000...0251xxx range.
--   users: coach 01 (team A), player 02 (team A), coach 03 (team B)
--   event: EV practice on team A
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000251001', 'coach@touchupd.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000251002', 'player@touchupd.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000251003', 'other@touchupd.test',  'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000251201', 'Touch Upd Org A', 'college'),
    ('00000000-0000-0000-0000-000000251202', 'Touch Upd Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000251301', 'Touch Upd Team A', 'GTOUCHUA', '00000000-0000-0000-0000-000000251201'),
    ('00000000-0000-0000-0000-000000251302', 'Touch Upd Team B', 'GTOUCHUB', '00000000-0000-0000-0000-000000251202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000251401', '00000000-0000-0000-0000-000000251001', '00000000-0000-0000-0000-000000251201'),
    ('00000000-0000-0000-0000-000000251403', '00000000-0000-0000-0000-000000251003', '00000000-0000-0000-0000-000000251202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000251301', '00000000-0000-0000-0000-000000251401'),
    ('00000000-0000-0000-0000-000000251302', '00000000-0000-0000-0000-000000251403')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000251502', '00000000-0000-0000-0000-000000251002', 'Pla', 'Yer')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000251301', '00000000-0000-0000-0000-000000251502', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, status) VALUES
    ('00000000-0000-0000-0000-000000251601', '00000000-0000-0000-0000-000000251301', 'EV', 'practice', now() + interval '1 day', now() + interval '1 day 2 hours', 'confirmed')
  ON CONFLICT DO NOTHING;
END $$;

-- An old, known token, written through the change-marks exemption so the trigger leaves it as set.
CREATE OR REPLACE FUNCTION pg_temp.set_old_token() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('helm.change_mark_writer', 'on', true);
  UPDATE public.golf_events SET updated_at = '2020-01-01 00:00:00+00' WHERE id = '00000000-0000-0000-0000-000000251601';
  SELECT set_config('helm.change_mark_writer', '', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.token() RETURNS timestamptz LANGUAGE sql AS $$
  SELECT updated_at FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000251601';
$$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT has_trigger('public', 'golf_events', 'golf_events_touch_updated_at', 'golf_events has the updated_at trigger');

-- ============================================================================
-- The team's coach
-- ============================================================================
SELECT pg_temp.set_old_token();
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000251001", "role": "authenticated"}';

UPDATE public.golf_events SET start_time = start_time + interval '30 minutes', end_time = end_time + interval '30 minutes'
  WHERE id = '00000000-0000-0000-0000-000000251601';
RESET role;
SELECT ok(pg_temp.token() > '2020-01-01 00:00:00+00', 'a coach''s move bumps updated_at');

SELECT pg_temp.set_old_token();
SET LOCAL role TO authenticated;
UPDATE public.golf_events SET title = title WHERE id = '00000000-0000-0000-0000-000000251601';
RESET role;
SELECT is(pg_temp.token(), '2020-01-01 00:00:00+00'::timestamptz, 'a no-op update leaves updated_at as it was');

-- A move sent with the old token after someone else changed the row lands nowhere (the stale case).
UPDATE public.golf_events SET location = 'Range' WHERE id = '00000000-0000-0000-0000-000000251601';
SET LOCAL role TO authenticated;
WITH upd AS (
  UPDATE public.golf_events SET start_time = start_time + interval '15 minutes', end_time = end_time + interval '15 minutes'
    WHERE id = '00000000-0000-0000-0000-000000251601' AND updated_at = '2020-01-01 00:00:00+00'
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0, 'an update conditioned on a stale updated_at affects no row');

SELECT lives_ok(
  $$UPDATE public.golf_events SET start_time = now() + interval '3 days', end_time = now() + interval '3 days 90 minutes'
      WHERE id = '00000000-0000-0000-0000-000000251601'$$,
  'a coach''s valid move still passes golf_events_end_after_start'
);

-- P-14's settle write: the exemption leaves the token alone.
RESET role;
SELECT pg_temp.set_old_token();
SET LOCAL role TO authenticated;
SELECT set_config('helm.change_mark_writer', 'on', true);
UPDATE public.golf_events SET description = 'settled' WHERE id = '00000000-0000-0000-0000-000000251601';
RESET role;
SELECT is(pg_temp.token(), '2020-01-01 00:00:00+00'::timestamptz, 'the change-marks writer (helm.change_mark_writer = on) leaves updated_at');

-- The next write without the setting bumps it again.
SET LOCAL role TO authenticated;
SELECT set_config('helm.change_mark_writer', '', true);
UPDATE public.golf_events SET description = 'after' WHERE id = '00000000-0000-0000-0000-000000251601';
RESET role;
SELECT ok(pg_temp.token() > '2020-01-01 00:00:00+00', 'the next write without the setting bumps updated_at');

-- ============================================================================
-- Refusals (RLS unchanged)
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000251002", "role": "authenticated"}';
WITH upd AS (
  UPDATE public.golf_events SET start_time = start_time + interval '1 hour', end_time = end_time + interval '1 hour'
    WHERE id = '00000000-0000-0000-0000-000000251601'
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0, 'a player on the team moves nothing (golf_events_update_coach)');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000251003", "role": "authenticated"}';
WITH upd AS (
  UPDATE public.golf_events SET start_time = start_time + interval '1 hour', end_time = end_time + interval '1 hour'
    WHERE id = '00000000-0000-0000-0000-000000251601'
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0, 'a coach of another team moves nothing');

SELECT * FROM finish();
ROLLBACK;
