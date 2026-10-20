-- pgTAP contract for the Home event functions skipping cancelled events
-- (20261017111000_golf_home_event_rpcs_skip_cancelled.sql).
--
-- deleteGolfEvent soft-cancels: the golf_events row stays with cancelled_at
-- set. get_coach_today_schedule (the coach's Today list) and
-- get_player_hub_events (the player hub events, with an RSVP) listed it anyway.
-- This is a BEHAVIORAL test: it seeds a team's events and reads what each
-- function returns to its caller.
--
-- Plan arithmetic: 2 structural + 1 coach Today + 2 player hub + 1 refusal = 6.

BEGIN;
\ir _helpers.sql

SELECT plan(6);

-- ============================================================================
-- Seed. Ids use the 0000...0177xxx range.
--   users:  coach 01, player 02 (team A)
--   events: L live today, X cancelled today, C a class today (team A)
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000177001', 'coach@homecancel.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000177002', 'player@homecancel.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000177201', 'Home Cancel Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000177301', 'Home Cancel Team', 'GHOMECXL', '00000000-0000-0000-0000-000000177201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000177401', '00000000-0000-0000-0000-000000177001', '00000000-0000-0000-0000-000000177201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000177502', '00000000-0000-0000-0000-000000177002', 'Home', 'Player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000177301', '00000000-0000-0000-0000-000000177502', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, status, cancelled_at) VALUES
    ('00000000-0000-0000-0000-000000177601', '00000000-0000-0000-0000-000000177301', 'Live',      'practice', now() + interval '1 hour',  'confirmed', NULL),
    ('00000000-0000-0000-0000-000000177602', '00000000-0000-0000-0000-000000177301', 'Cancelled', 'practice', now() + interval '2 hours', 'cancelled', now()),
    ('00000000-0000-0000-0000-000000177603', '00000000-0000-0000-0000-000000177301', 'Class',     'class',    now() + interval '3 hours', NULL,        NULL)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural: kept as live
-- ============================================================================
SELECT ok(
  (SELECT prosecdef AND proconfig = ARRAY['search_path=public'] FROM pg_proc
   WHERE oid = 'public.get_coach_today_schedule(uuid, timestamptz, timestamptz)'::regprocedure),
  'get_coach_today_schedule stays SECURITY DEFINER with search_path = public'
);
SELECT ok(
  (SELECT prosecdef AND proconfig = ARRAY['search_path=public'] FROM pg_proc
   WHERE oid = 'public.get_player_hub_events(uuid, uuid, timestamptz)'::regprocedure),
  'get_player_hub_events stays SECURITY DEFINER with search_path = public'
);

-- ============================================================================
-- Coach Today
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000177001", "role": "authenticated"}';

SELECT is(
  (SELECT string_agg(e->>'title', ',' ORDER BY e->>'start_time')
   FROM jsonb_array_elements(public.get_coach_today_schedule(
     '00000000-0000-0000-0000-000000177301', now(), now() + interval '1 day')) e),
  'Live',
  'coach Today lists the live event only: not the cancelled one, not the class'
);

-- ============================================================================
-- Player hub events
-- ============================================================================
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000177002", "role": "authenticated"}';

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.get_player_hub_events(
      '00000000-0000-0000-0000-000000177301', '00000000-0000-0000-0000-000000177502', now())) e
    WHERE e->>'id' = '00000000-0000-0000-0000-000000177602'
  ),
  'the player hub does not list the cancelled event'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.get_player_hub_events(
      '00000000-0000-0000-0000-000000177301', '00000000-0000-0000-0000-000000177502', now())) e
    WHERE e->>'id' = '00000000-0000-0000-0000-000000177601'
  ),
  'the player hub still lists the live event'
);

-- The auth check is kept: a caller with no place on the team is refused.
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000177099", "role": "authenticated"}';
SELECT throws_ok(
  $$ SELECT public.get_player_hub_events('00000000-0000-0000-0000-000000177301',
       '00000000-0000-0000-0000-000000177502', now()) $$,
  '42501',
  NULL,
  'get_player_hub_events still refuses a caller with no place on the team'
);

SELECT * FROM finish();
ROLLBACK;
