-- pgTAP contract for 20261025070100_golf_class_blocks_functions.sql
-- (Clubhouse P-10 class awareness: the one definition of "who is in class").
--
-- Every rule of plan section 8.3 and every fail-open row of 8.4 has a check:
-- the day tokens, the term and eligibility rules F1 to F6, agreement with the
-- synced calendar, the suppressions S1 to S5, the hold window (which now starts at
-- the first block, with no pre-class window), the one date rule in the term's own
-- zone, the coach and player reads, and the grants.
--
-- Block checks use the internal function with fixed dates, so the suite does not
-- depend on today's date; the RPC checks use a term built around today in UTC.
--
-- Plan arithmetic: 4 structural + 14 blocks and eligibility + 4 calendar + 12
-- suppressions + 10 hold window + 4 zones + 14 coach read + 8 player read = 70.

BEGIN;
\ir _helpers.sql

SELECT plan(70);

-- Test helpers (rolled back with the transaction).
CREATE FUNCTION public.p10_id(k text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT md5('p10-blocks:' || k)::uuid $$;

CREATE FUNCTION public.p10_mkplayer(k text, p_team uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, role)
  VALUES (public.p10_id('u:' || k), k || '@clblk.test', 'authenticated') ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name)
  VALUES (public.p10_id('p:' || k), public.p10_id('u:' || k), k, 'Test');
  INSERT INTO public.golf_team_members (team_id, player_id, status)
  VALUES (p_team, public.p10_id('p:' || k), 'active');
END $$;

CREATE FUNCTION public.p10_mkclass(
  k text, p_days text[] DEFAULT '{M,W,F}', p_start time DEFAULT '09:30', p_end time DEFAULT '10:45',
  p_sem text DEFAULT 'Fall 2026', p_created timestamptz DEFAULT now(), p_enabled boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.golf_player_classes
    (id, player_id, class_name, days, start_time, end_time, semester, created_at, status_enabled)
  VALUES (public.p10_id('c:' || k), public.p10_id('p:' || k), 'CLS ' || k || ' - Test',
          p_days, p_start, p_end, p_sem, p_created, p_enabled);
END $$;

-- Act as a signed-in user (or anon) for the statements that follow.
CREATE FUNCTION public.p10_as(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET role';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL role TO authenticated';
END $$;

CREATE FUNCTION public.p10_as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET role';
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  EXECUTE 'SET LOCAL role TO anon';
END $$;

-- Blocks of one test player on a date, in team 'team'.
CREATE FUNCTION public.p10_nb(k text, d date) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.golf_class_blocks_internal(public.p10_id('team'), d, public.p10_id('p:' || k))
$$;

-- ============================================================================
-- Seed. Team 'team' has the Fall 2026 term (America/New_York); 'noterm' has none;
-- 'west' has a Pacific term with an Eastern team setting; 'dyn' has a term built
-- around today in UTC (used by the RPC checks).
-- ============================================================================
DO $$
DECLARE
  t_team uuid := public.p10_id('team');
  k text;
BEGIN
  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (t_team,                   'Blocks Team',    'CLBLK001'),
    (public.p10_id('noterm'),  'No Term Team',   'CLBLK002'),
    (public.p10_id('west'),    'West Team',      'CLBLK003'),
    (public.p10_id('dyn'),     'Dynamic Team',   'CLBLK004');

  INSERT INTO public.golf_team_settings (team_id, timezone) VALUES
    (t_team,                  'America/New_York'),
    (public.p10_id('west'),   'America/New_York'),
    (public.p10_id('dyn'),    'Not/AZone');

  INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone) VALUES
    (t_team,                'Fall 2026', '2026-08-24', '2026-12-11', '2026-12-18', 'America/New_York'),
    (public.p10_id('west'), 'Fall 2026', '2026-08-24', '2026-12-11', '2026-12-18', 'America/Los_Angeles'),
    (public.p10_id('dyn'),  'Dyn Term',  current_date - 30, current_date + 60, current_date + 70, 'UTC');

  -- Players on the main team. Each scenario owns one player so blocks never mix.
  FOREACH k IN ARRAY ARRAY[
    'base', 'f1off', 'f2other', 'f2old', 'f2new', 'f4null', 'f4short', 'f4long', 'f5bad',
    'syncok', 'syncmoved', 'synccancel', 'syncnoday', 's2one', 's2all', 's3', 's4acc', 's4dec',
    's5acc', 's5pend', 's5canc', 's5tour', 's5meet', 'exam', 'twob', 'nap', 'long',
    'noshare', 'nohold', 'live'
  ] LOOP
    PERFORM public.p10_mkplayer(k, t_team);
  END LOOP;

  PERFORM public.p10_mkclass('base');
  PERFORM public.p10_mkclass('f1off', p_enabled => false);
  PERFORM public.p10_mkclass('f2other', p_sem => 'Spring 2026');
  PERFORM public.p10_mkclass('f2old', p_sem => '  ', p_created => '2026-06-01');
  PERFORM public.p10_mkclass('f2new', p_sem => NULL, p_created => '2026-08-14');
  PERFORM public.p10_mkclass('f4null', p_start => NULL);
  PERFORM public.p10_mkclass('f4short', p_start => '09:30', p_end => '09:35');
  PERFORM public.p10_mkclass('f4long', p_start => '08:00', p_end => '13:00');
  PERFORM public.p10_mkclass('f5bad', p_days => '{M,X}');
  PERFORM public.p10_mkclass('syncok');
  PERFORM public.p10_mkclass('syncmoved');
  PERFORM public.p10_mkclass('synccancel');
  PERFORM public.p10_mkclass('syncnoday');
  PERFORM public.p10_mkclass('s2one');
  PERFORM public.p10_mkclass('s2all');
  PERFORM public.p10_mkclass('s3');
  PERFORM public.p10_mkclass('s4acc');
  PERFORM public.p10_mkclass('s4dec');
  PERFORM public.p10_mkclass('s5acc');
  PERFORM public.p10_mkclass('s5pend');
  PERFORM public.p10_mkclass('s5canc');
  PERFORM public.p10_mkclass('s5tour');
  PERFORM public.p10_mkclass('s5meet');
  PERFORM public.p10_mkclass('exam');
  PERFORM public.p10_mkclass('noshare');
  PERFORM public.p10_mkclass('nohold');
  PERFORM public.p10_mkclass('live');
  -- 'twob': two classes 10 minutes apart (one island); 'nap': 20 minutes apart (two islands);
  -- 'long': four back-to-back 90 minute classes (a six hour island).
  INSERT INTO public.golf_player_classes (id, player_id, class_name, days, start_time, end_time, semester) VALUES
    (public.p10_id('c:twob1'), public.p10_id('p:twob'), 'CLS twob1', '{M}', '09:30', '10:45', 'Fall 2026'),
    (public.p10_id('c:twob2'), public.p10_id('p:twob'), 'CLS twob2', '{M}', '10:55', '12:00', 'Fall 2026'),
    (public.p10_id('c:nap1'),  public.p10_id('p:nap'),  'CLS nap1',  '{M}', '09:30', '10:45', 'Fall 2026'),
    (public.p10_id('c:nap2'),  public.p10_id('p:nap'),  'CLS nap2',  '{M}', '11:05', '12:00', 'Fall 2026'),
    (public.p10_id('c:long1'), public.p10_id('p:long'), 'CLS long1', '{M}', '08:00', '09:30', 'Fall 2026'),
    (public.p10_id('c:long2'), public.p10_id('p:long'), 'CLS long2', '{M}', '09:30', '11:00', 'Fall 2026'),
    (public.p10_id('c:long3'), public.p10_id('p:long'), 'CLS long3', '{M}', '11:00', '12:30', 'Fall 2026'),
    (public.p10_id('c:long4'), public.p10_id('p:long'), 'CLS long4', '{M}', '12:30', '14:00', 'Fall 2026');

  INSERT INTO public.golf_player_class_settings (player_id, share_status, hold_pushes) VALUES
    (public.p10_id('p:noshare'), false, true),
    (public.p10_id('p:nohold'),  true,  false);

  -- Exam period: a player exam block on Monday 2026-12-14.
  INSERT INTO public.golf_class_exceptions (team_id, player_id, kind, starts_on, ends_on, start_time, end_time, label)
  VALUES (t_team, public.p10_id('p:exam'), 'extra', '2026-12-14', '2026-12-14', '10:00', '12:00', 'STAT exam');

  -- Synced calendar occurrences (Monday 2026-10-26, EDT: 13:30Z to 14:45Z is 09:30 to 10:45).
  INSERT INTO public.golf_events (team_id, title, description, event_type, start_time, end_time, status) VALUES
    (t_team, 'ok',     '[class:' || public.p10_id('c:syncok') || ']',     'class', '2026-10-26 13:30:00+00', '2026-10-26 14:45:00+00', 'scheduled'),
    (t_team, 'moved',  '[class:' || public.p10_id('c:syncmoved') || ']',  'class', '2026-10-26 14:00:00+00', '2026-10-26 15:15:00+00', 'scheduled'),
    (t_team, 'noday',  '[class:' || public.p10_id('c:syncnoday') || ']',  'class', '2026-10-19 13:30:00+00', '2026-10-19 14:45:00+00', 'scheduled');
  INSERT INTO public.golf_events (team_id, title, description, event_type, start_time, end_time, status, cancelled_at) VALUES
    (t_team, 'cancel', '[class:' || public.p10_id('c:synccancel') || ']', 'class', '2026-10-26 13:30:00+00', '2026-10-26 14:45:00+00', 'cancelled', '2026-10-25 12:00:00+00');

  -- S2: one class off for one player; all classes off for another. S3: exclusion.
  INSERT INTO public.golf_class_exceptions (team_id, player_id, class_id, kind, starts_on, ends_on) VALUES
    (t_team, public.p10_id('p:s2one'), public.p10_id('c:s2one'), 'off', '2026-10-26', '2026-10-26'),
    (t_team, public.p10_id('p:s2all'), NULL,                     'off', '2026-10-26', '2026-10-26');
  INSERT INTO public.golf_academic_exclusions (player_id, start_date, end_date)
  VALUES (public.p10_id('p:s3'), '2026-10-26', '2026-10-27');

  -- S1: a team-wide break on Wednesday 2026-10-28.
  INSERT INTO public.golf_class_exceptions (team_id, kind, starts_on, ends_on, label)
  VALUES (t_team, 'off', '2026-10-28', '2026-10-28', 'Break');
  -- An exam kept through the team break: the exam player's Wednesday exam.
  INSERT INTO public.golf_class_exceptions (team_id, player_id, kind, starts_on, ends_on, start_time, end_time)
  VALUES (t_team, public.p10_id('p:exam'), 'extra', '2026-10-28', '2026-10-28', '15:00', '16:00');

  -- S4: trips. Departure 10-25, return 10-27, one linked event each; accepted drops, declined does not.
  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, status) VALUES
    (public.p10_id('e:trip'), t_team, 'Trip', 'travel', '2026-10-25 12:00:00+00', '2026-10-27 22:00:00+00', 'scheduled');
  INSERT INTO public.golf_travel_itineraries (team_id, event_id, destination, departure_date, return_date)
  VALUES (t_team, public.p10_id('e:trip'), 'Pinehurst', '2026-10-25', '2026-10-27');
  INSERT INTO public.golf_event_attendance (event_id, player_id, status) VALUES
    (public.p10_id('e:trip'), public.p10_id('p:s4acc'), 'accepted'),
    (public.p10_id('e:trip'), public.p10_id('p:s4dec'), 'declined');

  -- S5: events overlapping the Monday class (13:30Z to 14:45Z).
  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, status, cancelled_at, all_day) VALUES
    (public.p10_id('e:prac'),  t_team, 'Practice',  'practice',   '2026-10-26 14:00:00+00', '2026-10-26 16:00:00+00', 'scheduled', NULL, false),
    (public.p10_id('e:pracx'), t_team, 'Cancelled', 'practice',   '2026-10-26 14:00:00+00', '2026-10-26 16:00:00+00', 'cancelled', '2026-10-25 12:00:00+00', false),
    (public.p10_id('e:tour'),  t_team, 'Open',      'tournament', '2026-10-26 04:00:00+00', '2026-10-27 04:00:00+00', 'scheduled', NULL, true),
    (public.p10_id('e:meet'),  t_team, 'Meeting',   'meeting',    '2026-10-26 04:00:00+00', '2026-10-27 04:00:00+00', 'scheduled', NULL, true);
  INSERT INTO public.golf_event_attendance (event_id, player_id, status) VALUES
    (public.p10_id('e:prac'),  public.p10_id('p:s5acc'),  'accepted'),
    (public.p10_id('e:prac'),  public.p10_id('p:s5pend'), 'pending'),
    (public.p10_id('e:pracx'), public.p10_id('p:s5canc'), 'accepted'),
    (public.p10_id('e:tour'),  public.p10_id('p:s5tour'), 'accepted'),
    (public.p10_id('e:meet'),  public.p10_id('p:s5meet'), 'accepted');

  -- A live round: in progress, last saved 5 minutes before the test instants below.
  INSERT INTO public.golf_rounds (player_id, round_date, status, updated_at)
  VALUES (public.p10_id('p:live'), '2026-10-26', 'in_progress', '2026-10-26 13:55:00+00');

  -- West team: a Monday 21:00 to 22:00 class in the Pacific term.
  PERFORM public.p10_mkplayer('pacific', public.p10_id('west'));
  PERFORM public.p10_mkclass('pacific', p_days => '{M}', p_start => '21:00', p_end => '22:00');

  -- No-term team: a member with a class and no term at all.
  PERFORM public.p10_mkplayer('noterm', public.p10_id('noterm'));
  PERFORM public.p10_mkclass('noterm');
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  public.golf_day_token_dow('Sunday') = 7 AND public.golf_day_token_dow('SU') = 7
  AND public.golf_day_token_dow(' Th ') = 4 AND public.golf_day_token_dow('r') = 4
  AND public.golf_day_token_dow('s') IS NULL AND public.golf_day_token_dow('x') IS NULL,
  'day tokens are case and space tolerant; a bare S and an unknown token map to nothing'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.golf_class_blocks_internal(uuid, date, uuid)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.golf_class_day_players_internal(uuid, date, uuid, timestamptz)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_class_blocks_internal(uuid, date, uuid)', 'execute'),
  'the internal functions have no client grant'
);

SELECT ok(
  has_function_privilege('service_role', 'public.golf_class_hold_until(uuid, timestamptz)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.golf_class_hold_until(uuid, timestamptz)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_class_hold_until(uuid, timestamptz)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.golf_class_term_at(uuid, timestamptz)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.golf_player_on_course(uuid, timestamptz)', 'execute'),
  'the hold question, the term lookup and the on-course rule are service_role only'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.golf_team_class_day(uuid, date)', 'execute')
  AND has_function_privilege('authenticated', 'public.golf_my_class_day(date)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_team_class_day(uuid, date)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_my_class_day(date)', 'execute'),
  'the coach read and the player read are callable by authenticated, not by anon'
);

-- ============================================================================
-- Blocks and eligibility (F1 to F6)
-- ============================================================================
SELECT is(
  (SELECT array[to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'), to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')]
     FROM public.golf_class_blocks_internal(public.p10_id('team'), '2026-10-26', public.p10_id('p:base'))),
  ARRAY['2026-10-26 13:30', '2026-10-26 14:45'],
  'an M W F 9:30 to 10:45 class on a Monday is one block at 13:30Z to 14:45Z (EDT)'
);

SELECT is(
  (SELECT array[to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'), to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')]
     FROM public.golf_class_blocks_internal(public.p10_id('team'), '2026-11-02', public.p10_id('p:base'))),
  ARRAY['2026-11-02 14:30', '2026-11-02 15:45'],
  'the Monday after daylight saving ends the same class is 14:30Z to 15:45Z (EST)'
);

SELECT is(public.p10_nb('base', '2026-10-27'), 0, 'Tuesday yields no block for an M W F class (F6)');
SELECT is(public.p10_nb('base', '2026-08-17'), 0, 'a Monday before classes start yields no block');
SELECT is(public.p10_nb('base', '2026-12-21'), 0, 'a Monday after the exam period yields no block');

SELECT is(
  (SELECT count(*)::int FROM public.golf_class_blocks_internal(public.p10_id('noterm'), '2026-10-26', NULL)),
  0,
  'a team with no term yields no block for anyone (fail open)'
);

SELECT is(public.p10_nb('base', '2026-12-14'), 0, 'in the exam period, weekly classes yield no block (F3)');

SELECT is(
  (SELECT array[kind, label] FROM public.golf_class_blocks_internal(public.p10_id('team'), '2026-12-14', public.p10_id('p:exam'))),
  ARRAY['exam', 'STAT exam'],
  'in the exam period, a player exam block yields an exam block'
);

SELECT is(public.p10_nb('f1off', '2026-10-26'), 0, 'F1: a class switched off yields no block');
SELECT is(public.p10_nb('f2other', '2026-10-26'), 0, 'F2: a class tagged for another term yields no block');
SELECT is(public.p10_nb('f2old', '2026-10-26'), 0, 'F2: a blank-term class created 60 days before the term yields no block');
SELECT is(public.p10_nb('f2new', '2026-10-26'), 1, 'F2: a blank-term class created 10 days before the term counts');
SELECT is(
  public.p10_nb('f4null', '2026-10-26') + public.p10_nb('f4short', '2026-10-26') + public.p10_nb('f4long', '2026-10-26'),
  0,
  'F4: a class with no start time, a 5 minute class and a 5 hour class yield no block'
);
SELECT is(public.p10_nb('f5bad', '2026-10-26'), 0, 'F5: one unknown day token drops the whole class');

-- ============================================================================
-- Agreement with the synced calendar
-- ============================================================================
SELECT is(
  (SELECT source FROM public.golf_class_blocks_internal(public.p10_id('team'), '2026-10-26', public.p10_id('p:syncok'))),
  'calendar',
  'a synced class whose occurrence matches the pattern yields a calendar block'
);
SELECT is(public.p10_nb('syncmoved', '2026-10-26'), 0, 'an occurrence moved 30 minutes drops the block');
SELECT is(public.p10_nb('synccancel', '2026-10-26'), 0, 'a cancelled occurrence drops the block');
SELECT is(public.p10_nb('syncnoday', '2026-10-26'), 0, 'a synced class with no occurrence on the date drops the block');

-- ============================================================================
-- Suppressions S1 to S5
-- ============================================================================
SELECT is(public.p10_nb('base', '2026-10-28'), 0, 'S1: a team break drops pattern blocks');
SELECT is(
  (SELECT kind FROM public.golf_class_blocks_internal(public.p10_id('team'), '2026-10-28', public.p10_id('p:exam'))),
  'exam',
  'S1: a team break keeps a player exam block'
);
SELECT is(public.p10_nb('base', '2026-10-26'), 1, 'S1: the break did not touch the Monday before it');
SELECT is(public.p10_nb('s2one', '2026-10-26'), 0, 'S2: a per-class off drops that class');
SELECT is(public.p10_nb('s2all', '2026-10-26'), 0, 'S2: an all-classes off drops every class');
SELECT is(public.p10_nb('s3', '2026-10-26'), 0, 'S3: an academic exclusion drops the block');
SELECT is(public.p10_nb('s4acc', '2026-10-26'), 0, 'S4: a trip with accepted attendance drops the block');
SELECT is(public.p10_nb('s4dec', '2026-10-26'), 1, 'S4: a trip the player declined does not');
SELECT is(public.p10_nb('s5acc', '2026-10-26'), 0, 'S5: an accepted overlapping practice drops the block');
SELECT is(public.p10_nb('s5pend', '2026-10-26'), 1, 'S5: a pending practice does not');
SELECT is(public.p10_nb('s5canc', '2026-10-26'), 1, 'S5: a cancelled practice does not');
SELECT is(
  public.p10_nb('s5tour', '2026-10-26') * 10 + public.p10_nb('s5meet', '2026-10-26'),
  1,
  'S5: an accepted all-day tournament drops the block; an accepted all-day meeting does not'
);

-- ============================================================================
-- The hold window: from the first block to the island end, no pre-class window
-- ============================================================================
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:base'), '2026-10-26 14:00:00+00'),
  '2026-10-26 14:45:00+00'::timestamptz,
  'inside a block, the hold runs to the block end'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:base'), '2026-10-26 13:29:00+00'),
  NULL::timestamptz,
  'one minute before the first block there is no hold (Must 2: no pre-class window)'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:base'), '2026-10-26 13:30:00+00'),
  '2026-10-26 14:45:00+00'::timestamptz,
  'at the first block''s start the hold begins and returns the end'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:base'), '2026-10-26 14:45:00+00'),
  NULL::timestamptz,
  'at the block end the hold is over'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:twob'), '2026-10-26 14:00:00+00'),
  '2026-10-26 16:00:00+00'::timestamptz,
  'two blocks 10 minutes apart are one island: the hold runs to the second end'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:nap'), '2026-10-26 14:00:00+00'),
  '2026-10-26 14:45:00+00'::timestamptz,
  'two blocks 20 minutes apart are two islands: the hold ends with the first'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:long'), '2026-10-26 12:30:00+00'),
  '2026-10-26 16:30:00+00'::timestamptz,
  'a six hour island is capped at four hours from the moment of holding'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:noshare'), '2026-10-26 14:00:00+00'),
  NULL::timestamptz,
  'a player with sharing off is never held'
);
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:nohold'), '2026-10-26 14:00:00+00'),
  NULL::timestamptz,
  'a player with the hold switch off is never held'
);
SELECT is(
  (public.golf_class_hold_until(public.p10_id('u:live'), '2026-10-26 14:00:00+00') IS NULL)
  AND (public.golf_class_hold_until(public.p10_id('u:live'), '2026-10-26 14:20:00+00') IS NOT NULL),
  true,
  'a round saved 5 minutes ago means on the course (no hold); 25 minutes later it no longer does (10 minute rule)'
);

-- ============================================================================
-- One date rule: the term's own zone (Must 8)
-- ============================================================================
SELECT is(
  public.golf_class_hold_until(public.p10_id('u:pacific'), '2026-10-27 04:30:00+00'),
  '2026-10-27 05:00:00+00'::timestamptz,
  'a 9 PM Pacific Monday class holds at 04:30Z Tuesday: the date is taken in the term''s zone, not the team''s'
);
SELECT ok(
  (public.golf_class_term_at(public.p10_id('west'), '2026-12-19 03:30:00+00')).id IS NOT NULL
  AND (public.golf_class_term_at(public.p10_id('west'), '2026-12-19 08:30:00+00')).id IS NULL,
  'the term covers 19:30 Pacific on its last day and not 00:30 Pacific the day after'
);
SELECT is(public.golf_safe_time_zone('Not/AZone'), 'America/New_York', 'a zone Postgres does not know falls back to America/New_York');
SELECT is(public.golf_safe_time_zone('America/Chicago'), 'America/Chicago', 'a real zone is kept');

-- ============================================================================
-- Coach read: golf_team_class_day on the dynamic team
-- ============================================================================
DO $$
DECLARE
  t uuid := public.p10_id('dyn');
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (public.p10_id('u:dcoach'),  'dcoach@clblk.test',  'authenticated'),
    (public.p10_id('u:ocoach'),  'ocoach@clblk.test',  'authenticated');
  INSERT INTO public.golf_coaches (id, user_id) VALUES
    (public.p10_id('coach:d'), public.p10_id('u:dcoach')),
    (public.p10_id('coach:o'), public.p10_id('u:ocoach'));
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    (t, public.p10_id('coach:d')),
    (public.p10_id('noterm'), public.p10_id('coach:o'));

  PERFORM public.p10_mkplayer('g1', t);   -- normal, shared, usable class every day
  PERFORM public.p10_mkplayer('g2', t);   -- sharing off
  PERFORM public.p10_mkplayer('g3', t);   -- no classes at all
  PERFORM public.p10_mkplayer('g4', t);   -- only a switched-off class
  PERFORM public.p10_mkplayer('g5', t);   -- hold off
  PERFORM public.p10_mkplayer('g6', t);   -- on the course (round saved 5 minutes ago)
  PERFORM public.p10_mkplayer('g7', t);   -- round saved 45 minutes ago
  PERFORM public.p10_mkplayer('g8', t);   -- no longer an active member
  UPDATE public.golf_team_members SET status = 'inactive' WHERE player_id = public.p10_id('p:g8');
  PERFORM public.p10_mkclass('g8', p_days => '{M,T,W,Th,F,Sa,Su}', p_sem => 'Dyn Term');

  PERFORM public.p10_mkclass('g1', p_days => '{M,T,W,Th,F,Sa,Su}', p_sem => 'Dyn Term');
  PERFORM public.p10_mkclass('g2', p_days => '{M,T,W,Th,F,Sa,Su}', p_sem => 'Dyn Term');
  PERFORM public.p10_mkclass('g4', p_days => '{M,T,W,Th,F,Sa,Su}', p_sem => 'Dyn Term', p_enabled => false);
  PERFORM public.p10_mkclass('g5', p_days => '{M,T,W,Th,F,Sa,Su}', p_sem => 'Dyn Term');
  PERFORM public.p10_mkclass('g6', p_days => '{M,T,W,Th,F,Sa,Su}', p_sem => 'Dyn Term');
  PERFORM public.p10_mkclass('g7', p_days => '{M,T,W,Th,F,Sa,Su}', p_sem => 'Dyn Term');

  INSERT INTO public.golf_player_class_settings (player_id, share_status, hold_pushes) VALUES
    (public.p10_id('p:g2'), false, true),
    (public.p10_id('p:g5'), true,  false);

  INSERT INTO public.golf_rounds (player_id, round_date, status, updated_at) VALUES
    (public.p10_id('p:g6'), current_date, 'in_progress', now() - interval '5 minutes'),
    (public.p10_id('p:g7'), current_date, 'in_progress', now() - interval '45 minutes');

  -- g1 also has: a class with no end time ('times'), a bad day token ('days'), a blank-term
  -- class created long ago (untagged), and a synced class whose calendar rows never match
  -- its times ('calendar_mismatch').
  INSERT INTO public.golf_player_classes (id, player_id, class_name, days, start_time, end_time, semester, created_at) VALUES
    (public.p10_id('c:g1times'), public.p10_id('p:g1'), 'CLS times',  '{M}',   '09:00', NULL,    'Dyn Term', now()),
    (public.p10_id('c:g1days'),  public.p10_id('p:g1'), 'CLS days',   '{M,X}', '09:00', '10:00', 'Dyn Term', now()),
    (public.p10_id('c:g1old'),   public.p10_id('p:g1'), 'CLS old',    '{M}',   '09:00', '10:00', NULL,       '2020-01-01'),
    (public.p10_id('c:g1sync'),  public.p10_id('p:g1'), 'CLS synced', '{M,T,W,Th,F,Sa,Su}', '09:00', '10:00', 'Dyn Term', now());
  INSERT INTO public.golf_events (team_id, title, description, event_type, start_time, end_time, status)
  VALUES (t, 'synced', '[class:' || public.p10_id('c:g1sync') || ']', 'class',
          (current_date - 7)::timestamp + time '14:00', (current_date - 7)::timestamp + time '15:00', 'scheduled');
END $$;

SELECT public.p10_as(public.p10_id('u:dcoach'));

CREATE TEMP TABLE coach_day ON COMMIT DROP AS
SELECT public.golf_team_class_day(public.p10_id('dyn')) AS d;
GRANT SELECT ON coach_day TO authenticated;

SELECT is(
  (SELECT d->>'team_time_zone' FROM coach_day),
  'America/New_York',
  'a team whose stored zone Postgres does not know does not raise; the team zone reads America/New_York'
);

SELECT is(
  (SELECT d->>'class_time_zone' FROM coach_day),
  'UTC',
  'with a term covering now, "today" is taken in the term''s zone'
);

SELECT is(
  (SELECT count(*)::int FROM coach_day, jsonb_array_elements(d->'players')),
  7,
  'the coach gets every active player of their team'
);

SELECT is(
  (SELECT (p->>'tracked')::boolean FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' = 'g1'),
  true,
  'a sharing player with a usable class is tracked'
);

SELECT is(
  (SELECT jsonb_array_length(p->'blocks') FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' = 'g2'),
  0,
  'a player with sharing off has no blocks in the coach payload'
);

SELECT is(
  (SELECT p ? 'shared' FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' = 'g2'),
  false,
  'the payload has no shared key: coaches cannot tell who turned sharing off (Should 9)'
);

SELECT is(
  (SELECT array_agg((p->>'tracked')::boolean ORDER BY p->>'first_name')
     FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' IN ('g2', 'g3', 'g4')),
  ARRAY[false, false, false],
  'sharing off, no schedule and a switched-off class all read tracked = false (Should 10)'
);

SELECT is(
  (SELECT array_agg((p->>'holds')::boolean ORDER BY p->>'first_name')
     FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' IN ('g1', 'g5')),
  ARRAY[true, false],
  'holds is true for a sharing player with the switch on and false when the hold switch is off'
);

SELECT is(
  (SELECT array_agg((p->>'on_course')::boolean ORDER BY p->>'first_name')
     FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' IN ('g6', 'g7')),
  ARRAY[true, false],
  'on_course is true for a round saved 5 minutes ago and false at 45 minutes'
);

SELECT throws_ok(
  $$SELECT public.golf_team_class_day(public.p10_id('dyn'), current_date + 30)$$,
  '22023', NULL,
  'a date 30 days away is refused'
);

SELECT throws_ok(
  $$SELECT public.golf_team_class_day(public.p10_id('noterm'))$$,
  '42501', NULL,
  'a coach of another team gets 42501'
);

SELECT public.p10_as(public.p10_id('u:g1'));

SELECT throws_ok(
  $$SELECT public.golf_team_class_day(public.p10_id('dyn'))$$,
  '42501', NULL,
  'a player gets 42501 from the coach read'
);

SELECT public.p10_as(public.p10_id('u:dcoach'));

SELECT is(
  (SELECT count(*)::int FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' = 'g8'),
  0,
  'a player who is not an active member never appears'
);

SELECT public.p10_as_anon();
SELECT throws_ok(
  $$SELECT public.golf_team_class_day(public.p10_id('dyn'))$$,
  '42501', NULL,
  'anon cannot execute the coach read'
);
RESET role;

-- ============================================================================
-- Player read: golf_my_class_day
-- ============================================================================
SELECT public.p10_as(public.p10_id('u:g1'));

CREATE TEMP TABLE my_day ON COMMIT DROP AS SELECT public.golf_my_class_day() AS d;
GRANT SELECT ON my_day TO authenticated;

SELECT is(
  (SELECT d->'player' FROM my_day),
  (SELECT p FROM coach_day, jsonb_array_elements(d->'players') p WHERE p->>'first_name' = 'g1'),
  'the player''s "player" object is exactly what the coach''s payload holds for them (Should 8)'
);

SELECT is(
  (SELECT (d->>'untagged_classes')::int FROM my_day),
  1,
  'one blank-term class created long ago counts as untagged'
);

SELECT is(
  (SELECT array_agg(u->>'reason' ORDER BY u->>'reason') FROM my_day, jsonb_array_elements(d->'unusable_classes') u),
  ARRAY['calendar_mismatch', 'days', 'times'],
  'unusable classes carry a reason: times, days or calendar_mismatch (Should 11)'
);

SELECT ok(
  (SELECT d->'held' IS NULL OR d->'held' = 'null'::jsonb OR (d->'held'->>'count')::int = 0 FROM my_day),
  'a player with nothing held reads held as null (070100) or a zero count (070200)'
);

SELECT public.p10_as(public.p10_id('u:g2'));

SELECT is(
  (SELECT jsonb_array_length(public.golf_my_class_day()->'blocks')),
  1,
  'with sharing off the player still sees their own blocks'
);

SELECT is(
  (SELECT jsonb_array_length(public.golf_my_class_day()->'player'->'blocks')),
  0,
  'and their "Coaches see" object is empty, exactly as a coach sees it'
);

SELECT is(
  (SELECT (public.golf_my_class_day()->'player'->>'tracked')::boolean),
  false,
  'and reads untracked'
);

SELECT is(
  (SELECT public.golf_my_class_day()->'settings'),
  '{"share_status": false, "hold_pushes": true}'::jsonb,
  'the settings come back with the answer'
);

RESET role;

SELECT * FROM finish();
ROLLBACK;
