-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 7.
-- WHY: A coach makes a solo make-up from an event plan for one player who
--   missed; it is published like any plan (one player told) and never filed in
--   Documents or posted in chat; the player marks it done.
-- WHO: Create: public.is_golf_team_coach on the source plan's team, for an
--   active player of that team. Complete: that player (golf_players.user_id =
--   auth.uid(), active member, plan published) or a coach of the team. My
--   make-ups: the calling player's own published make-ups only.
-- ORDER: After 20261026010500 (uses golf_practice_plan_check_body) and
--   20261026010600.
-- RISK: Low. Functions only.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_practice_my_makeups(uuid);
--   DROP FUNCTION IF EXISTS public.golf_practice_makeup_complete(uuid,
--   boolean); DROP FUNCTION IF EXISTS public.golf_practice_makeup_create(uuid,
--   uuid, date, text, jsonb);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace =
-- VERIFY: 'public'::regnamespace AND proname IN ('golf_practice_makeup_create',
-- VERIFY: 'golf_practice_makeup_complete', 'golf_practice_my_makeups') AND
-- VERIFY: prosecdef AND 'search_path=""' = ANY (proconfig) HAVING count(*) = 3;
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('anon',
-- VERIFY: 'public.golf_practice_makeup_create(uuid, uuid, date, text, jsonb)',
-- VERIFY: 'EXECUTE') AND NOT has_function_privilege('anon',
-- VERIFY: 'public.golf_practice_makeup_complete(uuid, boolean)', 'EXECUTE') AND
-- VERIFY: NOT has_function_privilege('anon',
-- VERIFY: 'public.golf_practice_my_makeups(uuid)', 'EXECUTE');

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_practice_makeup_create(
    p_source_plan_id uuid,
    p_player_id uuid,
    p_due_on date,
    p_title text,
    p_body jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_src public.golf_practice_plans%ROWTYPE;
  v_tz text;
  v_today date;
  v_title text := NULLIF(pg_catalog.btrim(COALESCE(p_title, '')), '');
  v_id uuid;
BEGIN
  SELECT * INTO v_src
      FROM public.golf_practice_plans p WHERE p.id = p_source_plan_id;
  IF v_uid IS NULL OR NOT FOUND OR v_src.kind <> 'event'
      OR NOT public.is_golf_team_coach(v_src.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.team_id = v_src.team_id AND m.player_id = p_player_id
        AND m.status = 'active'::public.team_member_status
  ) THEN
    RAISE EXCEPTION 'practice_plan_player_not_on_team';
  END IF;
  IF v_title IS NULL OR pg_catalog.char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'practice_plan_title';
  END IF;
  -- "Today" on the team clock: golf_team_settings.timezone, trimmed, falling
  --   back to America/New_York when it is
  -- missing, empty or not a zone Postgres knows (the shared rule; never
  --   golf_teams.timezone, never the server clock).
  SELECT NULLIF(pg_catalog.btrim(ts.timezone), '') INTO v_tz
    FROM public.golf_team_settings ts WHERE ts.team_id = v_src.team_id;
  v_tz := COALESCE(v_tz, 'America/New_York');
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names
      WHERE name = v_tz) THEN
    v_tz := 'America/New_York';
  END IF;
  v_today := (pg_catalog.now() AT TIME ZONE v_tz)::date;
  IF p_due_on IS NULL OR p_due_on < v_today OR p_due_on > v_today + 60 THEN
    RAISE EXCEPTION 'practice_makeup_due';
  END IF;
  PERFORM public.golf_practice_plan_check_body(v_src.team_id, p_body, true);
  IF (p_body -> 'players')
      IS DISTINCT FROM pg_catalog.jsonb_build_array(p_player_id::text) THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;

  INSERT INTO public.golf_practice_plans (team_id, kind, for_player_id,
      source_plan_id, due_on, title, body, created_by, updated_by)
  VALUES (v_src.team_id, 'makeup', p_player_id, v_src.id, p_due_on, v_title,
      p_body, v_uid, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_makeup_complete(
    p_plan_id uuid, p_done boolean
)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.golf_practice_plans%ROWTYPE;
  v_is_player boolean;
BEGIN
  SELECT * INTO v_plan
      FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR v_plan.kind <> 'makeup' THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  v_is_player := v_plan.status = 'published'
    AND public.is_golf_team_player(v_plan.team_id)
    AND EXISTS (SELECT 1
        FROM public.golf_players gp
            WHERE gp.id = v_plan.for_player_id
                AND gp.user_id = (SELECT auth.uid()));
  IF NOT v_is_player AND NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Only completed_at changes; the draft version is left alone so a coach's
  --   open builder never goes stale.
  UPDATE public.golf_practice_plans p
     SET completed_at = CASE WHEN p_done
         THEN COALESCE(p.completed_at, pg_catalog.now()) ELSE NULL END,
         updated_at = pg_catalog.now()
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;
  RETURN v_plan.completed_at;
END;
$$;

-- The calling player's own published make-ups on a team, soonest due first.
CREATE OR REPLACE FUNCTION public.golf_practice_my_makeups(p_team uuid)
RETURNS TABLE (
    plan_id uuid,
    title text,
    due_on date,
    completed_at timestamptz,
    live_version integer,
    minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.title, p.due_on, p.completed_at, v.version,
         (SELECT COALESCE(sum((b ->> 'len')::int), 0)::int
             FROM pg_catalog.jsonb_array_elements(v.body -> 'blocks') b)
    FROM public.golf_practice_plans p
    JOIN public.golf_practice_plan_versions v ON v.plan_id = p.id AND v.is_live
    JOIN public.golf_players gp ON gp.id = p.for_player_id
   WHERE p.kind = 'makeup'
     AND p.team_id = p_team
     AND p.status = 'published'
     AND gp.user_id = (SELECT auth.uid())
     AND public.is_golf_team_player(p_team)
   ORDER BY p.due_on, p.id
   LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.golf_practice_makeup_create(
    uuid, uuid, date, text, jsonb
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_makeup_create(
    uuid, uuid, date, text, jsonb
) TO authenticated,
service_role;
REVOKE ALL ON FUNCTION public.golf_practice_makeup_complete(
    uuid, boolean
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_makeup_complete(
    uuid, boolean
) TO authenticated,
service_role;
REVOKE ALL ON FUNCTION public.golf_practice_my_makeups(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_my_makeups(
    uuid
) TO authenticated,
service_role;
