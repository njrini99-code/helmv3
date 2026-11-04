-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: One atomic, version-checked save of a plan's draft (title, step,
--   body), with team players, staff coaches, drills, groups and qualifiers
--   checked on the server.
-- WHO: golf_practice_plan_save is callable by authenticated and checks
--   public.is_golf_team_coach on the plan's team (staff joined to
--   golf_coaches.user_id), never "has a golf_coaches row".
--   golf_practice_plan_check_body is service_role only (called inside definer
--   functions).
-- ORDER: After 20261026010000, 010100, 010200 and 010300.
-- RISK: Low. Functions only.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_practice_plan_save(uuid,
--   uuid, integer, text, text, jsonb); DROP FUNCTION IF EXISTS
--   public.golf_practice_plan_check_body(uuid, jsonb, boolean);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace =
-- VERIFY: 'public'::regnamespace AND proname IN ('golf_practice_plan_save',
-- VERIFY: 'golf_practice_plan_check_body') AND prosecdef AND 'search_path=""' =
-- VERIFY: ANY (proconfig) HAVING count(*) = 2;
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('authenticated',
-- VERIFY: 'public.golf_practice_plan_check_body(uuid, jsonb, boolean)',
-- VERIFY: 'EXECUTE') AND NOT has_function_privilege('anon',
-- VERIFY: 'public.golf_practice_plan_save(uuid, uuid, integer, text, text,
-- VERIFY: jsonb)', 'EXECUTE') AND has_function_privilege('authenticated',
-- VERIFY: 'public.golf_practice_plan_save(uuid, uuid, integer, text, text,
-- VERIFY: jsonb)', 'EXECUTE');

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_practice_plan_check_body(
    p_team uuid, p_body jsonb, p_solo boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_players jsonb;
  v_groups jsonb;
  v_layout jsonb;
  v_name text;
BEGIN
  -- A value's type is checked in its own statement before anything that
  --   raises on the wrong type reads it
  -- (jsonb_array_length, casts, jsonb_each): SQL does not promise
  --   left-to-right OR.
  IF p_body IS NULL OR pg_catalog.jsonb_typeof(p_body) <> 'object'
      OR (p_body ->> 'v') IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'practice_plan_body_version';
  END IF;
  IF pg_catalog.octet_length(p_body::text) > 196608 THEN
    RAISE EXCEPTION 'practice_plan_body_size';
  END IF;

  -- Plan fields.
  IF pg_catalog.jsonb_typeof(p_body -> 'focus') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_body -> 'notes') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_body -> 'place') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_body -> 'bring') IS DISTINCT FROM 'array'
     OR COALESCE(p_body ->> 'arrivalBufferMin',
         '') !~ '^(0|5|10|15|20|25|30)$' THEN
    RAISE EXCEPTION 'practice_plan_body_fields';
  END IF;
  IF pg_catalog.char_length(p_body ->> 'focus') > 140
     OR pg_catalog.char_length(p_body ->> 'notes') > 2000
     OR pg_catalog.char_length(p_body ->> 'place') > 80
     OR pg_catalog.jsonb_array_length(p_body -> 'bring') > 20
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_body -> 'bring') i
       WHERE pg_catalog.char_length(COALESCE(i ->> 'item', '')) NOT BETWEEN 1
           AND 40
          OR COALESCE(i ->> 'qty', '') !~ '^[1-9][0-9]?$'
     ) THEN
    RAISE EXCEPTION 'practice_plan_body_fields';
  END IF;

  -- Players and groups.
  v_players := p_body -> 'players';
  v_groups := p_body -> 'groups';
  IF pg_catalog.jsonb_typeof(v_players) IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_typeof(v_groups) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;
  IF pg_catalog.jsonb_array_length(v_players) > 60
      OR pg_catalog.jsonb_array_length(v_groups) > 6
     OR (p_solo
         AND (pg_catalog.jsonb_array_length(v_players) <> 1
             OR pg_catalog.jsonb_array_length(v_groups) > 0)) THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_groups) g
    WHERE pg_catalog.jsonb_typeof(g) <> 'object'
       OR pg_catalog.jsonb_typeof(g -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.char_length(COALESCE(g ->> 'name', '')) NOT BETWEEN 1
           AND 40
       OR pg_catalog.jsonb_typeof(g -> 'players') IS DISTINCT FROM 'array'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_groups) g
        GROUP BY g ->> 'id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;
  -- Each player listed once; group members are plan players; a player is in
  --   at most one group.
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_players) pid
      GROUP BY pid HAVING count(*) > 1)
     OR EXISTS (
       SELECT 1
           FROM pg_catalog.jsonb_path_query(v_groups, 'lax $[*].players[*]') pid
       WHERE NOT (v_players @> pg_catalog.jsonb_build_array(pid))
     )
     OR EXISTS (
       SELECT 1
           FROM pg_catalog.jsonb_path_query(v_groups, 'lax $[*].players[*]') pid
               GROUP BY pid HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'practice_plan_group_player';
  END IF;
  -- Every plan player is an active member of this team (compared as text, so
  --   a malformed id is a refusal, not a cast error).
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_players) pid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.golf_team_members m
      WHERE m.team_id = p_team AND m.player_id::text = pid
          AND m.status = 'active'::public.team_member_status
    )
  ) THEN
    RAISE EXCEPTION 'practice_plan_player_not_on_team';
  END IF;

  -- Layouts.
  IF pg_catalog.jsonb_typeof(p_body -> 'variants') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_body -> 'variants' -> 'main')
         IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'practice_plan_layout';
  END IF;

  FOREACH v_name IN ARRAY ARRAY['main', 'rain'] LOOP
    v_layout := p_body -> 'variants' -> v_name;
    CONTINUE WHEN v_layout IS NULL
        OR pg_catalog.jsonb_typeof(v_layout) = 'null';
    IF pg_catalog.jsonb_typeof(v_layout) <> 'object'
        OR pg_catalog.jsonb_typeof(v_layout -> 'blocks')
            IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'practice_plan_layout';
    END IF;
    IF pg_catalog.jsonb_array_length(v_layout -> 'blocks') > 40 THEN
      RAISE EXCEPTION 'practice_plan_layout';
    END IF;

    -- Fields every block has. len is matched as text first, so the casts
    --   below never see a non-integer.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE pg_catalog.jsonb_typeof(b) <> 'object'
         OR pg_catalog.jsonb_typeof(b -> 'id') IS DISTINCT FROM 'string'
         OR pg_catalog.char_length(b ->> 'id') > 64
         OR COALESCE(b ->> 'kind', '') NOT
             IN ('team', 'stations', 'course', 'own', 'break')
         OR pg_catalog.char_length(COALESCE(b ->> 'title', '')) NOT BETWEEN 1
             AND 80
         OR COALESCE(b ->> 'len', '') !~ '^[1-9][0-9]{0,2}$'
         OR pg_catalog.char_length(COALESCE(b ->> 'note', '')) > 280
         OR COALESCE(pg_catalog.jsonb_typeof(b -> 'coach'), 'null') NOT
             IN ('string', 'null')
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
          GROUP BY b ->> 'id' HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'practice_plan_block';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE (b ->> 'len')::int % 5 <> 0 OR (b ->> 'len')::int NOT BETWEEN 5
          AND 360
    ) OR (SELECT COALESCE(sum((b ->> 'len')::int), 0)
        FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b) > 360 THEN
      RAISE EXCEPTION 'practice_plan_block';
    END IF;

    -- Team, Break and Own work places.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' IN ('team', 'break', 'own')
        AND (pg_catalog.jsonb_typeof(b -> 'place') IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(b ->> 'place') > 40)
    ) THEN
      RAISE EXCEPTION 'practice_plan_block';
    END IF;

    -- Stations: shapes first, then lengths, then each station.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'stations' AND (
           pg_catalog.jsonb_typeof(b -> 'stations') IS DISTINCT FROM 'array'
        OR pg_catalog.jsonb_typeof(b -> 'groupIds') IS DISTINCT FROM 'array'
        OR COALESCE(b ->> 'turnMin',
            '') !~ '^(5|10|15|20|25|30|35|40|45|50|55|60)$'
        OR COALESCE(b ->> 'moveMin', '') !~ '^([0-9]|10)$'
        OR COALESCE(b ->> 'turns', '') !~ '^[1-8]$'
        OR COALESCE(pg_catalog.jsonb_typeof(b -> 'grid'), 'null') NOT
            IN ('array', 'null')
      )
    ) THEN
      RAISE EXCEPTION 'practice_plan_station';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'stations'
        AND (pg_catalog.jsonb_array_length(b -> 'stations') NOT BETWEEN 1
            AND 8 OR pg_catalog.jsonb_array_length(b -> 'groupIds') > 6)
    ) OR EXISTS (
      SELECT 1
          FROM pg_catalog.jsonb_path_query(v_layout,
              'lax $.blocks[*] ? (@.kind == "stations").stations[*]') s
      WHERE pg_catalog.jsonb_typeof(s) <> 'object'
         OR pg_catalog.jsonb_typeof(s -> 'id') IS DISTINCT FROM 'string'
         OR pg_catalog.char_length(COALESCE(s ->> 'place', '')) NOT BETWEEN 1
             AND 40
         OR pg_catalog.char_length(COALESCE(s ->> 'note', '')) > 280
         OR COALESCE(pg_catalog.jsonb_typeof(s -> 'coach'), 'null') NOT
             IN ('string', 'null')
    ) THEN
      RAISE EXCEPTION 'practice_plan_station';
    END IF;
    -- Groups named in Stations blocks and in grid cells are this plan's
    --   groups ('' is an open cell); a solo body has none.
    IF EXISTS (
      SELECT 1
          FROM pg_catalog.jsonb_path_query(v_layout,
              'lax $.blocks[*].groupIds[*]') gid
      WHERE p_solo
          OR NOT EXISTS (SELECT 1
              FROM pg_catalog.jsonb_array_elements(v_groups) g
                  WHERE g -> 'id' = gid)
    ) OR EXISTS (
      SELECT 1
          FROM pg_catalog.jsonb_path_query(v_layout,
              'lax $.blocks[*].grid[*][*]') cell
      WHERE cell <> '""'::jsonb
          AND NOT EXISTS (SELECT 1
              FROM pg_catalog.jsonb_array_elements(v_groups) g
                  WHERE g -> 'id' = cell)
    ) THEN
      RAISE EXCEPTION 'practice_plan_block_group';
    END IF;

    -- Course.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'course' AND (
           COALESCE(b ->> 'holeFrom', '') !~ '^([1-9]|1[0-8])$'
        OR COALESCE(b ->> 'holeTo', '') !~ '^([1-9]|1[0-8])$'
        OR COALESCE(b ->> 'format', '') NOT
            IN ('stroke', 'scramble', 'best_ball', 'worst_ball', 'match')
        OR pg_catalog.jsonb_typeof(b -> 'pairings') IS DISTINCT FROM 'array'
        OR COALESCE(pg_catalog.jsonb_typeof(b -> 'qualifierId'), 'null') NOT
            IN ('string', 'null')
      )
    ) THEN
      RAISE EXCEPTION 'practice_plan_course';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'course'
        AND ((b ->> 'holeTo')::int < (b ->> 'holeFrom')::int
            OR pg_catalog.jsonb_array_length(b -> 'pairings') > 20)
    ) OR EXISTS (
      SELECT 1
          FROM pg_catalog.jsonb_path_query(v_layout,
              'lax $.blocks[*] ? (@.kind == "course").pairings[*]') pr
      WHERE pg_catalog.jsonb_typeof(pr) <> 'object'
         OR COALESCE(pr ->> 'teeMin', '') !~ '^[0-9]{1,3}$'
         OR pg_catalog.jsonb_typeof(pr -> 'players') IS DISTINCT FROM 'array'
    ) THEN
      RAISE EXCEPTION 'practice_plan_course';
    END IF;
    IF EXISTS (
      SELECT 1
          FROM pg_catalog.jsonb_path_query(v_layout,
              'lax $.blocks[*].pairings[*].players[*]') pid
      WHERE NOT (v_players @> pg_catalog.jsonb_build_array(pid))
    ) THEN
      RAISE EXCEPTION 'practice_plan_group_player';
    END IF;
    IF EXISTS (
      SELECT 1
          FROM pg_catalog.jsonb_path_query(v_layout,
              'lax $.blocks[*].qualifierId ? (@.type() == "string")') q
      WHERE NOT EXISTS (SELECT 1
          FROM public.golf_qualifiers gq
              WHERE gq.id::text = (q #>> '{}') AND gq.team_id = p_team)
    ) THEN
      RAISE EXCEPTION 'practice_plan_qualifier';
    END IF;

    -- Own work: lines is an object of plan player id -> string of up to 140
    --   characters.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'own'
          AND pg_catalog.jsonb_typeof(b -> 'lines') IS DISTINCT FROM 'object'
    ) THEN
      RAISE EXCEPTION 'practice_plan_own';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_path_query(v_layout,
          'lax $.blocks[*] ? (@.kind == "own")') b,
           pg_catalog.jsonb_each(b -> 'lines') l
      WHERE pg_catalog.jsonb_typeof(l.value) <> 'string'
         OR pg_catalog.char_length(l.value #>> '{}') > 140
         OR NOT (v_players @> pg_catalog.jsonb_build_array(l.key))
    ) THEN
      RAISE EXCEPTION 'practice_plan_own';
    END IF;

    -- Coaches (on blocks and on stations) are on this team's staff.
    IF EXISTS (
      SELECT 1 FROM (
        SELECT c
            FROM pg_catalog.jsonb_path_query(v_layout,
                'lax $.blocks[*].coach ? (@.type() == "string")') c
        UNION ALL
        SELECT c
            FROM pg_catalog.jsonb_path_query(v_layout,
                'lax $.blocks[*].stations[*].coach ? (@.type() == "string")') c
      ) cs
      WHERE NOT EXISTS (
        SELECT 1 FROM public.golf_team_coach_staff s
        WHERE s.team_id = p_team AND s.coach_id::text = (cs.c #>> '{}')
      )
    ) THEN
      RAISE EXCEPTION 'practice_plan_coach_not_on_staff';
    END IF;

    -- Drills: a team drill of this team (archived ones too) or a GolfHelm
    --   library drill.
    IF EXISTS (
      SELECT 1 FROM (
        SELECT d
            FROM pg_catalog.jsonb_path_query(v_layout,
                'lax $.blocks[*].drill ? (@.type() != "null")') d
        UNION ALL
        SELECT d
            FROM pg_catalog.jsonb_path_query(v_layout,
                'lax $.blocks[*].stations[*].drill ? (@.type() != "null")') d
      ) refs
      WHERE pg_catalog.jsonb_typeof(refs.d) <> 'object'
         OR NOT (CASE refs.d ->> 'src'
                   WHEN 'team' THEN EXISTS (SELECT 1
                       FROM public.golf_team_drills t
                           WHERE t.id::text = (refs.d ->> 'id')
                               AND t.team_id = p_team)
                   WHEN 'lib' THEN EXISTS (SELECT 1
                       FROM public.golf_drills g
                           WHERE g.id::text = (refs.d ->> 'id'))
                   ELSE false END)
    ) THEN
      RAISE EXCEPTION 'practice_plan_drill';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_save(
    p_event_id uuid,
    p_plan_id uuid,
    p_expected_version integer,
    p_title text,
    p_step text,
    p_body jsonb
)
RETURNS TABLE (plan_id uuid, plan_version integer, plan_updated_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_team uuid;
  v_type text;
  v_all_day boolean;
  v_event_title text;
  v_title text;
  v_plan public.golf_practice_plans%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF (p_event_id IS NULL) = (p_plan_id IS NULL) THEN
    RAISE EXCEPTION 'practice_plan_target';
  END IF;
  IF p_step IS NOT NULL
      AND p_step NOT IN ('blocks', 'groups', 'drills', 'review') THEN
    RAISE EXCEPTION 'practice_plan_step';
  END IF;
  v_title := NULLIF(pg_catalog.btrim(COALESCE(p_title, '')), '');
  IF v_title IS NOT NULL AND pg_catalog.char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'practice_plan_title';
  END IF;

  IF p_plan_id IS NOT NULL THEN
    -- Update an existing plan (event plan or make-up) by id.
    SELECT * INTO v_plan
        FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
      RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_expected_version IS NULL
        OR p_expected_version IS DISTINCT FROM v_plan.version THEN
      RAISE EXCEPTION 'practice_plan_stale';
    END IF;
    PERFORM public.golf_practice_plan_check_body(v_plan.team_id, p_body,
        v_plan.kind = 'makeup');
    IF v_plan.kind = 'makeup'
        AND (p_body -> 'players')
            IS DISTINCT
                FROM pg_catalog.jsonb_build_array(
                    v_plan.for_player_id::text
                ) THEN
      RAISE EXCEPTION 'practice_plan_groups';
    END IF;
    IF v_plan.active_variant = 'rain'
        AND pg_catalog.jsonb_typeof(p_body -> 'variants' -> 'rain')
            IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'practice_plan_rain_active';
    END IF;
    UPDATE public.golf_practice_plans p
       SET body = p_body,
           title = COALESCE(v_title, p.title),
           step = COALESCE(p_step, p.step),
           edited_after_publish = p.edited_after_publish
             OR (p.status = 'published'
                 AND (p.body IS DISTINCT FROM p_body
                     OR p.title IS DISTINCT FROM COALESCE(v_title, p.title))),
           version = p.version + 1,
           updated_by = v_uid,
           updated_at = pg_catalog.now()
     WHERE p.id = v_plan.id
     RETURNING * INTO v_plan;
    RETURN QUERY SELECT v_plan.id, v_plan.version, v_plan.updated_at;
    RETURN;
  END IF;

  -- By event: create the plan on first save, or update it.
  SELECT e.team_id, e.event_type, COALESCE(e.all_day, false), e.title
    INTO v_team, v_type, v_all_day, v_event_title
    FROM public.golf_events e WHERE e.id = p_event_id;
  IF v_team IS NULL OR NOT public.is_golf_team_coach(v_team) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_type IS DISTINCT FROM 'practice' THEN
    RAISE EXCEPTION 'practice_plan_not_practice';
  END IF;
  IF v_all_day THEN
    RAISE EXCEPTION 'practice_plan_all_day';
  END IF;
  PERFORM public.golf_practice_plan_check_body(v_team, p_body, false);

  SELECT * INTO v_plan
      FROM public.golf_practice_plans p
          WHERE p.event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    -- A first save says "no plan yet" with a NULL version; any other version
    --   means the caller is out of date.
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'practice_plan_stale';
    END IF;
    INSERT INTO public.golf_practice_plans (
        team_id, kind, event_id, title, step,
        body, created_by, updated_by)
    VALUES (v_team, 'event', p_event_id, COALESCE(v_title,
        pg_catalog.left(pg_catalog.btrim(v_event_title), 80)),
            COALESCE(p_step, 'blocks'), p_body, v_uid, v_uid)
    ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_plan;
    IF v_plan.id IS NULL THEN
      -- Another coach created it between our read and insert.
      RAISE EXCEPTION 'practice_plan_stale';
    END IF;
    RETURN QUERY SELECT v_plan.id, v_plan.version, v_plan.updated_at;
    RETURN;
  END IF;

  -- An existing plan is never written through the event path: the client
  --   always saves an existing plan by id.
  RAISE EXCEPTION 'practice_plan_stale';
END;
$$;

REVOKE ALL ON FUNCTION public.golf_practice_plan_check_body(
    uuid, jsonb, boolean
) FROM public,
anon,
authenticated;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_check_body(
    uuid, jsonb, boolean
) TO service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_save(
    uuid, uuid, integer, text, text, jsonb
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_save(
    uuid, uuid, integer, text, text, jsonb
) TO authenticated,
service_role;
