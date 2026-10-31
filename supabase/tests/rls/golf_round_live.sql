-- pgTAP contract for P-6 live rounds (20261025050000_golf_round_live.sql, with the optional
-- 20261025050100_golf_round_live_realtime.sql checks skipped until that file is applied).
--
-- WRITTEN WITH THE PLAN, NOT RUN against a Supabase stack (none here): run `npm run test:rls` before the owner applies
-- migration 1. The deferred constraint triggers are fired inside the test transaction with the recipe
--   SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;  -- before a step
--   <the step: one statement>
--   SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE; -- fires them
-- Each step is its own statement, so the touch handler's dedupe key (the statement timestamp) differs per step.
--
-- Plan arithmetic: 5 structural + 49 behaviour checks (lettered where one numbered case needs several) = 54. The cases follow the
-- plan's numbering (1-24); 15 and 22-24 skip with a note until 20261025050100, 4.33's link table and P-5's timezone helper exist.

BEGIN;
\ir _helpers.sql

SELECT plan(54);

-- ============================================================================
-- Seed. Ids use the 0000...0016xxx range.
--   users:   coach 01 (team A); players 02-07 (team A); outsider coach 08 and player 09 (team B)
--   rounds:  made by the steps below, one in-progress round per player
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000016001', 'coach@live.test',     'authenticated'),
    ('00000000-0000-0000-0000-000000016002', 'p1@live.test',        'authenticated'),
    ('00000000-0000-0000-0000-000000016003', 'p2@live.test',        'authenticated'),
    ('00000000-0000-0000-0000-000000016004', 'p3@live.test',        'authenticated'),
    ('00000000-0000-0000-0000-000000016005', 'p4@live.test',        'authenticated'),
    ('00000000-0000-0000-0000-000000016006', 'p5@live.test',        'authenticated'),
    ('00000000-0000-0000-0000-000000016007', 'p6@live.test',        'authenticated'),
    ('00000000-0000-0000-0000-000000016008', 'coachb@live.test',    'authenticated'),
    ('00000000-0000-0000-0000-000000016009', 'playerb@live.test',   'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000016201', 'Live Org A', 'college'),
    ('00000000-0000-0000-0000-000000016202', 'Live Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000016301', 'Live Team A', 'GLIVEAA', '00000000-0000-0000-0000-000000016201'),
    ('00000000-0000-0000-0000-000000016302', 'Live Team B', 'GLIVEBB', '00000000-0000-0000-0000-000000016202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000016401', '00000000-0000-0000-0000-000000016001', '00000000-0000-0000-0000-000000016201'),
    ('00000000-0000-0000-0000-000000016402', '00000000-0000-0000-0000-000000016008', '00000000-0000-0000-0000-000000016202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000016301', '00000000-0000-0000-0000-000000016401'),
    ('00000000-0000-0000-0000-000000016302', '00000000-0000-0000-0000-000000016402')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000016502', '00000000-0000-0000-0000-000000016002', 'Pat', 'One'),
    ('00000000-0000-0000-0000-000000016503', '00000000-0000-0000-0000-000000016003', 'Pam', 'Two'),
    ('00000000-0000-0000-0000-000000016504', '00000000-0000-0000-0000-000000016004', 'Pip', 'Three'),
    ('00000000-0000-0000-0000-000000016505', '00000000-0000-0000-0000-000000016005', 'Pia', 'Four'),
    ('00000000-0000-0000-0000-000000016506', '00000000-0000-0000-0000-000000016006', 'Pax', 'Five'),
    ('00000000-0000-0000-0000-000000016507', '00000000-0000-0000-0000-000000016007', 'Pol', 'Six'),
    ('00000000-0000-0000-0000-000000016509', '00000000-0000-0000-0000-000000016009', 'Out', 'Sider')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000016301', '00000000-0000-0000-0000-000000016502', 'active'),
    ('00000000-0000-0000-0000-000000016301', '00000000-0000-0000-0000-000000016503', 'active'),
    ('00000000-0000-0000-0000-000000016301', '00000000-0000-0000-0000-000000016504', 'active'),
    ('00000000-0000-0000-0000-000000016301', '00000000-0000-0000-0000-000000016505', 'active'),
    ('00000000-0000-0000-0000-000000016301', '00000000-0000-0000-0000-000000016506', 'active'),
    ('00000000-0000-0000-0000-000000016301', '00000000-0000-0000-0000-000000016507', 'active'),
    ('00000000-0000-0000-0000-000000016302', '00000000-0000-0000-0000-000000016509', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- Test helpers (this transaction only).
CREATE FUNCTION pg_temp.live(p_round uuid) RETURNS public.golf_round_live LANGUAGE sql AS $$
  SELECT l FROM public.golf_round_live l WHERE l.round_id = p_round $$;
CREATE FUNCTION pg_temp.as_user(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL role authenticated';
END $$;
CREATE FUNCTION pg_temp.as_postgres() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET role';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE FUNCTION pg_temp.eval_bool(p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN EXECUTE p_sql INTO v; RETURN v; END $$;
-- Every broadcast the database would send is recorded here by a spy that replaces the broadcaster inside this transaction
-- (it rolls back with the rest, which restores the real one).
CREATE TEMP TABLE sent (topic text, event text, payload jsonb) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION helm_private.golf_live_broadcast(p_topic text, p_event text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO pg_temp.sent VALUES (p_topic, p_event, p_payload);
END $$;
GRANT ALL ON pg_temp.sent TO PUBLIC;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('golf_holes_round_live', 'golf_rounds_round_live_ins', 'golf_rounds_round_live_upd')
      AND tgdeferrable AND tginitdeferred) = 3
  AND (SELECT count(*) FROM pg_trigger WHERE tgname = 'golf_rounds_round_live_gone') = 1,
  'the three refresh triggers are deferrable and initially deferred, and the gone trigger exists'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_round_live', 'select')
  AND NOT has_table_privilege('anon', 'public.golf_round_live_prefs', 'select')
  AND NOT has_table_privilege('authenticated', 'public.golf_round_live', 'insert')
  AND NOT has_table_privilege('authenticated', 'public.golf_round_live', 'update')
  AND NOT has_table_privilege('authenticated', 'public.golf_round_live', 'delete')
  AND NOT has_table_privilege('authenticated', 'public.golf_round_live', 'truncate')
  AND has_table_privilege('authenticated', 'public.golf_round_live', 'select'),
  'anon has no access; authenticated can only select live rows'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_round_live_set_share(uuid,text,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_round_live_set_next_share(text,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_live_viewer_on_course(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_round_live_set_share(uuid,text,boolean)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_round_live_set_next_share(text,boolean)', 'EXECUTE'),
  'the sharing RPCs are executable by authenticated and not by anon'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'helm_private.golf_round_live_refresh(uuid,boolean)'::regprocedure
            AND 'lock_timeout=200ms' = ANY (p.proconfig))
  AND (SELECT count(*) FROM pg_proc p WHERE p.oid IN ('helm_private.golf_round_live_type(text)'::regprocedure, 'helm_private.golf_round_live_floor(text,text)'::regprocedure)
         AND 'search_path=pg_catalog' = ANY (p.proconfig)) = 2
  AND position('FOR UPDATE NOWAIT' IN pg_get_functiondef('helm_private.golf_round_live_refresh(uuid,boolean)'::regprocedure)) > 0,
  'the refresh waits at most 200 ms and takes the live row NOWAIT; the two helpers pin search_path = pg_catalog'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'public.golf_round_live_set_share(uuid,text,boolean)'::regprocedure
            AND 'lock_timeout=2s' = ANY (p.proconfig))
  AND position('FOR KEY SHARE OF gr' IN pg_get_functiondef('public.golf_round_live_set_share(uuid,text,boolean)'::regprocedure)) > 0,
  'set_share locks the round first (FOR KEY SHARE) and gives up after 2 s'
);

-- ============================================================================
-- 1-2. A round and its holes
-- ============================================================================
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, course_name, draft_data)
VALUES ('00000000-0000-0000-0000-000000016701', '00000000-0000-0000-0000-000000016502', '00000000-0000-0000-0000-000000016301',
        current_date, 'practice', 'in_progress', 18, 1, 'Pine Hollow',
        '{"holes":[{"number":1,"par":4,"yardage":388},{"number":2,"par":5,"yardage":512},{"number":3,"par":4,"yardage":401}]}');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;

SELECT is(
  (SELECT share FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'),
  'off',
  'an in-progress team round gets a live row; practice starts off (no prefs)'
);

SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_holes (round_id, hole_number, par, score) VALUES
  ('00000000-0000-0000-0000-000000016701', 1, 4, 4),
  ('00000000-0000-0000-0000-000000016701', 2, 5, 4),
  ('00000000-0000-0000-0000-000000016701', 3, 4, 6);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;

SELECT is(
  (SELECT (l.thru, l.to_par, l.strokes, jsonb_array_length(l.holes))::text FROM pg_temp.live('00000000-0000-0000-0000-000000016701') l),
  '(3,1,14,3)',
  'three scored holes: thru 3, to-par +1, 14 strokes, three entries (18 or fewer)'
);

-- 3. Re-saving the same holes (delete and re-insert, as the save RPC does) changes nothing visible.
CREATE TEMP TABLE before3 ON COMMIT DROP AS
  SELECT l.seq, l.holes FROM public.golf_round_live l WHERE l.round_id = '00000000-0000-0000-0000-000000016701';
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
DELETE FROM public.golf_holes WHERE round_id = '00000000-0000-0000-0000-000000016701';
INSERT INTO public.golf_holes (round_id, hole_number, par, score) VALUES
  ('00000000-0000-0000-0000-000000016701', 1, 4, 4),
  ('00000000-0000-0000-0000-000000016701', 2, 5, 4),
  ('00000000-0000-0000-0000-000000016701', 3, 4, 6);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT ok(
  (SELECT l.seq = b.seq AND l.holes = b.holes
     FROM public.golf_round_live l, before3 b WHERE l.round_id = '00000000-0000-0000-0000-000000016701'),
  'a delete and re-insert of the same holes leaves seq and every hole time unchanged'
);

-- 4. Changing hole 2's score bumps seq, changes only hole 2's time and recomputes to-par.
SELECT pg_sleep(0.02);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
UPDATE public.golf_holes SET score = 5 WHERE round_id = '00000000-0000-0000-0000-000000016701' AND hole_number = 2;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT ok(
  (SELECT l.seq > b.seq AND l.to_par = 2
          AND (SELECT (e->>'at') FROM jsonb_array_elements(l.holes) e WHERE (e->>'n')::int = 1) = (SELECT (e->>'at') FROM jsonb_array_elements(b.holes) e WHERE (e->>'n')::int = 1)
          AND (SELECT (e->>'at') FROM jsonb_array_elements(l.holes) e WHERE (e->>'n')::int = 2) <> (SELECT (e->>'at') FROM jsonb_array_elements(b.holes) e WHERE (e->>'n')::int = 2)
     FROM public.golf_round_live l, before3 b WHERE l.round_id = '00000000-0000-0000-0000-000000016701'),
  'a corrected score bumps seq, re-stamps only that hole and recomputes to-par'
);

-- 5. Hole times are the server's receive time: a client-supplied draft_data.holeTimes is ignored.
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
UPDATE public.golf_rounds SET draft_data = draft_data || jsonb_build_object('holeTimes', jsonb_build_object('3', (now() + interval '1 hour')::text))
 WHERE id = '00000000-0000-0000-0000-000000016701';
UPDATE public.golf_holes SET score = 5 WHERE round_id = '00000000-0000-0000-0000-000000016701' AND hole_number = 3;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT ok(
  (SELECT (e->>'at')::timestamptz <= clock_timestamp() + interval '1 second'
     FROM public.golf_round_live l, jsonb_array_elements(l.holes) e
    WHERE l.round_id = '00000000-0000-0000-0000-000000016701' AND (e->>'n')::int = 3),
  'a hole time comes from the server clock; a future holeTimes value in draft_data is not used'
);

-- ============================================================================
-- 6. A refresh error never fails the save
-- ============================================================================
ALTER TABLE public.golf_round_live RENAME TO golf_round_live_away;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
SELECT lives_ok(
  $$UPDATE public.golf_holes SET score = 4 WHERE round_id = '00000000-0000-0000-0000-000000016701' AND hole_number = 3$$,
  'a hole save succeeds while the live table is missing'
);
SELECT lives_ok(
  $$SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE$$,
  'and so does the commit-time refresh (it logs a WARNING instead of raising)'
);
ALTER TABLE public.golf_round_live_away RENAME TO golf_round_live;

-- A busy lock (55P03) is swallowed the same way: the refresh is stubbed to raise it.
ALTER FUNCTION helm_private.golf_round_live_refresh(uuid, boolean) RENAME TO golf_round_live_refresh_real;
CREATE FUNCTION helm_private.golf_round_live_refresh(p_round_id uuid, p_quiet boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'locked' USING ERRCODE = '55P03'; END $$;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
UPDATE public.golf_holes SET score = 5 WHERE round_id = '00000000-0000-0000-0000-000000016701' AND hole_number = 3;
SELECT lives_ok(
  $$SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE$$,
  'a lock_not_available from the refresh is caught: the save commits'
);
DROP FUNCTION helm_private.golf_round_live_refresh(uuid, boolean);
ALTER FUNCTION helm_private.golf_round_live_refresh_real(uuid, boolean) RENAME TO golf_round_live_refresh;

-- ============================================================================
-- 7. Who can read a row (round 16701, owner Pat One, team A)
-- ============================================================================
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016001');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'), 0,
  'the team coach does not see a practice round the player has not shared');
SELECT pg_temp.as_postgres();
UPDATE public.golf_round_live SET share = 'coaches' WHERE round_id = '00000000-0000-0000-0000-000000016701';
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016001');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'), 1,
  '...and does once it is shared with coaches');
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016008');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'), 0,
  'another team''s coach never sees it');
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016002');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'), 1,
  'the player always sees their own row');
SELECT pg_temp.as_postgres();

-- ============================================================================
-- 8. Teammates: team-shared practice, not while they are on the course themselves, never a qualifier
-- ============================================================================
UPDATE public.golf_round_live SET share = 'team' WHERE round_id = '00000000-0000-0000-0000-000000016701';
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016003');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'), 1,
  'a teammate sees a practice round shared with the team');
SELECT pg_temp.as_postgres();

-- The teammate starts a round of their own: the team lane is withheld while they are on the course.
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, draft_data)
VALUES ('00000000-0000-0000-0000-000000016702', '00000000-0000-0000-0000-000000016503', '00000000-0000-0000-0000-000000016301',
        current_date, 'practice', 'in_progress', 18, 1, '{"holes":[{"number":1,"par":4}]}');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016003');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'), 0,
  '...but not once they have a round on the course themselves (they still see their own)');
SELECT pg_temp.as_postgres();

-- A qualifier round is never shown to teammates, shared or not.
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, draft_data)
VALUES ('00000000-0000-0000-0000-000000016703', '00000000-0000-0000-0000-000000016504', '00000000-0000-0000-0000-000000016301',
        current_date, 'qualifier', 'in_progress', 18, 1, '{"holes":[{"number":1,"par":4}]}');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
DELETE FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016702';
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016005');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016703'), 0,
  'a teammate never sees a qualifier round');
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016001');
SELECT is((SELECT share FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016703'), 'coaches',
  '...and the coach sees it, shared at the floor (coaches)');
SELECT pg_temp.as_postgres();

-- ============================================================================
-- 9. Nobody writes the table directly
-- ============================================================================
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016002');
SELECT throws_ok(
  $$UPDATE public.golf_round_live SET share = 'team' WHERE round_id = '00000000-0000-0000-0000-000000016701'$$,
  '42501', NULL, 'authenticated cannot update a live row');
SELECT throws_ok(
  $$DELETE FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'$$,
  '42501', NULL, 'authenticated cannot delete a live row');
SELECT pg_temp.as_postgres();

-- ============================================================================
-- 10. set_share
-- ============================================================================
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016003');
SELECT is((public.golf_round_live_set_share('00000000-0000-0000-0000-000000016701', 'coaches', false))->>'error', 'not_found',
  'set_share on someone else''s round is not_found');
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016004');
SELECT is((public.golf_round_live_set_share('00000000-0000-0000-0000-000000016703', 'off', true))->>'share', 'coaches',
  'a qualifier round cannot be lowered below coaches (the floor)');
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016002');
SELECT is((public.golf_round_live_set_share('00000000-0000-0000-0000-000000016701', 'coaches', true))->>'ok', 'true',
  'the owner changes sharing, and asks to remember it');
SELECT pg_temp.as_postgres();
SELECT is((SELECT practice_share FROM public.golf_round_live_prefs WHERE player_id = '00000000-0000-0000-0000-000000016502'), 'coaches',
  'the practice default is written with p_remember');
UPDATE public.golf_round_live SET share_changes = 29 WHERE round_id = '00000000-0000-0000-0000-000000016701';
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016002');
DO $$ BEGIN PERFORM public.golf_round_live_set_share('00000000-0000-0000-0000-000000016701', 'team', false); END $$;
SELECT is((public.golf_round_live_set_share('00000000-0000-0000-0000-000000016701', 'off', false))->>'error', 'too_many_changes',
  'the 31st change on one round is refused');
SELECT pg_temp.as_postgres();

-- ============================================================================
-- 11. Reclassifying practice to qualifier lifts the share to coaches
-- ============================================================================
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
SELECT set_config('helm.golf_lifecycle_write', 'reclassify', true);
UPDATE public.golf_rounds SET round_type = 'qualifier' WHERE id = '00000000-0000-0000-0000-000000016701';
SELECT set_config('helm.golf_lifecycle_write', '', true);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT is((SELECT (round_type, share)::text FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'),
  '(qualifier,coaches)', 'a practice round reclassified as a qualifier is shared with coaches');

-- ============================================================================
-- 12. Deleting an in-progress round leaves no live row
-- ============================================================================
DELETE FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-000000016703';
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016703'), 0,
  'deleting an in-progress round removes its live row');
SELECT ok(EXISTS (SELECT 1 FROM sent WHERE event = 'gone' AND payload->>'r' = '00000000-0000-0000-0000-000000016703'),
  '...and a gone event went to the coach topic');

-- ============================================================================
-- 13. A posted round with no live row gets none
-- ============================================================================
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET status = 'completed' WHERE id = '00000000-0000-0000-0000-000000016701';
SELECT set_config('helm.golf_lifecycle_write', '', true);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
DELETE FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701';
SELECT helm_private.golf_round_live_refresh('00000000-0000-0000-0000-000000016701', false);
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016701'), 0,
  'a refresh of a completed round with no live row creates none');

-- ============================================================================
-- 14. Test data is invisible
-- ============================================================================
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, is_test, draft_data)
VALUES ('00000000-0000-0000-0000-000000016704', '00000000-0000-0000-0000-000000016505', '00000000-0000-0000-0000-000000016301',
        current_date, 'qualifier', 'in_progress', 18, 1, true, '{"holes":[{"number":1,"par":4}]}');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016001');
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016704'), 0,
  'an is_test round is invisible to the coach');
SELECT pg_temp.as_postgres();

-- ============================================================================
-- 16. Rate limit: 121 visible changes inside 10 minutes
-- ============================================================================
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, draft_data)
VALUES ('00000000-0000-0000-0000-000000016705', '00000000-0000-0000-0000-000000016506', '00000000-0000-0000-0000-000000016301',
        current_date, 'qualifier', 'in_progress', 18, 1, '{"holes":[{"number":1,"par":4}]}');
INSERT INTO public.golf_holes (round_id, hole_number, par, score) VALUES ('00000000-0000-0000-0000-000000016705', 1, 4, 4);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
DELETE FROM sent;
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..120 LOOP
    UPDATE public.golf_holes SET score = 4 + (i % 2) WHERE round_id = '00000000-0000-0000-0000-000000016705' AND hole_number = 1;
    PERFORM helm_private.golf_round_live_refresh('00000000-0000-0000-0000-000000016705', false);
  END LOOP;
END $$;
SELECT ok(
  (SELECT emit_count >= 121 AND thru = 1 FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016705')
  AND (SELECT count(*) FROM sent WHERE event = 'lane' AND payload->>'r' = '00000000-0000-0000-0000-000000016705') <= 120,
  'past 120 visible changes in 10 minutes the row keeps updating but broadcasts stop');

-- ============================================================================
-- 17. Late sync: two or more holes gained a score in one commit
-- ============================================================================
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, draft_data)
VALUES ('00000000-0000-0000-0000-000000016706', '00000000-0000-0000-0000-000000016507', '00000000-0000-0000-0000-000000016301',
        current_date, 'qualifier', 'in_progress', 18, 1, '{"holes":[{"number":1,"par":4},{"number":2,"par":4},{"number":3,"par":4}]}');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
DELETE FROM sent;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_holes (round_id, hole_number, par, score) VALUES
  ('00000000-0000-0000-0000-000000016706', 1, 4, 4), ('00000000-0000-0000-0000-000000016706', 2, 4, 3), ('00000000-0000-0000-0000-000000016706', 3, 4, 5);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT is((SELECT (payload->>'late')::boolean FROM sent WHERE event = 'lane' AND payload->>'r' = '00000000-0000-0000-0000-000000016706' ORDER BY (payload->>'seq')::bigint DESC LIMIT 1),
  true, 'three holes arriving in one commit are flagged late');
DELETE FROM sent;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
UPDATE public.golf_holes SET score = 4 WHERE round_id = '00000000-0000-0000-0000-000000016706' AND hole_number = 2;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT is((SELECT (payload->>'late')::boolean FROM sent WHERE event = 'lane' AND payload->>'r' = '00000000-0000-0000-0000-000000016706' ORDER BY (payload->>'seq')::bigint DESC LIMIT 1),
  false, 'a corrected score is not late');

SELECT ok(
  (SELECT payload ? 'cur' AND NOT payload ? 'cp' FROM sent WHERE event = 'lane' AND payload->>'r' = '00000000-0000-0000-0000-000000016706' ORDER BY (payload->>'seq')::bigint DESC LIMIT 1),
  'the lane payload names the hole the player is on as cur (a hole number), never cp');

-- ============================================================================
-- 18. The non-atomic submit fallback: no hole rows for a moment keeps what the row had
-- ============================================================================
CREATE TEMP TABLE before18 ON COMMIT DROP AS
  SELECT l.seq, l.thru, l.holes FROM public.golf_round_live l WHERE l.round_id = '00000000-0000-0000-0000-000000016706';
DELETE FROM sent;
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
DELETE FROM public.golf_holes WHERE round_id = '00000000-0000-0000-0000-000000016706';
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT ok(
  (SELECT l.seq = b.seq AND l.thru = b.thru AND l.holes = b.holes
     FROM public.golf_round_live l, before18 b WHERE l.round_id = '00000000-0000-0000-0000-000000016706')
  AND NOT EXISTS (SELECT 1 FROM sent WHERE payload->>'r' = '00000000-0000-0000-0000-000000016706'),
  'with no hole rows between a delete and the inserts, the row keeps its holes and seq and sends nothing');

-- ============================================================================
-- 19. Today and yesterday in the team's zone
-- ============================================================================
UPDATE public.golf_team_settings SET timezone = 'Pacific/Kiritimati' WHERE team_id = '00000000-0000-0000-0000-000000016301';
INSERT INTO public.golf_team_settings (team_id, timezone)
  SELECT '00000000-0000-0000-0000-000000016301', 'Pacific/Kiritimati'
   WHERE NOT EXISTS (SELECT 1 FROM public.golf_team_settings WHERE team_id = '00000000-0000-0000-0000-000000016301');
SELECT is(helm_private.golf_team_today('00000000-0000-0000-0000-000000016301'), (now() AT TIME ZONE 'Pacific/Kiritimati')::date,
  'golf_team_today follows the team''s own zone');
UPDATE public.golf_team_settings SET timezone = 'Mars/Olympus' WHERE team_id = '00000000-0000-0000-0000-000000016301';
SELECT is(helm_private.golf_team_today('00000000-0000-0000-0000-000000016301'), (now() AT TIME ZONE 'America/New_York')::date,
  'a zone that is not a real zone falls back to America/New_York without raising');
UPDATE public.golf_team_settings SET timezone = 'America/New_York' WHERE team_id = '00000000-0000-0000-0000-000000016301';
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, draft_data)
VALUES ('00000000-0000-0000-0000-000000016707', '00000000-0000-0000-0000-000000016509', '00000000-0000-0000-0000-000000016302',
        helm_private.golf_team_today('00000000-0000-0000-0000-000000016302') - 3, 'qualifier', 'in_progress', 18, 1, '{"holes":[{"number":1,"par":4}]}');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT is((SELECT count(*)::int FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016707'), 0,
  'an in-progress round from three days ago gets no live row');

-- ============================================================================
-- 20/21. The setup choice applies to one round only
-- ============================================================================
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016002');
DO $$ BEGIN PERFORM public.golf_round_live_set_next_share('team', false); END $$;
SELECT pg_temp.as_postgres();
SELECT is((SELECT next_share FROM public.golf_round_live_prefs WHERE player_id = '00000000-0000-0000-0000-000000016502'), 'team',
  'set_next_share records the choice for the next round');
-- The previous round of this player was completed above, so a new practice round can start.
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, draft_data)
VALUES ('00000000-0000-0000-0000-000000016708', '00000000-0000-0000-0000-000000016502', '00000000-0000-0000-0000-000000016301',
        current_date, 'practice', 'in_progress', 18, 1, '{"holes":[{"number":1,"par":4}]}');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT is((SELECT share FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016708'), 'team',
  'a practice round created within 30 minutes adopts the setup choice');
SELECT ok((SELECT next_share IS NULL AND next_share_at IS NULL FROM public.golf_round_live_prefs WHERE player_id = '00000000-0000-0000-0000-000000016502'),
  'the choice is cleared once that round''s row exists');
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET status = 'abandoned' WHERE id = '00000000-0000-0000-0000-000000016708';
SELECT set_config('helm.golf_lifecycle_write', '', true);
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd DEFERRED;
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, round_type, status, holes_played, current_hole, draft_data, created_at)
VALUES ('00000000-0000-0000-0000-000000016709', '00000000-0000-0000-0000-000000016502', '00000000-0000-0000-0000-000000016301',
        current_date, 'practice', 'in_progress', 18, 1, '{"holes":[{"number":1,"par":4}]}', now() + interval '20 minutes');
SET CONSTRAINTS golf_holes_round_live, golf_rounds_round_live_ins, golf_rounds_round_live_upd IMMEDIATE;
SELECT is((SELECT share FROM public.golf_round_live WHERE round_id = '00000000-0000-0000-0000-000000016709'), 'coaches',
  'a second practice round 20 minutes later, with no new call, gets the practice default (coaches, remembered in 10), not team');

-- ============================================================================
-- 22. A tracked tournament round gets no row (needs 4.33's link table)
-- ============================================================================
SELECT CASE WHEN to_regclass('public.golf_tournament_player_rounds') IS NULL
  THEN pass('skipped: golf_tournament_player_rounds is not in this database yet (4.33)')
  ELSE ok(pg_temp.eval_bool($q$
    SELECT NOT EXISTS (SELECT 1 FROM public.golf_round_live l WHERE l.round_type = 'tournament'
                         AND EXISTS (SELECT 1 FROM public.golf_tournament_player_rounds t WHERE t.round_id = l.round_id))$q$),
    'no live row exists for a tournament round that a tournament tracks') END;

-- ============================================================================
-- 23. Each VERIFY query of migration 1 returns a row once it is applied
--     (the other half, zero rows before it, is the apply script's own check on an empty database)
-- ============================================================================
SELECT ok(
  pg_temp.eval_bool($q$ SELECT EXISTS (select 1 where to_regclass('public.golf_round_live') is not null and to_regclass('public.golf_round_live_prefs') is not null) $q$)
  AND pg_temp.eval_bool($q$ SELECT EXISTS (select 1 where (select count(*) from pg_trigger where tgname in ('golf_holes_round_live','golf_rounds_round_live_ins','golf_rounds_round_live_upd') and tgdeferrable and tginitdeferred) = 3) $q$)
  AND pg_temp.eval_bool($q$ SELECT EXISTS (select 1 from pg_class where oid in ('public.golf_round_live'::regclass, 'public.golf_round_live_prefs'::regclass) and relrowsecurity having count(*) = 2) $q$)
  AND pg_temp.eval_bool($q$ SELECT EXISTS (select 1 where not has_table_privilege('anon', 'public.golf_round_live', 'select') and not has_table_privilege('anon', 'public.golf_round_live_prefs', 'select')) $q$),
  'the migration''s VERIFY queries each return a row');

-- ============================================================================
-- 24. Zone parity with P-5's team timezone helper, when it exists
-- ============================================================================
SELECT CASE WHEN to_regprocedure('public.golf_team_timezone(uuid)') IS NULL
  THEN pass('skipped: public.golf_team_timezone is not in this database yet (P-5)')
  ELSE ok(pg_temp.eval_bool($q$
    SELECT bool_and(helm_private.golf_team_today(t.id) = (now() AT TIME ZONE public.golf_team_timezone(t.id))::date) FROM public.golf_teams t$q$),
    'golf_team_today agrees with golf_team_timezone for every team') END;

-- ============================================================================
-- 15. After migration 2: who may join a private topic (skipped until that file is applied)
--     Team A: coach 01; Pam (03) has no live row, Pax (06) is on the course; team B's coach (08) and player (09).
-- ============================================================================
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016001');
SELECT CASE WHEN to_regprocedure('public.golf_live_topic_allowed(text)') IS NULL
  THEN pass('skipped: 20261025050100 is not applied')
  ELSE ok(pg_temp.eval_bool($q$ SELECT public.golf_live_topic_allowed('golf-live:coach:00000000-0000-0000-0000-000000016301') $q$),
    'a coach may join their own team''s coach topic') END;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016003');
SELECT CASE WHEN to_regprocedure('public.golf_live_topic_allowed(text)') IS NULL
  THEN pass('skipped: 20261025050100 is not applied')
  ELSE ok(pg_temp.eval_bool($q$ SELECT NOT public.golf_live_topic_allowed('golf-live:coach:00000000-0000-0000-0000-000000016301')
                                   AND public.golf_live_topic_allowed('golf-live:team:00000000-0000-0000-0000-000000016301') $q$),
    'a player may not join the coach topic, and may join the team topic while not on the course') END;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016006');
SELECT CASE WHEN to_regprocedure('public.golf_live_topic_allowed(text)') IS NULL
  THEN pass('skipped: 20261025050100 is not applied')
  ELSE ok(pg_temp.eval_bool($q$ SELECT NOT public.golf_live_topic_allowed('golf-live:team:00000000-0000-0000-0000-000000016301') $q$),
    'a player on the course may not join the team topic') END;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016008');
SELECT CASE WHEN to_regprocedure('public.golf_live_topic_allowed(text)') IS NULL
  THEN pass('skipped: 20261025050100 is not applied')
  ELSE ok(pg_temp.eval_bool($q$ SELECT NOT public.golf_live_topic_allowed('golf-live:coach:00000000-0000-0000-0000-000000016301') $q$),
    'another team''s coach may not join the coach topic') END;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000016009');
SELECT CASE WHEN to_regprocedure('public.golf_live_topic_allowed(text)') IS NULL
  THEN pass('skipped: 20261025050100 is not applied')
  ELSE ok(pg_temp.eval_bool($q$ SELECT NOT public.golf_live_topic_allowed('golf-live:team:00000000-0000-0000-0000-000000016301') $q$),
    'another team''s player may not join the team topic') END;
SELECT pg_temp.as_postgres();
SELECT CASE WHEN to_regprocedure('public.golf_live_topic_allowed(text)') IS NULL
  THEN pass('skipped: 20261025050100 is not applied')
  ELSE ok(pg_temp.eval_bool($q$ SELECT public.golf_live_topic_allowed('golf-live:coach:not-a-uuid') = false
                                   AND public.golf_live_topic_allowed('golf-live:other:00000000-0000-0000-0000-000000016301') = false
                                   AND public.golf_live_topic_allowed(NULL) = false $q$),
    'malformed topics are refused') END;

SELECT * FROM finish();

ROLLBACK;
