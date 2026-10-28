-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- Plan: docs/clubhouse/held/data/tournaments-round-write.md (HELD.md row).
-- Apply: npm run db:apply --
-- supabase/migrations/20261027100000_golf_tournament_update_round_write.sql
-- Risk: LOW. Replaces two function bodies (golf_tournament_create and
-- golf_tournament_update from 20261024100200); no table, policy, grant or
-- data change. CREATE OR REPLACE keeps both functions' grants and comments.
--
-- Why (PR 2374 review, fix list 2026-10-27, item 1): 4.33's desk update
-- (100200) writes a round event's title and course_id directly, at trigger
-- depth 1, without helm.tournament_write = 'rounds'. P-5's guard (040000,
-- helm_private.guard_tournament_round_event) refuses exactly that write with
-- round_fields_locked. 040100's sync triggers rename the round events to
-- "Name · R1" first, so the desk's own "Name · Round 1" always differs and
-- every rename, and every round course change, fails and rolls back. All
-- three files are applied in production, so this is a forward fix.
--
-- What changes:
--   * golf_tournament_update sets helm.tournament_write = 'rounds' for the
--     round loop (the same mark 040000's create_from_calendar sets) and clears
--     it after; round titles are written as name || ' · R' || n, the 040100
--     form, so the desk and the sync triggers agree.
--   * golf_tournament_create writes new round titles in the same form.
-- Existing titles are not rewritten by this file. Production's round events
-- titled "Name · Round n" move to "Name · Rn" at the next desk save that sends
-- a rounds list (any save from the desk, not only a rename), quietly, under
-- the same mark; a calendar rename moves them through 040100's sync.
--
-- Tests: supabase/tests/rls/golf_tournament_update_round_write.sql.
--
-- ROLLBACK: re-run the two CREATE OR REPLACE FUNCTION statements for
-- ROLLBACK:   golf_tournament_create and golf_tournament_update from
-- ROLLBACK:   20261024100200_golf_tournaments_rpcs.sql (sections 2 and 3).
-- VERIFY: SELECT 1 WHERE pg_get_functiondef(
-- VERIFY:   'public.golf_tournament_update(uuid, jsonb, integer)'::regprocedure
-- VERIFY: ) LIKE '%helm.tournament_write%';
-- VERIFY: SELECT 1 WHERE pg_get_functiondef(
-- VERIFY:   'public.golf_tournament_create(jsonb)'::regprocedure
-- VERIFY: ) NOT LIKE '%· Round%';
-- VERIFY: SELECT 1 WHERE pg_get_functiondef(
-- VERIFY:   'public.golf_tournament_update(uuid, jsonb, integer)'::regprocedure
-- VERIFY: ) NOT LIKE '%· Round%';
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege(
-- VERIFY:   'anon',
-- VERIFY:   'public.golf_tournament_update(uuid, jsonb, integer)',
-- VERIFY:   'EXECUTE'
-- VERIFY: );

set local lock_timeout = '3s';

create or replace function public.golf_tournament_create(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_team uuid := nullif(p_payload->>'team_id', '')::uuid;
  v_coach uuid;
  v_tz text;
  v_team_name text;
  v_id uuid;
  v_rounds jsonb := coalesce(p_payload->'rounds', '[]'::jsonb);
  v_n integer;
  v_from uuid := nullif(p_payload->>'from_event_id', '')::uuid;
  v_round jsonb;
  v_i integer := 0;
  v_event uuid;
  v_date date;
  v_tee timestamptz;
  v_name text := btrim(coalesce(p_payload->>'name', ''));
BEGIN
  IF v_team IS NULL OR NOT public.is_golf_team_coach(v_team) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.id INTO v_coach
  FROM public.golf_team_coach_staff s
  JOIN public.golf_coaches c ON c.id = s.coach_id
  WHERE s.team_id = v_team AND c.user_id = (SELECT auth.uid())
  LIMIT 1;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  v_n := CASE WHEN jsonb_typeof(v_rounds) = 'array' THEN jsonb_array_length(v_rounds) ELSE 0 END;
  IF v_n < 1 OR v_n > 6 OR v_name = '' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001', DETAIL = 'a name and one to six rounds are required';
  END IF;
  SELECT t.timezone, t.name INTO v_tz, v_team_name FROM public.golf_teams t WHERE t.id = v_team;

  INSERT INTO public.golf_tournaments (
    team_id, name, start_date, end_date, course_id, format, players_per_team,
    counting, holes_per_round, rounds_count, event_kind, tiebreak, field_size,
    line_kind, line_value, substitutions, lock_minutes, results_url, host,
    created_by)
  VALUES (
    v_team, v_name,
    (p_payload->>'start_date')::date, (p_payload->>'end_date')::date,
    nullif(p_payload->>'course_id', '')::uuid,
    coalesce(p_payload->>'format', '5c4'),
    coalesce((p_payload->>'players_per_team')::smallint, 5),
    coalesce((p_payload->>'counting')::smallint, 4),
    coalesce((p_payload->>'holes_per_round')::smallint, 18),
    v_n,
    coalesce(p_payload->>'event_kind', 'regular'),
    coalesce(p_payload->>'tiebreak', 'ties_stand'),
    (p_payload->>'field_size')::smallint,
    nullif(p_payload->>'line_kind', ''),
    (p_payload->>'line_value')::smallint,
    coalesce((p_payload->>'substitutions')::boolean, false),
    coalesce((p_payload->>'lock_minutes')::smallint, 10),
    nullif(p_payload->>'results_url', ''),
    nullif(p_payload->>'host', ''),
    (SELECT auth.uid()))
  RETURNING id INTO v_id;

  FOR v_round IN SELECT value FROM jsonb_array_elements(v_rounds) LOOP
    v_i := v_i + 1;
    v_date := (v_round->>'date')::date;
    v_tee := nullif(v_round->>'first_tee_at', '')::timestamptz;
    IF v_i = 1 AND v_from IS NOT NULL THEN
      -- Adopt a calendar event of this team as round 1; never one that is
      -- already a tournament round.
      IF NOT EXISTS (
        SELECT 1 FROM public.golf_events e WHERE e.id = v_from AND e.team_id = v_team) THEN
        RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001', DETAIL = 'from_event_id is not an event of this team';
      END IF;
      IF EXISTS (SELECT 1 FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_from) THEN
        RAISE EXCEPTION 'event_taken' USING ERRCODE = 'P0001';
      END IF;
      v_event := v_from;
    ELSE
      INSERT INTO public.golf_events (
        team_id, title, event_type, start_time, all_day, course_id, created_by)
      VALUES (
        v_team,
        v_name || ' · R' || v_i,
        'tournament',
        coalesce(v_tee, (v_date + time '12:00') AT TIME ZONE coalesce(v_tz, 'America/New_York')),
        v_tee IS NULL,
        coalesce(nullif(v_round->>'course_id', '')::uuid, nullif(p_payload->>'course_id', '')::uuid),
        v_coach)
      RETURNING id INTO v_event;
    END IF;
    INSERT INTO public.golf_tournament_rounds (
      round_event_id, tournament_id, team_id, round_number, course_id, tee_id,
      start_type, first_tee_at, event_adopted)
    VALUES (
      v_event, v_id, v_team, v_i,
      coalesce(nullif(v_round->>'course_id', '')::uuid, nullif(p_payload->>'course_id', '')::uuid),
      nullif(v_round->>'tee_id', '')::uuid,
      coalesce(nullif(v_round->>'start_type', ''), 'tee_times'),
      v_tee,
      v_i = 1 AND v_from IS NOT NULL);
  END LOOP;

  INSERT INTO public.golf_tournament_field_teams (tournament_id, team_id, name, is_us)
  VALUES (v_id, v_team, left(coalesce(v_team_name, 'Us'), 80), true);
  INSERT INTO public.golf_tournament_field_teams (
    tournament_id, team_id, name, is_b_team, same_division, seed)
  SELECT v_id, v_team, left(btrim(f->>'name'), 80),
    coalesce((f->>'is_b_team')::boolean, false),
    coalesce((f->>'same_division')::boolean, true),
    (f->>'seed')::smallint
  FROM jsonb_array_elements(coalesce(p_payload->'field_teams', '[]'::jsonb)) f
  WHERE btrim(coalesce(f->>'name', '')) <> '';

  INSERT INTO public.golf_tournament_advice_givers (tournament_id, team_id, user_id)
  SELECT DISTINCT v_id, v_team, a::uuid
  FROM jsonb_array_elements_text(coalesce(p_payload->'advice_givers', '[]'::jsonb)) a;

  RETURN v_id;
END $$;

create or replace function public.golf_tournament_update(
    p_id uuid, p_payload jsonb, p_version integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
  v_coach uuid;
  v_tz text;
  v_rounds jsonb := p_payload->'rounds';
  v_n integer;
  v_round jsonb;
  v_i integer := 0;
  v_event uuid;
  v_date date;
  v_tee timestamptz;
  v_course uuid;
  v_gone record;
  v_name text;
BEGIN
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NULL OR v_t.version <> p_version THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = 'P0001',
      DETAIL = format('version is %s, the edit was made on %s', v_t.version, p_version);
  END IF;
  v_name := CASE WHEN p_payload ? 'name' THEN btrim(p_payload->>'name') ELSE v_t.name END;
  IF coalesce(v_name, '') = '' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001', DETAIL = 'a name is required';
  END IF;

  IF v_rounds IS NOT NULL THEN
    v_n := CASE WHEN jsonb_typeof(v_rounds) = 'array' THEN jsonb_array_length(v_rounds) ELSE 0 END;
    IF v_n < 1 OR v_n > 6 THEN
      RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001', DETAIL = 'one to six rounds are required';
    END IF;
    -- Rounds past the new count go only when nothing was played or scored.
    FOR v_gone IN
      SELECT r.round_event_id, r.status, r.event_adopted
      FROM public.golf_tournament_rounds r
      WHERE r.tournament_id = p_id AND r.round_number > v_n
    LOOP
      IF v_gone.status <> 'upcoming' OR EXISTS (
        SELECT 1 FROM public.golf_tournament_player_rounds pr
        WHERE pr.round_event_id = v_gone.round_event_id
          AND (pr.round_id IS NOT NULL OR pr.entered_total IS NOT NULL)) THEN
        RAISE EXCEPTION 'round_has_scores' USING ERRCODE = 'P0001';
      END IF;
      DELETE FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_gone.round_event_id;
      IF NOT v_gone.event_adopted THEN
        DELETE FROM public.golf_events e WHERE e.id = v_gone.round_event_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.golf_tournaments t SET
    name = v_name,
    start_date = coalesce((p_payload->>'start_date')::date, t.start_date),
    end_date = coalesce((p_payload->>'end_date')::date, t.end_date),
    course_id = CASE WHEN p_payload ? 'course_id' THEN nullif(p_payload->>'course_id', '')::uuid ELSE t.course_id END,
    format = coalesce(p_payload->>'format', t.format),
    players_per_team = coalesce((p_payload->>'players_per_team')::smallint, t.players_per_team),
    counting = coalesce((p_payload->>'counting')::smallint, t.counting),
    holes_per_round = coalesce((p_payload->>'holes_per_round')::smallint, t.holes_per_round),
    rounds_count = coalesce(v_n, t.rounds_count),
    event_kind = coalesce(p_payload->>'event_kind', t.event_kind),
    tiebreak = coalesce(p_payload->>'tiebreak', t.tiebreak),
    field_size = CASE WHEN p_payload ? 'field_size' THEN (p_payload->>'field_size')::smallint ELSE t.field_size END,
    line_kind = CASE WHEN p_payload ? 'line_kind' THEN nullif(p_payload->>'line_kind', '') ELSE t.line_kind END,
    line_value = CASE WHEN p_payload ? 'line_value' THEN (p_payload->>'line_value')::smallint ELSE t.line_value END,
    substitutions = coalesce((p_payload->>'substitutions')::boolean, t.substitutions),
    lock_minutes = coalesce((p_payload->>'lock_minutes')::smallint, t.lock_minutes),
    results_url = CASE WHEN p_payload ? 'results_url' THEN nullif(p_payload->>'results_url', '') ELSE t.results_url END,
    host = CASE WHEN p_payload ? 'host' THEN nullif(p_payload->>'host', '') ELSE t.host END
  WHERE t.id = p_id;

  IF v_rounds IS NOT NULL THEN
    -- P-5's guard (040000) locks a round event's title, place and course
    -- unless the transaction marks itself as a tournament write. 040100's
    -- sync triggers have already moved the title and course by the time the
    -- UPDATE below runs; marking the write lets it through and keeps P-14's
    -- change marks from calling it a rename. Cleared after the loop.
    PERFORM set_config('helm.tournament_write', 'rounds', true);
    SELECT tm.timezone INTO v_tz FROM public.golf_teams tm WHERE tm.id = v_t.team_id;
    SELECT c.id INTO v_coach
    FROM public.golf_team_coach_staff s
    JOIN public.golf_coaches c ON c.id = s.coach_id
    WHERE s.team_id = v_t.team_id AND c.user_id = (SELECT auth.uid())
    LIMIT 1;
    FOR v_round IN SELECT value FROM jsonb_array_elements(v_rounds) LOOP
      v_i := v_i + 1;
      v_date := (v_round->>'date')::date;
      v_tee := nullif(v_round->>'first_tee_at', '')::timestamptz;
      v_course := coalesce(
        nullif(v_round->>'course_id', '')::uuid,
        nullif(p_payload->>'course_id', '')::uuid,
        v_t.course_id
      );
      SELECT r.round_event_id INTO v_event
      FROM public.golf_tournament_rounds r
      WHERE r.tournament_id = p_id AND r.round_number = v_i;
      IF FOUND THEN
        UPDATE public.golf_tournament_rounds r SET
          course_id = v_course,
          tee_id = nullif(v_round->>'tee_id', '')::uuid,
          start_type = coalesce(nullif(v_round->>'start_type', ''), r.start_type),
          first_tee_at = v_tee
        WHERE r.round_event_id = v_event;
        UPDATE public.golf_events e SET
          start_time = coalesce(v_tee, (v_date + time '12:00') AT TIME ZONE coalesce(v_tz, 'America/New_York')),
          all_day = v_tee IS NULL,
          course_id = v_course,
          title = CASE WHEN e.event_type = 'tournament' THEN v_name || ' · R' || v_i ELSE e.title END
        WHERE e.id = v_event;
      ELSE
        INSERT INTO public.golf_events (
          team_id, title, event_type, start_time, all_day, course_id, created_by)
        VALUES (
          v_t.team_id, v_name || ' · R' || v_i, 'tournament',
          coalesce(v_tee, (v_date + time '12:00') AT TIME ZONE coalesce(v_tz, 'America/New_York')),
          v_tee IS NULL, v_course, v_coach)
        RETURNING id INTO v_event;
        INSERT INTO public.golf_tournament_rounds (
          round_event_id, tournament_id, team_id, round_number, course_id,
          tee_id, start_type, first_tee_at)
        VALUES (
          v_event, p_id, v_t.team_id, v_i, v_course,
          nullif(v_round->>'tee_id', '')::uuid,
          coalesce(nullif(v_round->>'start_type', ''), 'tee_times'), v_tee);
      END IF;
    END LOOP;
    PERFORM set_config('helm.tournament_write', '', true);
  END IF;

  RETURN (SELECT t.version FROM public.golf_tournaments t WHERE t.id = p_id);
END $$;
