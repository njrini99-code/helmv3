-- pgTAP contract for 20261107090400_golf_player_next_class.sql (Messages v2 package M, M6): the Details card's
-- "Next: Monday 9:05 AM, Statistics".
--
-- Proves: a coach of the team gets the next class block strictly after the given instant (today's if still ahead, else
-- the next day's), with label, kind and the zone to format it in; a player who turned sharing off, a player with no
-- schedule and a player on another team all answer NULL; a non-coach, a coach of another team, a null player and anon are
-- refused; the instant is limited to the window golf_team_class_day accepts.
-- The term is built around today in UTC with a class every day at 09:30 to 10:45 (as golf_class_blocks.sql does), so the
-- suite does not depend on the date it runs.
-- WRITTEN, NOT RUN where it was authored (no Docker): run with npm run test:rls before applying. Needs 20261025070000 and
-- 20261025070100 applied (the class awareness functions).

BEGIN;
\ir _helpers.sql

SELECT plan(15);

CREATE FUNCTION public.f6_id(k text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('f6-next-class:' || k)::uuid $$;

CREATE FUNCTION public.f6_utc_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'UTC')::date $$;

-- An instant on today's UTC date.
CREATE FUNCTION public.f6_today_at(t time) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (public.f6_utc_today() + t) AT TIME ZONE 'UTC' $$;

CREATE FUNCTION public.f6_mkplayer(k text, p_team uuid, p_class boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES (public.f6_id('u:' || k), k || '@f6.test', 'authenticated') ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES (public.f6_id('p:' || k), public.f6_id('u:' || k), k, 'Test');
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES (p_team, public.f6_id('p:' || k), 'active');
  IF p_class THEN
    INSERT INTO public.golf_player_classes (id, player_id, class_name, days, start_time, end_time, semester, created_at, status_enabled)
    VALUES (public.f6_id('c:' || k), public.f6_id('p:' || k), 'STAT 201 - Probability', '{M,T,W,Th,F,Sa,Su}', '09:30', '10:45', 'Dyn Term', now(), true);
  END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (public.f6_id('team'),  'Next Class Team',  'NXTCLS01'),
    (public.f6_id('other'), 'Other Class Team', 'NXTCLS02');
  INSERT INTO public.golf_team_settings (team_id, timezone) VALUES
    (public.f6_id('team'),  'America/New_York'),
    (public.f6_id('other'), 'America/New_York');
  INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone) VALUES
    (public.f6_id('team'),  'Dyn Term', public.f6_utc_today() - 30, public.f6_utc_today() + 60, public.f6_utc_today() + 70, 'UTC'),
    (public.f6_id('other'), 'Dyn Term', public.f6_utc_today() - 30, public.f6_utc_today() + 60, public.f6_utc_today() + 70, 'UTC');

  INSERT INTO auth.users (id, email, role) VALUES
    (public.f6_id('u:coach1'), 'coach1@f6.test', 'authenticated'),
    (public.f6_id('u:coach2'), 'coach2@f6.test', 'authenticated');
  INSERT INTO public.golf_coaches (id, user_id) VALUES
    (public.f6_id('coach1'), public.f6_id('u:coach1')),
    (public.f6_id('coach2'), public.f6_id('u:coach2'));
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    (public.f6_id('team'),  public.f6_id('coach1')),
    (public.f6_id('other'), public.f6_id('coach2'));

  PERFORM public.f6_mkplayer('shares', public.f6_id('team'), true);     -- normal, shared
  PERFORM public.f6_mkplayer('private', public.f6_id('team'), true);    -- sharing off
  PERFORM public.f6_mkplayer('bare', public.f6_id('team'), false);      -- no classes
  PERFORM public.f6_mkplayer('foreign', public.f6_id('other'), true);   -- a player on the other team
  INSERT INTO public.golf_player_class_settings (player_id, share_status, hold_pushes) VALUES
    (public.f6_id('p:private'), false, true);
END $$;

-- Structure ------------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.golf_player_next_class(uuid, uuid, timestamptz)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_player_next_class(uuid, uuid, timestamptz)', 'execute')
  AND (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.golf_player_next_class(uuid, uuid, timestamptz)'::regprocedure),
  'the function is SECURITY DEFINER, callable by authenticated and not by anon');

-- As the coach of team ---------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', public.f6_id('u:coach1'), 'role', 'authenticated')::text, true);

SELECT is(
  (public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:shares'), public.f6_today_at('11:00')) ->> 'starts_at')::timestamptz,
  (public.f6_utc_today() + 1 + time '09:30') AT TIME ZONE 'UTC',
  'after today''s class, the next block is tomorrow at 09:30 (UTC term)');
SELECT is(
  (SELECT ARRAY[r ->> 'label', r ->> 'kind', r ->> 'time_zone']
     FROM (SELECT public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:shares'), public.f6_today_at('11:00')) AS r) x),
  ARRAY['STAT 201 - Probability', 'class', 'UTC'],
  'it carries the class label, kind and the zone to format in');
SELECT is(
  (public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:shares'), public.f6_today_at('11:00')) ->> 'ends_at')::timestamptz,
  (public.f6_utc_today() + 1 + time '10:45') AT TIME ZONE 'UTC',
  'and the end of the block');
SELECT is(
  (public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:shares'), public.f6_today_at('08:00')) ->> 'starts_at')::timestamptz,
  (public.f6_utc_today() + time '09:30') AT TIME ZONE 'UTC',
  'before today''s class, the next block is today at 09:30');
SELECT is(
  (public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:shares'), public.f6_today_at('10:00')) ->> 'starts_at')::timestamptz,
  (public.f6_utc_today() + 1 + time '09:30') AT TIME ZONE 'UTC',
  'during today''s class, "next" is strictly after: tomorrow''s block');
SELECT ok(
  public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:shares'), NULL) IS NOT NULL,
  'a null instant means now');

SELECT is(public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:private'), public.f6_today_at('11:00')), NULL::jsonb,
  'a player who turned sharing off answers NULL');
SELECT is(public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:bare'), public.f6_today_at('11:00')), NULL::jsonb,
  'a player with no classes answers NULL');
SELECT is(public.golf_player_next_class(public.f6_id('team'), public.f6_id('p:foreign'), public.f6_today_at('11:00')), NULL::jsonb,
  'a player on another team answers NULL (no cross-team read by passing their id)');

SELECT throws_ok(
  format($$SELECT public.golf_player_next_class(%L, %L, now())$$, public.f6_id('other'), public.f6_id('p:foreign')),
  '42501', NULL, 'a coach of team A is refused for team B');
SELECT throws_ok(
  format($$SELECT public.golf_player_next_class(%L, NULL, now())$$, public.f6_id('team')),
  '42501', NULL, 'a null player is refused');
SELECT throws_ok(
  format($$SELECT public.golf_player_next_class(%L, %L, now() + interval '30 days')$$, public.f6_id('team'), public.f6_id('p:shares')),
  '22023', NULL, 'an instant beyond the 14-day window is refused');
RESET ROLE;

-- As a player of the team ----------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', public.f6_id('u:shares'), 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format($$SELECT public.golf_player_next_class(%L, %L, now())$$, public.f6_id('team'), public.f6_id('p:shares')),
  '42501', NULL, 'a player is refused, even for themselves (coach read only)');
RESET ROLE;

-- anon ---------------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok(
  format($$SELECT public.golf_player_next_class(%L, %L, now())$$, public.f6_id('team'), public.f6_id('p:shares')),
  '42501', NULL, 'anon cannot call it');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
