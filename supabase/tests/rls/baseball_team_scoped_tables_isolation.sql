-- pgTAP cross-tenant contracts for the four team-scoped baseball tables that
-- had NO RLS coverage at all: tasks, travel itineraries, announcements, and
-- developmental plans.
--
-- WHY THESE FOUR, TOGETHER. They are not related by feature — they are related
-- by the shape of their security contract. Each holds rows that belong to one
-- team, and each is guarded by a per-row `team_id` check. That is one contract
-- worth asserting once against a realistic two-program fixture, rather than
-- four near-identical files.
--
-- WHY THIS SUITE EXISTS. An audit of every previously-uncovered baseball table
-- turned up one genuine hole — the baseball_messages self-comparison typo,
-- which opened every private conversation in the database for read AND write
-- (see baseball_messages_conversation_isolation.sql). These four came out of
-- that same audit CLEAN: their policies really do correlate on team_id and
-- really are scoped. This file is therefore a regression guard, not a fix.
--
-- That distinction is deliberate and worth stating: the value here is that
-- these contracts are now EXECUTED on every CI run instead of being believed
-- because someone read them once. The messages typo is the argument — it sat
-- in the baseline for two months, next to a correctly-written version of
-- itself, and survived because reading a policy is not running it.
--
-- Unlike the sibling suites, this one asserts behaviour that is ALREADY TRUE
-- at HEAD. It should pass before and after migration B; if it ever fails,
-- something has regressed rather than something being unfixed.
--
-- Plan arithmetic, per group: 4 (coach cross-tenant) + 4 (player cross-tenant)
-- + 2 (own-team access preserved) = 10. Counted rather than eyeballed — a
-- miscounted plan aborts the runner's `set -euo pipefail` loop and silently
-- skips every alphabetically later suite.

BEGIN;
\ir _helpers.sql

SELECT plan(10);

-- ============================================================================
-- SEED — two complete programs. Program A has a coach and a rostered player;
-- Program B has its own coach, its own player, and one row in each of the four
-- tables. Nobody from A has any relationship to B.
--
-- Ids in the 00000011* range; checked against every sibling suite.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000110001', 'Scoped Program A', 'college'),
    ('00000000-0000-0000-0000-000000110002', 'Scoped Program B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000110101', 'scopedcoacha@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000110301', 'scopedplayera@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000110201', 'scopedcoachb@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000110401', 'scopedplayerb@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000110101', 'scopedcoacha@helm.test', 'coach'),
    ('00000000-0000-0000-0000-000000110301', 'scopedplayera@helm.test', 'player'),
    ('00000000-0000-0000-0000-000000110201', 'scopedcoachb@helm.test', 'coach'),
    ('00000000-0000-0000-0000-000000110401', 'scopedplayerb@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name) VALUES
    ('00000000-0000-0000-0000-000000110102', '00000000-0000-0000-0000-000000110101', 'college', 'Scoped Coach A'),
    ('00000000-0000-0000-0000-000000110202', '00000000-0000-0000-0000-000000110201', 'college', 'Scoped Coach B')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code) VALUES
    ('00000000-0000-0000-0000-000000110103', '00000000-0000-0000-0000-000000110001', 'Scoped Team A', 'college', 'GSCOPEAA'),
    ('00000000-0000-0000-0000-000000110203', '00000000-0000-0000-0000-000000110002', 'Scoped Team B', 'college', 'GSCOPEBB')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status) VALUES
    ('00000000-0000-0000-0000-000000110103', '00000000-0000-0000-0000-000000110102', 'head_coach', true, true, 'active'),
    ('00000000-0000-0000-0000-000000110203', '00000000-0000-0000-0000-000000110202', 'head_coach', true, true, 'active')
  ON CONFLICT (team_id, coach_id) DO UPDATE
    SET is_primary = true, is_head_coach = true, status = 'active';

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated) VALUES
    ('00000000-0000-0000-0000-000000110302', '00000000-0000-0000-0000-000000110301', 'college', false),
    ('00000000-0000-0000-0000-000000110402', '00000000-0000-0000-0000-000000110401', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000110103', '00000000-0000-0000-0000-000000110302', 'active'),
    ('00000000-0000-0000-0000-000000110203', '00000000-0000-0000-0000-000000110402', 'active')
  ON CONFLICT DO NOTHING;

  -- One row per table for EACH program. Program A's rows prove access is
  -- preserved; Program B's are what must stay invisible to A.
  --
  -- NOTE on the creator columns: baseball_tasks.created_by_id,
  -- baseball_travel_itineraries.created_by and
  -- baseball_announcements.created_by_id all FK to baseball_coaches.id — NOT
  -- to auth.users. The first version of this fixture passed auth user ids and
  -- CI rejected it outright ("violates foreign key constraint
  -- baseball_tasks_created_by_id_fkey"). Recorded because the two id families
  -- are both uuids and both plausible at a glance, so the mistake is silent
  -- until something executes it.
  INSERT INTO public.baseball_tasks (id, team_id, title, status, created_by_id) VALUES
    ('00000000-0000-0000-0000-000000110501', '00000000-0000-0000-0000-000000110103',
     'Team A task', 'pending', '00000000-0000-0000-0000-000000110102'),
    ('00000000-0000-0000-0000-000000110502', '00000000-0000-0000-0000-000000110203',
     'Team B task', 'pending', '00000000-0000-0000-0000-000000110202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_travel_itineraries (id, team_id, event_name, created_by) VALUES
    ('00000000-0000-0000-0000-000000110601', '00000000-0000-0000-0000-000000110103',
     'Team A road trip', '00000000-0000-0000-0000-000000110102'),
    ('00000000-0000-0000-0000-000000110602', '00000000-0000-0000-0000-000000110203',
     'Team B road trip', '00000000-0000-0000-0000-000000110202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_announcements (id, team_id, title, content, urgency, created_by_id) VALUES
    ('00000000-0000-0000-0000-000000110701', '00000000-0000-0000-0000-000000110103',
     'Team A notice', 'A body', 'normal', '00000000-0000-0000-0000-000000110102'),
    ('00000000-0000-0000-0000-000000110702', '00000000-0000-0000-0000-000000110203',
     'Team B notice', 'B body', 'normal', '00000000-0000-0000-0000-000000110202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_developmental_plans (id, coach_id, player_id, team_id, title) VALUES
    ('00000000-0000-0000-0000-000000110801', '00000000-0000-0000-0000-000000110102',
     '00000000-0000-0000-0000-000000110302', '00000000-0000-0000-0000-000000110103', 'A plan'),
    ('00000000-0000-0000-0000-000000110802', '00000000-0000-0000-0000-000000110202',
     '00000000-0000-0000-0000-000000110402', '00000000-0000-0000-0000-000000110203', 'B plan')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 1 — Coach A cannot see Program B's rows.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000110101", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.baseball_tasks
    WHERE id = '00000000-0000-0000-0000-000000110502'),
  0,
  'Coach A cannot read Program B''s tasks'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_travel_itineraries
    WHERE id = '00000000-0000-0000-0000-000000110602'),
  0,
  'Coach A cannot read Program B''s travel itinerary'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_announcements
    WHERE id = '00000000-0000-0000-0000-000000110702'),
  0,
  'Coach A cannot read Program B''s announcements'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_developmental_plans
    WHERE id = '00000000-0000-0000-0000-000000110802'),
  0,
  'Coach A cannot read Program B''s developmental plans — a player''s development record is not cross-program data'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 2 — Player A cannot either. Asserted separately because tasks, travel
-- and announcements each carry a SEPARATE player-side policy
-- (is_baseball_team_player / is_baseball_team_member), so a hole could exist
-- on the player side while the coach side is correctly scoped.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000110301", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.baseball_tasks
    WHERE id = '00000000-0000-0000-0000-000000110502'),
  0,
  'Player A cannot read Program B''s tasks (player-side policy is scoped too)'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_travel_itineraries
    WHERE id = '00000000-0000-0000-0000-000000110602'),
  0,
  'Player A cannot read Program B''s travel itinerary'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_announcements
    WHERE id = '00000000-0000-0000-0000-000000110702'),
  0,
  'Player A cannot read Program B''s announcements'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_developmental_plans
    WHERE id = '00000000-0000-0000-0000-000000110802'),
  0,
  'Player A cannot read another player''s developmental plan'
);

-- ============================================================================
-- GROUP 3 — and the product still works. Without these the whole suite would
-- pass against a database where all four tables denied everything.
-- ============================================================================

SELECT is(
  (SELECT title FROM public.baseball_tasks
    WHERE id = '00000000-0000-0000-0000-000000110501'),
  'Team A task',
  'Player A CAN read their own team''s tasks'
);

SELECT is(
  (SELECT title FROM public.baseball_developmental_plans
    WHERE id = '00000000-0000-0000-0000-000000110801'),
  'A plan',
  'Player A CAN read their own developmental plan'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
