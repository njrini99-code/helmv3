-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0. The owner's override of 2026-10-24 ("players notified when its published"): this file freezes and files; the server action sends the notices after it commits.
-- WHY: Publish freezes the draft into a version (with drill snapshots, without own-work lines), stores the lines privately, moves the live marker and files the plan in golf_documents, atomically; take down reverses visibility; set_variant switches main and rain on the draft; record_open feeds Seen by; cards serves the team chat card's live state; set_chat_message records the card once.
-- WHO: publish, take_down, set_variant and set_chat_message check public.is_golf_team_coach on the plan's team. record_open acts only for a player who can read the live version. cards answers only for plans of a team the caller coaches or plays on. public_body and recipients are service_role only.
-- ORDER: After 20261026010500 (uses golf_practice_plan_check_body) and 20261026010400 (writes golf_documents.practice_plan_id).
-- RISK: Low. Functions only. Writes golf_documents only through the one partial unique index on practice_plan_id.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_practice_plan_set_chat_message(uuid, uuid); DROP FUNCTION IF EXISTS public.golf_practice_plan_cards(uuid[]); DROP FUNCTION IF EXISTS public.golf_practice_plan_record_open(uuid); DROP FUNCTION IF EXISTS public.golf_practice_plan_set_variant(uuid, integer, text); DROP FUNCTION IF EXISTS public.golf_practice_plan_take_down(uuid, integer); DROP FUNCTION IF EXISTS public.golf_practice_plan_publish(uuid, integer, jsonb, boolean); DROP FUNCTION IF EXISTS public.golf_practice_plan_recipients(uuid, jsonb, uuid); DROP FUNCTION IF EXISTS public.golf_practice_plan_public_body(jsonb, text);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('golf_practice_plan_public_body', 'golf_practice_plan_recipients', 'golf_practice_plan_publish', 'golf_practice_plan_take_down', 'golf_practice_plan_set_variant', 'golf_practice_plan_record_open', 'golf_practice_plan_cards', 'golf_practice_plan_set_chat_message') AND 'search_path=""' = ANY (proconfig) HAVING count(*) = 8;
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('authenticated', 'public.golf_practice_plan_public_body(jsonb, text)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.golf_practice_plan_recipients(uuid, jsonb, uuid)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.golf_practice_plan_publish(uuid, integer, jsonb, boolean)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_practice_plan_publish(uuid, integer, jsonb, boolean)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_practice_plan_cards(uuid[])', 'EXECUTE');

SET lock_timeout = '3s';

-- The body players may read: plan fields and the active layout's blocks, with every Own work block's lines removed.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_public_body(p_body jsonb, p_variant text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- fixed 4 Nov wiring: also drops any 'why' or 'coach_why' key, so a CoachHelm Why line can never reach a version players read.
  SELECT (p_body - 'variants' - 'why' - 'coach_why') || pg_catalog.jsonb_build_object(
    'variant', p_variant,
    'blocks', COALESCE((
      SELECT pg_catalog.jsonb_agg(CASE WHEN b.value ->> 'kind' = 'own' THEN b.value - 'lines' ELSE b.value END ORDER BY b.ord)
      FROM pg_catalog.jsonb_array_elements(p_body -> 'variants' -> p_variant -> 'blocks') WITH ORDINALITY AS b(value, ord)
    ), '[]'::jsonb)
  );
$$;

-- Who a publish tells: the plan's players who are active members with an account, and the staff coaches assigned in
-- its blocks or stations, never the caller. p_flat is a public body (players and blocks at the top level).
CREATE OR REPLACE FUNCTION public.golf_practice_plan_recipients(p_team uuid, p_flat jsonb, p_exclude uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(r.x ORDER BY r.x ->> 'role', r.x ->> 'user_id'), '[]'::jsonb)
  FROM (
    SELECT pg_catalog.jsonb_build_object('role', 'player', 'player_id', gp.id, 'user_id', gp.user_id) AS x
      FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_flat -> 'players', '[]'::jsonb)) pid
      JOIN public.golf_players gp ON gp.id::text = pid
      JOIN public.golf_team_members m
        ON m.player_id = gp.id AND m.team_id = p_team AND m.status = 'active'::public.team_member_status
     WHERE gp.user_id IS NOT NULL AND gp.user_id IS DISTINCT FROM p_exclude
    UNION
    SELECT pg_catalog.jsonb_build_object('role', 'coach', 'coach_id', gc.id, 'user_id', gc.user_id)
      FROM (
        SELECT c #>> '{}' AS cid FROM pg_catalog.jsonb_path_query(p_flat, 'lax $.blocks[*].coach ? (@.type() == "string")') c
        UNION
        SELECT c #>> '{}' FROM pg_catalog.jsonb_path_query(p_flat, 'lax $.blocks[*].stations[*].coach ? (@.type() == "string")') c
      ) cs
      JOIN public.golf_team_coach_staff s ON s.coach_id::text = cs.cid AND s.team_id = p_team
      JOIN public.golf_coaches gc ON gc.id = s.coach_id
     WHERE gc.user_id IS NOT NULL AND gc.user_id IS DISTINCT FROM p_exclude
  ) r;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_publish(
  p_plan_id uuid,
  p_expected_version integer,
  p_changes jsonb,
  p_notified boolean
)
RETURNS TABLE (published_version integer, published_at timestamptz, document_id uuid, first_publish boolean, recipients jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_now timestamptz := pg_catalog.now();
  v_plan public.golf_practice_plans%ROWTYPE;
  v_event public.golf_events%ROWTYPE;
  v_layout jsonb;
  v_public jsonb;
  v_drills jsonb;
  v_next integer;
  v_first boolean;
  v_doc uuid;
  v_is_test boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'practice_plan_stale';
  END IF;
  IF p_changes IS NULL OR pg_catalog.jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'practice_plan_changes';
  END IF;
  IF pg_catalog.jsonb_array_length(p_changes) > 30 OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_changes) c
    WHERE pg_catalog.jsonb_typeof(c) <> 'string' OR pg_catalog.char_length(c #>> '{}') NOT BETWEEN 1 AND 140
  ) THEN
    RAISE EXCEPTION 'practice_plan_changes';
  END IF;

  PERFORM public.golf_practice_plan_check_body(v_plan.team_id, v_plan.body, v_plan.kind = 'makeup');
  v_layout := v_plan.body -> 'variants' -> v_plan.active_variant;
  IF pg_catalog.jsonb_typeof(v_layout) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'practice_plan_empty';
  END IF;
  IF pg_catalog.jsonb_array_length(v_layout -> 'blocks') = 0 THEN
    RAISE EXCEPTION 'practice_plan_empty';
  END IF;

  IF v_plan.kind = 'event' THEN
    SELECT * INTO v_event FROM public.golf_events e WHERE e.id = v_plan.event_id;
    IF v_event.status = 'cancelled' THEN
      RAISE EXCEPTION 'practice_plan_event_cancelled';
    END IF;
    IF COALESCE(v_event.all_day, false) THEN
      RAISE EXCEPTION 'practice_plan_all_day';
    END IF;
  END IF;

  -- Freeze each drill the active layout uses, as it is now ("src:id" -> card).
  WITH refs AS (
    SELECT DISTINCT x.r ->> 'src' AS src, x.r ->> 'id' AS id
    FROM (
      SELECT r FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].drill ? (@.type() == "object")') r
      UNION ALL
      SELECT r FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].stations[*].drill ? (@.type() == "object")') r
    ) x
  )
  SELECT COALESCE(pg_catalog.jsonb_object_agg(refs.src || ':' || refs.id, c.card), '{}'::jsonb)
    INTO v_drills
    FROM refs
    CROSS JOIN LATERAL (
      SELECT pg_catalog.jsonb_build_object(
               'src', 'team', 'name', t.name, 'area', t.area, 'kind', t.kind, 'minutes', t.minutes,
               'players', t.players, 'equipment', t.equipment, 'setup', t.setup, 'goal', t.goal,
               'scoring', t.scoring, 'levels', t.levels, 'tags', pg_catalog.to_jsonb(t.tags), 'mediaUrl', t.media_url,
               'diagram', t.diagram) AS card
        FROM public.golf_team_drills t
       WHERE refs.src = 'team' AND t.id::text = refs.id AND t.team_id = v_plan.team_id
      UNION ALL
      SELECT pg_catalog.jsonb_build_object(
               'src', 'lib', 'name', g.title, 'category', g.category, 'minutes', g.duration_min,
               'setup', g.description, 'tags', pg_catalog.to_jsonb(g.tags), 'mediaUrl', g.video_url,
               'diagram', 'auto') AS card
        FROM public.golf_drills g
       WHERE refs.src = 'lib' AND g.id::text = refs.id
    ) c;

  v_public := public.golf_practice_plan_public_body(v_plan.body, v_plan.active_variant)
    || pg_catalog.jsonb_build_object(
         'title', v_plan.title,
         'drills', v_drills,
         'eventStart', v_event.start_time,
         'eventEnd', v_event.end_time,
         'eventLocation', v_event.location,
         'dueOn', v_plan.due_on
       );

  v_next := COALESCE(v_plan.published_version, 0) + 1;
  v_first := v_plan.first_published_at IS NULL;

  UPDATE public.golf_practice_plan_versions v SET is_live = false WHERE v.plan_id = v_plan.id AND v.is_live;
  INSERT INTO public.golf_practice_plan_versions
    (plan_id, team_id, kind, event_id, for_player_id, version, title, body, changes, notified, is_live, published_by, published_at)
  VALUES
    (v_plan.id, v_plan.team_id, v_plan.kind, v_plan.event_id, v_plan.for_player_id, v_next, v_plan.title, v_public,
     p_changes, COALESCE(p_notified, true), true, v_uid, v_now);

  -- Own-work lines, private to each player (check_body proved every key is an active plan player).
  INSERT INTO public.golf_practice_plan_lines (plan_id, version, team_id, player_id, block_id, line)
  SELECT v_plan.id, v_next, v_plan.team_id, l.key::uuid, b ->> 'id', pg_catalog.btrim(l.value #>> '{}')
    FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*] ? (@.kind == "own")') b
   CROSS JOIN LATERAL pg_catalog.jsonb_each(b -> 'lines') l
   WHERE pg_catalog.char_length(pg_catalog.btrim(l.value #>> '{}')) > 0;

  UPDATE public.golf_practice_plans p
     SET status = 'published',
         published_version = v_next,
         published_at = v_now,
         first_published_at = COALESCE(p.first_published_at, v_now),
         taken_down_at = NULL,
         edited_after_publish = false,
         version = p.version + 1,
         updated_by = v_uid,
         updated_at = v_now
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;

  -- File the event plan in Documents (one row per plan). Folder and uploader are kept on republish.
  IF v_plan.kind = 'event' THEN
    SELECT t.is_test INTO v_is_test FROM public.golf_teams t WHERE t.id = v_plan.team_id;
    INSERT INTO public.golf_documents AS d
      (team_id, uploaded_by, title, description, file_url, file_type, file_size, category, is_public, folder,
       version_count, updated_at, practice_plan_id, is_test)
    VALUES
      (v_plan.team_id, v_uid, v_plan.title, NULLIF(v_plan.body ->> 'focus', ''), NULL, NULL, NULL, 'practice_plan', true,
       'Practice plans', v_next, v_now, v_plan.id, COALESCE(v_is_test, false))
    ON CONFLICT (practice_plan_id) WHERE practice_plan_id IS NOT NULL
    DO UPDATE SET title = EXCLUDED.title,
                  description = EXCLUDED.description,
                  is_public = true,
                  version_count = EXCLUDED.version_count,
                  updated_at = EXCLUDED.updated_at
    RETURNING d.id INTO v_doc;
  END IF;

  RETURN QUERY
    SELECT v_next, v_now, v_doc, v_first, public.golf_practice_plan_recipients(v_plan.team_id, v_public, v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_take_down(p_plan_id uuid, p_expected_version integer)
RETURNS TABLE (plan_version integer, recipients jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_plan public.golf_practice_plans%ROWTYPE;
  v_live public.golf_practice_plan_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'practice_plan_stale';
  END IF;
  IF v_plan.status <> 'published' THEN
    RAISE EXCEPTION 'practice_plan_not_published';
  END IF;
  SELECT * INTO v_live FROM public.golf_practice_plan_versions v WHERE v.plan_id = v_plan.id AND v.is_live;
  UPDATE public.golf_practice_plan_versions v SET is_live = false WHERE v.plan_id = v_plan.id AND v.is_live;
  UPDATE public.golf_practice_plans p
     SET status = 'draft', taken_down_at = pg_catalog.now(), version = p.version + 1,
         updated_by = v_uid, updated_at = pg_catalog.now()
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;
  UPDATE public.golf_documents d SET is_public = false, updated_at = pg_catalog.now() WHERE d.practice_plan_id = v_plan.id;
  RETURN QUERY
    SELECT v_plan.version,
           CASE WHEN v_live.id IS NULL THEN '[]'::jsonb
                ELSE public.golf_practice_plan_recipients(v_plan.team_id, v_live.body, v_uid) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_set_variant(p_plan_id uuid, p_expected_version integer, p_variant text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.golf_practice_plans%ROWTYPE;
BEGIN
  IF p_variant IS NULL OR p_variant NOT IN ('main', 'rain') THEN
    RAISE EXCEPTION 'practice_plan_variant';
  END IF;
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'practice_plan_stale';
  END IF;
  IF p_variant = 'rain' AND pg_catalog.jsonb_typeof(v_plan.body -> 'variants' -> 'rain') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'practice_plan_no_rain_layout';
  END IF;
  UPDATE public.golf_practice_plans p
     SET active_variant = p_variant,
         edited_after_publish = p.edited_after_publish OR (p.status = 'published' AND p.active_variant IS DISTINCT FROM p_variant),
         version = p.version + 1,
         updated_by = (SELECT auth.uid()),
         updated_at = pg_catalog.now()
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;
  RETURN v_plan.version;
END;
$$;

-- Seen by: a player who can read the live version records the highest version they opened. Anyone else is a no-op.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_record_open(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_live public.golf_practice_plan_versions%ROWTYPE;
  v_player uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_live FROM public.golf_practice_plan_versions v WHERE v.plan_id = p_plan_id AND v.is_live;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT gp.id INTO v_player
    FROM public.golf_players gp
    JOIN public.golf_team_members m
      ON m.player_id = gp.id AND m.team_id = v_live.team_id AND m.status = 'active'::public.team_member_status
   WHERE gp.user_id = v_uid
   LIMIT 1;
  IF v_player IS NULL OR (v_live.kind = 'makeup' AND v_live.for_player_id IS DISTINCT FROM v_player) THEN
    RETURN;
  END IF;
  INSERT INTO public.golf_practice_plan_opens AS o (plan_id, player_id, team_id, version, first_opened_at, last_opened_at)
  VALUES (p_plan_id, v_player, v_live.team_id, v_live.version, pg_catalog.now(), pg_catalog.now())
  ON CONFLICT (plan_id, player_id)
  DO UPDATE SET version = GREATEST(o.version, EXCLUDED.version), last_opened_at = EXCLUDED.last_opened_at;
END;
$$;

-- The team chat card's live state. No row for a plan that was never published, was deleted, or is on another team.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_cards(p_plan_ids uuid[])
RETURNS TABLE (
  plan_id uuid, state text, title text, live_version integer, published_at timestamptz,
  event_start timestamptz, event_end timestamptz, event_location text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id,
         CASE WHEN e.status = 'cancelled' THEN 'cancelled'
              WHEN p.status = 'published' AND p.published_version > 1 THEN 'updated'
              WHEN p.status = 'published' THEN 'published'
              ELSE 'taken_down' END,
         p.title,
         CASE WHEN p.status = 'published' THEN p.published_version END,
         p.published_at,
         e.start_time,
         e.end_time,
         e.location
    FROM public.golf_practice_plans p
    JOIN public.golf_events e ON e.id = p.event_id
   WHERE p.id = ANY (p_plan_ids[1:50])
     AND p.kind = 'event'
     AND p.first_published_at IS NOT NULL
     AND (public.is_golf_team_coach(p.team_id) OR public.is_golf_team_player(p.team_id));
$$;

-- Record the team chat card once. The message must be the caller's own practice card for this plan, in this team's team chat.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_set_chat_message(p_plan_id uuid, p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_plan public.golf_practice_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND OR v_plan.kind <> 'event' OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.golf_messages m
      JOIN public.golf_conversations c ON c.id = m.conversation_id
     WHERE m.id = p_message_id
       AND m.sender_id = v_uid
       AND m.kind = 'practice'
       AND m.payload ->> 'plan_id' = p_plan_id::text
       AND c.team_id = v_plan.team_id
       AND c.is_team_chat
  ) THEN
    RAISE EXCEPTION 'practice_plan_card';
  END IF;
  UPDATE public.golf_practice_plans p SET chat_message_id = p_message_id WHERE p.id = v_plan.id;
END;
$$;

REVOKE ALL ON FUNCTION public.golf_practice_plan_public_body(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_public_body(jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_recipients(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_recipients(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_publish(uuid, integer, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_publish(uuid, integer, jsonb, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_take_down(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_take_down(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_set_variant(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_set_variant(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_record_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_record_open(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_cards(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_set_chat_message(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_set_chat_message(uuid, uuid) TO authenticated, service_role;
