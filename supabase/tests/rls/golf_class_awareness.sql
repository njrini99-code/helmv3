-- pgTAP contract for 20261025070000_golf_class_awareness_tables.sql
-- (Clubhouse P-10 class awareness: terms, exceptions, player settings).
--
-- Who may write what, who may read what, and what each check constraint and
-- guard refuses. The suite acts as real users through request.jwt.claims; each
-- refusal is paired with the permission it must not have taken away.
--
-- Plan arithmetic: 4 structural + 11 terms + 14 exceptions + 8 settings and sharing
-- + 1 realtime = 38.

BEGIN;
\ir _helpers.sql

SELECT plan(38);

-- Test helper (rolled back with the transaction): rows touched by one statement.
CREATE FUNCTION public.p10_rows_affected(p_sql text) RETURNS integer
LANGUAGE plpgsql AS $f$
DECLARE n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $f$;

-- ============================================================================
-- Seed. Ids use the 0000...0b11xx range.
--   users:   coach A 01, coach B 02, players 03 and 04 on team A (31, 32),
--            player 05 on team B (33), bare golf_coaches row with no staff 06
--   teams:   A 21, B 22
--   classes: 41 belongs to player 31, 42 belongs to player 32
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000b1101', 'coacha@clsaw.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000b1102', 'coachb@clsaw.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000b1103', 'p1@clsaw.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000b1104', 'p2@clsaw.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000b1105', 'p3@clsaw.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000b1106', 'bare@clsaw.test',   'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    ('00000000-0000-0000-0000-0000000b1121', 'Class Awareness Team A', 'CLSAWA01'),
    ('00000000-0000-0000-0000-0000000b1122', 'Class Awareness Team B', 'CLSAWB01')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000b1111', '00000000-0000-0000-0000-0000000b1101'),
    ('00000000-0000-0000-0000-0000000b1112', '00000000-0000-0000-0000-0000000b1102'),
    ('00000000-0000-0000-0000-0000000b1113', '00000000-0000-0000-0000-0000000b1106')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1111'),
    ('00000000-0000-0000-0000-0000000b1122', '00000000-0000-0000-0000-0000000b1112')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000b1131', '00000000-0000-0000-0000-0000000b1103', 'Pat',  'One'),
    ('00000000-0000-0000-0000-0000000b1132', '00000000-0000-0000-0000-0000000b1104', 'Pat',  'Two'),
    ('00000000-0000-0000-0000-0000000b1133', '00000000-0000-0000-0000-0000000b1105', 'Pat',  'Three')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131', 'active'),
    ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1132', 'active'),
    ('00000000-0000-0000-0000-0000000b1122', '00000000-0000-0000-0000-0000000b1133', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_player_classes (id, player_id, class_name, days, start_time, end_time, semester) VALUES
    ('00000000-0000-0000-0000-0000000b1141', '00000000-0000-0000-0000-0000000b1131', 'STAT 201 - Probability', '{M,W,F}', '09:30', '10:45', 'Fall 2026'),
    ('00000000-0000-0000-0000-0000000b1142', '00000000-0000-0000-0000-0000000b1132', 'ECON 210 - Micro',       '{T,Th}',   '13:00', '14:15', 'Fall 2026')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c
    WHERE c.oid IN ('public.golf_team_terms'::regclass,
                    'public.golf_class_exceptions'::regclass,
                    'public.golf_player_class_settings'::regclass))
  AND to_regclass('public.golf_team_terms') IS NOT NULL
  AND to_regclass('public.golf_class_exceptions') IS NOT NULL
  AND to_regclass('public.golf_player_class_settings') IS NOT NULL,
  'the three tables exist and have row level security on'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_team_terms', 'select')
  AND NOT has_table_privilege('anon', 'public.golf_class_exceptions', 'select')
  AND NOT has_table_privilege('anon', 'public.golf_player_class_settings', 'select'),
  'anon has no privilege on any of the three tables'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_team_terms', 'truncate')
  AND NOT has_table_privilege('authenticated', 'public.golf_class_exceptions', 'truncate')
  AND NOT has_table_privilege('authenticated', 'public.golf_player_class_settings', 'truncate')
  AND NOT has_table_privilege('authenticated', 'public.golf_class_exceptions', 'update'),
  'authenticated has no TRUNCATE on any of the three, and no UPDATE on exceptions'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.golf_player_shares_class_status(uuid, uuid)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_player_shares_class_status(uuid, uuid)', 'execute')
  AND position('pg_advisory_xact_lock' IN pg_get_functiondef('public.golf_team_terms_guard()'::regprocedure)) > 0,
  'the sharing helper is callable by authenticated only, and the term guard takes the per-team advisory lock before its overlap check'
);

-- ============================================================================
-- Terms
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1101", "role": "authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.golf_team_terms (id, team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1151', '00000000-0000-0000-0000-0000000b1121',
            '  Fall 2026 ', '2026-08-24', '2026-12-11', '2026-12-18', 'America/New_York')$$,
  'a coach of team A can add a term for team A'
);

SELECT is(
  (SELECT label FROM public.golf_team_terms WHERE id = '00000000-0000-0000-0000-0000000b1151'),
  'Fall 2026',
  'the guard trims the label'
);

SELECT is(
  (SELECT confirmed_by FROM public.golf_team_terms WHERE id = '00000000-0000-0000-0000-0000000b1151'),
  '00000000-0000-0000-0000-0000000b1101'::uuid,
  'the guard stamps confirmed_by with the caller'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1122', 'Fall 2026', '2026-08-24', '2026-12-11', '2026-12-18', 'America/New_York')$$,
  '42501', NULL,
  'a coach of team A cannot add a term for team B'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1121', 'Short', '2027-01-04', '2027-01-20', '2027-01-25', 'America/New_York')$$,
  '23514', NULL,
  'a term shorter than 28 days is refused'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1121', 'Long exams', '2027-01-12', '2027-05-01', '2027-06-15', 'America/New_York')$$,
  '23514', NULL,
  'exams ending more than 21 days after the last class are refused'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1121', 'Bad zone', '2027-01-12', '2027-05-01', '2027-05-08', 'Mars/Olympus')$$,
  '22023', NULL,
  'an unknown time zone is refused'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1121', 'Overlap', '2026-12-01', '2027-02-05', '2027-02-10', 'America/New_York')$$,
  '23P01', NULL,
  'a term that overlaps another term of the team is refused'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1121', 'Spring 2027', '2027-01-12', '2027-05-01', '2027-05-08', 'America/New_York')$$,
  'an adjacent term is accepted'
);

SELECT is(
  public.p10_rows_affected($$UPDATE public.golf_team_terms SET label = 'Fall 2026 (edited)'
                            WHERE id = '00000000-0000-0000-0000-0000000b1151'$$),
  1,
  'a coach of team A can edit their term'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1102", "role": "authenticated"}';

SELECT is(
  public.p10_rows_affected($$UPDATE public.golf_team_terms SET label = 'Hijack'
                            WHERE id = '00000000-0000-0000-0000-0000000b1151'$$),
  0,
  'a coach of team B cannot edit a term of team A'
);

-- ============================================================================
-- Terms as a player, then exceptions
-- ============================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1103", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_team_terms WHERE team_id = '00000000-0000-0000-0000-0000000b1121'),
  2,
  'a player of team A reads team A''s terms'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
    VALUES ('00000000-0000-0000-0000-0000000b1121', 'Summer 2027', '2027-06-01', '2027-07-30', '2027-08-05', 'America/New_York')$$,
  '42501', NULL,
  'a player cannot add a term'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_class_exceptions (id, team_id, player_id, class_id, kind, starts_on, ends_on)
    VALUES ('00000000-0000-0000-0000-0000000b1161', '00000000-0000-0000-0000-0000000b1121',
            '00000000-0000-0000-0000-0000000b1131', '00000000-0000-0000-0000-0000000b1141', 'off', '2026-10-26', '2026-10-26')$$,
  'a player can mark no class for their own class'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_class_exceptions (team_id, player_id, class_id, kind, starts_on, ends_on)
    VALUES ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131',
            '00000000-0000-0000-0000-0000000b1142', 'off', '2026-10-27', '2026-10-27')$$,
  '23514', NULL,
  'a class that belongs to another player is refused'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_class_exceptions (team_id, player_id, kind, starts_on, ends_on)
    VALUES ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1132', 'off', '2026-10-27', '2026-10-27')$$,
  '42501', NULL,
  'a player cannot add an exception for another player'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_class_exceptions (id, team_id, player_id, kind, starts_on, ends_on, start_time, end_time, label)
    VALUES ('00000000-0000-0000-0000-0000000b1162', '00000000-0000-0000-0000-0000000b1121',
            '00000000-0000-0000-0000-0000000b1131', 'extra', '2026-12-14', '2026-12-14', '10:00', '12:00', 'STAT 201 exam')$$,
  'a player can add an exam block of up to four hours'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_class_exceptions (team_id, player_id, kind, starts_on, ends_on, start_time, end_time)
    VALUES ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131', 'extra',
            '2026-12-15', '2026-12-15', '09:00', '13:30')$$,
  '23514', NULL,
  'an exam block of more than four hours is refused'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_class_exceptions (team_id, player_id, class_id, kind, starts_on, ends_on, start_time, end_time)
    VALUES ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131',
            '00000000-0000-0000-0000-0000000b1141', 'extra', '2026-12-15', '2026-12-15', '09:00', '10:00')$$,
  '23514', NULL,
  'an exam block tied to a class is refused (it is a block of its own)'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_class_exceptions (team_id, player_id, kind, starts_on, ends_on, start_time, end_time)
    VALUES ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131', 'extra',
            '2026-12-15', '2026-12-16', '09:00', '10:00')$$,
  '23514', NULL,
  'a multi-day exam block is refused'
);

SELECT throws_ok(
  $$UPDATE public.golf_class_exceptions SET label = 'edited' WHERE id = '00000000-0000-0000-0000-0000000b1161'$$,
  '42501', NULL,
  'there is no update path: rows are replaced, never edited'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1104", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_class_exceptions WHERE player_id = '00000000-0000-0000-0000-0000000b1131'),
  0,
  'a teammate cannot read another player''s exceptions'
);

-- Coach A adds a team-wide break; teammates read it, the coach of team A reads it.
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1101", "role": "authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.golf_class_exceptions (id, team_id, kind, starts_on, ends_on, label)
    VALUES ('00000000-0000-0000-0000-0000000b1163', '00000000-0000-0000-0000-0000000b1121', 'off', '2026-11-25', '2026-11-27', 'Thanksgiving')$$,
  'a coach can add a team-wide break'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_class_exceptions (team_id, player_id, kind, starts_on, ends_on)
    VALUES ('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131', 'off', '2026-10-28', '2026-10-28')$$,
  '42501', NULL,
  'a coach cannot add an exception for a single player'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_class_exceptions WHERE team_id = '00000000-0000-0000-0000-0000000b1121'),
  3,
  'a coach reads the team break and the rows of players who share class status'
);

-- ============================================================================
-- Player settings and the sharing switch (Must 5)
-- ============================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1103", "role": "authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.golf_player_class_settings (player_id, share_status, hold_pushes)
    VALUES ('00000000-0000-0000-0000-0000000b1131', false, true)$$,
  'a player can turn sharing off for themselves'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_player_class_settings (player_id, share_status)
    VALUES ('00000000-0000-0000-0000-0000000b1132', false)$$,
  '42501', NULL,
  'a player cannot write another player''s settings'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1101", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_class_exceptions WHERE player_id = '00000000-0000-0000-0000-0000000b1131'),
  0,
  'with sharing off, the coach no longer reads that player''s exceptions (the helper gates the coach branch)'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_class_exceptions WHERE team_id = '00000000-0000-0000-0000-0000000b1121'),
  1,
  'the team break is still readable by the coach'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_class_settings),
  0,
  'a coach never reads the settings table'
);

SELECT is(
  public.golf_player_shares_class_status('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131'),
  false,
  'the helper tells a coach of the team that this player has sharing off'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b1104", "role": "authenticated"}';

SELECT is(
  public.golf_player_shares_class_status('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1132'),
  true,
  'the helper lets a player read their own switch (default on)'
);

SELECT is(
  public.golf_player_shares_class_status('00000000-0000-0000-0000-0000000b1121', '00000000-0000-0000-0000-0000000b1131'),
  false,
  'the helper answers false to a teammate: it reveals nothing about someone else'
);

-- ============================================================================
-- Realtime
-- ============================================================================
RESET role;

SELECT ok(
  EXISTS (SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'golf_class_exceptions'),
  'golf_class_exceptions is in the supabase_realtime publication'
);

SELECT * FROM finish();
ROLLBACK;
