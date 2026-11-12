-- pgTAP contract for 20261108100000_golf_division_cohort.sql (Ask's level comparison: the mean of the players on Helm at
-- one college level and gender).
--
-- Proves:
--   * refresh_division_cohort() LEAVES the aggregates it computes. As first written it stamped rows with now() (the
--     transaction's start) and then deleted every row older than a clock reading taken inside the transaction, so the
--     table always ended empty and Ask silently fell back. The rows after a run are asserted here, not just the call.
--   * the aggregates are right: the mean over active members only, a player on two teams of one level counted once and
--     on teams of two levels once at each, the newest season's division first and the program's division after it, no
--     row under 8 players and none for a team with no college level.
--   * a second run replaces the first (one row per cohort, new values, one instant for the whole table) and removes a
--     cohort that fell under the floor, whatever instant its old row carries.
--   * grants are as intended: signed-in users read, nobody but the service role writes or refreshes, anon has nothing.
--   * nothing player-identifying is exposed: the table has exactly its six aggregate columns and no cohort under 8.
--   * college_level_of() answers the cases benchmark-reads.test.ts pins for its TypeScript twin, levelFromDivision().
--
-- Every fixture row uses metric ids that exist only here, so the assertions do not depend on what else is in the
-- database. Nothing touches auth.users: the players carry no user id.
-- WRITTEN, NOT RUN on the real stack where it was authored (the shared local stack was in use): run with
-- npm run test:rls before applying. The function bodies, the aggregates and these assertions were run on a scratch
-- Postgres 16 with stand-in tables and a pgTAP shim.

BEGIN;
\ir _helpers.sql

SELECT plan(34);

CREATE FUNCTION public.dc_id(k text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('division-cohort:' || k)::uuid $$;

-- A player with one membership and, when p_gir is given, one standing figure on the fixture metric.
CREATE FUNCTION public.dc_player(k text, p_team text, p_status text, p_gir numeric) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.golf_players (id, first_name, last_name) VALUES (public.dc_id('p:' || k), k, 'Cohort');
  INSERT INTO public.golf_team_members (team_id, player_id, status)
  VALUES (public.dc_id('team:' || p_team), public.dc_id('p:' || k), p_status::public.team_member_status);
  IF p_gir IS NOT NULL THEN
    INSERT INTO public.golf_player_standing (player_id, metric_id, player_value, pga_value)
    VALUES (public.dc_id('p:' || k), 'pgtap_dc_gir', p_gir, 66);
  END IF;
END $$;

-- The fixture cohorts, as text, in a fixed order: gender|level|metric|mean to two places|players.
CREATE FUNCTION public.dc_rows() RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(
    SELECT c.gender || '|' || c.level || '|' || c.metric_id || '|' || round(c.cohort_avg, 2)::text || '|' || c.cohort_n::text
    FROM public.golf_division_cohort c
    WHERE c.metric_id LIKE 'pgtap_dc_%'
    ORDER BY 1
  ) $$;

DO $$
DECLARE
  i integer;
BEGIN
  INSERT INTO public.golf_metrics (metric_id, display_label, unit, direction, category) VALUES
    ('pgtap_dc_gir',   'pgTAP cohort GIR',   'percent', 'higher_better', 'approach'),
    ('pgtap_dc_putts', 'pgTAP cohort putts', 'count',   'lower_better',  'putting');

  INSERT INTO public.organizations (id, name, type, division) VALUES
    (public.dc_id('org:d1'),   'pgTAP Cohort College',      'college', 'NCAA Division I'),
    (public.dc_id('org:naia'), 'pgTAP Cohort NAIA College', 'college', 'NAIA');

  INSERT INTO public.golf_teams (id, name, join_code, gender, organization_id) VALUES
    (public.dc_id('team:season_d1'), 'Cohort men, D1 by season',  'PGDCMD1S', 'mens',   NULL),
    (public.dc_id('team:org_d1'),    'Cohort men, D1 by program', 'PGDCMD1O', 'mens',   public.dc_id('org:d1')),
    (public.dc_id('team:women_d1'),  'Cohort women, D1',          'PGDCWD1S', 'womens', NULL),
    (public.dc_id('team:men_d2'),    'Cohort men, D2',            'PGDCMD2S', 'mens',   NULL),
    (public.dc_id('team:naia'),      'Cohort men, NAIA',          'PGDCNAIA', 'mens',   public.dc_id('org:naia'));

  -- The newest season row decides: this team was Division III two seasons ago and is Division I now.
  INSERT INTO public.golf_team_seasons (team_id, season, division) VALUES
    (public.dc_id('team:season_d1'), '2024-25', 'd3'),
    (public.dc_id('team:season_d1'), '2026-27', 'd1'),
    (public.dc_id('team:women_d1'),  '2026-27', 'd1'),
    (public.dc_id('team:men_d2'),    '2026-27', 'd2');

  -- Men, Division I: five on the season team, three on the program team. Values 10..80, mean 45.
  FOR i IN 1..5 LOOP PERFORM public.dc_player('a' || i, 'season_d1', 'active', i * 10); END LOOP;
  FOR i IN 6..8 LOOP PERFORM public.dc_player('a' || i, 'org_d1', 'active', i * 10); END LOOP;
  -- Not active: left out (1000 would move the mean).
  PERFORM public.dc_player('a9', 'season_d1', 'inactive', 1000);
  -- a2 is on both Division I teams: counted once.
  INSERT INTO public.golf_team_members (team_id, player_id, status)
  VALUES (public.dc_id('team:org_d1'), public.dc_id('p:a2'), 'active');

  -- Men, Division II: seven players at 30, and a1 (10) is on this team too: counted once at each level. Mean 27.5.
  FOR i IN 1..7 LOOP PERFORM public.dc_player('e' || i, 'men_d2', 'active', 30); END LOOP;
  INSERT INTO public.golf_team_members (team_id, player_id, status)
  VALUES (public.dc_id('team:men_d2'), public.dc_id('p:a1'), 'active');

  -- Women, Division I: eight at 50.
  FOR i IN 1..8 LOOP PERFORM public.dc_player('w' || i, 'women_d1', 'active', 50); END LOOP;
  -- No college level (NAIA): eight players, no cohort.
  FOR i IN 1..8 LOOP PERFORM public.dc_player('n' || i, 'naia', 'active', 99); END LOOP;

  -- A second metric held by only seven of the eight Division I men: under the floor.
  FOR i IN 1..7 LOOP
    INSERT INTO public.golf_player_standing (player_id, metric_id, player_value, pga_value)
    VALUES (public.dc_id('p:a' || i), 'pgtap_dc_putts', 30, 29);
  END LOOP;
END $$;

-- Structure and privacy ----------------------------------------------------------------------------------------------
SELECT has_table('public', 'golf_division_cohort', 'golf_division_cohort exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_division_cohort'::regclass),
  'golf_division_cohort has RLS enabled');
SELECT is(
  ARRAY(SELECT a.attname::text FROM pg_attribute a
        WHERE a.attrelid = 'public.golf_division_cohort'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum),
  ARRAY['gender', 'level', 'metric_id', 'cohort_avg', 'cohort_n', 'computed_at'],
  'the table has exactly its six aggregate columns: no player, user or team column');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.golf_division_cohort'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.atttypid = 'uuid'::regtype),
  'no column can hold an id');
SELECT col_type_is('public', 'golf_division_cohort', 'cohort_n', 'bigint', 'cohort_n is a bigint');
SELECT throws_ok(
  $$INSERT INTO public.golf_division_cohort (gender, level, metric_id, cohort_avg, cohort_n)
    VALUES ('mens', 'd3', 'pgtap_dc_gir', 1, 7)$$,
  '23514', NULL, 'a cohort of fewer than 8 players cannot be stored, by anyone');
SELECT is(
  ARRAY(SELECT p.policyname::text || ':' || p.cmd || ':' || p.roles::text FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'golf_division_cohort' ORDER BY 1),
  ARRAY['golf_division_cohort_read:SELECT:{authenticated}'],
  'the only policy is a SELECT for signed-in users');

-- Grants -------------------------------------------------------------------------------------------------------------
SELECT ok(
  has_table_privilege('authenticated', 'public.golf_division_cohort', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.golf_division_cohort', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'authenticated reads the table and holds no other privilege on it');
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_division_cohort', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'anon holds no privilege on the table');
SELECT ok(
  has_table_privilege('service_role', 'public.golf_division_cohort', 'SELECT')
  AND has_table_privilege('service_role', 'public.golf_division_cohort', 'INSERT')
  AND has_table_privilege('service_role', 'public.golf_division_cohort', 'UPDATE')
  AND has_table_privilege('service_role', 'public.golf_division_cohort', 'DELETE'),
  'service_role reads and writes the table');
SELECT ok(
  has_function_privilege('service_role', 'public.refresh_division_cohort()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.refresh_division_cohort()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.refresh_division_cohort()', 'EXECUTE'),
  'only service_role may run the refresh');
SELECT ok(
  (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
   FROM pg_proc p WHERE p.oid = 'public.refresh_division_cohort()'::regprocedure),
  'the refresh runs with its owner''s rights and a pinned search_path');
SELECT ok(
  has_function_privilege('authenticated', 'public.college_level_of(text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.college_level_of(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.college_level_of(text)', 'EXECUTE'),
  'college_level_of is for signed-in users and the service role, not anon');

-- college_level_of: the cases benchmark-reads.test.ts pins for levelFromDivision() ---------------------------------
SELECT is(
  ARRAY(SELECT public.college_level_of(d) FROM unnest(ARRAY['d1', 'D1', 'Division I', 'div 1', '1', 'd2', 'Division II', 'd3', 'Division III', 'DIII']) WITH ORDINALITY AS t(d, n) ORDER BY n),
  ARRAY['d1', 'd1', 'd1', 'd1', 'd1', 'd2', 'd2', 'd3', 'd3', 'd3'],
  'the three levels, however the division is written');
SELECT is(
  ARRAY(SELECT public.college_level_of(d) FROM unnest(ARRAY['NCAA D1', 'NCAA Division III', 'NCAA D-II', 'ncaa div. 2']) WITH ORDINALITY AS t(d, n) ORDER BY n),
  ARRAY['d1', 'd3', 'd2', 'd2'],
  'an association prefix does not hide the level');
SELECT is(
  ARRAY(SELECT public.college_level_of(d) FROM unnest(ARRAY[NULL, '', 'NAIA', 'JUCO', 'NJCAA Division I', 'NAIA Division II', 'Big Ten', 'other']) WITH ORDINALITY AS t(d, n) ORDER BY n),
  ARRAY[NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL]::text[],
  'unset, another association and anything else have no college level');

-- First run, as the service role -------------------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.refresh_division_cohort()$$, 'the service role runs the refresh');
RESET ROLE;

SELECT is(
  public.dc_rows(),
  ARRAY['mens|d1|pgtap_dc_gir|45.00|8', 'mens|d2|pgtap_dc_gir|27.50|8', 'womens|d1|pgtap_dc_gir|50.00|8'],
  'the refresh LEAVES its aggregates: the mean and the player count of each cohort of 8 or more');
SELECT is(
  (SELECT count(*)::int FROM public.golf_division_cohort WHERE metric_id = 'pgtap_dc_putts'), 0,
  'a metric only seven players hold has no cohort');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.golf_division_cohort WHERE cohort_n < 8),
  'no stored cohort describes fewer than 8 players');
SELECT ok(
  (SELECT count(DISTINCT c.computed_at) = 1 AND min(c.computed_at) > now()
   FROM public.golf_division_cohort c WHERE c.metric_id LIKE 'pgtap_dc_%'),
  'one run stamps its rows with one instant, read from the clock (later than the transaction''s start)');

CREATE TEMP TABLE dc_first_run ON COMMIT DROP AS
SELECT max(c.computed_at) AS at FROM public.golf_division_cohort c WHERE c.metric_id LIKE 'pgtap_dc_%';

-- A signed-in user with no team reads the aggregates and can change nothing ------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', public.dc_id('u:nobody'), 'role', 'authenticated')::text, true);
SELECT is(
  (SELECT count(*)::int FROM public.golf_division_cohort WHERE metric_id LIKE 'pgtap_dc_%'), 3,
  'any signed-in user reads the cohorts');
SELECT throws_ok(
  $$INSERT INTO public.golf_division_cohort (gender, level, metric_id, cohort_avg, cohort_n)
    VALUES ('mens', 'd3', 'pgtap_dc_gir', 1, 8)$$,
  '42501', NULL, 'a signed-in user cannot insert a cohort');
SELECT throws_ok(
  $$UPDATE public.golf_division_cohort SET cohort_avg = 0 WHERE metric_id = 'pgtap_dc_gir'$$,
  '42501', NULL, 'a signed-in user cannot change a cohort');
SELECT throws_ok(
  $$DELETE FROM public.golf_division_cohort WHERE metric_id = 'pgtap_dc_gir'$$,
  '42501', NULL, 'a signed-in user cannot delete a cohort');
SELECT throws_ok(
  $$SELECT public.refresh_division_cohort()$$,
  '42501', NULL, 'a signed-in user cannot run the refresh');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT count(*) FROM public.golf_division_cohort$$,
  '42501', NULL, 'anon cannot read the cohorts');
SELECT throws_ok(
  $$SELECT public.refresh_division_cohort()$$,
  '42501', NULL, 'anon cannot run the refresh');
SELECT throws_ok(
  $$SELECT public.college_level_of('d1')$$,
  '42501', NULL, 'anon cannot call college_level_of');
RESET ROLE;

-- Second run: values move, one cohort falls under the floor, one reaches it ------------------------------------------
UPDATE public.golf_player_standing SET player_value = 160
WHERE player_id = public.dc_id('p:a8') AND metric_id = 'pgtap_dc_gir';          -- men D1 mean 45 -> 55
DELETE FROM public.golf_player_standing
WHERE player_id = public.dc_id('p:e7') AND metric_id = 'pgtap_dc_gir';          -- men D2: 7 players left
INSERT INTO public.golf_player_standing (player_id, metric_id, player_value, pga_value)
VALUES (public.dc_id('p:a8'), 'pgtap_dc_putts', 38, 29);                        -- putts: now 8, mean 31
-- A leftover row stamped in the future (a clock that stepped back, or a hand edit) is still a leftover.
INSERT INTO public.golf_division_cohort (gender, level, metric_id, cohort_avg, cohort_n, computed_at)
VALUES ('womens', 'd3', 'pgtap_dc_gir', 1, 8, now() + interval '1 day');

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.refresh_division_cohort()$$, 'the service role runs the refresh again');
RESET ROLE;

SELECT is(
  public.dc_rows(),
  ARRAY['mens|d1|pgtap_dc_gir|55.00|8', 'mens|d1|pgtap_dc_putts|31.00|8', 'womens|d1|pgtap_dc_gir|50.00|8'],
  'a second run replaces the first: new values, the cohort that reached 8 appears, the two that are no longer cohorts are gone');
SELECT is(
  (SELECT count(*)::int FROM public.golf_division_cohort WHERE metric_id LIKE 'pgtap_dc_%'), 3,
  'and it does not duplicate: one row per cohort');
SELECT ok(
  (SELECT count(DISTINCT c.computed_at) = 1 FROM public.golf_division_cohort c),
  'after a run every row in the table carries that run''s instant: nothing from an earlier run survives');
SELECT ok(
  (SELECT min(c.computed_at) > (SELECT f.at FROM dc_first_run f)
   FROM public.golf_division_cohort c WHERE c.metric_id LIKE 'pgtap_dc_%'),
  'the second run''s instant is later than the first''s');

SELECT * FROM finish();
ROLLBACK;
