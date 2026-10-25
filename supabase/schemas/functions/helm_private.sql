SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION "helm_private"."configure_trace_context"("p_round_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'helm_private'
    AS $_$
declare
  v_trace_id text := p_round_data #>> '{_helm_trace,trace_id}';
  v_level integer := coalesce(nullif(p_round_data #>> '{_helm_trace,level}', '')::integer, 1);
begin
  if coalesce(p_round_data #>> '{_helm_trace,enabled}', 'false') <> 'true'
    or v_trace_id is null
    or v_trace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;

  perform set_config('helm.trace_id', v_trace_id, true);
  perform set_config('helm.trace_enabled', 'on', true);
  perform set_config('helm.trace_level', greatest(1, least(v_level, 3))::text, true);
end;
$_$;

ALTER FUNCTION "helm_private"."configure_trace_context"("p_round_data" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_holes_round_live"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM helm_private.golf_round_live_touch(OLD.round_id);
  ELSE
    PERFORM helm_private.golf_round_live_touch(NEW.round_id);
  END IF;
  RETURN NULL;
END $$;

ALTER FUNCTION "helm_private"."golf_holes_round_live"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_live_broadcast"("p_topic" "text", "p_event" "text", "p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM realtime.send(p_payload, p_event, p_topic, true);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'golf live broadcast failed on %: % (%)', p_topic, SQLERRM, SQLSTATE;
END $$;

ALTER FUNCTION "helm_private"."golf_live_broadcast"("p_topic" "text", "p_event" "text", "p_payload" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_round_live_emit"("p_new" "public"."golf_round_live", "p_old_team" "uuid", "p_old_share" "text", "p_changed" "jsonb", "p_late" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_coach_now boolean := p_new.share IN ('coaches', 'team');
  v_team_now  boolean := p_new.share = 'team' AND p_new.round_type = 'practice';
  v_coach_was boolean := p_old_team IS NOT NULL AND p_old_share IN ('coaches', 'team');
  v_team_was  boolean := p_old_team IS NOT NULL AND p_old_share = 'team';
  v_moved     boolean := p_old_team IS NOT NULL AND p_old_team IS DISTINCT FROM p_new.team_id;
  v_hide      jsonb   := jsonb_build_object('v', 1, 'k', 'hide', 'r', p_new.round_id, 'seq', p_new.seq);
  v_base      jsonb;
BEGIN
  IF p_new.is_test THEN
    RETURN;
  END IF;

  -- 'cur' is the hole NUMBER the player is on (1 to 18), the same value as golf_rounds.current_hole.
  v_base := jsonb_build_object(
    'v', 1, 'k', 'lane', 'r', p_new.round_id, 'p', p_new.player_id, 'seq', p_new.seq,
    'rt', p_new.round_type, 'q', p_new.qualifier_id, 'qr', p_new.qualifier_round, 'd', p_new.round_date,
    'c', p_new.course_id, 'cn', p_new.course_name, 'hp', p_new.holes_planned, 'sp', p_new.start_position,
    'cur', p_new.current_hole, 'ph', p_new.phase, 't', p_new.thru, 'tp', p_new.to_par, 'st', p_new.strokes,
    'la', p_new.last_hole_at, 'hd', p_new.heard_at, 'sh', p_new.share, 'e', p_new.ended_at, 'late', p_late
  );

  -- Hide where the lane was visible and no longer is (share lowered, or the round moved team).
  IF v_coach_was AND (v_moved OR NOT v_coach_now) THEN
    PERFORM helm_private.golf_live_broadcast('golf-live:coach:' || p_old_team, 'hide', v_hide);
  END IF;
  IF v_team_was AND (v_moved OR NOT v_team_now) THEN
    PERFORM helm_private.golf_live_broadcast('golf-live:team:' || p_old_team, 'hide', v_hide);
  END IF;

  -- Lane where it is visible now. A topic that did not have the lane before gets the full hole list.
  IF v_coach_now THEN
    PERFORM helm_private.golf_live_broadcast(
      'golf-live:coach:' || p_new.team_id, 'lane',
      v_base || CASE WHEN v_coach_was AND NOT v_moved
                     THEN jsonb_build_object('full', false, 'h', p_changed)
                     ELSE jsonb_build_object('full', true, 'h', p_new.holes) END);
  END IF;
  IF v_team_now THEN
    PERFORM helm_private.golf_live_broadcast(
      'golf-live:team:' || p_new.team_id, 'lane',
      v_base || CASE WHEN v_team_was AND NOT v_moved
                     THEN jsonb_build_object('full', false, 'h', p_changed)
                     ELSE jsonb_build_object('full', true, 'h', p_new.holes) END);
  END IF;
END $$;

ALTER FUNCTION "helm_private"."golf_round_live_emit"("p_new" "public"."golf_round_live", "p_old_team" "uuid", "p_old_share" "text", "p_changed" "jsonb", "p_late" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_round_live_floor"("p_type" "text", "p_share" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT CASE
    WHEN p_type = 'practice' THEN CASE WHEN p_share IN ('off', 'coaches', 'team') THEN p_share ELSE 'off' END
    ELSE 'coaches'
  END;
$$;

ALTER FUNCTION "helm_private"."golf_round_live_floor"("p_type" "text", "p_share" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_round_live_refresh"("p_round_id" "uuid", "p_quiet" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    SET "lock_timeout" TO '200ms'
    AS $$
DECLARE
  r          public.golf_rounds%ROWTYPE;
  v_prev     public.golf_round_live%ROWTYPE;
  v_has_prev boolean;
  v_new      public.golf_round_live%ROWTYPE;
  v_now      timestamptz := clock_timestamp();
  v_type     text;
  v_tracked  boolean := false;
  v_share    text;
  v_pref     text;
  v_next     text;
  v_rows     int;
  v_holes    jsonb;
  v_changed  jsonb;
  v_late     boolean;
  v_thru     int;
  v_to_par   int;
  v_strokes  int;
  v_last     timestamptz;
  v_planned  int;
  v_start    int;
  v_phase    text;
  v_visible  boolean;
  v_emit     boolean;
  v_window   timestamptz;
  v_count    int;
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RETURN; -- deleted; the live row cascaded and golf_rounds_round_live_gone already sent 'gone'
  END IF;

  -- NOWAIT: if another transaction holds the live row (a set_share, or another refresh), give up at once. The next save heals it.
  SELECT * INTO v_prev FROM public.golf_round_live WHERE round_id = p_round_id FOR UPDATE NOWAIT;
  v_has_prev := FOUND;

  v_type := helm_private.golf_round_live_type(r.round_type);

  -- A tournament round that a tournament already tracks is shown by the tournament's own live view (open call b, version 2:
  -- exclude). Dynamic SQL, so this compiles before the tournaments migration exists; without the table nothing is tracked.
  IF v_type = 'tournament' AND to_regclass('public.golf_tournament_player_rounds') IS NOT NULL THEN
    EXECUTE 'select exists (select 1 from public.golf_tournament_player_rounds where round_id = $1)' INTO v_tracked USING p_round_id;
  END IF;

  -- No team, or tracked by a tournament: nothing to show. If it had a lane, hide it and drop the row.
  -- (Moving a round to another team or taking the player off the team cannot happen while it is in progress:
  -- guard_golf_round_lifecycle refuses identity changes and the stranding guards refuse the deletes.)
  IF r.team_id IS NULL OR v_tracked THEN
    IF v_has_prev THEN
      v_new := v_prev;
      v_new.seq := nextval('public.golf_round_live_seq');
      v_new.share := 'off';               -- visible nowhere now, so emit sends only 'hide'
      IF NOT p_quiet THEN
        PERFORM helm_private.golf_round_live_emit(v_new, v_prev.team_id, v_prev.share, '[]'::jsonb, false);
      END IF;
      DELETE FROM public.golf_round_live WHERE round_id = p_round_id;
    END IF;
    RETURN;
  END IF;

  -- Only rounds that are in progress, recent (today or yesterday in the team's zone) and not test data get a new row.
  -- An ended round keeps its row until swept.
  IF NOT v_has_prev AND (r.status IS DISTINCT FROM 'in_progress' OR r.round_date < helm_private.golf_team_today(r.team_id) - 1) THEN
    RETURN;
  END IF;

  -- The non-atomic submit path (golf-action-shared) deletes the hole rows and inserts them in separate requests, so a
  -- refresh can see a round with no hole rows between the two. Keep what the row had; only record that the phone was heard.
  SELECT count(*) INTO v_rows FROM public.golf_holes WHERE round_id = p_round_id;
  IF v_has_prev AND v_rows = 0 AND v_prev.thru > 0 AND r.status = 'in_progress' THEN
    IF v_prev.heard_at < v_now - interval '60 seconds' THEN
      UPDATE public.golf_round_live SET heard_at = v_now WHERE round_id = p_round_id;
    END IF;
    RETURN;
  END IF;

  v_planned := CASE WHEN r.holes_played = 9 THEN 9 ELSE 18 END;
  v_start := CASE WHEN (r.draft_data->>'startHole') ~ '^[0-9]{1,2}$'
                  THEN least(greatest((r.draft_data->>'startHole')::int, 1), v_planned) ELSE 1 END;

  -- Sharing: the row's own level once it exists (floored if the type changed). At creation: the choice made in round
  -- setup (prefs.next_share, if it was set within 30 minutes before the round was created), else the player's practice
  -- default, else off. A qualifier or tournament round gets the floor, coaches.
  IF v_has_prev THEN
    v_share := helm_private.golf_round_live_floor(v_type, v_prev.share);
  ELSE
    SELECT p.practice_share,
           CASE WHEN p.next_share IS NOT NULL AND p.next_share_at >= coalesce(r.created_at, v_now) - interval '30 minutes'
                THEN p.next_share END
      INTO v_pref, v_next
      FROM public.golf_round_live_prefs p
     WHERE p.player_id = r.player_id;
    v_share := helm_private.golf_round_live_floor(v_type, coalesce(v_next, v_pref, 'off'));
  END IF;

  -- Merge the hole plan (draft_data.holes) with scored holes; keep each hole's time while its score is unchanged.
  -- A hole's time is the server's receive time, stamped when it first gains a score or its score changes.
  WITH plan AS (
    SELECT (e->>'number')::int AS n,
           CASE WHEN (e->>'par') ~ '^[0-9]$' THEN (e->>'par')::int END AS p,
           CASE WHEN (e->>'yardage') ~ '^[0-9]{1,4}$' AND (e->>'yardage')::int > 0 THEN (e->>'yardage')::int END AS y
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.draft_data->'holes') = 'array'
                                     THEN r.draft_data->'holes' ELSE '[]'::jsonb END) e
     WHERE (e->>'number') ~ '^[0-9]{1,2}$'
  ), scored AS (
    SELECT h.hole_number AS n, h.par AS p, nullif(h.yardage, 0) AS y, CASE WHEN h.score > 0 THEN h.score END AS s
      FROM public.golf_holes h
     WHERE h.round_id = p_round_id
  ), merged AS (
    SELECT coalesce(s.n, pl.n) AS n, coalesce(s.p, pl.p) AS p, coalesce(s.y, pl.y) AS y, s.s
      FROM plan pl FULL JOIN scored s ON s.n = pl.n
     WHERE coalesce(s.n, pl.n) BETWEEN 1 AND 18
  ), prev AS (
    SELECT (e->>'n')::int AS n, (e->>'s')::int AS s, (e->>'at')::timestamptz AS at
      FROM jsonb_array_elements(CASE WHEN v_has_prev THEN v_prev.holes ELSE '[]'::jsonb END) e
  ), stamped AS (
    SELECT m.n, m.p, m.y, m.s,
           CASE
             WHEN m.s IS NULL THEN NULL
             WHEN pv.s IS NOT DISTINCT FROM m.s AND pv.at IS NOT NULL THEN pv.at
             ELSE v_now
           END AS at,
           (m.s IS NOT NULL AND pv.s IS DISTINCT FROM m.s) OR (m.s IS NULL AND pv.s IS NOT NULL) AS changed,
           (m.s IS NOT NULL AND pv.s IS NULL) AS gained
      FROM merged m
      LEFT JOIN prev pv ON pv.n = m.n
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'p', p, 'y', y, 's', s, 'at', at) ORDER BY n), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('n', n, 'p', p, 'y', y, 's', s, 'at', at) ORDER BY n) FILTER (WHERE changed), '[]'::jsonb),
         -- Late: two or more holes gained a score in this one commit (a phone that came back online).
         coalesce(count(*) FILTER (WHERE gained) >= 2, false),
         count(*) FILTER (WHERE s IS NOT NULL),
         sum(s - p) FILTER (WHERE s IS NOT NULL AND p IS NOT NULL),
         sum(s) FILTER (WHERE s IS NOT NULL),
         max(at)
    INTO v_holes, v_changed, v_late, v_thru, v_to_par, v_strokes, v_last
    FROM stamped;

  v_phase := CASE
    WHEN r.status = 'completed' THEN 'posted'
    WHEN r.status = 'abandoned' THEN 'stopped'
    WHEN v_thru >= v_planned THEN 'finished'
    ELSE 'on_course'
  END;

  v_visible := NOT v_has_prev
    OR v_prev.holes IS DISTINCT FROM v_holes
    OR v_prev.phase IS DISTINCT FROM v_phase
    OR v_prev.share IS DISTINCT FROM v_share
    OR v_prev.team_id IS DISTINCT FROM r.team_id
    OR v_prev.round_type IS DISTINCT FROM v_type
    OR v_prev.qualifier_id IS DISTINCT FROM r.qualifier_id
    OR v_prev.qualifier_round IS DISTINCT FROM r.qualifier_round_number
    OR v_prev.current_hole IS DISTINCT FROM (CASE WHEN r.current_hole BETWEEN 1 AND 18 THEN r.current_hole END)
    OR v_prev.holes_planned IS DISTINCT FROM v_planned
    OR v_prev.start_position IS DISTINCT FROM v_start
    OR v_prev.course_name IS DISTINCT FROM r.course_name;

  IF NOT v_visible THEN
    -- Heartbeat only: record that the phone was heard, at most once a minute, and send nothing.
    IF v_prev.heard_at < v_now - interval '60 seconds' THEN
      UPDATE public.golf_round_live SET heard_at = v_now WHERE round_id = p_round_id;
    END IF;
    RETURN;
  END IF;

  -- Rate limit: at most 120 broadcasts per round per 10 minutes. The row still updates; clients catch up on refetch.
  v_window := CASE WHEN v_has_prev AND v_prev.emit_window_at > v_now - interval '10 minutes' THEN v_prev.emit_window_at ELSE v_now END;
  v_count  := CASE WHEN v_window = v_now THEN 1 ELSE v_prev.emit_count + 1 END;
  v_emit   := NOT p_quiet AND v_count <= 120;

  INSERT INTO public.golf_round_live AS l (
    round_id, team_id, player_id, round_type, qualifier_id, qualifier_round, round_date, course_id, course_name,
    holes_planned, start_position, current_hole, share, phase, thru, to_par, strokes, holes, last_hole_at,
    heard_at, is_test, seq, emit_window_at, emit_count, started_at, ended_at, updated_at)
  VALUES (
    r.id, r.team_id, r.player_id, v_type, r.qualifier_id, r.qualifier_round_number, r.round_date, r.course_id, r.course_name,
    v_planned, v_start, CASE WHEN r.current_hole BETWEEN 1 AND 18 THEN r.current_hole END, v_share, v_phase, v_thru, v_to_par, v_strokes, v_holes, v_last,
    v_now, coalesce(r.is_test, false), nextval('public.golf_round_live_seq'), v_window, v_count,
    coalesce(r.created_at, v_now), CASE WHEN v_phase IN ('posted', 'stopped') THEN v_now END, v_now)
  ON CONFLICT (round_id) DO UPDATE SET
    team_id = excluded.team_id, player_id = excluded.player_id, round_type = excluded.round_type,
    qualifier_id = excluded.qualifier_id, qualifier_round = excluded.qualifier_round, round_date = excluded.round_date,
    course_id = excluded.course_id, course_name = excluded.course_name, holes_planned = excluded.holes_planned,
    start_position = excluded.start_position, current_hole = excluded.current_hole, share = excluded.share,
    phase = excluded.phase, thru = excluded.thru, to_par = excluded.to_par, strokes = excluded.strokes,
    holes = excluded.holes, last_hole_at = excluded.last_hole_at, heard_at = excluded.heard_at,
    is_test = excluded.is_test, seq = excluded.seq, emit_window_at = excluded.emit_window_at,
    emit_count = excluded.emit_count,
    ended_at = CASE WHEN excluded.phase IN ('posted', 'stopped') THEN coalesce(l.ended_at, excluded.ended_at) END,
    updated_at = excluded.updated_at
  RETURNING * INTO v_new;

  -- A setup choice applies to ONE round: once this round's row exists with it, clear it. This runs in the same
  -- subtransaction as the insert (the touch handler's block), so a refresh that fails and is caught rolls both back.
  IF NOT v_has_prev AND v_next IS NOT NULL THEN
    UPDATE public.golf_round_live_prefs SET next_share = NULL, next_share_at = NULL, updated_at = v_now
     WHERE player_id = r.player_id;
  END IF;

  IF v_emit THEN
    PERFORM helm_private.golf_round_live_emit(
      v_new,
      CASE WHEN v_has_prev THEN v_prev.team_id END,
      CASE WHEN v_has_prev THEN v_prev.share END,
      v_changed, v_late);
  END IF;
END $$;

ALTER FUNCTION "helm_private"."golf_round_live_refresh"("p_round_id" "uuid", "p_quiet" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_round_live_touch"("p_round_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_key  text;
  v_done text;
BEGIN
  IF p_round_id IS NULL OR current_setting('helm.round_live_off', true) = 'on' THEN
    RETURN;
  END IF;
  -- Deferred events of one commit share the COMMIT statement's timestamp, so this runs once per round per commit.
  v_key := p_round_id::text || '@' || extract(epoch FROM statement_timestamp())::text;
  v_done := coalesce(current_setting('helm.round_live_done', true), '');
  IF strpos(v_done, v_key) > 0 THEN
    RETURN;
  END IF;
  PERFORM set_config('helm.round_live_done', right(v_done, 4000) || ',' || v_key, true);
  BEGIN
    PERFORM helm_private.golf_round_live_refresh(p_round_id, false);
  EXCEPTION
    WHEN lock_not_available THEN
      -- The live row (or another lock) was busy. The save goes on; the next save heals the row.
      RAISE WARNING 'golf_round_live refresh skipped for round % (lock busy): % (%)', p_round_id, SQLERRM, SQLSTATE;
    WHEN OTHERS THEN
      RAISE WARNING 'golf_round_live refresh failed for round %: % (%)', p_round_id, SQLERRM, SQLSTATE;
  END;
END $$;

ALTER FUNCTION "helm_private"."golf_round_live_touch"("p_round_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_round_live_type"("p_round_type" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT CASE
    WHEN p_round_type IN ('qualifier', 'qualifying') THEN 'qualifier'
    WHEN p_round_type = 'tournament' THEN 'tournament'
    ELSE 'practice'
  END;
$$;

ALTER FUNCTION "helm_private"."golf_round_live_type"("p_round_type" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_rounds_round_live"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM helm_private.golf_round_live_touch(NEW.id);
  RETURN NULL;
END $$;

ALTER FUNCTION "helm_private"."golf_rounds_round_live"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_rounds_round_live_gone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  l public.golf_round_live%ROWTYPE;
  v_msg jsonb;
BEGIN
  BEGIN
    SELECT * INTO l FROM public.golf_round_live WHERE round_id = OLD.id;
    IF FOUND AND NOT l.is_test THEN
      v_msg := jsonb_build_object('v', 1, 'k', 'gone', 'r', l.round_id, 'seq', nextval('public.golf_round_live_seq'));
      IF l.share IN ('coaches', 'team') THEN
        PERFORM helm_private.golf_live_broadcast('golf-live:coach:' || l.team_id, 'gone', v_msg);
      END IF;
      IF l.share = 'team' THEN
        PERFORM helm_private.golf_live_broadcast('golf-live:team:' || l.team_id, 'gone', v_msg);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'golf_round_live gone failed for round %: %', OLD.id, SQLERRM;
  END;
  RETURN OLD;
END $$;

ALTER FUNCTION "helm_private"."golf_rounds_round_live_gone"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."golf_team_today"("p_team" "uuid") RETURNS "date"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_zone text;
BEGIN
  SELECT s.timezone INTO v_zone FROM public.golf_team_settings s WHERE s.team_id = p_team LIMIT 1;
  BEGIN
    RETURN (now() AT TIME ZONE coalesce(nullif(btrim(v_zone), ''), 'America/New_York'))::date;
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN (now() AT TIME ZONE 'America/New_York')::date;
  END;
END $$;

ALTER FUNCTION "helm_private"."golf_team_today"("p_team" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."guard_golf_round_lifecycle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user IN ('postgres', 'service_role')
    AND current_setting('helm.golf_lifecycle_write', true) = 'stats_cache'
    AND (to_jsonb(NEW) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) = (to_jsonb(OLD) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'round_recap'
    AND (to_jsonb(NEW) - ARRAY['ai_recap', 'ai_recap_generated_at'])
      = (to_jsonb(OLD) - ARRAY['ai_recap', 'ai_recap_generated_at']) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'coachhelm_terminal'
    AND (to_jsonb(NEW) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) = (to_jsonb(OLD) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'reclassify'
    AND (to_jsonb(NEW) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) = (to_jsonb(OLD) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds are permanent history and cannot be deleted.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds are permanent history and cannot be changed.';
    END IF;
    IF NEW.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
    END IF;
    IF NEW.player_id IS DISTINCT FROM OLD.player_id
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.round_type IS DISTINCT FROM OLD.round_type
      OR NEW.qualifier_id IS DISTINCT FROM OLD.qualifier_id
      OR NEW.qualifier_round_number IS DISTINCT FROM OLD.qualifier_round_number THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

ALTER FUNCTION "helm_private"."guard_golf_round_lifecycle"() OWNER TO "postgres";

COMMENT ON FUNCTION "helm_private"."guard_golf_round_lifecycle"() IS 'Blocks direct completed-round mutation and started-round identity changes. The protected atomic submit RPC is the sole terminal-write bypass and enforces its own player authorization and durable qualifier identity.';

CREATE OR REPLACE FUNCTION "helm_private"."prevent_active_team_member_deactivation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' AND EXISTS (
    SELECT 1 FROM public.golf_rounds
    WHERE team_id = OLD.team_id AND player_id = OLD.player_id AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'This player has a saved in-progress round. Have them finish or explicitly discard it before removing them from the team.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_active_team_member_deactivation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_qualifier_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE qualifier_id = OLD.id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This qualifier has saved rounds. Have players finish or explicitly discard them before deleting the qualifier.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_qualifier_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_qualifier_entry_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Runs as its owner so a round the caller's RLS can't see still counts,
  -- and any unfinished round (in progress, draft, or anything not completed)
  -- keeps its entry.
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE player_id = OLD.player_id
      AND qualifier_id = OLD.qualifier_id
      AND status IS DISTINCT FROM 'completed'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved qualifier round. Have them finish or explicitly discard it before removing their qualifier entry.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_qualifier_entry_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_team_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE team_id = OLD.id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This team has saved rounds. Have players finish or explicitly discard them before deleting the team.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_team_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."prevent_team_member_active_round_stranding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE team_id = OLD.team_id
      AND player_id = OLD.player_id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved round. Have them finish or explicitly discard it before removing them from the team.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "helm_private"."prevent_team_member_active_round_stranding"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."reject_completed_round_child_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  target_round_id uuid;
BEGIN
  IF current_user = 'postgres' AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  target_round_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.round_id ELSE OLD.round_id END;
  IF EXISTS (
    SELECT 1 FROM public.golf_rounds
    WHERE status = 'completed'
      AND id IN (target_round_id, CASE WHEN TG_OP = 'UPDATE' THEN NEW.round_id END)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'This round is already completed and its saved shots cannot be changed.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

ALTER FUNCTION "helm_private"."reject_completed_round_child_mutation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."reject_completed_round_detail_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  old_shot_id uuid;
  new_shot_id uuid;
BEGIN
  IF current_user = 'postgres' AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  old_shot_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.shot_id END;
  new_shot_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.shot_id END;
  IF EXISTS (
    SELECT 1 FROM public.golf_shots s
    JOIN public.golf_rounds r ON r.id = s.round_id
    WHERE r.status = 'completed' AND s.id IN (old_shot_id, new_shot_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'This round is already completed and its saved shot details cannot be changed.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

ALTER FUNCTION "helm_private"."reject_completed_round_detail_mutation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_player_id uuid;
  v_recap text;
  v_persisted boolean;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to save a round recap.';
  END IF;
  v_recap := btrim(coalesce(p_recap, ''));
  IF char_length(v_recap) < 30 OR char_length(v_recap) > 400 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Round recap must be between 30 and 400 characters.';
  END IF;

  SELECT player_id
  INTO v_player_id
  FROM public.golf_rounds
  WHERE id = p_round_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Completed round not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.golf_players
    WHERE id = v_player_id
      AND user_id = p_actor_user_id
  ) AND NOT coalesce(public.verify_coach_owns_player(v_player_id, p_actor_user_id), false) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'You do not have access to this round.';
  END IF;

  PERFORM set_config('helm.golf_lifecycle_write', 'round_recap', true);

  -- Package 8, repair plan §14.10 (2026-09-23): single-flight, cheap half.
  -- A concurrent call that already won the race already set ai_recap, so
  -- this call's UPDATE now touches zero rows instead of overwriting the
  -- winner's text. `persisted` (below) tells the caller which happened.
  UPDATE public.golf_rounds
  SET ai_recap = v_recap,
      ai_recap_generated_at = now()
  WHERE id = p_round_id
    AND ai_recap IS NULL;

  v_persisted := FOUND;

  RETURN jsonb_build_object('success', true, 'persisted', v_persisted);
END;
$$;

ALTER FUNCTION "helm_private"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text", "p_actor_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."trace_checkpoint"("p_step_key" "text", "p_parent_step_key" "text" DEFAULT NULL::"text", "p_phase" "text" DEFAULT 'checkpoint'::"text", "p_status" "text" DEFAULT 'success'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'helm_private'
    AS $$
declare
  v_trace_id text := current_setting('helm.trace_id', true);
  v_enabled text := current_setting('helm.trace_enabled', true);
  v_level integer := coalesce(nullif(current_setting('helm.trace_level', true), '')::integer, 0);
  v_safe_metadata jsonb;
  v_parts text[];
  v_parent text;
  v_function_name text;
  v_table_name text;
  v_last text;
  v_row_status text;
  v_prev_finished_at timestamptz;
  v_now timestamptz;
begin
  if v_trace_id is null or v_enabled is distinct from 'on' or v_level < 1 then
    return;
  end if;

  perform set_config('helm.trace_step', p_step_key, true);

  raise log 'HELM_TRACE %', jsonb_build_object(
    'trace_id', v_trace_id,
    'step_key', p_step_key,
    'parent_step_key', p_parent_step_key,
    'phase', p_phase,
    'status', p_status,
    'txid', txid_current_if_assigned(),
    'pid', pg_backend_pid(),
    'metadata', helm_private.trace_safe_metadata(p_metadata)
  )::text;

  -- Best-effort persistence into helm_debug.trace_steps so the Bridge can
  -- render this checkpoint. Never allowed to fail or slow the caller
  -- beyond this block: any error here is caught, logged, and swallowed.
  begin
    v_now := clock_timestamp();
    v_safe_metadata := helm_private.trace_safe_metadata(p_metadata);
    v_parts := string_to_array(p_step_key, '.');

    if p_parent_step_key is not null then
      v_parent := p_parent_step_key;
    elsif array_length(v_parts, 1) >= 3 then
      v_parent := v_parts[1] || '.' || v_parts[2];
    else
      v_parent := null;
    end if;

    v_function_name := coalesce(
      nullif(v_safe_metadata ->> 'function', ''),
      case when array_length(v_parts, 1) >= 2 then v_parts[2] else null end
    );

    v_last := v_parts[array_length(v_parts, 1)];
    v_table_name := coalesce(
      nullif(v_safe_metadata ->> 'table', ''),
      case v_last
        when 'update_round' then 'golf_rounds'
        when 'insert_holes' then 'golf_holes'
        when 'insert_shots' then 'golf_shots'
        when 'recalculate_strokes_gained' then 'golf_rounds'
        else null
      end
    );

    -- The entry checkpoint fires before any work has happened; recording
    -- it as 'success' would let a later fail-open JS write leave a failed
    -- round permanently marked successful. Every other plain checkpoint
    -- reports 'success': reaching it with no exception is the observation.
    v_row_status := case when p_phase = 'enter' then 'started' else 'success' end;

    select finished_at into v_prev_finished_at
    from helm_debug.trace_steps
    where trace_id = v_trace_id::uuid
    order by created_at desc, id desc
    limit 1;

    insert into helm_debug.trace_steps (
      trace_id, step_key, parent_step_key, layer, status, requiredness,
      started_at, finished_at, function_name, table_name, metadata
    ) values (
      v_trace_id::uuid,
      p_step_key,
      v_parent,
      'postgres',
      v_row_status,
      'best_effort',
      coalesce(v_prev_finished_at, v_now),
      v_now,
      v_function_name,
      v_table_name,
      v_safe_metadata
    )
    on conflict (trace_id, step_key) do update set
      parent_step_key = coalesce(helm_debug.trace_steps.parent_step_key, excluded.parent_step_key),
      status = excluded.status,
      started_at = coalesce(helm_debug.trace_steps.started_at, excluded.started_at),
      finished_at = excluded.finished_at,
      function_name = coalesce(helm_debug.trace_steps.function_name, excluded.function_name),
      table_name = coalesce(helm_debug.trace_steps.table_name, excluded.table_name),
      metadata = helm_debug.trace_steps.metadata || excluded.metadata,
      updated_at = clock_timestamp();
    -- layer and requiredness are deliberately NOT in the SET list above:
    -- this writer only ever proposes them on first insert (they are
    -- constant for every row it writes) and must never override a value
    -- the JS application layer already recorded for the same key.
  exception when others then
    raise log 'HELM_TRACE_STEP_WRITE_FAILED %', jsonb_build_object(
      'trace_id', v_trace_id,
      'step_key', p_step_key,
      'sqlstate', SQLSTATE,
      'message', left(SQLERRM, 500)
    )::text;
  end;
end;
$$;

ALTER FUNCTION "helm_private"."trace_checkpoint"("p_step_key" "text", "p_parent_step_key" "text", "p_phase" "text", "p_status" "text", "p_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."trace_exception_checkpoint"("p_round_data" "jsonb", "p_step_key" "text", "p_parent_step_key" "text", "p_sqlstate" "text", "p_message" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'helm_private'
    AS $_$
declare
  v_trace_id text := p_round_data #>> '{_helm_trace,trace_id}';
  v_parts text[];
  v_parent text;
  v_function_name text;
  v_metadata jsonb;
  v_prev_finished_at timestamptz;
  v_now timestamptz;
begin
  if coalesce(p_round_data #>> '{_helm_trace,enabled}', 'false') <> 'true'
    or v_trace_id is null
    or v_trace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;

  raise log 'HELM_TRACE %', jsonb_build_object(
    'trace_id', v_trace_id,
    'step_key', p_step_key,
    'parent_step_key', p_parent_step_key,
    'phase', 'exception',
    'status', 'failure',
    'txid', txid_current_if_assigned(),
    'pid', pg_backend_pid(),
    'metadata', jsonb_build_object('sqlstate', p_sqlstate, 'message', left(p_message, 1000))
  )::text;

  -- Best-effort, same fail-open contract as trace_checkpoint above. See
  -- this file's header for why this specific row does not, today, survive
  -- the outer RPC's own rollback-and-reraise on any current call site.
  begin
    v_now := clock_timestamp();
    v_metadata := jsonb_build_object('sqlstate', p_sqlstate, 'message', left(p_message, 1000));
    v_parts := string_to_array(p_step_key, '.');

    if p_parent_step_key is not null then
      v_parent := p_parent_step_key;
    elsif array_length(v_parts, 1) >= 3 then
      v_parent := v_parts[1] || '.' || v_parts[2];
    else
      v_parent := null;
    end if;

    v_function_name := case when array_length(v_parts, 1) >= 2 then v_parts[2] else null end;

    select finished_at into v_prev_finished_at
    from helm_debug.trace_steps
    where trace_id = v_trace_id::uuid
    order by created_at desc, id desc
    limit 1;

    insert into helm_debug.trace_steps (
      trace_id, step_key, parent_step_key, layer, status, requiredness,
      started_at, finished_at, function_name, error_code, error_summary,
      metadata
    ) values (
      v_trace_id::uuid,
      p_step_key,
      v_parent,
      'postgres',
      'failure',
      'best_effort',
      coalesce(v_prev_finished_at, v_now),
      v_now,
      v_function_name,
      p_sqlstate,
      left(p_message, 1000),
      v_metadata
    )
    on conflict (trace_id, step_key) do update set
      parent_step_key = coalesce(helm_debug.trace_steps.parent_step_key, excluded.parent_step_key),
      status = excluded.status,
      started_at = coalesce(helm_debug.trace_steps.started_at, excluded.started_at),
      finished_at = excluded.finished_at,
      function_name = coalesce(helm_debug.trace_steps.function_name, excluded.function_name),
      error_code = excluded.error_code,
      error_summary = excluded.error_summary,
      metadata = helm_debug.trace_steps.metadata || excluded.metadata,
      updated_at = clock_timestamp();
  exception when others then
    raise log 'HELM_TRACE_STEP_WRITE_FAILED %', jsonb_build_object(
      'trace_id', v_trace_id,
      'step_key', p_step_key,
      'sqlstate', SQLSTATE,
      'message', left(SQLERRM, 500)
    )::text;
  end;
end;
$_$;

ALTER FUNCTION "helm_private"."trace_exception_checkpoint"("p_round_data" "jsonb", "p_step_key" "text", "p_parent_step_key" "text", "p_sqlstate" "text", "p_message" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."trace_safe_metadata"("p_metadata" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select coalesce(p_metadata, '{}'::jsonb) - array[
    'authorization', 'cookie', 'cookies', 'token', 'access_token',
    'refresh_token', 'service_role', 'service_role_key', 'password',
    'payload', 'round_payload', 'headers'
  ]
$$;

ALTER FUNCTION "helm_private"."trace_safe_metadata"("p_metadata" "jsonb") OWNER TO "postgres";

-- P016 Tournaments: held migrations 20261024100000 (tables), 100100 (RLS)
-- and 100200 (RPCs, lineup guard), WRITTEN — HOLD — NOT APPLIED in production.
-- Generated 2026-10-25 by pg_dump of the three files applied in order to a
-- scratch Postgres 16 (docs/clubhouse/held/data/tournaments.md).

CREATE OR REPLACE FUNCTION "helm_private"."guard_tournament_lineup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_tournament uuid;
  v_round uuid;
  v_locked timestamptz;
BEGIN
  IF coalesce(current_setting('helm.tournament_write', true), '') = 'substitute' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_TABLE_NAME = 'golf_tournament_entries' THEN
    IF TG_OP = 'DELETE' THEN v_tournament := OLD.tournament_id; ELSE v_tournament := NEW.tournament_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_round := OLD.round_event_id; ELSE v_round := NEW.round_event_id; END IF;
    SELECT r.tournament_id INTO v_tournament
    FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_round;
  END IF;
  SELECT t.lineup_locked_at INTO v_locked
  FROM public.golf_tournaments t WHERE t.id = v_tournament;
  -- Not locked, or the tournament (or its round) is already gone: the
  -- cascade of a delete, which must not be blocked by its own lock.
  IF v_locked IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'locked' USING ERRCODE = 'P0001',
    DETAIL = format('the lineup of tournament %s locked at %s; substitute instead', v_tournament, v_locked);
END $$;


ALTER FUNCTION "helm_private"."guard_tournament_lineup"() OWNER TO "postgres";

COMMENT ON FUNCTION "helm_private"."guard_tournament_lineup"() IS 'P016 Tournaments: refuses entry and round-lineup changes after the lineup locks, unless helm.tournament_write = substitute (golf_tournament_substitute). HELD 20261024100200.';

CREATE OR REPLACE FUNCTION "helm_private"."guard_tournament_team"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_ins boolean := TG_OP = 'INSERT';
  v_team_changed boolean := TG_OP = 'INSERT' OR NEW.team_id IS DISTINCT FROM OLD.team_id;
BEGIN
  -- Field access on NEW is only evaluated inside the branch for a table that
  -- has the field (plpgsql resolves record fields per expression).
  CASE TG_TABLE_NAME
  WHEN 'golf_tournament_rounds' THEN
    IF v_team_changed OR NEW.round_event_id IS DISTINCT FROM OLD.round_event_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_events e
        WHERE e.id = NEW.round_event_id AND e.team_id = NEW.team_id),
        format('tournament round %s is not an event of team %s',
          NEW.round_event_id, NEW.team_id));
    END IF;

  WHEN 'golf_tournament_advice_givers' THEN
    IF v_team_changed OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_team_coach_staff s
        JOIN public.golf_coaches c ON c.id = s.coach_id
        WHERE s.team_id = NEW.team_id AND c.user_id = NEW.user_id),
        format('user %s is not a coach of team %s', NEW.user_id, NEW.team_id));
    END IF;

  WHEN 'golf_tournament_coach_presence' THEN
    IF v_team_changed OR NEW.coach_user_id IS DISTINCT FROM OLD.coach_user_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_team_coach_staff s
        JOIN public.golf_coaches c ON c.id = s.coach_id
        WHERE s.team_id = NEW.team_id AND c.user_id = NEW.coach_user_id),
        format('user %s is not a coach of team %s', NEW.coach_user_id,
          NEW.team_id));
    END IF;
    IF NEW.with_player_id IS NOT NULL AND (v_team_changed
        OR NEW.with_player_id IS DISTINCT FROM OLD.with_player_id) THEN
      PERFORM helm_private.tournament_assert_member(NEW.team_id,
        NEW.with_player_id);
    END IF;

  WHEN 'golf_tournament_link_dismissals' THEN
    IF v_team_changed OR NEW.round_id IS DISTINCT FROM OLD.round_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_rounds r
        JOIN public.golf_team_members m ON m.player_id = r.player_id
        WHERE r.id = NEW.round_id AND m.team_id = NEW.team_id),
        format('round %s is not a round of a team %s player', NEW.round_id,
          NEW.team_id));
    END IF;

  WHEN 'golf_tournament_result_marks' THEN
    IF NEW.round_event_id IS NOT NULL THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_tournament_rounds r
        WHERE r.round_event_id = NEW.round_event_id
          AND r.tournament_id = NEW.tournament_id),
        format('round %s is not in tournament %s', NEW.round_event_id,
          NEW.tournament_id));
    END IF;

  ELSE
    -- entries, round lineups, player rounds, entry notes, player notes,
    -- reflections: player_id is on the team.
    IF v_team_changed OR NEW.player_id IS DISTINCT FROM OLD.player_id THEN
      PERFORM helm_private.tournament_assert_member(NEW.team_id,
        NEW.player_id);
    END IF;
    IF TG_TABLE_NAME = 'golf_tournament_round_lineups' THEN
      IF NEW.substituted_for IS NOT NULL AND (v_team_changed
          OR NEW.substituted_for IS DISTINCT FROM OLD.substituted_for) THEN
        PERFORM helm_private.tournament_assert_member(NEW.team_id,
          NEW.substituted_for);
      END IF;
    ELSIF TG_TABLE_NAME = 'golf_tournament_player_rounds' THEN
      IF NEW.round_id IS NOT NULL AND (v_ins
          OR NEW.round_id IS DISTINCT FROM OLD.round_id
          OR NEW.player_id IS DISTINCT FROM OLD.player_id) THEN
        PERFORM helm_private.tournament_assert(EXISTS (
          SELECT 1 FROM public.golf_rounds r
          WHERE r.id = NEW.round_id AND r.player_id = NEW.player_id),
          format('round %s is not player %s''s', NEW.round_id,
            NEW.player_id));
      END IF;
    END IF;
  END CASE;
  RETURN NEW;
END $$;


ALTER FUNCTION "helm_private"."guard_tournament_team"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."touch_tournament_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;


ALTER FUNCTION "helm_private"."touch_tournament_version"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."tournament_assert"("p_ok" boolean, "p_message" "text") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT coalesce(p_ok, false) THEN
    RAISE EXCEPTION '%', p_message USING ERRCODE = '23514';
  END IF;
END $$;


ALTER FUNCTION "helm_private"."tournament_assert"("p_ok" boolean, "p_message" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "helm_private"."tournament_assert_member"("p_team_id" "uuid", "p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.team_id = p_team_id AND m.player_id = p_player_id) THEN
    RAISE EXCEPTION 'player % is not on team %', p_player_id, p_team_id
      USING ERRCODE = '23514';
  END IF;
END $$;


ALTER FUNCTION "helm_private"."tournament_assert_member"("p_team_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";
