-- The demo write guard (20261115211100, DD-13): a signed-in account cannot
-- add, change or delete the demo team's rows; other teams, writes with no
-- signed-in user, the generator's own writes and the owner's logins listed in
-- helm_private.golf_demo_editors (20261116150000) pass. Runs as
-- the owner, so row security is out of the way and only the trigger decides.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

SELECT is(
  (SELECT count(*)::int FROM pg_trigger
    WHERE tgname = 'golf_demo_write_guard' AND NOT tgisinternal AND tgenabled = 'O'),
  18,
  'the guard is on all 18 tables'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'helm_private.golf_demo_editors', 'select')
  AND NOT has_table_privilege('anon', 'helm_private.golf_demo_editors', 'select'),
  'no client role can read the editors list'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'helm_private.golf_demo_write_guard()', 'execute')
  AND NOT has_function_privilege('anon', 'helm_private.golf_demo_write_guard()', 'execute'),
  'no client role can call the guard function'
);

-- ------------------------------------------------------------ fixtures (no signed-in user)

INSERT INTO public.golf_teams (id, name, join_code)
VALUES ('6ecdd1a6-63fe-4beb-b094-00118f334163', 'Demo team', 'DEMOGRD1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.golf_teams (id, name, join_code)
VALUES ('00000000-0000-4000-8000-00000000d1e1', 'Another team', 'DEMOGRD2');
INSERT INTO public.golf_players (id, first_name, last_name)
VALUES ('00000000-0000-4000-8000-00000000d1a1', 'Guard', 'Player');

SELECT lives_ok(
  $$INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status, round_type)
    VALUES ('00000000-0000-4000-8000-00000000d1b1', '00000000-0000-4000-8000-00000000d1a1',
            '6ecdd1a6-63fe-4beb-b094-00118f334163', DATE '2026-11-02', 'in_progress', 'practice'),
           ('00000000-0000-4000-8000-00000000d1b2', '00000000-0000-4000-8000-00000000d1a1',
            '00000000-0000-4000-8000-00000000d1e1', DATE '2026-11-02', 'in_progress', 'practice')$$,
  'with no signed-in user (service role, crons, SQL) the demo team takes writes'
);

INSERT INTO public.golf_events (id, team_id, title, event_type, start_time)
VALUES ('00000000-0000-4000-8000-00000000d1c1', '6ecdd1a6-63fe-4beb-b094-00118f334163',
        'Demo practice', 'practice', TIMESTAMPTZ '2026-11-20 14:00Z');

-- ------------------------------------------------------------ a signed-in account

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-4000-8000-00000000d1f1", "role": "authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.golf_events (team_id, title, event_type, start_time)
    VALUES ('6ecdd1a6-63fe-4beb-b094-00118f334163', 'QA event', 'practice', TIMESTAMPTZ '2026-11-21 14:00Z')$$,
  '42501', 'This is a shared demo team: changes are not saved.',
  'a signed-in account cannot add an event to the demo team'
);

SELECT throws_ok(
  $$UPDATE public.golf_events SET title = 'Renamed' WHERE id = '00000000-0000-4000-8000-00000000d1c1'$$,
  '42501', NULL,
  'nor change one'
);

SELECT throws_ok(
  $$UPDATE public.golf_events SET team_id = '00000000-0000-4000-8000-00000000d1e1'
     WHERE id = '00000000-0000-4000-8000-00000000d1c1'$$,
  '42501', NULL,
  'nor move one out of the demo team'
);

SELECT throws_ok(
  $$DELETE FROM public.golf_rounds WHERE id = '00000000-0000-4000-8000-00000000d1b1'$$,
  '42501', NULL,
  'nor delete a demo round'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_holes (round_id, hole_number, par, score)
    VALUES ('00000000-0000-4000-8000-00000000d1b1', 1, 4, 4)$$,
  '42501', NULL,
  'nor add a hole to a demo round (the team is found through the round)'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_holes (round_id, hole_number, par, score)
    VALUES ('00000000-0000-4000-8000-00000000d1b2', 1, 4, 4)$$,
  'another team''s round takes the same hole'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_events (team_id, title, event_type, start_time)
    VALUES ('00000000-0000-4000-8000-00000000d1e1', 'Practice', 'practice', TIMESTAMPTZ '2026-11-21 14:00Z')$$,
  'another team takes the same event'
);

-- ------------------------------------------------------------ an owner login

RESET request.jwt.claims;
INSERT INTO auth.users (id, email, role)
VALUES ('00000000-0000-4000-8000-00000000d1f2', 'demo-guard-owner@example.com', 'authenticated');
INSERT INTO helm_private.golf_demo_editors (user_id, note)
VALUES ('00000000-0000-4000-8000-00000000d1f2', 'owner login (test)');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-4000-8000-00000000d1f2", "role": "authenticated"}';

SELECT lives_ok(
  $$UPDATE public.golf_events SET title = 'Owner edit' WHERE id = '00000000-0000-4000-8000-00000000d1c1'$$,
  'an owner login on the editors list edits the demo team'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-4000-8000-00000000d1f1", "role": "authenticated"}';
SELECT throws_ok(
  $$UPDATE public.golf_events SET title = 'QA edit' WHERE id = '00000000-0000-4000-8000-00000000d1c1'$$,
  '42501', NULL,
  'an account not on the list is still refused'
);

-- ------------------------------------------------------------ the generator

SELECT set_config('helm.golf_demo_writer', 'generator', true);
SELECT lives_ok(
  $$UPDATE public.golf_events SET title = 'Demo practice, moved' WHERE id = '00000000-0000-4000-8000-00000000d1c1'$$,
  'the generator''s mark lets its own writes through'
);
SELECT set_config('helm.golf_demo_writer', '', true);

RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
