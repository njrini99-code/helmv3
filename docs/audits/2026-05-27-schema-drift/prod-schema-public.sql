--
-- PostgreSQL database dump
--

\restrict JwXCyuD4D0Aq6C5QYkGFyWcZzayr5GOAY1C1OOfFgA5RJXSjzEBKS5vKJci30jf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: admin_event_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.admin_event_severity AS ENUM (
    'info',
    'warning',
    'error',
    'critical'
);


--
-- Name: baseball_coach_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.baseball_coach_type AS ENUM (
    'college',
    'juco',
    'high_school',
    'showcase'
);


--
-- Name: baseball_pipeline_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.baseball_pipeline_stage AS ENUM (
    'watchlist',
    'high_priority',
    'offer_extended',
    'committed',
    'uninterested'
);


--
-- Name: baseball_player_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.baseball_player_type AS ENUM (
    'college',
    'juco',
    'high_school',
    'showcase'
);


--
-- Name: coach_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coach_status AS ENUM (
    'new_lead',
    'contacted',
    'engaged',
    'proposal',
    'won',
    'lost',
    'nurture'
);


--
-- Name: contact_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_type AS ENUM (
    'email',
    'call',
    'demo',
    'meeting',
    'note'
);


--
-- Name: crm_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.crm_event_type AS ENUM (
    'demo',
    'follow_up',
    'call',
    'meeting',
    'email_reminder',
    'other'
);


--
-- Name: email_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.email_status AS ENUM (
    'valid',
    'bounced',
    'complained',
    'unknown',
    'unsubscribed'
);


--
-- Name: golf_expense_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.golf_expense_category AS ENUM (
    'lodging',
    'transportation',
    'meals',
    'entry_fees',
    'equipment',
    'other'
);


--
-- Name: golf_expense_paid_by; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.golf_expense_paid_by AS ENUM (
    'team',
    'player',
    'pending_reimbursement',
    'split'
);


--
-- Name: ncaa_division; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ncaa_division AS ENUM (
    'D2',
    'D3'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'profile_view',
    'watchlist_add',
    'video_view',
    'message',
    'team_invite',
    'team_join_request',
    'team_join_approved',
    'event_reminder',
    'dev_plan_assigned',
    'team_join',
    'team_join_rejected'
);


--
-- Name: organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.organization_type AS ENUM (
    'college',
    'juco',
    'high_school',
    'showcase'
);


--
-- Name: program_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.program_type AS ENUM (
    'mens',
    'womens',
    'both'
);


--
-- Name: reminder_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reminder_type AS ENUM (
    'in_app',
    'email',
    'push',
    'all'
);


--
-- Name: team_member_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.team_member_status AS ENUM (
    'pending',
    'active',
    'inactive',
    'removed'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'coach',
    'player',
    'admin'
);


--
-- Name: __admin_rollup_b_gate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.__admin_rollup_b_gate() RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: calculate_round_strokes_gained(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_round_strokes_gained(p_round_id uuid) RETURNS TABLE(sg_total numeric, sg_tee numeric, sg_approach numeric, sg_around_green numeric, sg_putting numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_shot RECORD;
  v_expected_before NUMERIC(5,3);
  v_expected_after NUMERIC(5,3);
  v_shot_sg NUMERIC(5,3);
  v_distance_before NUMERIC;
  v_distance_after NUMERIC;
  v_lie_before TEXT;
  v_lie_after TEXT;
  v_is_putting BOOLEAN;
  v_shot_type TEXT;
  v_sg_total NUMERIC(5,2) := 0;
  v_sg_tee NUMERIC(5,2) := 0;
  v_sg_approach NUMERIC(5,2) := 0;
  v_sg_around_green NUMERIC(5,2) := 0;
  v_sg_putting NUMERIC(5,2) := 0;
BEGIN
  FOR v_shot IN
    SELECT
      s.shot_type, s.lie_before,
      COALESCE(s.lie_after, s.result) AS lie_after,
      s.distance_to_hole_before, s.distance_to_hole_after,
      s.distance_unit_before, s.distance_unit_after,
      s.result, s.is_penalty
    FROM golf_shots s
    JOIN golf_holes h ON h.id = s.hole_id
    WHERE h.round_id = p_round_id AND s.is_penalty IS NOT TRUE
    ORDER BY h.hole_number, s.shot_number
  LOOP
    IF v_shot.distance_to_hole_before IS NULL THEN CONTINUE; END IF;
    v_lie_before := COALESCE(v_shot.lie_before, 'fairway');
    v_lie_after := COALESCE(v_shot.lie_after, v_shot.result, 'fairway');
    v_is_putting := v_lie_before = 'green' OR v_shot.shot_type = 'putting';
    v_distance_before := v_shot.distance_to_hole_before;
    IF v_is_putting THEN
      IF v_shot.distance_unit_before = 'feet' THEN v_distance_before := v_distance_before / 3.0; END IF;
      v_expected_before := sg_expected_strokes('green', v_distance_before);
    ELSE
      IF v_shot.distance_unit_before = 'feet' THEN v_distance_before := v_distance_before / 3.0; END IF;
      v_expected_before := sg_expected_strokes(v_lie_before, v_distance_before);
    END IF;
    IF v_shot.result = 'hole' OR v_shot.distance_to_hole_after = 0 THEN
      v_expected_after := 0;
    ELSIF v_shot.distance_to_hole_after IS NOT NULL THEN
      v_distance_after := v_shot.distance_to_hole_after;
      IF v_lie_after = 'green' THEN
        IF v_shot.distance_unit_after = 'feet' THEN v_distance_after := v_distance_after / 3.0; END IF;
        v_expected_after := sg_expected_strokes('green', v_distance_after);
      ELSE
        IF v_shot.distance_unit_after = 'feet' THEN v_distance_after := v_distance_after / 3.0; END IF;
        v_expected_after := sg_expected_strokes(v_lie_after, v_distance_after);
      END IF;
    ELSE
      CONTINUE;
    END IF;
    v_shot_sg := v_expected_before - (1 + v_expected_after);
    v_shot_type := COALESCE(v_shot.shot_type,
      CASE WHEN v_lie_before = 'green' THEN 'putting'
           WHEN v_lie_before = 'tee' THEN 'tee'
           WHEN v_distance_before <= 50 THEN 'around_green'
           ELSE 'approach' END);
    CASE v_shot_type
      WHEN 'tee' THEN v_sg_tee := v_sg_tee + v_shot_sg;
      WHEN 'approach' THEN v_sg_approach := v_sg_approach + v_shot_sg;
      WHEN 'around_green' THEN v_sg_around_green := v_sg_around_green + v_shot_sg;
      WHEN 'putting' THEN v_sg_putting := v_sg_putting + v_shot_sg;
      ELSE v_sg_approach := v_sg_approach + v_shot_sg;
    END CASE;
    v_sg_total := v_sg_total + v_shot_sg;
  END LOOP;
  sg_total := ROUND(v_sg_total, 2);
  sg_tee := ROUND(v_sg_tee, 2);
  sg_approach := ROUND(v_sg_approach, 2);
  sg_around_green := ROUND(v_sg_around_green, 2);
  sg_putting := ROUND(v_sg_putting, 2);
  RETURN NEXT;
END;
$$;


--
-- Name: calculate_strokes_gained_on_round_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_strokes_gained_on_round_complete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sg_result RECORD;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT * INTO v_sg_result FROM calculate_round_strokes_gained(NEW.id);
    NEW.strokes_gained_total := v_sg_result.sg_total;
    NEW.strokes_gained_tee := v_sg_result.sg_tee;
    NEW.strokes_gained_approach := v_sg_result.sg_approach;
    NEW.strokes_gained_around_green := v_sg_result.sg_around_green;
    NEW.strokes_gained_putting := v_sg_result.sg_putting;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: coach_id_for_team(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.coach_id_for_team(p_team_id uuid, p_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT gc.id
  FROM public.golf_team_coach_staff gtcs
  JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
  WHERE gtcs.team_id = p_team_id
    AND gc.user_id = p_user_id
  LIMIT 1;
$$;


--
-- Name: current_coach_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_coach_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_coach_id uuid;
BEGIN
  SELECT id INTO v_coach_id
  FROM golf_coaches
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN v_coach_id;
END;
$$;


--
-- Name: FUNCTION current_coach_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.current_coach_id() IS 'v3 RLS helper: returns the golf_coaches.id for the currently authenticated user, or NULL if the user is not a coach.';


--
-- Name: current_player_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_player_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_player_id uuid;
BEGIN
  SELECT id INTO v_player_id
  FROM golf_players
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN v_player_id;
END;
$$;


--
-- Name: FUNCTION current_player_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.current_player_id() IS 'v3 RLS helper: returns the golf_players.id for the currently authenticated user, or NULL if the user is not a player. Use in player-scoped policies via "player_id = current_player_id()".';


--
-- Name: extract_email_click_from_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.extract_email_click_from_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clicked_url text;
  v_user_agent  text;
  v_ip_address  text;
  v_recipient   text;
BEGIN
  IF NEW.event_type <> 'email.clicked' THEN
    RETURN NEW;
  END IF;

  v_clicked_url := NEW.raw_payload #>> '{data,click,link}';
  v_user_agent  := NEW.raw_payload #>> '{data,click,userAgent}';
  v_ip_address  := NEW.raw_payload #>> '{data,click,ipAddress}';

  -- Prefer event.recipient_email; fall back to the first entry in data.to
  IF NEW.recipient_email IS NOT NULL THEN
    v_recipient := NEW.recipient_email;
  ELSIF NEW.raw_payload #> '{data,to}' IS NOT NULL THEN
    v_recipient := (NEW.raw_payload #> '{data,to}' ->> 0);
  ELSE
    v_recipient := '';
  END IF;

  INSERT INTO email_clicks (
    email_event_id,
    resend_message_id,
    recipient_email,
    clicked_url,
    user_agent,
    ip_address,
    occurred_at
  ) VALUES (
    NEW.id,
    NEW.resend_message_id,
    v_recipient,
    v_clicked_url,
    v_user_agent,
    v_ip_address,
    NEW.occurred_at
  );

  RETURN NEW;
END;
$$;


--
-- Name: get_admin_analytics_rollup(timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_analytics_rollup(p_ago7d timestamp with time zone, p_ago30d timestamp with time zone, p_ago12w timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH
    analytics_raw AS (
      SELECT event_type, page_path, feature_name, session_id, user_id, created_at, duration_ms
      FROM admin_analytics_events WHERE created_at >= p_ago7d
    ),
    analytics_events_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'event_type', event_type, 'page_path', page_path, 'feature_name', feature_name,
        'session_id', session_id, 'user_id', user_id, 'created_at', created_at, 'duration_ms', duration_ms
      )), '[]'::jsonb) AS events FROM analytics_raw
    ),
    coach_insight_rollup AS (
      SELECT coach_id, COUNT(*)::int AS total_insights, MAX(created_at) AS last_insight_at
      FROM golf_coach_insights
      WHERE coach_id IS NOT NULL AND created_at >= p_ago12w
      GROUP BY coach_id
    ),
    coach_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'total_insights', total_insights, 'last_insight_at', last_insight_at
      )), '[]'::jsonb) AS rows FROM coach_insight_rollup
    ),
    round_reviews_joined AS (
      SELECT rr.published_by, rr.round_id, rr.created_at AS review_at,
             gr.player_id, gr.created_at AS round_at
      FROM golf_round_reviews rr
      LEFT JOIN golf_rounds gr ON gr.id = rr.round_id
      WHERE rr.created_at >= p_ago12w
    ),
    coach_review_rollup AS (
      SELECT published_by AS coach_id, COUNT(*)::int AS reviews,
        COALESCE(AVG(EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0)
          FILTER (WHERE round_at IS NOT NULL AND review_at IS NOT NULL
            AND review_at >= round_at
            AND EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0 < 720), NULL) AS avg_response_hours
      FROM round_reviews_joined WHERE published_by IS NOT NULL GROUP BY published_by
    ),
    coach_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'reviews', reviews,
        'avg_response_hours', CASE WHEN avg_response_hours IS NULL THEN NULL ELSE ROUND(avg_response_hours::numeric, 2) END
      )), '[]'::jsonb) AS rows FROM coach_review_rollup
    ),
    player_review_rollup AS (
      SELECT player_id, COUNT(*)::int AS reviews
      FROM round_reviews_joined WHERE player_id IS NOT NULL GROUP BY player_id
    ),
    player_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'reviews', reviews)), '[]'::jsonb) AS rows
      FROM player_review_rollup
    ),
    players_with_reviews_json AS (
      SELECT COALESCE(jsonb_agg(DISTINCT player_id), '[]'::jsonb) AS ids
      FROM round_reviews_joined WHERE player_id IS NOT NULL
    ),
    player_insight_rollup AS (
      SELECT player_id, SUM(COALESCE(insights_generated, 1))::int AS insights
      FROM golf_insight_generation_log
      WHERE player_id IS NOT NULL AND created_at >= p_ago12w
      GROUP BY player_id
    ),
    player_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'insights', insights)), '[]'::jsonb) AS rows
      FROM player_insight_rollup
    ),
    teams_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'season', season, 'organization_id', organization_id)), '[]'::jsonb) AS rows
      FROM golf_teams
    ),
    team_members_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'team_id', team_id)), '[]'::jsonb) AS rows
      FROM golf_team_members WHERE status = 'active'
    ),
    team_coach_staff_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'team_id', team_id, 'coach_id', coach_id, 'role', role, 'is_primary', is_primary
      )), '[]'::jsonb) AS rows
      FROM golf_team_coach_staff
    ),
    players_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'first_name', first_name, 'last_name', last_name,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows FROM golf_players
    ),
    coaches_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'full_name', full_name, 'organization_id', organization_id,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows FROM golf_coaches
    ),
    users_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'role', u.role::text,
        'created_at', u.created_at,
        'last_seen', GREATEST(u.last_seen, au.last_sign_in_at)
      ) ORDER BY u.created_at DESC NULLS LAST), '[]'::jsonb) AS rows
      FROM users u
      LEFT JOIN auth.users au ON au.id = u.id
    ),
    philosophy_coach_ids AS (
      SELECT COALESCE(jsonb_agg(DISTINCT coach_id), '[]'::jsonb) AS ids
      FROM golf_coach_philosophy WHERE coach_id IS NOT NULL
    ),
    player_stats_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player_id', player_id, 'first_name', gp.first_name, 'last_name', gp.last_name,
        'scoring_average', scoring_average, 'driving_accuracy', driving_accuracy_percentage,
        'gir_percentage', gir_percentage, 'putts_per_round', putts_per_round, 'rounds_played', rounds_played
      )), '[]'::jsonb) AS rows
      FROM golf_player_stats_cache psc LEFT JOIN golf_players gp ON gp.id = psc.player_id
    ),
    error_count_24h AS (
      SELECT COUNT(*)::int AS errors_24h FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= (now() - interval '24 hours')
    ),
    error_count_7d AS (
      SELECT COUNT(*)::int AS errors_7d FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= p_ago7d
    ),
    admin_error_events AS (
      SELECT id, event_type, severity::text AS severity,
             COALESCE(resolved, false) AS resolved, created_at
      FROM admin_events
      WHERE severity::text IN ('error', 'critical') AND created_at >= p_ago30d
    ),
    admin_error_events_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'event_type', event_type, 'severity', severity,
        'resolved', resolved, 'created_at', created_at
      )), '[]'::jsonb) AS rows,
      COALESCE(SUM(CASE WHEN NOT resolved THEN 1 ELSE 0 END), 0)::int AS unresolved
      FROM admin_error_events
    )
  SELECT jsonb_build_object(
    'generated_at', now(), 'ago7d', p_ago7d, 'ago30d', p_ago30d, 'ago12w', p_ago12w,
    'analyticsEvents', (SELECT events FROM analytics_events_json),
    'coachInsightRollup', (SELECT rows FROM coach_insight_rollup_json),
    'coachReviewRollup', (SELECT rows FROM coach_review_rollup_json),
    'playerReviewRollup', (SELECT rows FROM player_review_rollup_json),
    'playersWithReviews', (SELECT ids FROM players_with_reviews_json),
    'playerInsightRollup', (SELECT rows FROM player_insight_rollup_json),
    'teams', (SELECT rows FROM teams_json),
    'teamMembers', (SELECT rows FROM team_members_json),
    'teamCoachStaff', (SELECT rows FROM team_coach_staff_json),
    'players', (SELECT rows FROM players_json),
    'coaches', (SELECT rows FROM coaches_json),
    'users', (SELECT rows FROM users_json),
    'philosophyCoachIds', (SELECT ids FROM philosophy_coach_ids),
    'playerStats', (SELECT rows FROM player_stats_json),
    'errors24h', (SELECT errors_24h FROM error_count_24h),
    'errors7d', (SELECT errors_7d FROM error_count_7d),
    'adminErrorEvents', (SELECT rows FROM admin_error_events_json),
    'adminErrorEventsUnresolved', (SELECT unresolved FROM admin_error_events_json)
  ) INTO v_result;
  RETURN v_result;
END;
$$;


--
-- Name: FUNCTION get_admin_analytics_rollup(p_ago7d timestamp with time zone, p_ago30d timestamp with time zone, p_ago12w timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_analytics_rollup(p_ago7d timestamp with time zone, p_ago30d timestamp with time zone, p_ago12w timestamp with time zone) IS 'Slice C of admin dashboard refactor: consolidates Batch-5 enhanced analytics (admin_analytics_events, golf_coach_insights, golf_round_reviews, golf_insight_generation_log, golf_teams, admin_events, error_logs) into one JSONB payload. Caller supplies allRoundsMinimal separately to avoid a second golf_rounds scan (Slice A''s C1 RPC already emits it).';


--
-- Name: get_admin_baseball_rollup(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_baseball_rollup(p_ago30d timestamp with time zone DEFAULT (now() - '30 days'::interval)) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_total_players          bigint := 0;
  v_total_coaches          bigint := 0;
  v_players_onboarded      bigint := 0;
  v_coaches_onboarded      bigint := 0;
  v_recruiting_activated   bigint := 0;
  v_watchlist_stages       jsonb  := '{}'::jsonb;
  v_videos30d              bigint := 0;
  v_engagement30d          bigint := 0;
  v_messages30d            bigint := 0;
  v_conversations30d       bigint := 0;
  v_total_teams            bigint := 0;
  v_total_events           bigint := 0;
  v_total_camps            bigint := 0;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  IF to_regclass('public.baseball_players') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_players' INTO v_total_players;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_players WHERE onboarding_completed = TRUE$q$ INTO v_players_onboarded;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_players WHERE recruiting_activated = TRUE$q$ INTO v_recruiting_activated;
  END IF;

  IF to_regclass('public.baseball_coaches') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_coaches' INTO v_total_coaches;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_coaches WHERE onboarding_completed = TRUE$q$ INTO v_coaches_onboarded;
  END IF;

  IF to_regclass('public.baseball_watchlists') IS NOT NULL THEN
    EXECUTE
      $q$SELECT COALESCE(jsonb_object_agg(stage, cnt), '{}'::jsonb)
         FROM (
           SELECT COALESCE(pipeline_stage::text, 'unknown') AS stage,
                  COUNT(*)::int AS cnt
           FROM baseball_watchlists
           GROUP BY 1
         ) s$q$
      INTO v_watchlist_stages;
  END IF;

  IF to_regclass('public.baseball_videos') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_videos WHERE created_at >= $1'
      INTO v_videos30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_player_engagement_events') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_player_engagement_events WHERE created_at >= $1'
      INTO v_engagement30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_messages') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_messages WHERE created_at >= $1'
      INTO v_messages30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_conversations') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_conversations WHERE created_at >= $1'
      INTO v_conversations30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_teams') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_teams' INTO v_total_teams;
  END IF;

  IF to_regclass('public.baseball_events') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_events' INTO v_total_events;
  END IF;

  IF to_regclass('public.baseball_camps') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_camps' INTO v_total_camps;
  END IF;

  RETURN jsonb_build_object(
    'total_players',               v_total_players,
    'total_coaches',               v_total_coaches,
    'watchlist_stages',            v_watchlist_stages,
    'recruiting_activated_players', v_recruiting_activated,
    'videos_30d',                  v_videos30d,
    'engagement_events_30d',       v_engagement30d,
    'messages_30d',                v_messages30d,
    'conversations_30d',           v_conversations30d,
    'players_onboarded',           v_players_onboarded,
    'coaches_onboarded',           v_coaches_onboarded,
    'total_teams',                 v_total_teams,
    'total_events',                v_total_events,
    'total_camps',                 v_total_camps
  );
END;
$_$;


--
-- Name: FUNCTION get_admin_baseball_rollup(p_ago30d timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_baseball_rollup(p_ago30d timestamp with time zone) IS 'Slice B / C5 — collapses 14 baseball_* admin dashboard count queries into a single JSONB rollup. Resilient: missing baseball_* tables return 0.';


--
-- Name: get_admin_coachhelm_rollup(timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_coachhelm_rollup(p_ago7d timestamp with time zone, p_ago30d timestamp with time zone, p_ago12w timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '30s'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      igl_totals AS (
        SELECT
          MAX(created_at)                                                      AS last_insight_at,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int                   AS insights_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d
                            AND COALESCE(insights_generated, 0) = 0)::int     AS insights_failed_7d
        FROM golf_insight_generation_log
      ),
      igl_12w AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'created_at',         created_at,
                'insights_generated', COALESCE(insights_generated, 0)
              )
              ORDER BY created_at ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_insight_generation_log
        WHERE created_at >= p_ago12w
      ),
      igl_30d_count AS (
        SELECT COUNT(*)::int AS cnt
        FROM golf_insight_generation_log
        WHERE created_at >= p_ago30d
      ),
      igl_by_week AS (
        -- Bucketed weekly insight series (12 weeks). Payload mirrors L1699.
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM golf_insight_generation_log
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      latest_insights AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                  id,
                'insight_type',        insight_type,
                'insights_generated',  insights_generated,
                'created_at',          created_at
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, insight_type, insights_generated, created_at
          FROM golf_insight_generation_log
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      -- Covers L3226 (Slice C): (player_id, insights_generated) rows.
      insight_player_rows AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'player_id',          player_id,
                'insights_generated', insights_generated
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_insight_generation_log
        WHERE player_id IS NOT NULL
      ),
      reviews_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_reviews_all_time,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int   AS reviews_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS reviews_30d
        FROM golf_round_reviews
      ),
      reviews_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM golf_round_reviews
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      -- funnel.roundsReviewed denominator: distinct reviewed round_ids.
      reviewed_round_ids AS (
        SELECT
          COALESCE(
            jsonb_agg(DISTINCT round_id),
            '[]'::jsonb
          ) AS arr
        FROM golf_round_reviews
        WHERE round_id IS NOT NULL
      ),
      patterns_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_patterns,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS patterns_30d
        FROM golf_patterns_v2
      ),
      predictions_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_predictions,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS predictions_30d
        FROM golf_predictions
      ),
      philosophy_count AS (
        SELECT COUNT(*)::int AS cnt FROM golf_coach_philosophy
      ),
      model_performance AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'model_type',         model_type,
                'accuracy_rate',      accuracy_rate,
                'calibration_score',  calibration_score,
                'predictions_made',   predictions_made
              )
              ORDER BY period_end DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT model_type, accuracy_rate, calibration_score, predictions_made, period_end
          FROM golf_prediction_model_performance
          ORDER BY period_end DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      insight_effectiveness AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'insight_type',         insight_type,
                'action_rate',          action_rate,
                'improvement_rate',     improvement_rate,
                'effectiveness_score',  effectiveness_score
              )
              ORDER BY period_end DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT insight_type, action_rate, improvement_rate, effectiveness_score, period_end
          FROM golf_insight_effectiveness
          ORDER BY period_end DESC NULLS LAST
          LIMIT 10
        ) t
      )

    SELECT jsonb_build_object(
      'generatedAt',             now(),
      'lastInsightAt',           (SELECT last_insight_at     FROM igl_totals),
      'insightsThisWeek',        (SELECT insights_this_week  FROM igl_totals),
      'insightsFailed7d',        (SELECT insights_failed_7d  FROM igl_totals),
      'insightGenLog12w',        (SELECT arr FROM igl_12w),
      'insightGenLog30dCount',   (SELECT cnt FROM igl_30d_count),
      'insightsByWeek',          (SELECT arr FROM igl_by_week),
      'latestInsights',          (SELECT arr FROM latest_insights),
      'insightPlayerRows',       (SELECT arr FROM insight_player_rows),
      'totalReviewsAllTime',     (SELECT total_reviews_all_time FROM reviews_totals),
      'reviewsThisWeek',         (SELECT reviews_this_week      FROM reviews_totals),
      'reviews30d',              (SELECT reviews_30d            FROM reviews_totals),
      'reviewsByWeek',           (SELECT arr FROM reviews_by_week),
      'reviewedRoundIds',        (SELECT arr FROM reviewed_round_ids),
      'totalPatterns',           (SELECT total_patterns     FROM patterns_totals),
      'patterns30d',             (SELECT patterns_30d       FROM patterns_totals),
      'totalPredictions',        (SELECT total_predictions  FROM predictions_totals),
      'predictions30d',          (SELECT predictions_30d    FROM predictions_totals),
      'coachPhilosophyCount',    (SELECT cnt FROM philosophy_count),
      'modelPerformance',        (SELECT arr FROM model_performance),
      'insightEffectiveness',    (SELECT arr FROM insight_effectiveness)
    )
  );
END;
$$;


--
-- Name: get_admin_dashboard_rollup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_dashboard_rollup() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      user_stats AS (
        SELECT
          COUNT(*)                                                           AS total,
          COUNT(*) FILTER (WHERE role = 'admin')                             AS admins,
          COUNT(*) FILTER (WHERE role = 'coach')                             AS coaches,
          COUNT(*) FILTER (WHERE role = 'player')                            AS players,
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')     AS new_last_7d,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')    AS new_last_30d,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '1 hour')      AS active_1h,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '24 hours')    AS active_24h,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '7 days')      AS active_7d,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '30 days')     AS active_30d
        FROM users
      ),
      round_player_rollup AS (
        SELECT
          player_id,
          COUNT(*)                                                           AS rounds_total,
          MAX(created_at)                                                    AS last_round_at,
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')     AS rounds_last_7d,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')    AS rounds_last_30d
        FROM golf_rounds
        WHERE player_id IS NOT NULL
        GROUP BY player_id
      ),
      round_stats AS (
        SELECT
          COALESCE(SUM(rounds_total), 0)                                     AS total_rounds,
          COALESCE(SUM(rounds_last_7d), 0)                                   AS rounds_last_7d,
          COALESCE(SUM(rounds_last_30d), 0)                                  AS rounds_last_30d,
          COUNT(*)                                                           AS active_players,
          COUNT(*) FILTER (WHERE last_round_at > now() - interval '30 days') AS players_active_30d,
          COUNT(*) FILTER (WHERE last_round_at < now() - interval '30 days'
                              OR last_round_at IS NULL)                     AS at_risk_players
        FROM round_player_rollup
      ),
      round_today AS (
        SELECT COUNT(*) AS rounds_today
        FROM golf_rounds
        WHERE created_at >= date_trunc('day', now())
      ),
      team_stats AS (
        SELECT
          (SELECT COUNT(*) FROM golf_teams)                                   AS golf_teams,
          (SELECT COUNT(*) FROM golf_teams
             WHERE created_at > now() - interval '30 days')                   AS golf_teams_new_30d,
          (SELECT COUNT(DISTINCT team_id) FROM golf_team_members
             WHERE status = 'active')                                         AS golf_teams_active,
          COALESCE(
            (SELECT COUNT(*)::bigint FROM baseball_teams
               WHERE to_regclass('public.baseball_teams') IS NOT NULL),
            0
          )                                                                   AS baseball_teams
      ),
      signup_trend AS (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'date',  to_char(bucket, 'YYYY-MM-DD'),
              'count', cnt
            )
            ORDER BY bucket ASC
          ) AS series
        FROM (
          SELECT date_trunc('day', created_at) AS bucket,
                 COUNT(*)                       AS cnt
          FROM users
          WHERE created_at > now() - interval '30 days'
          GROUP BY 1
        ) s
      ),
      onboarding_stats AS (
        SELECT
          (SELECT COUNT(*) FROM golf_coaches WHERE onboarding_completed = TRUE) AS coaches_onboarded,
          (SELECT COUNT(*) FROM golf_players WHERE onboarding_completed = TRUE) AS players_onboarded,
          (SELECT COUNT(*) FROM golf_coaches)                                   AS coaches_total,
          (SELECT COUNT(*) FROM golf_players)                                   AS players_total
      )
    SELECT jsonb_build_object(
      'generated_at',     now(),
      'users',            (SELECT row_to_json(user_stats)       FROM user_stats),
      'rounds',           (SELECT row_to_json(round_stats)      FROM round_stats),
      'rounds_today',     (SELECT rounds_today                  FROM round_today),
      'teams',            (SELECT row_to_json(team_stats)       FROM team_stats),
      'onboarding',       (SELECT row_to_json(onboarding_stats) FROM onboarding_stats),
      'signup_trend_30d', COALESCE((SELECT series FROM signup_trend), '[]'::jsonb)
    )
  );
END;
$$;


--
-- Name: FUNCTION get_admin_dashboard_rollup(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_dashboard_rollup() IS 'Single-call admin dashboard rollup. Returns JSONB with user/round/team/onboarding counts + 30-day signup trend. Replaces ~95-query client path.';


--
-- Name: get_admin_errors_rollup(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_errors_rollup(p_ago7d timestamp with time zone DEFAULT (now() - '7 days'::interval), p_ago24h timestamp with time zone DEFAULT (now() - '24:00:00'::interval)) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_error_logs_recent       jsonb := '[]'::jsonb;
  v_error_logs_total_7d     bigint := 0;
  v_error_logs_critical_7d  bigint := 0;
  v_error_logs_count_24h    bigint := 0;
  v_error_summary           jsonb := NULL;
  v_audit_recent            jsonb := '[]'::jsonb;
  v_audit_total_7d          bigint := 0;
  v_login_recent            jsonb := '[]'::jsonb;
  v_login_locked_count      bigint := 0;
  v_admin_events_recent     jsonb := '[]'::jsonb;
  v_admin_events_unresolved jsonb := '[]'::jsonb;
  v_admin_events_error_only jsonb := '[]'::jsonb;
  v_admin_event_summary     jsonb := NULL;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'message', e.message,
        'severity', e.severity,
        'stack', e.stack,
        'url', e.url,
        'user_id', e.user_id,
        'context', e.context,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_error_logs_recent
  FROM (
    SELECT id, message, severity, stack, url, user_id, context, created_at
    FROM error_logs
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  SELECT COUNT(*)::bigint INTO v_error_logs_total_7d
    FROM error_logs WHERE created_at >= p_ago7d;
  SELECT COUNT(*)::bigint INTO v_error_logs_critical_7d
    FROM error_logs WHERE created_at >= p_ago7d AND severity = 'critical';
  SELECT COUNT(*)::bigint INTO v_error_logs_count_24h
    FROM error_logs WHERE created_at >= p_ago24h;

  BEGIN
    SELECT jsonb_build_object(
      'by_severity', by_severity,
      'top_errors', top_errors,
      'daily_rate', daily_rate,
      'total_count', total_count,
      'critical_count', critical_count
    )
    INTO v_error_summary
    FROM public.get_error_summary(7);
  EXCEPTION WHEN OTHERS THEN
    v_error_summary := NULL;
  END;

  BEGIN
    v_audit_recent := COALESCE(public.get_audit_log_recent(50)::jsonb, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_audit_recent := '[]'::jsonb;
  END;

  SELECT COUNT(*)::bigint INTO v_audit_total_7d
    FROM audit_log WHERE created_at >= p_ago7d;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'email', l.email,
        'failed_attempts', l.failed_attempts,
        'last_attempt', l.last_attempt,
        'locked_until', l.locked_until
      )
      ORDER BY l.last_attempt DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_login_recent
  FROM (
    SELECT email, failed_attempts, last_attempt, locked_until
    FROM login_attempts
    ORDER BY last_attempt DESC NULLS LAST
    LIMIT 20
  ) l;

  SELECT COUNT(*)::bigint INTO v_login_locked_count
    FROM login_attempts WHERE locked_until >= now();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'user_id', e.user_id,
        'user_email', e.user_email,
        'url', e.url,
        'resolved', e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_recent
  FROM (
    SELECT id, event_type, severity, title, message, user_id, user_email,
           url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'resolved', e.resolved,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_unresolved
  FROM (
    SELECT id, event_type, severity, title, message, resolved, created_at
    FROM admin_events
    WHERE resolved = FALSE
      AND severity IN ('critical', 'error')
    ORDER BY created_at DESC
    LIMIT 20
  ) e;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'metadata', e.metadata,
        'user_id', e.user_id,
        'user_email', e.user_email,
        'url', e.url,
        'resolved', e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_error_only
  FROM (
    SELECT id, event_type, severity, title, message, metadata, user_id,
           user_email, url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    WHERE event_type = 'error'
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  BEGIN
    v_admin_event_summary := COALESCE(public.get_admin_event_summary(7), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_admin_event_summary := NULL;
  END;

  RETURN jsonb_build_object(
    'error_logs', jsonb_build_object(
      'recent', v_error_logs_recent,
      'total_7d', v_error_logs_total_7d,
      'critical_7d', v_error_logs_critical_7d,
      'count_24h', v_error_logs_count_24h
    ),
    'error_summary', v_error_summary,
    'audit_log', jsonb_build_object(
      'recent', v_audit_recent,
      'total_7d', v_audit_total_7d
    ),
    'login_security', jsonb_build_object(
      'recent', v_login_recent,
      'locked_count', v_login_locked_count
    ),
    'admin_events', jsonb_build_object(
      'recent', v_admin_events_recent,
      'unresolved_critical', v_admin_events_unresolved,
      'error_only', v_admin_events_error_only,
      'summary', v_admin_event_summary
    )
  );
END;
$$;


--
-- Name: FUNCTION get_admin_errors_rollup(p_ago7d timestamp with time zone, p_ago24h timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_errors_rollup(p_ago7d timestamp with time zone, p_ago24h timestamp with time zone) IS 'Slice B / C6 — rollup of error_logs + audit_log + login_attempts + admin_events. Wraps get_error_summary and get_admin_event_summary with exception handlers so their failure degrades gracefully (TS sets errorSummaryDegraded / adminEventSummaryDegraded flags).';


--
-- Name: get_admin_event_summary(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_event_summary(p_days_back integer DEFAULT 7) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  cutoff timestamptz := now() - (p_days_back || ' days')::interval;
  result jsonb;
BEGIN
  WITH
    totals AS (
      SELECT
        count(*)                                                   AS total_events,
        count(*) FILTER (WHERE severity::text = 'error')           AS error_count,
        count(*) FILTER (WHERE severity::text = 'critical')        AS critical_count,
        count(*) FILTER (WHERE NOT resolved)                       AS unresolved_count
      FROM admin_events
      WHERE created_at >= cutoff
    ),
    by_type AS (
      SELECT coalesce(jsonb_object_agg(event_type, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT event_type, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY event_type
      ) t
    ),
    by_severity AS (
      SELECT coalesce(jsonb_object_agg(severity::text, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT severity, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY severity
      ) t
    ),
    by_day AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('date', d::text, 'count', coalesce(dc.cnt, 0))
          ORDER BY d
        ),
        '[]'::jsonb
      ) AS j
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT created_at::date AS day, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY 1
      ) dc ON dc.day = d
    )
  SELECT jsonb_build_object(
    'total_events',      totals.total_events,
    'error_count',       totals.error_count,
    'critical_count',    totals.critical_count,
    'unresolved_count',  totals.unresolved_count,
    'events_by_type',    by_type.j,
    'events_by_severity',by_severity.j,
    'events_by_day',     by_day.j
  )
  INTO result
  FROM totals, by_type, by_severity, by_day;

  RETURN result;
END;
$$;


--
-- Name: get_admin_feature_adoption_rollup(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_feature_adoption_rollup(p_ago30d timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '30s'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'generatedAt',   now(),
    'qualifiers', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_qualifiers),
      'last30d',  (SELECT COUNT(*)::int FROM golf_qualifiers  WHERE created_at >= p_ago30d)
    ),
    'events', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_events),
      'last30d',  (SELECT COUNT(*)::int FROM golf_events       WHERE created_at >= p_ago30d)
    ),
    'tasks', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_tasks),
      'last30d',  (SELECT COUNT(*)::int FROM golf_tasks        WHERE created_at >= p_ago30d)
    ),
    'announcements', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_announcements),
      'last30d',  (SELECT COUNT(*)::int FROM golf_announcements WHERE created_at >= p_ago30d)
    ),
    'messages', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_messages),
      'last30d',  (SELECT COUNT(*)::int FROM golf_messages     WHERE created_at >= p_ago30d)
    ),
    'documents', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_documents),
      'last30d',  (SELECT COUNT(*)::int FROM golf_documents    WHERE created_at >= p_ago30d)
    ),
    'travel', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_travel_itineraries),
      'last30d',  (SELECT COUNT(*)::int FROM golf_travel_itineraries WHERE created_at >= p_ago30d)
    )
  );
END;
$$;


--
-- Name: get_admin_rounds_rollup(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_rounds_rollup(p_today timestamp with time zone, p_ago24h timestamp with time zone, p_ago7d timestamp with time zone, p_ago14d timestamp with time zone, p_ago30d timestamp with time zone, p_ago60d timestamp with time zone, p_ago12w timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '30s'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      -- Active-user distinct sets (health.activeUsers{24h,7d,30d}).
      active_24h AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago24h
      ),
      active_7d AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago7d
      ),
      active_30d AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago30d
      ),
      -- Churn window: player sets active in [30d, 60d) vs [0, 30d).
      active_30_60 AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL
          AND created_at >= p_ago60d
          AND created_at <  p_ago30d
      ),
      -- Window + total counts.
      window_counts AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)                      AS rounds_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago14d
                             AND created_at <  p_ago7d)                     AS rounds_last_week,
          COUNT(*) FILTER (WHERE created_at >= p_today)                      AS rounds_today,
          COUNT(*)                                                           AS total_rounds,
          COUNT(*) FILTER (WHERE status = 'completed')                       AS completed_rounds,
          COUNT(*) FILTER (WHERE total_score IS NOT NULL)                    AS verified_rounds,
          MAX(created_at)                                                    AS last_round_at
        FROM golf_rounds
      ),
      -- Weekly/type breakdown over last 12 weeks.
      by_week_type AS (
        SELECT
          date_trunc('week', created_at) AS week_start,
          COALESCE(round_type, 'unknown') AS round_type,
          COUNT(*)                        AS cnt
        FROM golf_rounds
        WHERE created_at >= p_ago12w
        GROUP BY 1, 2
      ),
      rounds_by_type AS (
        SELECT
          COALESCE(
            jsonb_object_agg(round_type, total),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT round_type, SUM(cnt)::int AS total
          FROM by_week_type
          GROUP BY round_type
        ) t
      ),
      rounds_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(week_start, 'YYYY-MM-DD'),
                'count', weekly_cnt
              )
              ORDER BY week_start ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT week_start, SUM(cnt)::int AS weekly_cnt
          FROM by_week_type
          GROUP BY week_start
        ) t
      ),
      -- Per-team rounds this week (team_id may be NULL — preserved for TS).
      team_rounds_this_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'team_id',   team_id,
                'player_id', player_id
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT team_id, player_id
          FROM golf_rounds
          WHERE created_at >= p_ago7d
        ) t
      ),
      -- Completed-round scoring distribution (raw total_score list, TS buckets).
      scoring_dist AS (
        SELECT
          COALESCE(
            jsonb_agg(total_score),
            '[]'::jsonb
          ) AS arr
        FROM golf_rounds
        WHERE status = 'completed' AND total_score IS NOT NULL
      ),
      -- Best recent rounds: top 5 by score_to_par ASC among completed.
      best_rounds AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'total_score',  r.total_score,
                'score_to_par', r.score_to_par,
                'course_name',  r.course_name,
                'round_date',   r.round_date,
                'golf_players', CASE
                  WHEN p.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'first_name', p.first_name,
                    'last_name',  p.last_name
                  )
                END
              )
              ORDER BY r.score_to_par ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, player_id, total_score, score_to_par, course_name, round_date
          FROM golf_rounds
          WHERE status = 'completed' AND total_score IS NOT NULL
          ORDER BY score_to_par ASC NULLS LAST
          LIMIT 5
        ) r
        LEFT JOIN golf_players p ON p.id = r.player_id
      ),
      -- Most recent 10 rounds (for activity.recentRounds).
      recent_rounds AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',            r.id,
                'total_score',   r.total_score,
                'score_to_par',  r.score_to_par,
                'round_type',    r.round_type,
                'course_name',   r.course_name,
                'created_at',    r.created_at,
                'golf_players',  CASE
                  WHEN p.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'first_name', p.first_name,
                    'last_name',  p.last_name
                  )
                END
              )
              ORDER BY r.created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, player_id, total_score, score_to_par, round_type,
                 course_name, created_at
          FROM golf_rounds
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) r
        LEFT JOIN golf_players p ON p.id = r.player_id
      ),
      -- Round-count per player (replaces L2142 full scan).
      player_round_counts AS (
        SELECT
          COALESCE(
            jsonb_object_agg(player_id::text, cnt),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT player_id, COUNT(*)::int AS cnt
          FROM golf_rounds
          WHERE player_id IS NOT NULL
          GROUP BY player_id
        ) t
      ),
      -- Last round per player (replaces L2144 full scan).
      player_last_round AS (
        SELECT
          COALESCE(
            jsonb_object_agg(player_id::text, last_round_at),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT player_id, MAX(created_at) AS last_round_at
          FROM golf_rounds
          WHERE player_id IS NOT NULL
          GROUP BY player_id
        ) t
      ),
      -- Daily rounds over last 30 days (visitsByDay, engagement daily chart).
      rounds_by_day_30d AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'date',        to_char(bucket, 'YYYY-MM-DD'),
                'player_id',   player_id
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('day', created_at) AS bucket, player_id
          FROM golf_rounds
          WHERE created_at >= p_ago30d
        ) t
      ),
      -- Bounded minimal rounds array Slice C consumes (last 12 weeks of
      -- player_id/created_at/team_id triples, ordered DESC).
      all_rounds_minimal AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'player_id',  player_id,
                'created_at', created_at,
                'team_id',    team_id
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT player_id, created_at, team_id
          FROM golf_rounds
          WHERE created_at >= p_ago12w
            AND player_id IS NOT NULL
        ) t
      )

    SELECT jsonb_build_object(
      'generatedAt',            now(),
      'activeUsers24h',         (SELECT COUNT(*)::int FROM active_24h),
      'activeUsers7d',          (SELECT COUNT(*)::int FROM active_7d),
      'activeUsers30d',         (SELECT COUNT(*)::int FROM active_30d),
      'playerSetActive30d',     COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_30d),
                                  '[]'::jsonb
                                ),
      'playerSetActive30_60d',  COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_30_60),
                                  '[]'::jsonb
                                ),
      'playersThisWeek',        COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_7d),
                                  '[]'::jsonb
                                ),
      'roundsThisWeek',         (SELECT rounds_this_week  FROM window_counts),
      'roundsLastWeek',         (SELECT rounds_last_week  FROM window_counts),
      'roundsToday',            (SELECT rounds_today      FROM window_counts),
      'totalRounds',            (SELECT total_rounds      FROM window_counts),
      'completedRounds',        (SELECT completed_rounds  FROM window_counts),
      'verifiedRounds',         (SELECT verified_rounds   FROM window_counts),
      'lastRoundAt',            (SELECT last_round_at     FROM window_counts),
      'roundsByType',           (SELECT obj FROM rounds_by_type),
      'roundsByWeek',           (SELECT arr FROM rounds_by_week),
      'teamRoundsThisWeek',     (SELECT arr FROM team_rounds_this_week),
      'scoringDistribution',    (SELECT arr FROM scoring_dist),
      'recentBestRounds',       (SELECT arr FROM best_rounds),
      'recentRounds',           (SELECT arr FROM recent_rounds),
      'playerRoundCounts',      (SELECT obj FROM player_round_counts),
      'playerLastRound',        (SELECT obj FROM player_last_round),
      'roundsByDay30d',         (SELECT arr FROM rounds_by_day_30d),
      'allRoundsMinimal',       (SELECT arr FROM all_rounds_minimal)
    )
  );
END;
$$;


--
-- Name: get_admin_teams_scoring_rollup(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_teams_scoring_rollup(p_ago7d timestamp with time zone DEFAULT (now() - '7 days'::interval)) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_teams                    jsonb := '[]'::jsonb;
  v_team_members             jsonb := '[]'::jsonb;
  v_team_rounds_week         jsonb := '[]'::jsonb;
  v_player_stats_top50       jsonb := '[]'::jsonb;
  v_player_team_map          jsonb := '[]'::jsonb;
  v_coach_orgs               jsonb := '[]'::jsonb;
  v_scoring_distribution     jsonb := '[]'::jsonb;
  v_recent_best_rounds       jsonb := '[]'::jsonb;
  v_strokes_gained           jsonb := NULL;
  v_stats_cache_last_updated text  := NULL;
  v_demo_total               bigint := 0;
  v_demo_pending             bigint := 0;
  v_demo_recent              jsonb := '[]'::jsonb;
  v_announcements_total      bigint := 0;
  v_ack_count                bigint := 0;
  v_messages_total           bigint := 0;
  v_conversations_total      bigint := 0;
  v_attendance_pcts          jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  -- Teams + org name
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',              t.id,
        'name',            t.name,
        'organization_id', t.organization_id,
        'org_name',        o.name
      )
      ORDER BY t.name
    ),
    '[]'::jsonb
  )
  INTO v_teams
  FROM golf_teams t
  LEFT JOIN organizations o ON o.id = t.organization_id;

  -- Active team members joined to player name
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id',    m.team_id,
        'player_id',  m.player_id,
        'first_name', p.first_name,
        'last_name',  p.last_name
      )
    ),
    '[]'::jsonb
  )
  INTO v_team_members
  FROM golf_team_members m
  LEFT JOIN golf_players p ON p.id = m.player_id
  WHERE m.status = 'active';

  -- player_id ↔ team (for team-name resolution on topPerformers / directory)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id', m.player_id,
        'team_id',   t.id,
        'team_name', t.name
      )
    ),
    '[]'::jsonb
  )
  INTO v_player_team_map
  FROM golf_team_members m
  JOIN golf_teams t ON t.id = m.team_id
  WHERE m.status = 'active';

  -- Rounds this week per team (raw rows — TS bucketizes)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id', r.player_id,
        'team_id',   r.team_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_team_rounds_week
  FROM golf_rounds r
  WHERE r.created_at >= p_ago7d;

  -- Top 50 performers by scoring_average (with player name)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id',                    s.player_id,
        'scoring_average',              s.scoring_average,
        'driving_accuracy_percentage',  s.driving_accuracy_percentage,
        'gir_percentage',               s.gir_percentage,
        'putts_per_round',              s.putts_per_round,
        'rounds_played',                s.rounds_played,
        'first_name',                   p.first_name,
        'last_name',                    p.last_name
      )
      ORDER BY s.scoring_average ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_player_stats_top50
  FROM (
    SELECT player_id, scoring_average, driving_accuracy_percentage,
           gir_percentage, putts_per_round, rounds_played
    FROM golf_player_stats_cache
    WHERE scoring_average IS NOT NULL
    ORDER BY scoring_average ASC
    LIMIT 50
  ) s
  LEFT JOIN golf_players p ON p.id = s.player_id;

  -- Coach organization ids (for team.coachCount resolution)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('organization_id', c.organization_id)),
    '[]'::jsonb
  )
  INTO v_coach_orgs
  FROM golf_coaches c
  WHERE c.organization_id IS NOT NULL;

  -- Scoring distribution: raw total_score rows (TS bucketizes)
  SELECT COALESCE(
    jsonb_agg(r.total_score),
    '[]'::jsonb
  )
  INTO v_scoring_distribution
  FROM golf_rounds r
  WHERE r.total_score IS NOT NULL
    AND r.status = 'completed';

  -- Recent 5 best rounds
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'total_score',  r.total_score,
        'score_to_par', r.score_to_par,
        'course_name',  r.course_name,
        'round_date',   r.round_date,
        'first_name',   p.first_name,
        'last_name',    p.last_name
      )
      ORDER BY r.score_to_par ASC
    ),
    '[]'::jsonb
  )
  INTO v_recent_best_rounds
  FROM (
    SELECT player_id, total_score, score_to_par, course_name, round_date
    FROM golf_rounds
    WHERE total_score IS NOT NULL
      AND status = 'completed'
    ORDER BY score_to_par ASC
    LIMIT 5
  ) r
  LEFT JOIN golf_players p ON p.id = r.player_id;

  -- Platform strokes-gained averages (single pass)
  SELECT jsonb_build_object(
    'sg_total',        AVG(strokes_gained_total),
    'sg_tee',          AVG(strokes_gained_tee),
    'sg_approach',     AVG(strokes_gained_approach),
    'sg_around_green', AVG(strokes_gained_around_green),
    'sg_putting',      AVG(strokes_gained_putting)
  )
  INTO v_strokes_gained
  FROM golf_player_stats_cache
  WHERE strokes_gained_total IS NOT NULL;

  -- Stats cache last updated (single row)
  SELECT MAX(updated_at)::text INTO v_stats_cache_last_updated
  FROM golf_player_stats_cache;

  -- Demo requests: total + pending + recent 10
  SELECT COUNT(*)::bigint INTO v_demo_total FROM demo_requests;
  SELECT COUNT(*)::bigint INTO v_demo_pending
    FROM demo_requests WHERE status = 'pending';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name',          d.name,
        'email',         d.email,
        'organization',  d.organization,
        'interest_type', d.interest_type,
        'status',        d.status,
        'created_at',    d.created_at
      )
      ORDER BY d.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_demo_recent
  FROM (
    SELECT name, email, organization, interest_type, status, created_at
    FROM demo_requests
    ORDER BY created_at DESC
    LIMIT 10
  ) d;

  -- Golf communication counts
  SELECT COUNT(*)::bigint INTO v_announcements_total FROM golf_announcements;
  SELECT COUNT(*)::bigint INTO v_ack_count FROM golf_announcement_acknowledgements;
  SELECT COUNT(*)::bigint INTO v_messages_total FROM golf_messages;
  SELECT COUNT(*)::bigint INTO v_conversations_total FROM golf_conversations;

  -- Attendance percentages (if table present)
  IF to_regclass('public.golf_attendance_summary') IS NOT NULL THEN
    EXECUTE $q$SELECT COALESCE(jsonb_agg(attendance_percentage), '[]'::jsonb)
              FROM golf_attendance_summary
              WHERE attendance_percentage IS NOT NULL$q$
      INTO v_attendance_pcts;
  END IF;

  RETURN jsonb_build_object(
    'teams',                    v_teams,
    'team_members',             v_team_members,
    'team_rounds_week',         v_team_rounds_week,
    'player_stats_top50',       v_player_stats_top50,
    'player_team_map',          v_player_team_map,
    'coach_orgs',               v_coach_orgs,
    'scoring_distribution',     v_scoring_distribution,
    'recent_best_rounds',       v_recent_best_rounds,
    'strokes_gained',           v_strokes_gained,
    'stats_cache_last_updated', v_stats_cache_last_updated,
    'demo_requests', jsonb_build_object(
      'total',   v_demo_total,
      'pending', v_demo_pending,
      'recent',  v_demo_recent
    ),
    'golf_communication', jsonb_build_object(
      'total_announcements', v_announcements_total,
      'ack_count',           v_ack_count,
      'total_messages',      v_messages_total,
      'total_conversations', v_conversations_total
    ),
    'attendance_percentages', v_attendance_pcts
  );
END;
$_$;


--
-- Name: FUNCTION get_admin_teams_scoring_rollup(p_ago7d timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_teams_scoring_rollup(p_ago7d timestamp with time zone) IS 'Slice B / C7 — single rollup for teams, rosters, scoring, strokes-gained, demo_requests and golf_communication admin-dashboard data.';


--
-- Name: get_admin_users_rollup(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_users_rollup(p_ago7d timestamp with time zone, p_ago14d timestamp with time zone, p_ago30d timestamp with time zone, p_ago12w timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '30s'
    AS $$
DECLARE
  -- Cohort boundaries: weeks 1..4 back from now. Week N covers the 7-day
  -- bucket that starts N*7 days ago and ends (N-1)*7 days ago.
  v_w4_start timestamptz := now() - interval '28 days';
  v_w4_end   timestamptz := now() - interval '21 days';
  v_w3_start timestamptz := now() - interval '21 days';
  v_w3_end   timestamptz := now() - interval '14 days';
  v_w2_start timestamptz := now() - interval '14 days';
  v_w2_end   timestamptz := now() - interval '7 days';
  v_w1_start timestamptz := now() - interval '7 days';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      user_counts AS (
        SELECT
          COUNT(*)::int                                                AS total_platform_users,
          COUNT(*) FILTER (WHERE role = 'admin')::int                  AS total_admins,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int           AS new_users_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago14d
                            AND created_at <  p_ago7d)::int            AS new_users_last_week
        FROM users
      ),
      signups_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM users
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      signups_by_day_30d AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'date',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('day', created_at) AS bucket,
                 COUNT(*)::int                  AS cnt
          FROM users
          WHERE created_at >= p_ago30d
          GROUP BY 1
        ) t
      ),
      coach_counts AS (
        SELECT
          COUNT(*)::int                                           AS total_coaches,
          COUNT(*) FILTER (WHERE onboarding_completed IS TRUE)::int AS coaches_onboarded
        FROM golf_coaches
      ),
      player_counts AS (
        SELECT
          COUNT(*)::int                                           AS total_players,
          COUNT(*) FILTER (WHERE onboarding_completed IS TRUE)::int AS players_onboarded,
          COUNT(*) FILTER (WHERE onboarding_completed IS NOT TRUE)::int AS players_pending
        FROM golf_players
      ),
      active_teams AS (
        SELECT
          COUNT(DISTINCT team_id)::int AS active_team_count
        FROM golf_team_members
        WHERE status = 'active'
      ),
      players_by_year AS (
        SELECT
          COALESCE(
            jsonb_object_agg(year_key, cnt),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT
            COALESCE(graduation_year::text, 'unknown') AS year_key,
            COUNT(*)::int                              AS cnt
          FROM golf_players
          GROUP BY 1
        ) t
      ),
      -- playersByStatus embeds graduation_year per-member so the TS layer can
      -- rebuild the status→graduation breakdown (matches the shape at L1644).
      players_by_status AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'status',          tm.status::text,
                'graduation_year', p.graduation_year
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_team_members tm
        LEFT JOIN golf_players p ON p.id = tm.player_id
        WHERE tm.status IS NOT NULL
      ),
      -- Latest 10 signups for activity.recentSignups.
      latest_signups AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         id,
                'email',      email,
                'role',       role,
                'created_at', created_at
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, email, role, created_at
          FROM users
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      -- Cohort retention: users who signed up in each of the last 4 weeks.
      cohort_w1 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w1_start
      ),
      cohort_w2 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w2_start AND created_at <= v_w2_end
      ),
      cohort_w3 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w3_start AND created_at <= v_w3_end
      ),
      cohort_w4 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w4_start AND created_at <= v_w4_end
      ),
      -- Directory: full users list ordered by created_at DESC.
      users_for_directory AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         id,
                'email',      email,
                'role',       role,
                'created_at', created_at,
                'last_seen',  last_seen
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM users
      ),
      -- Player detail map (id → id/user_id/name/grad/onboard).
      player_map AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                   id,
                'user_id',              user_id,
                'first_name',           first_name,
                'last_name',            last_name,
                'graduation_year',      graduation_year,
                'onboarding_completed', onboarding_completed
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_players
      ),
      -- Coach detail map.
      coach_map AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                   id,
                'user_id',              user_id,
                'full_name',            full_name,
                'email',                email,
                'organization_id',      organization_id,
                'onboarding_completed', onboarding_completed
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_coaches
      )

    SELECT jsonb_build_object(
      'generatedAt',          now(),
      'totalPlatformUsers',   (SELECT total_platform_users FROM user_counts),
      'totalAdmins',          (SELECT total_admins         FROM user_counts),
      'newUsersThisWeek',     (SELECT new_users_this_week  FROM user_counts),
      'newUsersLastWeek',     (SELECT new_users_last_week  FROM user_counts),
      'totalCoaches',         (SELECT total_coaches        FROM coach_counts),
      'coachesOnboarded',     (SELECT coaches_onboarded    FROM coach_counts),
      'totalPlayers',         (SELECT total_players        FROM player_counts),
      'playersOnboarded',     (SELECT players_onboarded    FROM player_counts),
      'playersPending',       (SELECT players_pending      FROM player_counts),
      'activeTeamCount',      (SELECT active_team_count    FROM active_teams),
      'signupsByWeek',        (SELECT arr FROM signups_by_week),
      'signupsByDay30d',      (SELECT arr FROM signups_by_day_30d),
      'playersByYear',        (SELECT obj FROM players_by_year),
      'playersByStatus',      (SELECT arr FROM players_by_status),
      'latestSignups',        (SELECT arr FROM latest_signups),
      'cohortWeeks', jsonb_build_object(
        'w1', (SELECT ids FROM cohort_w1),
        'w2', (SELECT ids FROM cohort_w2),
        'w3', (SELECT ids FROM cohort_w3),
        'w4', (SELECT ids FROM cohort_w4)
      ),
      'usersForDirectory',    (SELECT arr FROM users_for_directory),
      'playerMap',            (SELECT arr FROM player_map),
      'coachMap',             (SELECT arr FROM coach_map)
    )
  );
END;
$$;


--
-- Name: get_api_performance_summary(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_api_performance_summary(days_back integer DEFAULT 7) RETURNS TABLE(route text, total_requests integer, total_errors integer, error_rate numeric, avg_ms integer, p50_ms integer, p95_ms integer, p99_ms integer)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.route,
    SUM(a.request_count)::INT,
    SUM(a.error_count)::INT,
    ROUND(SUM(a.error_count)::NUMERIC / NULLIF(SUM(a.request_count), 0) * 100, 2),
    ROUND(AVG(a.avg_duration_ms))::INT,
    ROUND(AVG(a.p50_ms))::INT,
    ROUND(AVG(a.p95_ms))::INT,
    ROUND(AVG(a.p99_ms))::INT
  FROM api_call_logs a
  WHERE a.recorded_at >= now() - (days_back || ' days')::interval
  GROUP BY a.route
  ORDER BY SUM(a.request_count) DESC;
END;
$$;


--
-- Name: get_audit_log_recent(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_audit_log_recent(limit_count integer DEFAULT 50) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(a), '[]'::json) INTO result
  FROM (
    SELECT
      al.id,
      al.user_id,
      al.action,
      al.table_name,
      al.record_id,
      al.old_data,
      al.new_data,
      al.ip_address,
      al.created_at,
      u.email as user_email
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT limit_count
  ) a;
  
  RETURN result;
END;
$$;


--
-- Name: get_baseball_conversations_with_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_baseball_conversations_with_details(p_user_id uuid) RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, creator_id text, last_message_content text, last_message_at timestamp with time zone, last_message_sender_id uuid, unread_count bigint, participant_ids uuid[], participant_names text[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by::text AS creator_id,
    (SELECT m.content FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.sender_id FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT COUNT(*) FROM baseball_messages m WHERE m.conversation_id = c.id AND m.read = FALSE AND m.sender_id != p_user_id),
    ARRAY(SELECT cp2.user_id FROM baseball_conversation_participants cp2 WHERE cp2.conversation_id = c.id),
    ARRAY(SELECT COALESCE(u.email, 'Unknown') FROM baseball_conversation_participants cp2 JOIN users u ON u.id = cp2.user_id WHERE cp2.conversation_id = c.id)
  FROM baseball_conversations c
  JOIN baseball_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = p_user_id
  ORDER BY c.updated_at DESC;
END;
$$;


--
-- Name: get_coach_effectiveness_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coach_effectiveness_metrics() RETURNS TABLE(coach_id uuid, coach_name text, team_count integer, player_count integer, reviews_published integer, avg_review_time_hours numeric, has_philosophy boolean, effectiveness_score numeric)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.full_name,
    COUNT(DISTINCT t.id)::INT,
    COUNT(DISTINCT tm.player_id)::INT,
    COUNT(DISTINCT grr.id)::INT,
    ROUND(AVG(EXTRACT(EPOCH FROM (grr.created_at - gr.created_at)) / 3600)::NUMERIC, 1),
    EXISTS(SELECT 1 FROM golf_coach_philosophy gcp WHERE gcp.coach_id = gc.id),
    ROUND(
      (LEAST(COUNT(DISTINCT grr.id)::NUMERIC / NULLIF(COUNT(DISTINCT gr.id), 0), 1) * 40) +
      (CASE WHEN EXISTS(SELECT 1 FROM golf_coach_philosophy gcp WHERE gcp.coach_id = gc.id) THEN 30 ELSE 0 END) +
      (LEAST(COUNT(DISTINCT tm.player_id)::NUMERIC / 10, 1) * 30)
    , 1)
  FROM golf_coaches gc
  LEFT JOIN organizations o ON o.id = gc.organization_id
  LEFT JOIN golf_teams t ON t.organization_id = o.id
  LEFT JOIN golf_team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  LEFT JOIN golf_rounds gr ON gr.player_id = tm.player_id AND gr.created_at >= now() - interval '30 days'
  LEFT JOIN golf_round_reviews grr ON grr.round_id = gr.id AND grr.published_by = gc.id
  GROUP BY gc.id, gc.full_name;
END;
$$;


--
-- Name: get_coach_today_schedule(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coach_today_schedule(p_team_id uuid, p_today_start timestamp with time zone, p_today_end timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM golf_coaches gc
    JOIN golf_teams   gt ON gt.organization_id = gc.organization_id
    WHERE gc.user_id = auth.uid()
      AND gt.id = p_team_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH today_events AS (
      SELECT id, title, event_type, start_time, end_time, location
      FROM golf_events
      WHERE team_id = p_team_id
        AND start_time >= p_today_start
        AND start_time <  p_today_end
      ORDER BY start_time ASC
      LIMIT 10
    ),
    counts AS (
      SELECT a.event_id,
             count(*) FILTER (WHERE a.status IN ('attending','yes')) AS yes_count,
             count(*)::int                                            AS total_count
      FROM golf_event_attendance a
      WHERE a.event_id IN (SELECT id FROM today_events)
      GROUP BY a.event_id
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',         e.id,
          'title',      e.title,
          'event_type', e.event_type,
          'start_time', e.start_time,
          'end_time',   e.end_time,
          'location',   e.location,
          'rsvp_yes',   COALESCE(c.yes_count, 0),
          'rsvp_total', COALESCE(c.total_count, 0)
        )
        ORDER BY e.start_time ASC
      ),
      '[]'::jsonb
    )
    FROM today_events e
    LEFT JOIN counts c ON c.event_id = e.id
  );
END;
$$;


--
-- Name: FUNCTION get_coach_today_schedule(p_team_id uuid, p_today_start timestamp with time zone, p_today_end timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_coach_today_schedule(p_team_id uuid, p_today_start timestamp with time zone, p_today_end timestamp with time zone) IS 'Returns today''s events for a team with RSVP yes/total counts joined. Replaces 2-round-trip waterfall in dashboard-data.ts.';


--
-- Name: get_crm_click_destinations(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_crm_click_destinations(p_window text DEFAULT '30d'::text, p_limit integer DEFAULT 25) RETURNS TABLE(clicked_url text, click_count integer, unique_recipients integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  )
  SELECT clicked_url, COUNT(*)::int, COUNT(DISTINCT recipient_email)::int
  FROM email_clicks WHERE occurred_at >= (SELECT since FROM window_days) AND clicked_url IS NOT NULL AND clicked_url <> ''
  GROUP BY clicked_url ORDER BY 2 DESC LIMIT GREATEST(p_limit, 1);
$$;


--
-- Name: get_crm_coach_email_events(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_crm_coach_email_events(p_coach_id uuid) RETURNS TABLE(id uuid, event_type text, subject text, occurred_at timestamp with time zone, recipient_email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    ee.id,
    ee.event_type::text,
    cl.subject,
    ee.occurred_at,
    ee.recipient_email
  FROM crm_email_events ee
  JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
  WHERE cl.coach_id = p_coach_id
  ORDER BY ee.occurred_at DESC;
$$;


--
-- Name: get_crm_email_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_crm_email_stats() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total_sent', (SELECT count(*) FROM crm_contact_log WHERE resend_message_id IS NOT NULL),
      'delivered',  (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.delivered'),
      'opened',     (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.opened'),
      'clicked',    (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.clicked'),
      'bounced',    (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.bounced'),
      'complained', (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.complained')
    )
  );
END;
$$;


--
-- Name: get_crm_email_stats_detailed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_crm_email_stats_detailed() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totals', (
      SELECT json_build_object(
        'sent', COUNT(*) FILTER (WHERE event_type = 'email.sent'),
        'delivered', COUNT(*) FILTER (WHERE event_type = 'email.delivered'),
        'opened', COUNT(*) FILTER (WHERE event_type = 'email.opened'),
        'clicked', COUNT(*) FILTER (WHERE event_type = 'email.clicked'),
        'bounced', COUNT(*) FILTER (WHERE event_type = 'email.bounced'),
        'complained', COUNT(*) FILTER (WHERE event_type = 'email.complained')
      )
      FROM crm_email_events
    ),
    'recent_events', (
      SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
      FROM (
        SELECT ee.id, ee.event_type, cl.subject, ee.occurred_at, ee.recipient_email,
               c.name AS coach_name, c.school
        FROM crm_email_events ee
        LEFT JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
        LEFT JOIN crm_coaches c ON c.id = cl.coach_id
        ORDER BY ee.occurred_at DESC
        LIMIT 50
      ) r
    ),
    'bounced_coaches', (
      SELECT COALESCE(json_agg(row_to_json(b)), '[]'::json)
      FROM (
        SELECT c.id, c.name, c.email, c.school, c.email_status
        FROM crm_coaches c
        WHERE c.email_status IN ('bounced', 'complained')
        ORDER BY c.updated_at DESC
      ) b
    )
  ) INTO result;
  RETURN result;
END;
$$;


--
-- Name: get_crm_events_in_range(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_crm_events_in_range(p_start timestamp with time zone, p_end timestamp with time zone) RETURNS TABLE(id uuid, title text, description text, event_type public.crm_event_type, start_time timestamp with time zone, end_time timestamp with time zone, all_day boolean, location text, meeting_url text, coach_id uuid, coach_name text, coach_school text, status text, google_event_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY SELECT
    e.id, e.title, e.description, e.event_type,
    e.start_time, e.end_time, e.all_day, e.location, e.meeting_url,
    e.coach_id, c.name as coach_name, c.school as coach_school,
    e.status, e.google_event_id
  FROM crm_events e
  LEFT JOIN crm_coaches c ON c.id = e.coach_id
  WHERE e.start_time >= p_start AND e.start_time < p_end
  ORDER BY e.start_time;
END;
$$;


--
-- Name: get_crm_template_performance(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_crm_template_performance(p_window text DEFAULT '30d'::text) RETURNS TABLE(template_id uuid, template_name text, sent_count integer, delivered_count integer, opened_count integer, clicked_count integer, bounced_count integer, open_rate numeric, click_rate numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  ),
  template_logs AS (
    SELECT t.id AS template_id, t.name AS template_name, cl.id AS contact_log_id
    FROM crm_email_templates t
    JOIN crm_contact_log cl ON cl.subject = t.subject
    WHERE cl.contact_date >= (SELECT since FROM window_days) AND cl.contact_type = 'email'
  )
  SELECT tl.template_id, tl.template_name,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.delivered'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.opened'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.clicked'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.bounced'))::int,
    NULL::numeric, NULL::numeric
  FROM template_logs tl GROUP BY tl.template_id, tl.template_name ORDER BY 3 DESC;
$$;


--
-- Name: get_crm_time_to_open(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_crm_time_to_open(p_window text DEFAULT '30d'::text) RETURNS TABLE(bucket_min integer, bucket_max integer, count integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  ),
  paired AS (
    SELECT sent.contact_log_id, EXTRACT(EPOCH FROM (MIN(opened.occurred_at) - sent.occurred_at)) AS seconds_to_open
    FROM email_events sent
    JOIN email_events opened ON opened.contact_log_id = sent.contact_log_id AND opened.event_type = 'email.opened' AND opened.occurred_at > sent.occurred_at
    WHERE sent.event_type = 'email.sent' AND sent.occurred_at >= (SELECT since FROM window_days)
    GROUP BY sent.contact_log_id, sent.occurred_at
  ),
  bucketed AS (
    SELECT CASE WHEN seconds_to_open < 60 THEN '0-60' WHEN seconds_to_open < 600 THEN '60-600' WHEN seconds_to_open < 3600 THEN '600-3600' WHEN seconds_to_open < 14400 THEN '3600-14400' WHEN seconds_to_open < 86400 THEN '14400-86400' ELSE '86400+' END AS bucket FROM paired
  )
  SELECT (split_part(bucket, '-', 1))::int, CASE WHEN bucket = '86400+' THEN 999999 ELSE (split_part(bucket, '-', 2))::int END, COUNT(*)::int
  FROM bucketed GROUP BY bucket ORDER BY 1;
$$;


--
-- Name: get_current_golf_player_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_golf_player_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM golf_players WHERE user_id = auth.uid() LIMIT 1
$$;


--
-- Name: get_current_player_team_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_player_team_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT gtm.team_id 
  FROM golf_team_members gtm
  JOIN golf_players gp ON gp.id = gtm.player_id
  WHERE gp.user_id = auth.uid()
  AND gtm.status = 'active'
$$;


--
-- Name: get_db_telemetry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_db_telemetry() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_role text;
  v_caller uuid;
  v_active int;
  v_idle int;
  v_db_size bigint;
  v_top_tables jsonb;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    v_caller := auth.uid();
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT role::text INTO v_role
    FROM public.users
    WHERE id = v_caller;

    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE state = 'active'),
    COUNT(*) FILTER (WHERE state = 'idle')
  INTO v_active, v_idle
  FROM pg_stat_activity
  WHERE datname = current_database();

  v_db_size := pg_database_size(current_database());

  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_top_tables
  FROM (
    SELECT jsonb_build_object(
      'schema',       n.nspname,
      'table',        c.relname,
      'size_bytes',   pg_total_relation_size(c.oid),
      'row_estimate', GREATEST(c.reltuples::bigint, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND n.nspname NOT LIKE 'pg_toast_temp_%'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 10
  ) sub;

  v_result := jsonb_build_object(
    'connection_pool_active', COALESCE(v_active, 0),
    'connection_pool_idle',   COALESCE(v_idle, 0),
    'db_size_bytes',          COALESCE(v_db_size, 0),
    'top_tables',             COALESCE(v_top_tables, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;


--
-- Name: FUNCTION get_db_telemetry(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_db_telemetry() IS 'Admin-only DB telemetry: connection pool, db size, and top 10 tables by total relation size.';


--
-- Name: get_enhanced_system_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_enhanced_system_health() RETURNS TABLE(metric_name text, metric_value text, status text, detail text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 'db_size'::TEXT, pg_size_pretty(pg_database_size(current_database())), 'ok'::TEXT, ''::TEXT
  UNION ALL
  SELECT 'active_connections', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 80 THEN 'critical' WHEN COUNT(*) > 50 THEN 'warning' ELSE 'ok' END,
    'Max: 100'
  FROM pg_stat_activity WHERE state = 'active'
  UNION ALL
  SELECT 'idle_connections', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 30 THEN 'warning' ELSE 'ok' END, ''
  FROM pg_stat_activity WHERE state = 'idle'
  UNION ALL
  SELECT 'errors_last_hour', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 50 THEN 'critical' WHEN COUNT(*) > 10 THEN 'warning' ELSE 'ok' END, ''
  FROM error_logs WHERE created_at >= now() - interval '1 hour'
  UNION ALL
  SELECT 'failed_logins_today', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 20 THEN 'warning' ELSE 'ok' END, ''
  FROM login_attempts WHERE last_attempt >= CURRENT_DATE AND failed_attempts > 0;
END;
$$;


--
-- Name: get_error_summary(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_error_summary(days_back integer DEFAULT 7) RETURNS TABLE(by_severity jsonb, top_errors jsonb, daily_rate jsonb, total_count bigint, critical_count bigint)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  cutoff timestamptz := now() - (days_back || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH base AS (
    -- Projection trimmed from SELECT * — stack + context JSONB + url are not
    -- used by any downstream aggregate, and pulling them across 70k rows was
    -- the dominant cost.
    SELECT message, severity, user_id, created_at
    FROM error_logs
    WHERE created_at >= cutoff
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('severity', s.severity, 'count', s.cnt))
      FROM (SELECT b.severity, count(*) AS cnt FROM base b GROUP BY b.severity) s
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.cnt DESC)
      FROM (
        SELECT b.message,
               min(b.severity) AS severity,
               count(*)        AS cnt,
               min(b.created_at)::text AS first_seen,
               max(b.created_at)::text AS last_seen,
               count(DISTINCT b.user_id) AS affected_users
        FROM base b
        GROUP BY b.message
        ORDER BY count(*) DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', d::text || 'T00:00:00+00:00', 'count', coalesce(dc.cnt, 0)
      ) ORDER BY d)
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT b.created_at::date AS day, count(*) AS cnt
        FROM base b
        GROUP BY 1
      ) dc ON dc.day = d
    ), '[]'::jsonb),
    (SELECT count(*) FROM base),
    (SELECT count(*) FROM base WHERE base.severity = 'critical');
END;
$$;


--
-- Name: get_golf_conversations_with_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_golf_conversations_with_details(p_user_id uuid) RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, creator_id uuid, last_message_content text, last_message_at timestamp with time zone, last_message_sender_id uuid, unread_count bigint, participant_ids uuid[], participant_names text[], is_group boolean, title text, participant_count bigint, is_team_channel boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by AS creator_id,
    (
      SELECT m.content FROM golf_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_content,
    (
      SELECT m.created_at FROM golf_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_at,
    (
      SELECT m.sender_id FROM golf_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_sender_id,
    (
      SELECT COUNT(*) FROM golf_messages m
      WHERE m.conversation_id = c.id
        AND m.read = FALSE
        AND m.sender_id != p_user_id
    ) AS unread_count,
    ARRAY(
      SELECT cp2.user_id FROM golf_conversation_participants cp2
      WHERE cp2.conversation_id = c.id
    ) AS participant_ids,
    ARRAY(
      SELECT COALESCE(u.email, 'Unknown')
      FROM golf_conversation_participants cp2
      JOIN users u ON u.id = cp2.user_id
      WHERE cp2.conversation_id = c.id
    ) AS participant_names,
    COALESCE(c.is_team_chat, FALSE) AS is_group,
    c.title,
    (
      SELECT COUNT(*) FROM golf_conversation_participants cp2
      WHERE cp2.conversation_id = c.id
    ) AS participant_count,
    COALESCE(c.is_team_channel, FALSE) AS is_team_channel
  FROM golf_conversations c
  JOIN golf_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = p_user_id
  ORDER BY 
    -- Team channels always first
    c.is_team_channel DESC NULLS LAST,
    c.updated_at DESC;
END;
$$;


--
-- Name: FUNCTION get_golf_conversations_with_details(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_golf_conversations_with_details(p_user_id uuid) IS 'Get golf conversations with details including group and team channel metadata';


--
-- Name: get_golf_message_attachments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_golf_message_attachments(p_message_id uuid) RETURNS TABLE(id uuid, file_name text, file_type text, mime_type text, file_size integer, storage_path text, thumbnail_url text, width integer, height integer, duration_seconds integer, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.golf_messages m
      JOIN public.golf_conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = p_message_id
        AND cp.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'not a participant in this conversation'
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
      a.id,
      a.file_name,
      a.file_type,
      a.mime_type,
      a.file_size,
      a.storage_path,
      a.thumbnail_url,
      a.width,
      a.height,
      a.duration_seconds,
      a.created_at
    FROM public.golf_message_attachments a
    WHERE a.message_id = p_message_id
    ORDER BY a.created_at ASC;
  END;
  $$;


--
-- Name: get_my_baseball_conversation_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_baseball_conversation_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT conversation_id FROM baseball_conversation_participants WHERE user_id = auth.uid();
$$;


--
-- Name: get_my_coach_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_coach_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1;
$$;


--
-- Name: get_my_player_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_player_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1;
$$;


--
-- Name: get_onboarding_funnel_analysis(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_onboarding_funnel_analysis() RETURNS TABLE(step_name text, step_order integer, total_count integer, completed_count integer, completion_rate numeric)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  WITH totals AS (
    SELECT COUNT(*)::INT AS total_users FROM users
  ),
  steps AS (
    SELECT 'signed_up' AS sname, 1 AS sorder, (SELECT total_users FROM totals) AS cnt
    UNION ALL
    SELECT 'profile_created', 2, (SELECT COUNT(*)::INT FROM users u WHERE EXISTS (SELECT 1 FROM golf_players gp WHERE gp.user_id = u.id) OR EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.user_id = u.id))
    UNION ALL
    SELECT 'onboarding_completed', 3, (SELECT COUNT(*)::INT FROM users u LEFT JOIN golf_players gp ON gp.user_id = u.id LEFT JOIN golf_coaches gc ON gc.user_id = u.id WHERE COALESCE(gp.onboarding_completed, gc.onboarding_completed, false) = true)
    UNION ALL
    SELECT 'first_round', 4, (SELECT COUNT(DISTINCT player_id)::INT FROM golf_rounds)
    UNION ALL
    SELECT 'active_this_week', 5, (SELECT COUNT(DISTINCT player_id)::INT FROM golf_rounds WHERE created_at >= now() - interval '7 days')
  )
  SELECT
    s.sname,
    s.sorder,
    (SELECT total_users FROM totals),
    s.cnt,
    ROUND(s.cnt::NUMERIC / NULLIF((SELECT total_users FROM totals), 0) * 100, 1)
  FROM steps s
  ORDER BY s.sorder;
END;
$$;


--
-- Name: get_pending_task_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pending_task_reminders() RETURNS TABLE(task_id uuid, team_id uuid, title text, due_date date, reminder_at timestamp with time zone, assigned_to uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as task_id,
    t.team_id,
    t.title,
    t.due_date,
    t.reminder_at,
    t.assigned_to
  FROM golf_tasks t
  WHERE t.reminder_at IS NOT NULL
    AND t.reminder_at <= NOW()
    AND t.reminder_sent = false
    AND t.status != 'completed'
  ORDER BY t.reminder_at ASC;
END;
$$;


--
-- Name: get_platform_health_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_health_stats() RETURNS TABLE(active_users_1h integer, active_users_24h integer, active_users_7d integer, active_users_30d integer, active_sessions integer, total_sessions integer, total_auth_users integer, users_signed_in_today integer, users_never_signed_in integer, db_size_bytes bigint, largest_tables jsonb, active_connections integer, idle_connections integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_1h    TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_24h   TIMESTAMPTZ := NOW() - INTERVAL '24 hours';
  v_7d    TIMESTAMPTZ := NOW() - INTERVAL '7 days';
  v_30d   TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  v_today TIMESTAMPTZ := DATE_TRUNC('day', NOW());
  v_largest jsonb;
BEGIN
  -- Top 5 user tables by total size. Field names match what the admin UI
  -- expects (`table_name`, `size_bytes`, `row_count`) so no TS-side mapping
  -- has to change.
  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_largest
  FROM (
    SELECT jsonb_build_object(
      'table_name', n.nspname || '.' || c.relname,
      'size_bytes', pg_total_relation_size(c.oid),
      'row_count',  GREATEST(c.reltuples::bigint, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND n.nspname NOT LIKE 'pg_toast_temp_%'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 5
  ) sub;

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_1h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_24h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_7d),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_30d),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_1h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NOT NULL),
    (SELECT COUNT(*)::INTEGER FROM users),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_today),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NULL),
    (SELECT pg_database_size(current_database())::BIGINT),
    COALESCE(v_largest, '[]'::jsonb),
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'active' AND datname = current_database()),
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'idle'   AND datname = current_database());
END;
$$;


--
-- Name: get_player_hub_announcements(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_player_hub_announcements(p_team_id uuid, p_player_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1
      FROM golf_players       gp
      JOIN golf_team_members  gtm ON gtm.player_id = gp.id
      WHERE gp.id = p_player_id
        AND gp.user_id = auth.uid()
        AND gtm.team_id = p_team_id
        AND gtm.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM golf_coaches gc
      JOIN golf_teams   gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
        AND gt.id = p_team_id
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH recent AS (
      SELECT *
      FROM golf_announcements
      WHERE team_id = p_team_id
        AND published_at IS NOT NULL
        AND published_at >= (now() - interval '30 days')
      ORDER BY published_at DESC
      LIMIT 10
    ),
    recipients AS (
      SELECT announcement_id,
             count(*)::int                      AS recipient_count,
             bool_or(player_id = p_player_id)   AS player_in_recipients
      FROM golf_announcement_recipients
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    acks AS (
      SELECT announcement_id,
             count(*)::int                      AS ack_count,
             bool_or(player_id = p_player_id)   AS player_acknowledged
      FROM golf_announcement_acknowledgements
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    docs AS (
      SELECT announcement_id, count(*)::int AS doc_count
      FROM golf_announcement_documents
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    task_counts AS (
      SELECT announcement_id, count(*)::int AS task_count
      FROM golf_announcement_tasks
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    visible AS (
      SELECT r.*,
             COALESCE(rp.recipient_count, 0)       AS recipient_count,
             COALESCE(rp.player_in_recipients, FALSE) AS player_in_recipients,
             COALESCE(ak.ack_count, 0)             AS ack_count,
             COALESCE(ak.player_acknowledged, FALSE) AS player_acknowledged,
             COALESCE(d.doc_count, 0)              AS doc_count,
             COALESCE(t.task_count, 0)             AS task_count
      FROM recent r
      LEFT JOIN recipients  rp ON rp.announcement_id = r.id
      LEFT JOIN acks        ak ON ak.announcement_id = r.id
      LEFT JOIN docs        d  ON d.announcement_id  = r.id
      LEFT JOIN task_counts t  ON t.announcement_id  = r.id
      WHERE COALESCE(rp.recipient_count, 0) = 0
         OR COALESCE(rp.player_in_recipients, FALSE)
      ORDER BY r.published_at DESC
      LIMIT 5
    )
    SELECT COALESCE(
      jsonb_agg(
        to_jsonb(v.*)
          - 'player_in_recipients'
          - 'player_acknowledged'
          - 'ack_count'
          - 'doc_count'
          - 'task_count'
          - 'recipient_count'
        || jsonb_build_object(
          'recipient_count',          v.recipient_count,
          'acknowledged_count',       v.ack_count,
          'total_recipients',         v.recipient_count,
          'task_count',               v.task_count,
          'completed_task_count',     0,
          'document_count',           v.doc_count,
          'has_player_acknowledged',  v.player_acknowledged
        )
        ORDER BY v.published_at DESC
      ),
      '[]'::jsonb
    )
    FROM visible v
  );
END;
$$;


--
-- Name: FUNCTION get_player_hub_announcements(p_team_id uuid, p_player_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_player_hub_announcements(p_team_id uuid, p_player_id uuid) IS 'Returns up to 5 player-visible announcements with ack/docs/tasks counts. Replaces 5-query waterfall in getPlayerHubAnnouncements.';


--
-- Name: get_player_hub_events(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_player_hub_events(p_team_id uuid, p_player_id uuid, p_since timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1
      FROM golf_players       gp
      JOIN golf_team_members  gtm ON gtm.player_id = gp.id
      WHERE gp.id = p_player_id
        AND gp.user_id = auth.uid()
        AND gtm.team_id = p_team_id
        AND gtm.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM golf_coaches gc
      JOIN golf_teams   gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
        AND gt.id = p_team_id
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH events AS (
      -- is_mandatory is exposed to the client; not a real column on golf_events.
      SELECT id, title, event_type, start_time, end_time, location
      FROM golf_events
      WHERE team_id = p_team_id
        AND start_time >= p_since
      ORDER BY start_time ASC
      LIMIT 20
    ),
    counts AS (
      SELECT event_id,
             count(*) FILTER (WHERE status IN ('accepted','checked_in')) AS going_count,
             count(*) FILTER (WHERE status = 'tentative')                AS maybe_count
      FROM golf_event_attendance
      WHERE event_id IN (SELECT id FROM events)
      GROUP BY event_id
    ),
    my_rsvp AS (
      SELECT event_id, status
      FROM golf_event_attendance
      WHERE player_id = p_player_id
        AND event_id IN (SELECT id FROM events)
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',           e.id,
          'event_id',     e.id,
          'title',        e.title,
          'event_type',   e.event_type,
          'start_time',   e.start_time,
          'end_time',     e.end_time,
          'location',     e.location,
          'is_mandatory', FALSE,
          'rsvp_status',  (SELECT status FROM my_rsvp WHERE event_id = e.id),
          'going_count',  COALESCE(c.going_count, 0)::int,
          'maybe_count',  COALESCE(c.maybe_count, 0)::int
        )
        ORDER BY e.start_time ASC
      ),
      '[]'::jsonb
    )
    FROM events e
    LEFT JOIN counts c ON c.event_id = e.id
  );
END;
$$;


--
-- Name: FUNCTION get_player_hub_events(p_team_id uuid, p_player_id uuid, p_since timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_player_hub_events(p_team_id uuid, p_player_id uuid, p_since timestamp with time zone) IS 'Returns upcoming events for a team with player RSVP + going/maybe counts joined. Replaces 3-round-trip waterfall in hub/page.tsx.';


--
-- Name: get_player_stats_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_player_stats_summary(p_player_id uuid) RETURNS TABLE(scoring_average numeric, rounds_played integer, best_round integer, worst_round integer, last_5_average numeric, last_10_average numeric, improvement_trend numeric, trend_direction text, gir_percentage numeric, fairway_percentage numeric, putts_per_round numeric, scrambling_percentage numeric, is_stale boolean, last_updated timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    psc.scoring_average,
    psc.rounds_played,
    psc.best_round,
    psc.worst_round,
    psc.last_5_average,
    psc.last_10_average,
    psc.improvement_trend,
    psc.trend_direction,
    psc.gir_percentage,
    psc.driving_accuracy_percentage AS fairway_percentage,
    psc.putts_per_round,
    psc.scrambling_percentage,
    psc.is_stale,
    psc.updated_at AS last_updated
  FROM golf_player_stats_cache psc
  WHERE psc.player_id = p_player_id;
END;
$$;


--
-- Name: FUNCTION get_player_stats_summary(p_player_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_player_stats_summary(p_player_id uuid) IS 'Returns cached player stats summary for instant dashboard loads';


--
-- Name: get_qualifier_leaderboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_qualifier_leaderboard(qualifier_uuid uuid) RETURNS TABLE(player_id uuid, first_name text, last_name text, rounds_played bigint, total_score bigint, avg_score numeric, best_score integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    gqe.player_id,
    gp.first_name,
    gp.last_name,
    COUNT(gr.id) AS rounds_played,
    COALESCE(SUM(gr.total_score), 0)::BIGINT AS total_score,
    CASE WHEN COUNT(gr.id) > 0 THEN ROUND(AVG(gr.total_score)::NUMERIC, 1) ELSE NULL END AS avg_score,
    MIN(gr.total_score) AS best_score
  FROM golf_qualifier_entries gqe
  JOIN golf_players gp ON gp.id = gqe.player_id
  LEFT JOIN golf_rounds gr ON gr.qualifier_id = qualifier_uuid
    AND gr.player_id = gqe.player_id
    AND gr.status = 'completed'
  WHERE gqe.qualifier_id = qualifier_uuid
  GROUP BY gqe.player_id, gp.first_name, gp.last_name
  ORDER BY
    CASE WHEN COUNT(gr.id) > 0 THEN 0 ELSE 1 END,
    COALESCE(SUM(gr.total_score), 0) ASC;
END;
$$;


--
-- Name: get_resend_activity_stats(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_resend_activity_stats(p_window text DEFAULT '7d'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_since timestamptz;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE p_window
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE 'epoch'::timestamptz
  END;

  SELECT jsonb_build_object(
    'window', p_window,
    'since',  v_since,

    'total',     count(*),
    'sent',      count(*) FILTER (WHERE sent_at IS NOT NULL),
    'delivered', count(*) FILTER (WHERE delivered_at IS NOT NULL),
    'opened',    count(*) FILTER (WHERE opened_at IS NOT NULL),
    'clicked',   count(*) FILTER (WHERE clicked_at IS NOT NULL),
    'bounced',   count(*) FILTER (WHERE bounced_at IS NOT NULL),
    'complained',count(*) FILTER (WHERE complained_at IS NOT NULL),
    'pending',   count(*) FILTER (WHERE sent_at IS NOT NULL AND delivered_at IS NULL AND bounced_at IS NULL),

    'open_count',  coalesce(sum(open_count), 0),
    'click_count', coalesce(sum(click_count), 0),

    'by_source', (
      SELECT jsonb_object_agg(source, cnt) FROM (
        SELECT source, count(*) AS cnt FROM emails
        WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        GROUP BY source
      ) s
    ),
    'by_day', (
      SELECT jsonb_agg(jsonb_build_object(
        'day',       day,
        'sent',      sent,
        'delivered', delivered,
        'opened',    opened,
        'clicked',   clicked,
        'bounced',   bounced
      ) ORDER BY day)
      FROM (
        SELECT
          date_trunc('day', coalesce(sent_at, first_seen_at))::date AS day,
          count(*) FILTER (WHERE sent_at IS NOT NULL)      AS sent,
          count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
          count(*) FILTER (WHERE opened_at IS NOT NULL)    AS opened,
          count(*) FILTER (WHERE clicked_at IS NOT NULL)   AS clicked,
          count(*) FILTER (WHERE bounced_at IS NOT NULL)   AS bounced
        FROM emails
        WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        GROUP BY day
      ) d
    )
  )
  INTO v_result
  FROM emails
  WHERE (sent_at >= v_since OR first_seen_at >= v_since);

  RETURN v_result;
END;
$$;


--
-- Name: get_resend_domain_breakdown(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_resend_domain_breakdown(p_window text DEFAULT '30d'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_since timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE p_window
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE 'epoch'::timestamptz
  END;

  RETURN (
    SELECT jsonb_agg(row_to_json(d) ORDER BY d.total DESC)
    FROM (
      SELECT
        split_part(lower(addr), '@', 2) AS domain,
        count(*)                                           AS total,
        count(*) FILTER (WHERE delivered_at IS NOT NULL)   AS delivered,
        count(*) FILTER (WHERE opened_at IS NOT NULL)      AS opened,
        count(*) FILTER (WHERE clicked_at IS NOT NULL)     AS clicked,
        count(*) FILTER (WHERE bounced_at IS NOT NULL)     AS bounced
      FROM emails, unnest(to_addresses) AS addr
      WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        AND addr IS NOT NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 25
    ) d
  );
END;
$$;


--
-- Name: get_shot_data_quality(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shot_data_quality() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_role text;
  v_caller uuid;
  v_total bigint;
  v_missing_distance bigint;
  v_missing_lie bigint;
  v_missing_club bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    v_caller := auth.uid();
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT role::text INTO v_role
    FROM public.users
    WHERE id = v_caller;

    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE distance_to_hole_before IS NULL),
    count(*) FILTER (WHERE lie_before IS NULL),
    count(*) FILTER (WHERE club_type IS NULL)
  INTO v_total, v_missing_distance, v_missing_lie, v_missing_club
  FROM golf_shots;

  RETURN jsonb_build_object(
    'total_shots',             COALESCE(v_total, 0),
    'missing_distance_before', COALESCE(v_missing_distance, 0),
    'missing_lie_before',      COALESCE(v_missing_lie, 0),
    'missing_club_type',       COALESCE(v_missing_club, 0)
  );
END;
$$;


--
-- Name: FUNCTION get_shot_data_quality(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_shot_data_quality() IS 'Admin-only shot telemetry data-quality counts: total shots plus rows missing distance_to_hole_before / lie_before / club_type. One scan of golf_shots via conditional aggregation; replaces four head-count queries that admin-data.ts used to issue per dashboard load. Service role bypasses the user-role gate.';


--
-- Name: get_team_health_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_health_dashboard() RETURNS TABLE(team_id uuid, team_name text, org_name text, member_count integer, active_7d integer, active_30d integer, rounds_30d integer, avg_rounds_per_player numeric, health_score numeric, health_tier text, has_ai_philosophy boolean)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    o.name,
    COUNT(DISTINCT tm.player_id)::INT,
    COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::INT,
    COUNT(DISTINCT CASE WHEN gr30.player_id IS NOT NULL THEN tm.player_id END)::INT,
    COUNT(DISTINCT gr30.id)::INT,
    CASE WHEN COUNT(DISTINCT tm.player_id) > 0
      THEN ROUND(COUNT(DISTINCT gr30.id)::NUMERIC / COUNT(DISTINCT tm.player_id), 1)
      ELSE 0 END,
    CASE WHEN COUNT(DISTINCT tm.player_id) > 0
      THEN ROUND(
        (COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
         NULLIF(COUNT(DISTINCT tm.player_id), 0) * 50) +
        (LEAST(COUNT(DISTINCT gr30.id)::NUMERIC / NULLIF(COUNT(DISTINCT tm.player_id), 0) / 4, 1) * 30) +
        (CASE WHEN bool_or(gcp.coach_id IS NOT NULL) THEN 20 ELSE 0 END)
      , 1)
      ELSE 0 END,
    CASE
      WHEN COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
           NULLIF(COUNT(DISTINCT tm.player_id), 0) >= 0.6 THEN 'thriving'
      WHEN COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
           NULLIF(COUNT(DISTINCT tm.player_id), 0) >= 0.3 THEN 'healthy'
      WHEN COUNT(DISTINCT CASE WHEN gr30.player_id IS NOT NULL THEN tm.player_id END) > 0 THEN 'at_risk'
      ELSE 'inactive'
    END,
    bool_or(gcp.coach_id IS NOT NULL)
  FROM golf_teams t
  LEFT JOIN organizations o ON o.id = t.organization_id
  LEFT JOIN golf_team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  LEFT JOIN golf_rounds gr7 ON gr7.player_id = tm.player_id AND gr7.created_at >= now() - interval '7 days'
  LEFT JOIN golf_rounds gr30 ON gr30.player_id = tm.player_id AND gr30.created_at >= now() - interval '30 days'
  LEFT JOIN golf_coaches gc ON gc.organization_id = t.organization_id
  LEFT JOIN golf_coach_philosophy gcp ON gcp.coach_id = gc.id
  GROUP BY t.id, t.name, o.name;
END;
$$;


--
-- Name: get_user_engagement_summary(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_engagement_summary(time_range_days integer DEFAULT 30) RETURNS TABLE(user_id uuid, email text, role text, rounds_in_period integer, reviews_in_period integer, messages_in_period integer, insights_acknowledged integer, events_attended integer, engagement_score numeric, lifecycle_stage text, last_active_at timestamp with time zone, days_since_signup integer)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - (time_range_days || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH user_activity AS (
    SELECT
      u.id AS uid,
      u.email AS uemail,
      u.role::text AS urole,
      u.created_at AS ucreated,
      u.last_seen AS ulast_seen,
      COALESCE(gp.id, gc.id) AS profile_id,
      COALESCE(gp.onboarding_completed, gc.onboarding_completed, false) AS onboarding_done
    FROM users u
    LEFT JOIN golf_players gp ON gp.user_id = u.id
    LEFT JOIN golf_coaches gc ON gc.user_id = u.id
  ),
  round_counts AS (
    SELECT gr.player_id, COUNT(*) AS cnt
    FROM golf_rounds gr
    WHERE gr.created_at >= cutoff
    GROUP BY gr.player_id
  ),
  review_counts AS (
    SELECT grr.player_id, COUNT(*) AS cnt
    FROM golf_round_reviews grr
    WHERE grr.created_at >= cutoff
    GROUP BY grr.player_id
  ),
  message_counts AS (
    SELECT gm.sender_id, COUNT(*) AS cnt
    FROM golf_messages gm
    WHERE gm.created_at >= cutoff
    GROUP BY gm.sender_id
  )
  SELECT
    ua.uid,
    ua.uemail,
    ua.urole,
    COALESCE(rc.cnt, 0)::INT,
    COALESCE(rv.cnt, 0)::INT,
    COALESCE(mc.cnt, 0)::INT,
    0::INT,
    0::INT,
    (COALESCE(rc.cnt, 0) * 3 + COALESCE(rv.cnt, 0) * 2 + COALESCE(mc.cnt, 0))::NUMERIC AS engagement_score,
    CASE
      WHEN ua.ucreated > now() - interval '7 days' AND NOT ua.onboarding_done THEN 'brand_new'
      WHEN NOT ua.onboarding_done THEN 'onboarding'
      WHEN COALESCE(rc.cnt, 0) = 0 AND ua.ulast_seen < now() - interval '30 days' THEN 'churned'
      WHEN COALESCE(rc.cnt, 0) = 0 AND ua.ulast_seen < now() - interval '14 days' THEN 'at_risk'
      WHEN COALESCE(rc.cnt, 0) >= 10 THEN 'power_user'
      WHEN COALESCE(rc.cnt, 0) >= 3 THEN 'engaged'
      WHEN COALESCE(rc.cnt, 0) >= 1 THEN 'active'
      ELSE 'dormant'
    END AS lifecycle_stage,
    ua.ulast_seen,
    EXTRACT(DAY FROM now() - ua.ucreated)::INT
  FROM user_activity ua
  LEFT JOIN golf_players gp2 ON gp2.user_id = ua.uid
  LEFT JOIN round_counts rc ON rc.player_id = gp2.id
  LEFT JOIN review_counts rv ON rv.player_id = gp2.id
  LEFT JOIN message_counts mc ON mc.sender_id = ua.uid;
END;
$$;


--
-- Name: get_user_golf_organization_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_golf_organization_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  org_id uuid;
BEGIN
  SELECT gc.organization_id INTO org_id
  FROM golf_coaches gc
  WHERE gc.user_id = auth.uid()
  LIMIT 1;
  RETURN org_id;
END;
$$;


--
-- Name: get_user_golf_team_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_golf_team_ids() RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT gtm.team_id
  FROM golf_team_members gtm
  JOIN golf_players gp ON gp.id = gtm.player_id
  WHERE gp.user_id = auth.uid()
    AND gtm.status = 'active';
END;
$$;


--
-- Name: get_user_last_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_last_active() RETURNS TABLE(user_id uuid, last_active_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    u.id AS user_id,
    GREATEST(
      -- Most recent session refresh (best indicator of app usage)
      (SELECT MAX(s.refreshed_at::timestamptz) FROM auth.sessions s WHERE s.user_id = u.id),
      -- Fallback to last sign-in
      u.last_sign_in_at
    ) AS last_active_at
  FROM auth.users u;
$$;


--
-- Name: get_users_with_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_users_with_auth() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(u), '[]'::json) INTO result
  FROM (
    SELECT
      pu.id,
      pu.email,
      pu.role,
      pu.created_at,
      pu.last_seen,
      au.last_sign_in_at,
      au.email_confirmed_at,
      au.created_at as auth_created_at
    FROM users pu
    LEFT JOIN auth.users au ON au.id = pu.id
    ORDER BY pu.created_at DESC
  ) u;
  
  RETURN result;
END;
$$;


--
-- Name: golf_event_documents_assert_same_team(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.golf_event_documents_assert_same_team() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  event_team uuid;
  doc_team uuid;
BEGIN
  SELECT team_id INTO event_team FROM public.golf_events WHERE id = NEW.event_id;
  SELECT team_id INTO doc_team   FROM public.golf_documents WHERE id = NEW.document_id;
  IF event_team IS NULL THEN
    RAISE EXCEPTION 'event_id % does not exist', NEW.event_id;
  END IF;
  IF doc_team IS NULL THEN
    RAISE EXCEPTION 'document_id % does not exist', NEW.document_id;
  END IF;
  IF event_team <> doc_team THEN
    RAISE EXCEPTION 'document % and event % belong to different teams', NEW.document_id, NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: golf_holes_recompute_round_totals_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.golf_holes_recompute_round_totals_fn() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_round uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_round := OLD.round_id;
  ELSE
    v_round := NEW.round_id;
  END IF;

  PERFORM public.recompute_golf_round_totals(v_round);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END
$$;


--
-- Name: golf_holes_set_gir_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.golf_holes_set_gir_fn() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.par IS NOT NULL AND NEW.score IS NOT NULL THEN
    NEW.gir := (NEW.par >= 3
                AND NEW.score > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) <= (NEW.par - 2));
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  user_role_value user_role;
  user_email TEXT;
BEGIN
  -- Extract data from raw_user_meta_data
  user_email := NEW.email;
  
  -- Get role from metadata, default to 'player'
  user_role_value := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role,
    'player'::user_role
  );

  -- Insert into users table (without full_name since column doesn't exist)
  INSERT INTO public.users (
    id,
    email,
    role,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    user_email,
    user_role_value,
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;


--
-- Name: heartbeat(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.heartbeat() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE users SET last_seen = NOW() WHERE id = auth.uid();
END;
$$;


--
-- Name: hypopg_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hypopg_reset() RETURNS void
    LANGUAGE sql
    AS $$
  SELECT extensions.hypopg_reset();
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;


--
-- Name: is_baseball_primary_coach(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_baseball_primary_coach(p_team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff
    WHERE team_id = p_team_id
    AND coach_id = get_my_coach_id()
    AND is_primary = true
  );
$$;


--
-- Name: is_baseball_team_coach(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_baseball_team_coach(team_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff tcs
    WHERE tcs.team_id = team_uuid
    AND tcs.coach_id = get_my_coach_id()
  );
$$;


--
-- Name: is_baseball_team_coach_v2(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_baseball_team_coach_v2(p_team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff
    WHERE team_id = p_team_id
      AND coach_id = (SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1)
  );
$$;


--
-- Name: is_baseball_team_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_baseball_team_member(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN RETURN EXISTS ( SELECT 1 FROM baseball_team_members btm JOIN baseball_players bp ON bp.id = btm.player_id WHERE btm.team_id = team_uuid AND bp.user_id = auth.uid() AND btm.status = 'active' ); END; $$;


--
-- Name: is_baseball_team_member_v2(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_baseball_team_member_v2(p_team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_members
    WHERE team_id = p_team_id
      AND player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
  );
$$;


--
-- Name: is_baseball_team_player(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_baseball_team_player(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM baseball_team_members btm
    JOIN baseball_players bp ON bp.id = btm.player_id
    WHERE btm.team_id = team_uuid
    AND bp.user_id = auth.uid()
    AND btm.status = 'active'
  );
END;
$$;


--
-- Name: is_golf_team_coach(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_golf_team_coach(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
    AND gc.user_id = auth.uid()
  );
END;
$$;


--
-- Name: is_golf_team_player(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_golf_team_player(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gtm.team_id = team_uuid
    AND gp.user_id = auth.uid()
    AND gtm.status = 'active'
  );
END;
$$;


--
-- Name: is_golf_team_primary_coach(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_golf_team_primary_coach(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = auth.uid()
      AND gtcs.is_primary = TRUE
  );
END;
$$;


--
-- Name: FUNCTION is_golf_team_primary_coach(team_uuid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_golf_team_primary_coach(team_uuid uuid) IS 'Check if current user is a PRIMARY coach on the specified team. SECURITY DEFINER avoids RLS recursion.';


--
-- Name: is_in_team(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_in_team(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN public.is_team_coach(team_uuid) OR public.is_team_player(team_uuid);
END;
$$;


--
-- Name: FUNCTION is_in_team(team_uuid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_in_team(team_uuid uuid) IS 'v3 RLS helper: either-or convenience. True if the current user is a coach OR an active player on the given team. Use for team-scoped shared-read policies (Pattern 3 in docs/v3-rls-template.md).';


--
-- Name: is_team_coach(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_team_coach(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff s
    JOIN golf_coaches c ON c.id = s.coach_id
    WHERE s.team_id = team_uuid
      AND c.user_id = auth.uid()
  );
END;
$$;


--
-- Name: FUNCTION is_team_coach(team_uuid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_team_coach(team_uuid uuid) IS 'v3 RLS helper: true if the current user is on the given team''s coaching staff (any role). Broader than is_golf_team_primary_coach, which restricts to primary only.';


--
-- Name: is_team_player(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_team_player(team_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_members m
    JOIN golf_players p ON p.id = m.player_id
    WHERE m.team_id = team_uuid
      AND p.user_id = auth.uid()
      AND m.status = 'active'::team_member_status
  );
END;
$$;


--
-- Name: FUNCTION is_team_player(team_uuid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_team_player(team_uuid uuid) IS 'v3 RLS helper: true if the current user is an ACTIVE player on the given team. Players with status (pending|inactive|removed) return false.';


--
-- Name: is_user_on_team(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_on_team(p_user_id uuid, p_team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff tcs
    JOIN public.golf_coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = p_team_id
      AND c.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.golf_team_members tm
    JOIN public.golf_players p ON p.id = tm.player_id
    WHERE tm.team_id = p_team_id
      AND p.user_id = p_user_id
      AND tm.status = 'active'
  );
$$;


--
-- Name: log_review_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_review_status_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO golf_review_events (review_id, player_id, actor_id, event_type, event_data)
    VALUES (
      NEW.id,
      NEW.player_id,
      NEW.published_by,
      CASE NEW.status
        WHEN 'published' THEN 'coach_published'
        ELSE 'review_generated'
      END,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: mark_player_stats_stale(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_player_stats_stale(p_player_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE golf_player_stats_cache
  SET
    is_stale = TRUE,
    updated_at = NOW()
  WHERE player_id = p_player_id;
END;
$$;


--
-- Name: FUNCTION mark_player_stats_stale(p_player_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_player_stats_stale(p_player_id uuid) IS 'Marks a players stats cache as stale, indicating a refresh is needed';


--
-- Name: mark_task_reminder_sent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_task_reminder_sent(p_task_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE golf_tasks
  SET reminder_sent = true
  WHERE id = p_task_id;

  RETURN FOUND;
END;
$$;


--
-- Name: recalculate_baseball_season_stats(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_baseball_season_stats(p_player_id uuid, p_team_id uuid, p_season_year integer DEFAULT (EXTRACT(year FROM now()))::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_g integer := 0;
  v_ab integer := 0;
  v_r integer := 0;
  v_h integer := 0;
  v_doubles integer := 0;
  v_triples integer := 0;
  v_hr integer := 0;
  v_rbi integer := 0;
  v_bb integer := 0;
  v_k integer := 0;
  v_sb integer := 0;
  v_cs integer := 0;
  v_hbp integer := 0;
  v_sac integer := 0;
  v_sf integer := 0;
  v_avg numeric(5,3);
  v_obp numeric(5,3);
  v_slg numeric(5,3);
  v_ops numeric(5,3);
  -- Pitching
  v_g_p integer := 0;
  v_w integer := 0;
  v_l integer := 0;
  v_sv integer := 0;
  v_ip numeric(6,1) := 0;
  v_h_allowed integer := 0;
  v_r_allowed integer := 0;
  v_er integer := 0;
  v_bb_allowed integer := 0;
  v_k_thrown integer := 0;
  v_hr_allowed integer := 0;
  v_era numeric(5,2);
  v_whip numeric(5,3);
  v_k9 numeric(5,2);
  v_bb9 numeric(5,2);
  v_singles integer;
  v_pa integer;
BEGIN
  -- ---- Batting aggregation ----
  SELECT
    COUNT(DISTINCT bsb.game_id)::integer,
    COALESCE(SUM(bsb.ab), 0)::integer,
    COALESCE(SUM(bsb.r), 0)::integer,
    COALESCE(SUM(bsb.h), 0)::integer,
    COALESCE(SUM(bsb.doubles), 0)::integer,
    COALESCE(SUM(bsb.triples), 0)::integer,
    COALESCE(SUM(bsb.hr), 0)::integer,
    COALESCE(SUM(bsb.rbi), 0)::integer,
    COALESCE(SUM(bsb.bb), 0)::integer,
    COALESCE(SUM(bsb.k), 0)::integer,
    COALESCE(SUM(bsb.sb), 0)::integer,
    COALESCE(SUM(bsb.cs), 0)::integer,
    COALESCE(SUM(bsb.hbp), 0)::integer,
    COALESCE(SUM(bsb.sac), 0)::integer,
    COALESCE(SUM(bsb.sf), 0)::integer
  INTO
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi,
    v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf
  FROM baseball_box_score_batting bsb
  JOIN baseball_games g ON g.id = bsb.game_id
  WHERE bsb.player_id = p_player_id
    AND bsb.team_id = p_team_id
    AND g.status = 'completed'
    AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year;

  -- Calculate batting rates
  IF v_ab > 0 THEN
    v_avg := ROUND(v_h::numeric / v_ab, 3);
    v_singles := v_h - v_doubles - v_triples - v_hr;
    v_slg := ROUND((v_singles + 2 * v_doubles + 3 * v_triples + 4 * v_hr)::numeric / v_ab, 3);
  END IF;

  v_pa := v_ab + v_bb + v_hbp + v_sf;
  IF v_pa > 0 THEN
    v_obp := ROUND((v_h + v_bb + v_hbp)::numeric / v_pa, 3);
  END IF;

  IF v_obp IS NOT NULL AND v_slg IS NOT NULL THEN
    v_ops := ROUND(v_obp + v_slg, 3);
  END IF;

  -- ---- Pitching aggregation ----
  SELECT
    COUNT(DISTINCT bsp.game_id)::integer,
    COUNT(CASE WHEN bsp.result = 'W' THEN 1 END)::integer,
    COUNT(CASE WHEN bsp.result = 'L' THEN 1 END)::integer,
    COUNT(CASE WHEN bsp.result = 'S' THEN 1 END)::integer,
    COALESCE(SUM(bsp.ip), 0),
    COALESCE(SUM(bsp.h), 0)::integer,
    COALESCE(SUM(bsp.r), 0)::integer,
    COALESCE(SUM(bsp.er), 0)::integer,
    COALESCE(SUM(bsp.bb), 0)::integer,
    COALESCE(SUM(bsp.k), 0)::integer,
    COALESCE(SUM(bsp.hr), 0)::integer
  INTO
    v_g_p, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er, v_bb_allowed, v_k_thrown, v_hr_allowed
  FROM baseball_box_score_pitching bsp
  JOIN baseball_games g ON g.id = bsp.game_id
  WHERE bsp.player_id = p_player_id
    AND bsp.team_id = p_team_id
    AND g.status = 'completed'
    AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year;

  -- Calculate pitching rates
  IF v_ip > 0 THEN
    v_era := ROUND(9.0 * v_er / v_ip, 2);
    v_whip := ROUND((v_bb_allowed + v_h_allowed)::numeric / v_ip, 3);
    v_k9 := ROUND(9.0 * v_k_thrown / v_ip, 2);
    v_bb9 := ROUND(9.0 * v_bb_allowed / v_ip, 2);
  END IF;

  -- ---- Upsert season stats ----
  INSERT INTO baseball_player_season_stats (
    player_id, team_id, season_year,
    g, ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf,
    avg, obp, slg, ops,
    g_p, gs, w, l, sv, ip, h_allowed, r_allowed, er, bb_allowed, k_thrown, hr_allowed,
    era, whip, k9, bb9,
    last_updated
  )
  VALUES (
    p_player_id, p_team_id, p_season_year,
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi, v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf,
    v_avg, v_obp, v_slg, v_ops,
    v_g_p, 0, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er, v_bb_allowed, v_k_thrown, v_hr_allowed,
    v_era, v_whip, v_k9, v_bb9,
    now()
  )
  ON CONFLICT (player_id, team_id, season_year)
  DO UPDATE SET
    g = EXCLUDED.g,
    ab = EXCLUDED.ab,
    r = EXCLUDED.r,
    h = EXCLUDED.h,
    doubles = EXCLUDED.doubles,
    triples = EXCLUDED.triples,
    hr = EXCLUDED.hr,
    rbi = EXCLUDED.rbi,
    bb = EXCLUDED.bb,
    k = EXCLUDED.k,
    sb = EXCLUDED.sb,
    cs = EXCLUDED.cs,
    hbp = EXCLUDED.hbp,
    sac = EXCLUDED.sac,
    sf = EXCLUDED.sf,
    avg = EXCLUDED.avg,
    obp = EXCLUDED.obp,
    slg = EXCLUDED.slg,
    ops = EXCLUDED.ops,
    g_p = EXCLUDED.g_p,
    w = EXCLUDED.w,
    l = EXCLUDED.l,
    sv = EXCLUDED.sv,
    ip = EXCLUDED.ip,
    h_allowed = EXCLUDED.h_allowed,
    r_allowed = EXCLUDED.r_allowed,
    er = EXCLUDED.er,
    bb_allowed = EXCLUDED.bb_allowed,
    k_thrown = EXCLUDED.k_thrown,
    hr_allowed = EXCLUDED.hr_allowed,
    era = EXCLUDED.era,
    whip = EXCLUDED.whip,
    k9 = EXCLUDED.k9,
    bb9 = EXCLUDED.bb9,
    last_updated = now();
END;
$$;


--
-- Name: recalculate_round_strokes_gained(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_round_strokes_gained(p_round_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_player_id      UUID;
  v_shot_count     INTEGER;
  v_sg_off_tee     NUMERIC := 0;
  v_sg_approach    NUMERIC := 0;
  v_sg_around      NUMERIC := 0;
  v_sg_putting     NUMERIC := 0;
  v_sg_total       NUMERIC := 0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Count shots usable for shot-level SG:
  -- Must have shot_type, lie_before, and starting distance
  SELECT COUNT(*) INTO v_shot_count
  FROM golf_shots gs
  WHERE gs.round_id = p_round_id
    AND gs.shot_type IS NOT NULL
    AND gs.lie_before IS NOT NULL
    AND gs.distance_to_hole_before IS NOT NULL
    AND gs.distance_to_hole_before > 0
    AND (
      gs.distance_to_hole_after IS NOT NULL
      OR gs.putt_made = TRUE
      OR gs.result IN ('holed', 'hole')
    );

  IF v_shot_count > 0 THEN
    -- ── Shot-level SG ─────────────────────────────────────────────────────
    WITH normalized AS (
      SELECT
        gs.shot_type,
        gs.shot_number,
        gh.par,

        -- ── Lie before (for expected_before lookup) ─────────────────────
        -- Putts always use 'green'; others use normalized lie_before
        CASE
          WHEN gs.shot_type = 'putting' THEN 'green'
          ELSE sg_normalize_lie(gs.lie_before)
        END AS lie_before_norm,

        -- ── Distance before in YARDS ─────────────────────────────────────
        -- Putts are stored in feet → divide by 3
        -- All others are stored in yards
        CASE
          WHEN gs.shot_type = 'putting' THEN
            CASE WHEN gs.distance_unit_before = 'feet'
              THEN gs.distance_to_hole_before / 3.0
              ELSE gs.distance_to_hole_before    -- already yards (rare edge case)
            END
          ELSE
            CASE WHEN gs.distance_unit_before = 'feet'
              THEN gs.distance_to_hole_before / 3.0
              ELSE gs.distance_to_hole_before
            END
        END AS dist_before_yards,

        -- ── Is holed? ────────────────────────────────────────────────────
        (gs.putt_made = TRUE OR gs.result IN ('holed', 'hole')) AS is_holed,

        -- ── Distance after in YARDS ──────────────────────────────────────
        -- Use explicit after-distance, or fallback to next shot's before-distance
        CASE
          WHEN gs.putt_made = TRUE OR gs.result IN ('holed', 'hole') THEN 0
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE
              WHEN gs.shot_type = 'putting' THEN
                CASE WHEN gs.distance_unit_after = 'feet'
                  THEN gs.distance_to_hole_after / 3.0
                  ELSE gs.distance_to_hole_after
                END
              ELSE
                CASE WHEN gs.distance_unit_after = 'feet'
                  THEN gs.distance_to_hole_after / 3.0
                  ELSE gs.distance_to_hole_after
                END
            END
          ELSE
            -- Fallback: next shot's distance_to_hole_before (window within hole)
            CASE
              WHEN LEAD(gs.distance_unit_before) OVER w = 'feet'
              THEN COALESCE(LEAD(gs.distance_to_hole_before) OVER w, 0) / 3.0
              ELSE COALESCE(LEAD(gs.distance_to_hole_before) OVER w, 0)
            END
        END AS dist_after_yards,

        -- ── Lie after (for expected_after lookup) ────────────────────────
        CASE
          WHEN gs.putt_made = TRUE OR gs.result IN ('holed', 'hole') THEN 'green'
          WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
          -- Fallback: next shot's lie_before
          ELSE sg_normalize_lie(LEAD(gs.lie_before) OVER w)
        END AS lie_after_norm,

        COALESCE(gs.is_penalty, FALSE) AS is_penalty

      FROM golf_shots gs
      JOIN golf_holes gh ON gh.id = gs.hole_id
      WHERE gs.round_id = p_round_id
        AND gs.shot_type IS NOT NULL
        AND gs.distance_to_hole_before IS NOT NULL
        AND gs.distance_to_hole_before > 0
      WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
    ),
    categorized AS (
      SELECT
        -- Category via shot_type (most reliable)
        CASE
          WHEN is_penalty                   THEN NULL
          WHEN shot_type = 'putting'        THEN 'putting'
          WHEN shot_type = 'tee'            THEN 'off_tee'
          WHEN shot_type = 'around_green'   THEN 'around_green'
          ELSE                                   'approach'  -- approach, recovery, etc.
        END AS category,

        -- Expected strokes before this shot
        sg_expected_strokes(lie_before_norm, dist_before_yards) AS exp_before,

        -- Expected strokes after (0 if holed)
        CASE
          WHEN is_holed        THEN 0
          WHEN dist_after_yards > 0
          THEN sg_expected_strokes(lie_after_norm, dist_after_yards)
          ELSE 0
        END AS exp_after,

        -- Shots with valid after-distance (or holed)
        (is_holed OR dist_after_yards > 0) AS has_after

      FROM normalized
      WHERE dist_before_yards > 0
    )
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN category = 'off_tee'      AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'approach'     AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'around_green' AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'putting'      AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3)
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting
    FROM categorized;

  ELSE
    -- ── Hole-level estimation fallback ────────────────────────────────────
    SELECT sg_off_tee, sg_approach, sg_around_green, sg_putting
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting
    FROM sg_estimate_from_holes(p_round_id);
  END IF;

  v_sg_total := ROUND((
    COALESCE(v_sg_off_tee,  0)
    + COALESCE(v_sg_approach, 0)
    + COALESCE(v_sg_around,   0)
    + COALESCE(v_sg_putting,  0)
  )::NUMERIC, 3);

  -- ── Upsert into golf_round_stats_cache ────────────────────────────────────
  INSERT INTO golf_round_stats_cache (
    id, round_id, player_id,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
    strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_round_id, v_player_id,
    v_sg_total, v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM golf_round_stats_cache WHERE round_id = p_round_id
  );

  UPDATE golf_round_stats_cache
  SET
    strokes_gained_total        = v_sg_total,
    strokes_gained_tee          = v_sg_off_tee,
    strokes_gained_approach     = v_sg_approach,
    strokes_gained_around_green = v_sg_around,
    strokes_gained_putting      = v_sg_putting,
    updated_at                  = now()
  WHERE round_id = p_round_id;

END;
$$;


--
-- Name: recalculate_team_baseball_season_stats(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_team_baseball_season_stats(p_team_id uuid, p_season_year integer DEFAULT (EXTRACT(year FROM now()))::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_player_id uuid;
BEGIN
  FOR v_player_id IN
    SELECT DISTINCT player_id FROM baseball_team_members WHERE team_id = p_team_id
  LOOP
    PERFORM recalculate_baseball_season_stats(v_player_id, p_team_id, p_season_year);
  END LOOP;
END;
$$;


--
-- Name: recompute_golf_round_totals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_golf_round_totals(p_round_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE golf_rounds r
  SET
    total_putts = COALESCE(t.sum_putts, 0),
    total_gir = COALESCE(t.sum_gir, 0),
    total_gir_possible = COALESCE(t.cnt, 0),
    total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
    total_fairways = COALESCE(t.cnt_par4plus, 0)
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
      SUM(CASE
            WHEN par >= 3
             AND score > 0
             AND (score - COALESCE(putts, 0)) > 0
             AND (score - COALESCE(putts, 0)) <= (par - 2)
            THEN 1 ELSE 0
          END) AS sum_gir,
      COUNT(*) AS cnt,
      SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      SUM(CASE WHEN par >= 4 THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes
    WHERE round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$$;


--
-- Name: refresh_crm_coach_engagement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_crm_coach_engagement() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM pg_advisory_lock(7777);
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm_coach_engagement;
  PERFORM pg_advisory_unlock(7777);
END; $$;


--
-- Name: refresh_player_standing(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_player_standing(p_team_ids uuid[]) RETURNS TABLE(metric_id text, rows_upserted bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  -- (metric_id, value_expr, direction) — value_expr is plain SQL,
  -- evaluated against `golf_player_stats_cache cache`. Trusted at
  -- function-creation time; not derived from caller input.
  v_bindings text[][] := ARRAY[
    ['sg_total',                  'cache.sg_total_per_round',          'higher_better'],
    ['sg_ott',                    'cache.sg_tee_per_round',            'higher_better'],
    ['sg_approach',               'cache.sg_approach_per_round',       'higher_better'],
    ['sg_around_green',           'cache.sg_around_green_per_round',   'higher_better'],
    ['sg_putting',                'cache.sg_putting_per_round',        'higher_better'],
    ['putts_made_3_5ft_pct',      'cache.putt_make_pct_3_5ft',         'higher_better'],
    ['putts_made_5_10ft_pct',     'cache.putt_make_pct_5_10ft',        'higher_better'],
    ['putts_made_10_15ft_pct',    'cache.putt_make_pct_10_15ft',       'higher_better'],
    ['gir_pct',                   'cache.gir_percentage',              'higher_better'],
    ['scrambling_pct_sand',       'cache.sand_save_percentage',        'higher_better'],
    ['penalty_rate_per_round',    'cache.penalty_strokes_per_round',   'lower_better'],
    ['big_number_rate',           'CASE WHEN COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0) > 0 THEN 100.0 * (COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0))::numeric / (COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0)) ELSE NULL END',
                                                                       'lower_better'],
    ['scoring_par_3',             'cache.par3_average',                'lower_better'],
    ['scoring_par_4',             'cache.par4_average',                'lower_better'],
    ['scoring_par_5',             'cache.par5_average',                'lower_better']
  ];
  v_n int := array_length(v_bindings, 1);
  v_i int;
  v_metric text;
  v_expr text;
  v_dir text;
  v_rank_order text;
  v_sql text;
  v_rows bigint;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bindings[v_i][1];
    v_expr   := v_bindings[v_i][2];
    v_dir    := v_bindings[v_i][3];

    v_rank_order := CASE WHEN v_dir = 'lower_better' THEN 'DESC' ELSE 'ASC' END;

    v_sql := format($q$
      WITH team_values AS (
        SELECT
          p.id AS player_id,
          tm.team_id,
          (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm
          ON tm.player_id = p.id
         AND tm.status = 'active'::team_member_status
        JOIN public.golf_player_stats_cache cache
          ON cache.player_id = p.id
        WHERE tm.team_id = ANY($1)
          AND cache.rounds_played >= 5
          AND (%s) IS NOT NULL
      ),
      team_stats AS (
        SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
        FROM team_values
        GROUP BY team_id
      ),
      ranked AS (
        SELECT
          tv.player_id,
          tv.team_id,
          tv.player_value,
          ts.team_avg,
          ts.team_n,
          100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value %s)) AS team_pct
        FROM team_values tv
        JOIN team_stats ts ON ts.team_id = tv.team_id
      ),
      pga AS (
        SELECT pga_tour_value, pga_p50
        FROM public.golf_pga_standards
        WHERE metric_id = $2
        ORDER BY season DESC
        LIMIT 1
      )
      INSERT INTO public.golf_player_standing AS s (
        player_id, metric_id, player_value,
        team_avg, team_n, team_pct,
        pga_value, pga_delta, computed_at
      )
      SELECT
        r.player_id, $2::text, r.player_value,
        r.team_avg, r.team_n::int, r.team_pct,
        COALESCE(pga.pga_tour_value, pga.pga_p50),
        r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
        now()
      FROM ranked r
      CROSS JOIN pga
      WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
      ON CONFLICT (player_id, metric_id) DO UPDATE
      SET player_value = EXCLUDED.player_value,
          team_avg = EXCLUDED.team_avg,
          team_n = EXCLUDED.team_n,
          team_pct = EXCLUDED.team_pct,
          pga_value = EXCLUDED.pga_value,
          pga_delta = EXCLUDED.pga_delta,
          computed_at = now();
    $q$, v_expr, v_expr, v_rank_order);

    EXECUTE v_sql USING p_team_ids, v_metric;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    metric_id := v_metric;
    rows_upserted := v_rows;
    RETURN NEXT;

    v_i := v_i + 1;
  END LOOP;
END;
$_$;


--
-- Name: FUNCTION refresh_player_standing(p_team_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refresh_player_standing(p_team_ids uuid[]) IS 'v3 W11. Loops over 15 metric bindings and upserts golf_player_standing rows for the given team chunk. Trusted SECURITY DEFINER — value expressions come from the function body, not the caller. Returns one (metric_id, rows_upserted) row per metric processed.';


--
-- Name: refresh_player_standing_round_metrics(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_player_standing_round_metrics(p_team_ids uuid[]) RETURNS TABLE(out_metric_id text, out_rows_upserted bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_window_days int := 90;
  v_min_rounds int := 5;
  v_rows bigint;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  ------------------------------------------------------------
  -- practice_tournament_delta
  ------------------------------------------------------------
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
        - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id
    HAVING
      COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) > 0
      AND COUNT(*) FILTER (WHERE r.round_type = 'practice') > 0
      AND COUNT(*) >= v_min_rounds
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      -- lower_better: invert percentile so higher pct = better player
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'practice_tournament_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'practice_tournament_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    r.team_pct,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'practice_tournament_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;

  -- The opening_hole_delta block below also writes its result via the
  -- same out_metric_id / out_rows_upserted OUT params.
  ------------------------------------------------------------
  -- opening_hole_delta
  ------------------------------------------------------------
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
        - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    JOIN public.golf_holes h
      ON h.round_id = r.id
     AND h.score IS NOT NULL
     AND h.par IS NOT NULL
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id
    HAVING
      COUNT(DISTINCT r.id) >= v_min_rounds
      AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
      AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'opening_hole_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'opening_hole_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    r.team_pct,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'opening_hole_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;
END;
$$;


--
-- Name: FUNCTION refresh_player_standing_round_metrics(p_team_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refresh_player_standing_round_metrics(p_team_ids uuid[]) IS 'v3 W24 prep. Round-level standing computation for practice_tournament_delta + opening_hole_delta. Companion to refresh_player_standing (W11) which only handles cache-backed metrics. Same (metric_id, rows_upserted) return shape.';


--
-- Name: refresh_player_stats_cache(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_player_stats_cache(p_player_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM golf_round_stats_cache WHERE player_id = p_player_id;

  IF NOT EXISTS (
    SELECT 1
    FROM golf_rounds
    WHERE player_id = p_player_id
      AND status = 'completed'
  ) THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = p_player_id;
    RETURN;
  END IF;

  INSERT INTO golf_round_stats_cache (
    round_id,
    player_id,
    total_score,
    score_to_par,
    front_nine,
    back_nine,
    fairways_hit,
    fairways_total,
    greens_hit,
    greens_total,
    total_putts,
    one_putts,
    three_putts,
    scrambles_converted,
    scramble_attempts,
    sand_saves,
    sand_attempts,
    eagles,
    birdies,
    pars,
    bogeys,
    double_bogeys,
    triple_plus,
    penalty_strokes,
    driving_distance_avg,
    strokes_gained_total,
    strokes_gained_tee,
    strokes_gained_approach,
    strokes_gained_around_green,
    strokes_gained_putting,
    created_at,
    updated_at
  )
  SELECT
    r.id AS round_id,
    r.player_id,
    r.total_score,
    r.score_to_par,
    COALESCE(r.front_nine, SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0),
    COALESCE(r.back_nine, SUM(h.score) FILTER (WHERE h.hole_number > 9), 0),
    COALESCE(r.total_fairways_hit, COUNT(*) FILTER (WHERE h.fairway_hit = true)),
    COALESCE(r.total_fairways, COUNT(*) FILTER (WHERE h.par > 3 AND h.fairway_hit IS NOT NULL)),
    COALESCE(r.total_gir, COUNT(*) FILTER (WHERE h.gir = true)),
    COALESCE(r.total_gir_possible, COUNT(*) FILTER (WHERE h.score IS NOT NULL)),
    COALESCE(r.total_putts, SUM(h.putts)),
    COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0) AS one_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0) AS three_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND (h.score - h.par) <= 0 AND h.score IS NOT NULL), 0) AS scrambles_converted,
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0) AS scramble_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0) AS sand_saves,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0) AS sand_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) <= -2), 0) AS eagles,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = -1), 0) AS birdies,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 0), 0) AS pars,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 1), 0) AS bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 2), 0) AS double_bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) >= 3), 0) AS triple_plus,
    COALESCE(r.total_penalties, SUM(COALESCE(h.penalty_strokes, 0))),
    (
      SELECT AVG(gs.shot_distance)
      FROM golf_shots gs
      JOIN golf_holes gh ON gh.id = gs.hole_id
      WHERE gh.round_id = r.id
        AND gs.shot_type = 'tee'
        AND gs.shot_distance IS NOT NULL
        AND gs.shot_distance > 0
    ) AS driving_distance_avg,
    r.strokes_gained_total,
    r.strokes_gained_tee,
    r.strokes_gained_approach,
    r.strokes_gained_around_green,
    r.strokes_gained_putting,
    NOW(),
    NOW()
  FROM golf_rounds r
  LEFT JOIN golf_holes h ON h.round_id = r.id
  WHERE r.player_id = p_player_id
    AND r.status = 'completed'
  GROUP BY
    r.id,
    r.player_id,
    r.total_score,
    r.score_to_par,
    r.front_nine,
    r.back_nine,
    r.total_fairways_hit,
    r.total_fairways,
    r.total_gir,
    r.total_gir_possible,
    r.total_putts,
    r.total_penalties,
    r.strokes_gained_total,
    r.strokes_gained_tee,
    r.strokes_gained_approach,
    r.strokes_gained_around_green,
    r.strokes_gained_putting
  ON CONFLICT (round_id) DO UPDATE SET
    total_score = EXCLUDED.total_score,
    score_to_par = EXCLUDED.score_to_par,
    front_nine = EXCLUDED.front_nine,
    back_nine = EXCLUDED.back_nine,
    fairways_hit = EXCLUDED.fairways_hit,
    fairways_total = EXCLUDED.fairways_total,
    greens_hit = EXCLUDED.greens_hit,
    greens_total = EXCLUDED.greens_total,
    total_putts = EXCLUDED.total_putts,
    one_putts = EXCLUDED.one_putts,
    three_putts = EXCLUDED.three_putts,
    scrambles_converted = EXCLUDED.scrambles_converted,
    scramble_attempts = EXCLUDED.scramble_attempts,
    sand_saves = EXCLUDED.sand_saves,
    sand_attempts = EXCLUDED.sand_attempts,
    eagles = EXCLUDED.eagles,
    birdies = EXCLUDED.birdies,
    pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys,
    double_bogeys = EXCLUDED.double_bogeys,
    triple_plus = EXCLUDED.triple_plus,
    penalty_strokes = EXCLUDED.penalty_strokes,
    driving_distance_avg = EXCLUDED.driving_distance_avg,
    strokes_gained_total = EXCLUDED.strokes_gained_total,
    strokes_gained_tee = EXCLUDED.strokes_gained_tee,
    strokes_gained_approach = EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting = EXCLUDED.strokes_gained_putting,
    updated_at = NOW();

  UPDATE golf_player_stats_cache psc
  SET
    par3_average = sub.par3_avg,
    par4_average = sub.par4_avg,
    par5_average = sub.par5_avg,
    updated_at = NOW()
  FROM (
    SELECT
      AVG(h.score) FILTER (WHERE h.par = 3) AS par3_avg,
      AVG(h.score) FILTER (WHERE h.par = 4) AS par4_avg,
      AVG(h.score) FILTER (WHERE h.par = 5) AS par5_avg
    FROM golf_holes h
    JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id
      AND r.status = 'completed'
      AND h.score IS NOT NULL
  ) sub
  WHERE psc.player_id = p_player_id;

  UPDATE golf_player_stats_cache
  SET
    is_stale = false,
    updated_at = NOW()
  WHERE player_id = p_player_id;
END;
$$;


--
-- Name: FUNCTION refresh_player_stats_cache(p_player_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refresh_player_stats_cache(p_player_id uuid) IS 'RPC function to fully recompute stats cache for a specific player. Normalizes all per-round stats to 18-hole equivalents.';


--
-- Name: save_partial_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_partial_round_atomic(p_round_id uuid, p_round_data jsonb, p_holes jsonb, p_shots jsonb, p_putt_details jsonb DEFAULT NULL::jsonb, p_approach_details jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '20s'
    SET lock_timeout TO '10s'
    AS $$
DECLARE
  v_player_id UUID;
  v_round_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_hole_record JSONB;
  v_shot_group JSONB;
  v_shot JSONB;
  v_detail JSONB;
  v_inserted_holes JSONB := '[]'::JSONB;
  v_inserted_shots JSONB := '[]'::JSONB;
  v_hole_id UUID;
  v_hole_number INT;
  v_shot_id UUID;
  v_new_updated_at TIMESTAMPTZ;
  v_warnings JSONB := '[]'::JSONB;
  v_err_state TEXT;
  v_err_msg TEXT;
  -- Sanitized values
  v_distance_feet NUMERIC;
  v_break_direction TEXT;
  v_lie_type TEXT;
  v_miss_direction TEXT;
  v_distance_from_green NUMERIC;
  v_estimated_break INT;
BEGIN
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Player profile not found for authenticated user.'
    );
  END IF;

  SELECT status, updated_at INTO v_round_status, v_current_updated_at
  FROM golf_rounds
  WHERE id = p_round_id
    AND player_id = v_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round not found or you do not have permission to update it.'
    );
  END IF;

  IF v_round_status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round has already been completed. Auto-save skipped.'
    );
  END IF;

  -- Optimistic locking: reject if the round was modified since the client last saved
  IF p_expected_updated_at IS NOT NULL
     AND v_current_updated_at IS NOT NULL
     AND v_current_updated_at > p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'conflict'
    );
  END IF;

  v_new_updated_at := NOW();

  UPDATE golf_rounds SET
    course_name = COALESCE(p_round_data->>'course_name', course_name),
    course_city = p_round_data->>'course_city',
    course_state = p_round_data->>'course_state',
    course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END,
    course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END,
    tees_played = p_round_data->>'tees_played',
    round_type = COALESCE(p_round_data->>'round_type', round_type),
    round_date = COALESCE((p_round_data->>'round_date')::DATE, round_date),
    holes_played = COALESCE((p_round_data->>'holes_played')::INT, holes_played),
    current_hole = CASE WHEN p_round_data->>'current_hole' IS NULL THEN current_hole ELSE (p_round_data->>'current_hole')::INT END,
    draft_data = CASE
      WHEN p_round_data->'draft_data' IS NOT NULL
      THEN p_round_data->'draft_data'
      ELSE draft_data
    END,
    updated_at = v_new_updated_at
  WHERE id = p_round_id
    AND player_id = v_player_id;

  DELETE FROM golf_shots WHERE round_id = p_round_id;
  DELETE FROM golf_holes WHERE round_id = p_round_id;

  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN
    FOR v_hole_record IN SELECT * FROM jsonb_array_elements(p_holes)
    LOOP
      INSERT INTO golf_holes (
        round_id, hole_number, par, score, putts,
        fairway_hit, gir, penalty_strokes,
        up_and_down, sand_save, yardage
      ) VALUES (
        p_round_id,
        (v_hole_record->>'hole_number')::INT,
        (v_hole_record->>'par')::INT,
        CASE WHEN v_hole_record->>'score' IS NULL THEN NULL ELSE (v_hole_record->>'score')::INT END,
        CASE WHEN v_hole_record->>'putts' IS NULL THEN NULL ELSE (v_hole_record->>'putts')::INT END,
        CASE WHEN v_hole_record->>'fairway_hit' IS NULL THEN NULL ELSE (v_hole_record->>'fairway_hit')::BOOLEAN END,
        CASE WHEN v_hole_record->>'gir' IS NULL THEN NULL ELSE (v_hole_record->>'gir')::BOOLEAN END,
        CASE WHEN v_hole_record->>'penalty_strokes' IS NULL THEN NULL ELSE (v_hole_record->>'penalty_strokes')::INT END,
        CASE WHEN v_hole_record->>'up_and_down' IS NULL THEN NULL ELSE (v_hole_record->>'up_and_down')::BOOLEAN END,
        CASE WHEN v_hole_record->>'sand_save' IS NULL THEN NULL ELSE (v_hole_record->>'sand_save')::BOOLEAN END,
        CASE WHEN v_hole_record->>'yardage' IS NULL THEN NULL ELSE (v_hole_record->>'yardage')::INT END
      )
      RETURNING id, hole_number INTO v_hole_id, v_hole_number;

      v_inserted_holes := v_inserted_holes || jsonb_build_object(
        'hole_id', v_hole_id,
        'hole_number', v_hole_number
      );
    END LOOP;
  END IF;

  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN
    FOR v_shot_group IN SELECT * FROM jsonb_array_elements(p_shots)
    LOOP
      v_hole_number := (v_shot_group->>'hole_number')::INT;
      SELECT (elem->>'hole_id')::UUID INTO v_hole_id
      FROM jsonb_array_elements(v_inserted_holes) elem
      WHERE (elem->>'hole_number')::INT = v_hole_number
      LIMIT 1;

      IF v_hole_id IS NULL THEN
        CONTINUE;
      END IF;

      FOR v_shot IN SELECT * FROM jsonb_array_elements(v_shot_group->'shots')
      LOOP
        INSERT INTO golf_shots (
          round_id, hole_id, hole_number, shot_number,
          shot_type, club_type, lie_before, lie_after,
          distance_to_hole_before, distance_unit_before,
          result, distance_to_hole_after, distance_unit_after,
          shot_distance, miss_direction,
          putt_break, putt_slope, putt_distance_feet, putt_made,
          is_penalty, penalty_type
        ) VALUES (
          p_round_id,
          v_hole_id,
          v_hole_number,
          (v_shot->>'shot_number')::INT,
          v_shot->>'shot_type',
          v_shot->>'club_type',
          v_shot->>'lie_before',
          v_shot->>'lie_after',
          (v_shot->>'distance_to_hole_before')::NUMERIC,
          v_shot->>'distance_unit_before',
          v_shot->>'result',
          CASE WHEN v_shot->>'distance_to_hole_after' IS NULL THEN NULL ELSE (v_shot->>'distance_to_hole_after')::NUMERIC END,
          v_shot->>'distance_unit_after',
          CASE WHEN v_shot->>'shot_distance' IS NULL THEN NULL ELSE (v_shot->>'shot_distance')::NUMERIC END,
          v_shot->>'miss_direction',
          v_shot->>'putt_break',
          v_shot->>'putt_slope',
          CASE WHEN v_shot->>'putt_distance_feet' IS NULL THEN NULL ELSE (v_shot->>'putt_distance_feet')::NUMERIC END,
          CASE WHEN v_shot->>'putt_made' IS NULL THEN NULL ELSE (v_shot->>'putt_made')::BOOLEAN END,
          COALESCE((v_shot->>'is_penalty')::BOOLEAN, false),
          v_shot->>'penalty_type'
        )
        RETURNING id INTO v_shot_id;

        v_inserted_shots := v_inserted_shots || jsonb_build_object(
          'shot_id', v_shot_id,
          'hole_number', v_hole_number,
          'shot_number', (v_shot->>'shot_number')::INT
        );
      END LOOP;
    END LOOP;
  END IF;

  -- Insert putt_details with SANITIZATION + resilient savepoints
  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        -- Sanitize distance_feet: clamp to 0-500
        BEGIN
          v_distance_feet := (v_detail->>'distance_feet')::NUMERIC;
          IF v_distance_feet IS NOT NULL THEN
            v_distance_feet := GREATEST(0, LEAST(500, v_distance_feet));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_feet := NULL;
        END;

        -- Sanitize break_direction
        v_break_direction := v_detail->>'break_direction';
        IF v_break_direction IS NOT NULL AND v_break_direction NOT IN ('left_to_right', 'right_to_left', 'straight', 'multiple') THEN
          v_break_direction := NULL;
        END IF;

        -- Sanitize estimated_break_inches: clamp to 0-120
        BEGIN
          v_estimated_break := (v_detail->>'estimated_break_inches')::INT;
          IF v_estimated_break IS NOT NULL THEN
            v_estimated_break := GREATEST(0, LEAST(120, v_estimated_break));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_estimated_break := NULL;
        END;

        BEGIN
          INSERT INTO putt_details (shot_id, miss_tags, break_direction, estimated_break_inches, distance_feet, made)
          VALUES (
            v_shot_id,
            CASE WHEN v_detail->'miss_tags' IS NULL THEN '{}' ELSE ARRAY(SELECT jsonb_array_elements_text(v_detail->'miss_tags')) END,
            v_break_direction,
            v_estimated_break,
            v_distance_feet,
            CASE WHEN v_detail->>'made' IS NULL THEN NULL ELSE (v_detail->>'made')::BOOLEAN END
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_putt_details',
            'hole_number', (v_detail->>'hole_number')::INT,
            'shot_number', (v_detail->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_detail
          );
        END;
      END IF;
    END LOOP;
  END IF;

  -- Insert approach_miss_details with SANITIZATION + resilient savepoints
  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        -- Sanitize lie_type: NULL if not in expanded allowed list
        v_lie_type := v_detail->>'lie_type';
        IF v_lie_type IS NOT NULL AND v_lie_type NOT IN (
          'fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard',
          'green', 'tee', 'other', 'penalty', 'deep_rough'
        ) THEN
          v_lie_type := NULL;
        END IF;

        -- Sanitize miss_direction
        v_miss_direction := v_detail->>'miss_direction';
        IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN (
          'short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'
        ) THEN
          v_miss_direction := NULL;
        END IF;

        -- Sanitize distance_from_green_yards: clamp >= 0
        BEGIN
          v_distance_from_green := (v_detail->>'distance_from_green_yards')::NUMERIC;
          IF v_distance_from_green IS NOT NULL AND v_distance_from_green < 0 THEN
            v_distance_from_green := 0;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_from_green := NULL;
        END;

        BEGIN
          INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards)
          VALUES (
            v_shot_id,
            v_miss_direction,
            v_lie_type,
            v_distance_from_green
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_approach_miss_details',
            'hole_number', (v_detail->>'hole_number')::INT,
            'shot_number', (v_detail->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_detail
          );
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'updated_at', v_new_updated_at,
    'warnings', v_warnings
  );
END;
$$;


--
-- Name: set_calendar_feed_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_calendar_feed_token() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.feed_token IS NULL OR NEW.feed_token = '' THEN
    NEW.feed_token = encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_document_version_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_document_version_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Get next version number for this document
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
  FROM golf_document_versions
  WHERE document_id = NEW.document_id;

  RETURN NEW;
END;
$$;


--
-- Name: sg_estimate_from_holes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sg_estimate_from_holes(p_round_id uuid) RETURNS TABLE(sg_off_tee numeric, sg_approach numeric, sg_around_green numeric, sg_putting numeric)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  r_off_tee      NUMERIC := 0;
  r_approach     NUMERIC := 0;
  r_around_green NUMERIC := 0;
  r_putting      NUMERIC := 0;
BEGIN
  SELECT
    ROUND(SUM(1.75 - COALESCE(h.putts, 1.75))::NUMERIC, 2),
    ROUND(SUM(
      CASE WHEN h.par >= 4 THEN
        CASE h.fairway_hit WHEN TRUE THEN 0.20 WHEN FALSE THEN -0.15 ELSE 0 END
      ELSE 0 END
    )::NUMERIC, 2),
    ROUND(SUM(
      CASE h.gir WHEN TRUE THEN 0.25 WHEN FALSE THEN -0.20 ELSE 0 END
    )::NUMERIC, 2),
    ROUND(SUM(
      CASE
        WHEN h.gir = FALSE AND h.up_and_down = TRUE  THEN  0.50
        WHEN h.gir = FALSE AND h.up_and_down = FALSE THEN -0.30
        ELSE 0
      END +
      CASE
        WHEN h.sand_save = TRUE  THEN  0.30
        WHEN h.sand_save = FALSE THEN -0.40
        ELSE 0
      END
    )::NUMERIC, 2)
  INTO r_putting, r_off_tee, r_approach, r_around_green
  FROM golf_holes h
  WHERE h.round_id = p_round_id;

  RETURN QUERY SELECT
    COALESCE(r_off_tee,      0),
    COALESCE(r_approach,     0),
    COALESCE(r_around_green, 0),
    COALESCE(r_putting,      0);
END;
$$;


--
-- Name: sg_expected_strokes(text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sg_expected_strokes(p_lie text, p_distance_yards numeric) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_distances NUMERIC[];
  v_strokes   NUMERIC[];
  v_distance  NUMERIC;
  n           INTEGER;
  i           INTEGER;
  ud          NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
BEGIN
  IF p_lie = 'green' THEN
    -- convert yards → feet for green lookups
    v_distance  := p_distance_yards * 3.0;
    v_distances := ARRAY[90,80,70,60,55,50,45,40,35,30,28,26,24,22,20,
                         18,16,14,12,10,9,8,7,6,5,4,3,2,1,0]::NUMERIC[];
    v_strokes   := ARRAY[2.40,2.30,2.20,2.15,2.08,2.02,2.00,1.93,1.87,1.82,
                         1.78,1.75,1.72,1.68,1.63,1.58,1.53,1.47,1.42,1.32,
                         1.28,1.24,1.20,1.16,1.12,1.08,1.04,1.00,1.00,0]::NUMERIC[];

  ELSIF p_lie = 'tee' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,
                         400,380,360,340,320,300,280,260]::NUMERIC[];
    v_strokes   := ARRAY[4.90,4.85,4.80,4.75,4.70,4.65,4.60,4.55,4.50,4.45,
                         4.10,4.02,3.95,3.88,3.82,3.75,3.68,3.62]::NUMERIC[];

  ELSIF p_lie = 'fairway' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[275,250,225,200,190,180,175,170,165,160,155,150,145,140,
                         135,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,
                         55,50,45,40,35,30,25,20]::NUMERIC[];
    v_strokes   := ARRAY[3.45,3.30,3.15,2.99,2.92,2.86,2.82,2.78,2.75,2.71,2.68,
                         2.67,2.64,2.61,2.58,2.55,2.53,2.50,2.47,2.44,2.42,2.40,
                         2.37,2.35,2.32,2.30,2.27,2.25,2.22,2.20,2.17,2.15,2.12,
                         2.10,2.08,2.06,2.04,2.02]::NUMERIC[];

  ELSIF p_lie = 'rough' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[275,250,225,200,190,180,175,170,165,160,155,150,145,140,
                         135,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,
                         55,50,45,40,35,30,25,20]::NUMERIC[];
    v_strokes   := ARRAY[3.65,3.48,3.32,3.15,3.08,3.01,2.98,2.94,2.91,2.87,2.84,
                         2.82,2.79,2.76,2.73,2.70,2.68,2.65,2.62,2.59,2.56,2.54,
                         2.51,2.48,2.45,2.42,2.40,2.37,2.34,2.32,2.29,2.26,2.24,
                         2.21,2.18,2.16,2.14,2.12]::NUMERIC[];

  ELSIF p_lie = 'sand' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[40,35,30,28,26,24,22,20,18,16,14,12,10,8,6,5,4,3]::NUMERIC[];
    v_strokes   := ARRAY[2.65,2.58,2.53,2.48,2.44,2.40,2.36,2.32,2.28,2.24,2.20,
                         2.18,2.18,2.14,2.10,2.08,2.06,2.04]::NUMERIC[];

  ELSE -- unknown lie → use fairway baseline
    v_distance  := p_distance_yards;
    v_distances := ARRAY[275,200,150,100,50,20]::NUMERIC[];
    v_strokes   := ARRAY[3.45,2.99,2.67,2.40,2.15,2.02]::NUMERIC[];
  END IF;

  IF v_distance <= 0 THEN RETURN 0; END IF;

  n := array_length(v_distances, 1);

  IF v_distance >= v_distances[1]  THEN RETURN v_strokes[1]; END IF;
  IF v_distance <= v_distances[n]  THEN RETURN v_strokes[n]; END IF;

  FOR i IN 1..(n - 1) LOOP
    ud := v_distances[i];
    ld := v_distances[i + 1];
    IF v_distance <= ud AND v_distance >= ld THEN
      us := v_strokes[i];
      ls := v_strokes[i + 1];
      RETURN ls + (v_distance - ld) / (ud - ld) * (us - ls);
    END IF;
  END LOOP;

  RETURN 3.0;
END;
$$;


--
-- Name: sg_normalize_lie(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sg_normalize_lie(p_lie text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  CASE lower(coalesce(p_lie, 'fairway'))
    WHEN 'tee', 'teebox'                                           THEN RETURN 'tee';
    WHEN 'fairway'                                                 THEN RETURN 'fairway';
    WHEN 'rough', 'primary_rough'                                  THEN RETURN 'rough';
    WHEN 'sand', 'bunker', 'greenside_bunker', 'fairway_bunker'    THEN RETURN 'sand';
    WHEN 'green', 'fringe'                                         THEN RETURN 'green';
    ELSE                                                                RETURN 'fairway';
  END CASE;
END;
$$;


--
-- Name: stop_sequences_on_reply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stop_sequences_on_reply() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.coach_id IS NOT NULL THEN
    UPDATE crm_sequence_enrollments
       SET status = 'stopped', stopped_at = NEW.received_at, stop_reason = 'replied'
     WHERE coach_id = NEW.coach_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_round_atomic(p_round_id uuid, p_round_data jsonb, p_holes jsonb, p_shots jsonb, p_putt_details jsonb DEFAULT '[]'::jsonb, p_approach_details jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '30s'
    SET lock_timeout TO '15s'
    AS $$ DECLARE v_player_id UUID; v_hole_record JSONB; v_shot_group JSONB; v_shot JSONB; v_inserted_holes JSONB := '[]'::JSONB; v_inserted_shots JSONB := '[]'::JSONB; v_hole_id UUID; v_hole_number INT; v_shot_id UUID; v_shot_number INT; v_putt JSONB; v_approach JSONB; v_target_shot_id UUID; v_warnings JSONB := '[]'::JSONB; v_err_state TEXT; v_err_msg TEXT; v_distance_feet NUMERIC; v_break_direction TEXT; v_lie_type TEXT; v_miss_direction TEXT; v_distance_from_green NUMERIC; v_estimated_break INT; v_expected_holes INT; v_supplied_holes INT := 0; v_null_score_holes INT := 0; v_null_putt_holes INT := 0; v_hole_score_sum INT := 0; v_hole_putt_sum INT := 0; v_distinct_hole_numbers INT := 0; v_min_hole_number INT; v_max_hole_number INT; BEGIN SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid(); IF v_player_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Player profile not found.'); END IF; PERFORM 1 FROM golf_rounds WHERE id = p_round_id AND player_id = v_player_id AND status != 'completed'; IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Round not found, already completed, or no permission.'); END IF; IF p_holes IS NULL OR jsonb_typeof(p_holes) <> 'array' THEN RETURN jsonb_build_object('success', false, 'error', 'Round submission requires a complete hole payload.'); END IF; v_supplied_holes := jsonb_array_length(p_holes); v_expected_holes := COALESCE((p_round_data->>'holes_played')::INT, v_supplied_holes); IF v_supplied_holes = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Round submission requires at least one hole.'); END IF; SELECT COUNT(*) FILTER (WHERE elem->>'score' IS NULL), COUNT(*) FILTER (WHERE elem->>'putts' IS NULL), COALESCE(SUM(CASE WHEN elem->>'score' IS NULL THEN 0 ELSE (elem->>'score')::INT END), 0), COALESCE(SUM(CASE WHEN elem->>'putts' IS NULL THEN 0 ELSE (elem->>'putts')::INT END), 0), COUNT(DISTINCT (elem->>'hole_number')::INT), MIN((elem->>'hole_number')::INT), MAX((elem->>'hole_number')::INT) INTO v_null_score_holes, v_null_putt_holes, v_hole_score_sum, v_hole_putt_sum, v_distinct_hole_numbers, v_min_hole_number, v_max_hole_number FROM jsonb_array_elements(p_holes) elem; IF v_supplied_holes <> v_expected_holes THEN RETURN jsonb_build_object('success', false, 'error', format('Hole count mismatch: expected %s got %s.', v_expected_holes, v_supplied_holes)); END IF; IF v_distinct_hole_numbers <> v_supplied_holes OR COALESCE(v_min_hole_number, 0) <> 1 OR COALESCE(v_max_hole_number, 0) <> v_expected_holes THEN RETURN jsonb_build_object('success', false, 'error', 'Requires one complete hole entry for every hole.'); END IF; IF v_null_score_holes > 0 OR v_null_putt_holes > 0 THEN RETURN jsonb_build_object('success', false, 'error', format('%s scores and %s putts missing.', v_null_score_holes, v_null_putt_holes)); END IF; IF p_round_data->>'total_score' IS NOT NULL AND v_hole_score_sum <> (p_round_data->>'total_score')::INT THEN RETURN jsonb_build_object('success', false, 'error', format('Score mismatch: round %s vs holes %s.', (p_round_data->>'total_score')::INT, v_hole_score_sum)); END IF; IF p_round_data->>'total_putts' IS NOT NULL AND v_hole_putt_sum <> (p_round_data->>'total_putts')::INT THEN RETURN jsonb_build_object('success', false, 'error', format('Putt mismatch: round %s vs holes %s.', (p_round_data->>'total_putts')::INT, v_hole_putt_sum)); END IF; UPDATE golf_rounds SET course_name = COALESCE(p_round_data->>'course_name', course_name), course_city = p_round_data->>'course_city', course_state = p_round_data->>'course_state', course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END, course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END, tees_played = p_round_data->>'tees_played', round_type = COALESCE(p_round_data->>'round_type', round_type), round_date = COALESCE((p_round_data->>'round_date')::DATE, round_date), status = 'completed', holes_played = COALESCE((p_round_data->>'holes_played')::INT, holes_played), total_score = CASE WHEN p_round_data->>'total_score' IS NULL THEN NULL ELSE (p_round_data->>'total_score')::INT END, score_to_par = CASE WHEN p_round_data->>'score_to_par' IS NULL THEN NULL ELSE (p_round_data->>'score_to_par')::INT END, total_putts = CASE WHEN p_round_data->>'total_putts' IS NULL THEN NULL ELSE (p_round_data->>'total_putts')::INT END, total_fairways_hit = CASE WHEN p_round_data->>'total_fairways_hit' IS NULL THEN NULL ELSE (p_round_data->>'total_fairways_hit')::INT END, total_fairways = CASE WHEN p_round_data->>'total_fairways' IS NULL THEN NULL ELSE (p_round_data->>'total_fairways')::INT END, total_gir = CASE WHEN p_round_data->>'total_gir' IS NULL THEN NULL ELSE (p_round_data->>'total_gir')::INT END, total_gir_possible = CASE WHEN p_round_data->>'total_gir_possible' IS NULL THEN NULL ELSE (p_round_data->>'total_gir_possible')::INT END, total_penalties = CASE WHEN p_round_data->>'total_penalties' IS NULL THEN NULL ELSE (p_round_data->>'total_penalties')::INT END, front_nine = CASE WHEN p_round_data->>'front_nine' IS NULL THEN NULL ELSE (p_round_data->>'front_nine')::INT END, back_nine = CASE WHEN p_round_data->>'back_nine' IS NULL THEN NULL ELSE (p_round_data->>'back_nine')::INT END, qualifier_id = CASE WHEN p_round_data->>'qualifier_id' = 'null' OR p_round_data->>'qualifier_id' IS NULL THEN NULL ELSE (p_round_data->>'qualifier_id')::UUID END, qualifier_round_number = CASE WHEN p_round_data->>'qualifier_round_number' IS NULL THEN NULL ELSE (p_round_data->>'qualifier_round_number')::INT END, draft_data = NULL, updated_at = NOW() WHERE id = p_round_id AND player_id = v_player_id; DELETE FROM golf_shots WHERE round_id = p_round_id; DELETE FROM golf_holes WHERE round_id = p_round_id; IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN FOR v_hole_record IN SELECT * FROM jsonb_array_elements(p_holes) LOOP INSERT INTO golf_holes (round_id, hole_number, par, score, putts, fairway_hit, gir, penalty_strokes, up_and_down, sand_save, yardage) VALUES (p_round_id, (v_hole_record->>'hole_number')::INT, (v_hole_record->>'par')::INT, CASE WHEN v_hole_record->>'score' IS NULL THEN NULL ELSE (v_hole_record->>'score')::INT END, CASE WHEN v_hole_record->>'putts' IS NULL THEN NULL ELSE (v_hole_record->>'putts')::INT END, CASE WHEN v_hole_record->>'fairway_hit' IS NULL THEN NULL ELSE (v_hole_record->>'fairway_hit')::BOOLEAN END, CASE WHEN v_hole_record->>'gir' IS NULL THEN NULL ELSE (v_hole_record->>'gir')::BOOLEAN END, CASE WHEN v_hole_record->>'penalty_strokes' IS NULL THEN NULL ELSE (v_hole_record->>'penalty_strokes')::INT END, CASE WHEN v_hole_record->>'up_and_down' IS NULL THEN NULL ELSE (v_hole_record->>'up_and_down')::BOOLEAN END, CASE WHEN v_hole_record->>'sand_save' IS NULL THEN NULL ELSE (v_hole_record->>'sand_save')::BOOLEAN END, CASE WHEN v_hole_record->>'yardage' IS NULL THEN NULL ELSE (v_hole_record->>'yardage')::INT END) RETURNING id, hole_number INTO v_hole_id, v_hole_number; v_inserted_holes := v_inserted_holes || jsonb_build_object('hole_id', v_hole_id, 'hole_number', v_hole_number); END LOOP; END IF; IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN FOR v_shot_group IN SELECT * FROM jsonb_array_elements(p_shots) LOOP v_hole_number := (v_shot_group->>'hole_number')::INT; SELECT (elem->>'hole_id')::UUID INTO v_hole_id FROM jsonb_array_elements(v_inserted_holes) elem WHERE (elem->>'hole_number')::INT = v_hole_number LIMIT 1; IF v_hole_id IS NULL THEN CONTINUE; END IF; FOR v_shot IN SELECT * FROM jsonb_array_elements(v_shot_group->'shots') LOOP INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, shot_type, club_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, result, distance_to_hole_after, distance_unit_after, shot_distance, miss_direction, putt_break, putt_slope, putt_distance_feet, putt_made, is_penalty, penalty_type) VALUES (p_round_id, v_hole_id, v_hole_number, (v_shot->>'shot_number')::INT, v_shot->>'shot_type', v_shot->>'club_type', v_shot->>'lie_before', v_shot->>'lie_after', (v_shot->>'distance_to_hole_before')::NUMERIC, v_shot->>'distance_unit_before', v_shot->>'result', CASE WHEN v_shot->>'distance_to_hole_after' IS NULL THEN NULL ELSE (v_shot->>'distance_to_hole_after')::NUMERIC END, v_shot->>'distance_unit_after', CASE WHEN v_shot->>'shot_distance' IS NULL THEN NULL ELSE (v_shot->>'shot_distance')::NUMERIC END, v_shot->>'miss_direction', v_shot->>'putt_break', v_shot->>'putt_slope', CASE WHEN v_shot->>'putt_distance_feet' IS NULL THEN NULL ELSE (v_shot->>'putt_distance_feet')::NUMERIC END, CASE WHEN v_shot->>'putt_made' IS NULL THEN NULL ELSE (v_shot->>'putt_made')::BOOLEAN END, COALESCE((v_shot->>'is_penalty')::BOOLEAN, false), v_shot->>'penalty_type') RETURNING id, hole_number, shot_number INTO v_shot_id, v_hole_number, v_shot_number; v_inserted_shots := v_inserted_shots || jsonb_build_object('shot_id', v_shot_id, 'hole_number', v_hole_number, 'shot_number', v_shot_number); END LOOP; END LOOP; END IF; IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN FOR v_putt IN SELECT * FROM jsonb_array_elements(p_putt_details) LOOP SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id FROM jsonb_array_elements(v_inserted_shots) elem WHERE (elem->>'hole_number')::INT = (v_putt->>'hole_number')::INT AND (elem->>'shot_number')::INT = (v_putt->>'shot_number')::INT LIMIT 1; IF v_target_shot_id IS NOT NULL THEN BEGIN v_distance_feet := (v_putt->>'distance_feet')::NUMERIC; IF v_distance_feet IS NOT NULL THEN v_distance_feet := GREATEST(0, LEAST(500, v_distance_feet)); END IF; EXCEPTION WHEN OTHERS THEN v_distance_feet := NULL; END; v_break_direction := v_putt->>'break_direction'; IF v_break_direction IS NOT NULL AND v_break_direction NOT IN ('left_to_right', 'right_to_left', 'straight', 'multiple') THEN v_break_direction := NULL; END IF; BEGIN v_estimated_break := (v_putt->>'estimated_break_inches')::INT; IF v_estimated_break IS NOT NULL THEN v_estimated_break := GREATEST(0, LEAST(120, v_estimated_break)); END IF; EXCEPTION WHEN OTHERS THEN v_estimated_break := NULL; END; BEGIN INSERT INTO putt_details (shot_id, miss_tags, break_direction, estimated_break_inches, distance_feet, made) VALUES (v_target_shot_id, CASE WHEN v_putt->'miss_tags' IS NULL THEN '{}'::TEXT[] ELSE ARRAY(SELECT jsonb_array_elements_text(v_putt->'miss_tags')) END, v_break_direction, v_estimated_break, v_distance_feet, COALESCE((v_putt->>'made')::BOOLEAN, false)); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT; v_warnings := v_warnings || jsonb_build_object('step', 'insert_putt_details', 'hole_number', (v_putt->>'hole_number')::INT, 'shot_number', (v_putt->>'shot_number')::INT, 'error_code', v_err_state, 'error', v_err_msg); END; END IF; END LOOP; END IF; IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN FOR v_approach IN SELECT * FROM jsonb_array_elements(p_approach_details) LOOP SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id FROM jsonb_array_elements(v_inserted_shots) elem WHERE (elem->>'hole_number')::INT = (v_approach->>'hole_number')::INT AND (elem->>'shot_number')::INT = (v_approach->>'shot_number')::INT LIMIT 1; IF v_target_shot_id IS NOT NULL THEN v_lie_type := v_approach->>'lie_type'; IF v_lie_type IS NOT NULL AND v_lie_type NOT IN ('fairway','rough','sand','bunker','recovery','hazard','green','tee','other','penalty','deep_rough') THEN v_lie_type := NULL; END IF; v_miss_direction := v_approach->>'miss_direction'; IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN ('short','long','left','right','short_left','short_right','long_left','long_right') THEN v_miss_direction := NULL; END IF; BEGIN v_distance_from_green := (v_approach->>'distance_from_green_yards')::NUMERIC; IF v_distance_from_green IS NOT NULL AND v_distance_from_green < 0 THEN v_distance_from_green := 0; END IF; EXCEPTION WHEN OTHERS THEN v_distance_from_green := NULL; END; BEGIN INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards) VALUES (v_target_shot_id, v_miss_direction, v_lie_type, v_distance_from_green); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT; v_warnings := v_warnings || jsonb_build_object('step', 'insert_approach_miss_details', 'hole_number', (v_approach->>'hole_number')::INT, 'shot_number', (v_approach->>'shot_number')::INT, 'error_code', v_err_state, 'error', v_err_msg); END; END IF; END LOOP; END IF; PERFORM recalculate_round_strokes_gained(p_round_id); RETURN jsonb_build_object('success', true, 'round_id', p_round_id, 'warnings', v_warnings); END; $$;


--
-- Name: sync_coach_last_email_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_coach_last_email_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_coach_id        uuid;
  v_normalized_type text;
BEGIN
  IF NEW.contact_log_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coach_id INTO v_coach_id
    FROM crm_contact_log
   WHERE id = NEW.contact_log_id;

  IF v_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Strip the 'email.' prefix for the denorm column so downstream
  -- consumers see a clean value like 'opened' instead of 'email.opened'.
  IF NEW.event_type LIKE 'email.%' THEN
    v_normalized_type := substring(NEW.event_type FROM 7);
  ELSE
    v_normalized_type := NEW.event_type;
  END IF;

  UPDATE crm_coaches
     SET last_email_event_type = v_normalized_type,
         last_email_event_at   = NEW.occurred_at,
         updated_at            = now()
   WHERE id = v_coach_id
     AND (last_email_event_at IS NULL OR NEW.occurred_at >= last_email_event_at);

  RETURN NEW;
END;
$$;


--
-- Name: sync_email_snapshot_from_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_email_snapshot_from_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_from       text;
  v_to         text[];
  v_subject    text;
  v_tags       jsonb;
  v_source     text;
  v_recipient  text;
BEGIN
  -- Pull message fields from the raw payload (if present)
  v_from    := NEW.raw_payload #>> '{data,from}';
  v_subject := NEW.raw_payload #>> '{data,subject}';
  v_tags    := NEW.raw_payload -> 'data' -> 'tags';

  -- Resend sends `to` as a JSON array of strings. Fall back to recipient_email.
  IF NEW.raw_payload #> '{data,to}' IS NOT NULL THEN
    SELECT array_agg(value::text) INTO v_to
      FROM jsonb_array_elements_text(NEW.raw_payload #> '{data,to}');
  ELSIF NEW.recipient_email IS NOT NULL THEN
    v_to := ARRAY[NEW.recipient_email];
  ELSE
    v_to := '{}';
  END IF;

  -- Classify source by whether it links to a CRM contact log
  IF NEW.contact_log_id IS NOT NULL THEN
    v_source := 'crm';
  ELSE
    v_source := 'transactional';
  END IF;

  INSERT INTO emails AS e (
    resend_message_id,
    from_address,
    to_addresses,
    subject,
    tags,
    contact_log_id,
    source,
    sent_at,
    delivered_at,
    delivery_delayed_at,
    opened_at,
    clicked_at,
    bounced_at,
    complained_at,
    last_event_type,
    last_event_at,
    open_count,
    click_count,
    first_seen_at,
    updated_at
  ) VALUES (
    NEW.resend_message_id,
    v_from,
    v_to,
    v_subject,
    v_tags,
    NEW.contact_log_id,
    v_source,
    CASE WHEN NEW.event_type = 'email.sent'              THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.delivered'         THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.delivery_delayed'  THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.opened'            THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.clicked'           THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.bounced'           THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.complained'        THEN NEW.occurred_at END,
    NEW.event_type,
    NEW.occurred_at,
    CASE WHEN NEW.event_type = 'email.opened'  THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'email.clicked' THEN 1 ELSE 0 END,
    NEW.occurred_at,
    now()
  )
  ON CONFLICT (resend_message_id) DO UPDATE SET
    -- Only fill content fields if currently null (email.sent usually arrives first)
    from_address       = COALESCE(e.from_address, EXCLUDED.from_address),
    to_addresses       = CASE WHEN e.to_addresses = '{}'::text[] THEN EXCLUDED.to_addresses ELSE e.to_addresses END,
    subject            = COALESCE(e.subject, EXCLUDED.subject),
    tags               = COALESCE(e.tags, EXCLUDED.tags),
    contact_log_id     = COALESCE(e.contact_log_id, EXCLUDED.contact_log_id),
    source             = CASE WHEN e.source = 'unknown' THEN EXCLUDED.source ELSE e.source END,

    -- Status timestamps: take earliest per event type
    sent_at             = LEAST(e.sent_at,             EXCLUDED.sent_at),
    delivered_at        = LEAST(e.delivered_at,        EXCLUDED.delivered_at),
    delivery_delayed_at = LEAST(e.delivery_delayed_at, EXCLUDED.delivery_delayed_at),
    opened_at           = LEAST(e.opened_at,           EXCLUDED.opened_at),
    clicked_at          = LEAST(e.clicked_at,          EXCLUDED.clicked_at),
    bounced_at          = LEAST(e.bounced_at,          EXCLUDED.bounced_at),
    complained_at       = LEAST(e.complained_at,       EXCLUDED.complained_at),

    -- Latest event wins for last_event_*
    last_event_type = CASE WHEN EXCLUDED.last_event_at > COALESCE(e.last_event_at, 'epoch'::timestamptz)
                           THEN EXCLUDED.last_event_type ELSE e.last_event_type END,
    last_event_at   = GREATEST(e.last_event_at, EXCLUDED.last_event_at),

    open_count  = e.open_count  + CASE WHEN NEW.event_type = 'email.opened'  THEN 1 ELSE 0 END,
    click_count = e.click_count + CASE WHEN NEW.event_type = 'email.clicked' THEN 1 ELSE 0 END,

    updated_at = now();

  RETURN NEW;
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: update_crm_automations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_automations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_crm_coaches_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_coaches_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_crm_events_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_events_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_crm_google_tokens_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_google_tokens_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_crm_notes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_notes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_crm_segments_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_segments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_crm_sequences_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_sequences_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_crm_tasks_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crm_tasks_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_device_tokens_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_device_tokens_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_document_version_info(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_document_version_info() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Update the parent document with new version info
  UPDATE golf_documents
  SET
    current_version_id = NEW.id,
    version_count = (
      SELECT COUNT(*) FROM golf_document_versions WHERE document_id = NEW.document_id
    ),
    file_url = NEW.file_url,
    file_size = NEW.file_size,
    updated_at = NOW()
  WHERE id = NEW.document_id;

  RETURN NEW;
END;
$$;


--
-- Name: update_golf_expenses_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_golf_expenses_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_golf_task_reminders_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_golf_task_reminders_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_golf_task_templates_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_golf_task_templates_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_golf_team_join_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_golf_team_join_requests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_message_has_attachments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_message_has_attachments() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE golf_messages
    SET has_attachments = TRUE
    WHERE id = NEW.message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Check if any attachments remain
    IF NOT EXISTS (
      SELECT 1 FROM golf_message_attachments
      WHERE message_id = OLD.message_id
    ) THEN
      UPDATE golf_messages
      SET has_attachments = FALSE
      WHERE id = OLD.message_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_player_stats_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_player_stats_cache() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_player_id UUID;
  v_rounds_played INTEGER;
  v_total_score NUMERIC;
  v_total_score_to_par NUMERIC;
  v_best_round INTEGER;
  v_worst_round INTEGER;
  v_total_eagles INTEGER;
  v_total_birdies INTEGER;
  v_total_pars INTEGER;
  v_total_bogeys INTEGER;
  v_total_double_bogeys INTEGER;
  v_total_triple_plus INTEGER;
  v_total_fairways_hit INTEGER;
  v_total_fairways INTEGER;
  v_total_greens_hit INTEGER;
  v_total_greens INTEGER;
  v_total_scrambles_converted INTEGER;
  v_total_scramble_attempts INTEGER;
  v_total_sand_saves INTEGER;
  v_total_sand_attempts INTEGER;
  v_total_putts INTEGER;
  v_total_one_putts INTEGER;
  v_total_three_putts INTEGER;
  v_total_penalties INTEGER;
  v_driving_accuracy NUMERIC(5,2);
  v_gir_percentage NUMERIC(5,2);
  v_scrambling_percentage NUMERIC(5,2);
  v_sand_save_percentage NUMERIC(5,2);
  v_putts_per_round NUMERIC(4,2);
  v_total_holes INTEGER;
  v_one_putt_percentage NUMERIC(5,2);
  v_three_putt_percentage NUMERIC(5,2);
  v_penalty_per_round NUMERIC(4,2);
  v_scoring_average NUMERIC(5,2);
  v_scoring_average_vs_par NUMERIC(5,2);
  v_best_round_normalized NUMERIC(5,2);
  v_worst_round_normalized NUMERIC(5,2);
  v_first_round_date DATE;
  v_last_round_date DATE;
  v_par3_average NUMERIC(4,2);
  v_par4_average NUMERIC(4,2);
  v_par5_average NUMERIC(4,2);
  v_rounds_18 INTEGER;
  v_total_score_18 NUMERIC;
  v_score_to_par_18 NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  SELECT
    COUNT(*),
    SUM(total_score),
    SUM(score_to_par),
    MIN(total_score),
    MAX(total_score),
    SUM(eagles),
    SUM(birdies),
    SUM(pars),
    SUM(bogeys),
    SUM(double_bogeys),
    SUM(triple_plus),
    SUM(fairways_hit),
    SUM(fairways_total),
    SUM(greens_hit),
    SUM(greens_total),
    SUM(scrambles_converted),
    SUM(scramble_attempts),
    SUM(sand_saves),
    SUM(sand_attempts),
    SUM(total_putts),
    SUM(one_putts),
    SUM(three_putts),
    SUM(penalty_strokes)
  INTO
    v_rounds_played,
    v_total_score,
    v_total_score_to_par,
    v_best_round,
    v_worst_round,
    v_total_eagles,
    v_total_birdies,
    v_total_pars,
    v_total_bogeys,
    v_total_double_bogeys,
    v_total_triple_plus,
    v_total_fairways_hit,
    v_total_fairways,
    v_total_greens_hit,
    v_total_greens,
    v_total_scrambles_converted,
    v_total_scramble_attempts,
    v_total_sand_saves,
    v_total_sand_attempts,
    v_total_putts,
    v_total_one_putts,
    v_total_three_putts,
    v_total_penalties
  FROM golf_round_stats_cache
  WHERE player_id = v_player_id;

  SELECT MIN(round_date), MAX(round_date)
  INTO v_first_round_date, v_last_round_date
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  SELECT
    AVG(CASE WHEN par = 3 THEN score END),
    AVG(CASE WHEN par = 4 THEN score END),
    AVG(CASE WHEN par = 5 THEN score END)
  INTO v_par3_average, v_par4_average, v_par5_average
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.status = 'completed';

  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0)
  INTO v_total_holes
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  SELECT COUNT(*), SUM(r.total_score), SUM(r.score_to_par)
  INTO v_rounds_18, v_total_score_18, v_score_to_par_18
  FROM golf_rounds r
  WHERE r.player_id = v_player_id
    AND r.status = 'completed'
    AND r.total_score IS NOT NULL
    AND COALESCE(r.holes_played, 18) = 18;

  IF v_total_fairways > 0 THEN
    v_driving_accuracy := (v_total_fairways_hit::NUMERIC / v_total_fairways) * 100;
  END IF;

  IF v_total_greens > 0 THEN
    v_gir_percentage := (v_total_greens_hit::NUMERIC / v_total_greens) * 100;
  END IF;

  IF v_total_scramble_attempts > 0 THEN
    v_scrambling_percentage := (v_total_scrambles_converted::NUMERIC / v_total_scramble_attempts) * 100;
  END IF;

  IF v_total_sand_attempts > 0 THEN
    v_sand_save_percentage := (v_total_sand_saves::NUMERIC / v_total_sand_attempts) * 100;
  END IF;

  IF v_rounds_18 > 0 THEN
    v_scoring_average := v_total_score_18::NUMERIC / v_rounds_18;
    v_scoring_average_vs_par := v_score_to_par_18::NUMERIC / v_rounds_18;
  END IF;

  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  ELSIF v_rounds_played > 0 THEN
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
  END IF;

  SELECT
    MIN(r.total_score * (18.0 / COALESCE(r.holes_played, 18))),
    MAX(r.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r
  WHERE r.player_id = v_player_id
    AND r.status = 'completed'
    AND r.total_score IS NOT NULL;

  IF v_rounds_played = 0 OR v_rounds_played IS NULL THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = v_player_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO golf_player_stats_cache (
    player_id,
    scoring_average,
    scoring_average_vs_par,
    rounds_played,
    best_round,
    worst_round,
    par3_average,
    par4_average,
    par5_average,
    eagles,
    birdies,
    pars,
    bogeys,
    double_bogeys,
    triple_plus,
    driving_accuracy_percentage,
    fairways_hit,
    fairways_total,
    gir_percentage,
    greens_hit,
    greens_total,
    scrambling_percentage,
    scrambles_converted,
    scramble_attempts,
    sand_save_percentage,
    sand_saves,
    sand_attempts,
    putts_per_round,
    one_putt_percentage,
    three_putt_percentage,
    total_putts,
    penalty_strokes_per_round,
    total_penalties,
    last_round_date,
    rounds_in_calculation,
    calculation_period_start,
    calculation_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_player_id,
    v_scoring_average,
    v_scoring_average_vs_par,
    v_rounds_played,
    COALESCE(v_best_round_normalized::INTEGER, v_best_round),
    COALESCE(v_worst_round_normalized::INTEGER, v_worst_round),
    v_par3_average,
    v_par4_average,
    v_par5_average,
    v_total_eagles,
    v_total_birdies,
    v_total_pars,
    v_total_bogeys,
    v_total_double_bogeys,
    v_total_triple_plus,
    v_driving_accuracy,
    v_total_fairways_hit,
    v_total_fairways,
    v_gir_percentage,
    v_total_greens_hit,
    v_total_greens,
    v_scrambling_percentage,
    v_total_scrambles_converted,
    v_total_scramble_attempts,
    v_sand_save_percentage,
    v_total_sand_saves,
    v_total_sand_attempts,
    v_putts_per_round,
    v_one_putt_percentage,
    v_three_putt_percentage,
    v_total_putts,
    v_penalty_per_round,
    v_total_penalties,
    v_last_round_date,
    v_rounds_played,
    v_first_round_date,
    v_last_round_date,
    NOW(),
    NOW()
  )
  ON CONFLICT (player_id) DO UPDATE SET
    scoring_average = EXCLUDED.scoring_average,
    scoring_average_vs_par = EXCLUDED.scoring_average_vs_par,
    rounds_played = EXCLUDED.rounds_played,
    best_round = EXCLUDED.best_round,
    worst_round = EXCLUDED.worst_round,
    par3_average = EXCLUDED.par3_average,
    par4_average = EXCLUDED.par4_average,
    par5_average = EXCLUDED.par5_average,
    eagles = EXCLUDED.eagles,
    birdies = EXCLUDED.birdies,
    pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys,
    double_bogeys = EXCLUDED.double_bogeys,
    triple_plus = EXCLUDED.triple_plus,
    driving_accuracy_percentage = EXCLUDED.driving_accuracy_percentage,
    fairways_hit = EXCLUDED.fairways_hit,
    fairways_total = EXCLUDED.fairways_total,
    gir_percentage = EXCLUDED.gir_percentage,
    greens_hit = EXCLUDED.greens_hit,
    greens_total = EXCLUDED.greens_total,
    scrambling_percentage = EXCLUDED.scrambling_percentage,
    scrambles_converted = EXCLUDED.scrambles_converted,
    scramble_attempts = EXCLUDED.scramble_attempts,
    sand_save_percentage = EXCLUDED.sand_save_percentage,
    sand_saves = EXCLUDED.sand_saves,
    sand_attempts = EXCLUDED.sand_attempts,
    putts_per_round = EXCLUDED.putts_per_round,
    one_putt_percentage = EXCLUDED.one_putt_percentage,
    three_putt_percentage = EXCLUDED.three_putt_percentage,
    total_putts = EXCLUDED.total_putts,
    penalty_strokes_per_round = EXCLUDED.penalty_strokes_per_round,
    total_penalties = EXCLUDED.total_penalties,
    last_round_date = EXCLUDED.last_round_date,
    rounds_in_calculation = EXCLUDED.rounds_in_calculation,
    calculation_period_start = EXCLUDED.calculation_period_start,
    calculation_period_end = EXCLUDED.calculation_period_end,
    updated_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_player_stats_cache_enhanced(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_player_stats_cache_enhanced() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_player_id UUID;
  v_last_5_avg NUMERIC(5,2);
  v_last_10_avg NUMERIC(5,2);
  v_prev_5_avg NUMERIC(5,2);
  v_improvement NUMERIC(5,2);
  v_trend TEXT;
  v_round_ids UUID[];
  v_season_start DATE;
  v_rounds_this_season INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  v_season_start := make_date(
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER
    END,
    8,
    1
  );

  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC)
  INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id
    AND r.round_date >= v_season_start;

  SELECT AVG(r.total_score)
  INTO v_last_5_avg
  FROM (
    SELECT r2.id, r2.total_score
    FROM golf_rounds r2
    WHERE r2.player_id = v_player_id
      AND r2.status = 'completed'
      AND r2.total_score IS NOT NULL
      AND COALESCE(r2.holes_played, 18) = 18
    ORDER BY r2.round_date DESC
    LIMIT 5
  ) r;

  SELECT AVG(r.total_score)
  INTO v_last_10_avg
  FROM (
    SELECT r2.id, r2.total_score
    FROM golf_rounds r2
    WHERE r2.player_id = v_player_id
      AND r2.status = 'completed'
      AND r2.total_score IS NOT NULL
      AND COALESCE(r2.holes_played, 18) = 18
    ORDER BY r2.round_date DESC
    LIMIT 10
  ) r;

  SELECT AVG(r.total_score)
  INTO v_prev_5_avg
  FROM (
    SELECT r2.id, r2.total_score
    FROM golf_rounds r2
    WHERE r2.player_id = v_player_id
      AND r2.status = 'completed'
      AND r2.total_score IS NOT NULL
      AND COALESCE(r2.holes_played, 18) = 18
    ORDER BY r2.round_date DESC
    LIMIT 5 OFFSET 5
  ) r;

  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg;
    IF v_improvement > 1.0 THEN
      v_trend := 'improving';
    ELSIF v_improvement < -1.0 THEN
      v_trend := 'declining';
    ELSE
      v_trend := 'stable';
    END IF;
  ELSE
    v_improvement := NULL;
    v_trend := 'stable';
  END IF;

  UPDATE golf_player_stats_cache
  SET
    last_5_average = v_last_5_avg,
    last_10_average = v_last_10_avg,
    improvement_trend = v_improvement,
    trend_direction = v_trend,
    rounds_this_season = v_rounds_this_season,
    season_start_date = v_season_start,
    round_ids_included = v_round_ids,
    is_stale = FALSE,
    next_refresh_due = NOW() + INTERVAL '1 hour',
    updated_at = NOW()
  WHERE player_id = v_player_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: FUNCTION update_player_stats_cache_enhanced(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_player_stats_cache_enhanced() IS 'Enhanced trigger function that calculates trend stats after player cache is updated';


--
-- Name: update_player_stats_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_player_stats_complete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_player_id UUID;
  v_rounds_played INTEGER; v_total_score NUMERIC; v_total_score_to_par NUMERIC;
  v_best_round INTEGER; v_worst_round INTEGER;
  v_total_eagles INTEGER; v_total_birdies INTEGER; v_total_pars INTEGER;
  v_total_bogeys INTEGER; v_total_double_bogeys INTEGER; v_total_triple_plus INTEGER;
  v_total_fairways_hit INTEGER; v_total_fairways INTEGER;
  v_total_greens_hit INTEGER; v_total_greens INTEGER;
  v_total_scrambles_converted INTEGER; v_total_scramble_attempts INTEGER;
  v_total_sand_saves INTEGER; v_total_sand_attempts INTEGER;
  v_total_putts INTEGER; v_total_one_putts INTEGER; v_total_three_putts INTEGER;
  v_total_penalties INTEGER;
  v_driving_accuracy NUMERIC(5,2); v_gir_percentage NUMERIC(5,2);
  v_scrambling_percentage NUMERIC(5,2); v_sand_save_percentage NUMERIC(5,2);
  v_putts_per_round NUMERIC(4,2); v_total_holes INTEGER;
  v_one_putt_percentage NUMERIC(5,2); v_three_putt_percentage NUMERIC(5,2);
  v_penalty_per_round NUMERIC(4,2);
  v_scoring_average NUMERIC(5,2); v_scoring_average_vs_par NUMERIC(5,2);
  v_best_round_normalized NUMERIC(5,2); v_worst_round_normalized NUMERIC(5,2);
  v_first_round_date DATE; v_last_round_date DATE;
  v_par3_average NUMERIC(4,2); v_par4_average NUMERIC(4,2); v_par5_average NUMERIC(4,2);
  v_rounds_18 INTEGER; v_total_score_18 NUMERIC; v_score_to_par_18 NUMERIC;
  v_last_5_avg NUMERIC(5,2); v_last_10_avg NUMERIC(5,2); v_prev_5_avg NUMERIC(5,2);
  v_improvement NUMERIC(5,2); v_trend TEXT;
  v_round_ids UUID[]; v_season_start DATE; v_rounds_this_season INTEGER;
  v_sg_total_avg NUMERIC; v_sg_tee_avg NUMERIC; v_sg_approach_avg NUMERIC;
  v_sg_ag_avg NUMERIC; v_sg_putting_avg NUMERIC;
  v_sg_total_sum NUMERIC; v_sg_tee_sum NUMERIC; v_sg_approach_sum NUMERIC;
  v_sg_ag_sum NUMERIC; v_sg_putting_sum NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN v_player_id := OLD.player_id; ELSE v_player_id := NEW.player_id; END IF;

  SELECT COUNT(*), SUM(total_score), SUM(score_to_par), MIN(total_score), MAX(total_score),
    SUM(eagles), SUM(birdies), SUM(pars), SUM(bogeys), SUM(double_bogeys), SUM(triple_plus),
    SUM(fairways_hit), SUM(fairways_total), SUM(greens_hit), SUM(greens_total),
    SUM(scrambles_converted), SUM(scramble_attempts), SUM(sand_saves), SUM(sand_attempts),
    SUM(total_putts), SUM(one_putts), SUM(three_putts), SUM(penalty_strokes)
  INTO v_rounds_played, v_total_score, v_total_score_to_par, v_best_round, v_worst_round,
    v_total_eagles, v_total_birdies, v_total_pars, v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_total_fairways_hit, v_total_fairways, v_total_greens_hit, v_total_greens,
    v_total_scrambles_converted, v_total_scramble_attempts, v_total_sand_saves, v_total_sand_attempts,
    v_total_putts, v_total_one_putts, v_total_three_putts, v_total_penalties
  FROM golf_round_stats_cache WHERE player_id = v_player_id;

  SELECT MIN(round_date), MAX(round_date) INTO v_first_round_date, v_last_round_date
  FROM golf_rounds WHERE player_id = v_player_id AND status = 'completed';

  SELECT AVG(CASE WHEN par=3 THEN score END), AVG(CASE WHEN par=4 THEN score END), AVG(CASE WHEN par=5 THEN score END)
  INTO v_par3_average, v_par4_average, v_par5_average
  FROM golf_holes h JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.status = 'completed';

  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0) INTO v_total_holes
  FROM golf_rounds WHERE player_id = v_player_id AND status = 'completed';

  SELECT COUNT(*), SUM(r.total_score), SUM(r.score_to_par) INTO v_rounds_18, v_total_score_18, v_score_to_par_18
  FROM golf_rounds r WHERE r.player_id = v_player_id AND r.status = 'completed'
    AND r.total_score IS NOT NULL AND COALESCE(r.holes_played, 18) = 18;

  IF v_total_fairways > 0 THEN v_driving_accuracy := (v_total_fairways_hit::NUMERIC / v_total_fairways) * 100; END IF;
  IF v_total_greens > 0 THEN v_gir_percentage := (v_total_greens_hit::NUMERIC / v_total_greens) * 100; END IF;
  IF v_total_scramble_attempts > 0 THEN v_scrambling_percentage := (v_total_scrambles_converted::NUMERIC / v_total_scramble_attempts) * 100; END IF;
  IF v_total_sand_attempts > 0 THEN v_sand_save_percentage := (v_total_sand_saves::NUMERIC / v_total_sand_attempts) * 100; END IF;
  IF v_rounds_18 > 0 THEN v_scoring_average := v_total_score_18::NUMERIC / v_rounds_18; v_scoring_average_vs_par := v_score_to_par_18::NUMERIC / v_rounds_18; END IF;
  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  ELSIF v_rounds_played > 0 THEN
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
  END IF;

  SELECT MIN(r.total_score * (18.0 / COALESCE(r.holes_played, 18))), MAX(r.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r WHERE r.player_id = v_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL;

  IF v_rounds_played = 0 OR v_rounds_played IS NULL THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = v_player_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Enhanced stats
  v_season_start := make_date(CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER END, 8, 1);
  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC) INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc JOIN golf_rounds r ON r.id = rsc.round_id WHERE rsc.player_id = v_player_id AND r.round_date >= v_season_start;

  SELECT AVG(r.total_score) INTO v_last_5_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5) r;
  SELECT AVG(r.total_score) INTO v_last_10_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 10) r;
  SELECT AVG(r.total_score) INTO v_prev_5_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5 OFFSET 5) r;

  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg;
    v_trend := CASE WHEN v_improvement > 1.0 THEN 'improving' WHEN v_improvement < -1.0 THEN 'declining' ELSE 'stable' END;
  ELSE v_improvement := NULL; v_trend := 'stable'; END IF;

  -- Strokes gained
  SELECT AVG(strokes_gained_total), AVG(strokes_gained_tee), AVG(strokes_gained_approach), AVG(strokes_gained_around_green), AVG(strokes_gained_putting),
    SUM(strokes_gained_total), SUM(strokes_gained_tee), SUM(strokes_gained_approach), SUM(strokes_gained_around_green), SUM(strokes_gained_putting)
  INTO v_sg_total_avg, v_sg_tee_avg, v_sg_approach_avg, v_sg_ag_avg, v_sg_putting_avg, v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum
  FROM golf_round_stats_cache WHERE player_id = v_player_id AND strokes_gained_total IS NOT NULL;

  INSERT INTO golf_player_stats_cache (player_id, scoring_average, scoring_average_vs_par, rounds_played, best_round, worst_round,
    par3_average, par4_average, par5_average, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    driving_accuracy_percentage, fairways_hit, fairways_total, gir_percentage, greens_hit, greens_total,
    scrambling_percentage, scrambles_converted, scramble_attempts, sand_save_percentage, sand_saves, sand_attempts,
    putts_per_round, one_putt_percentage, three_putt_percentage, total_putts, penalty_strokes_per_round, total_penalties,
    last_round_date, rounds_in_calculation, calculation_period_start, calculation_period_end,
    last_5_average, last_10_average, improvement_trend, trend_direction, rounds_this_season, season_start_date, round_ids_included,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    sg_total_per_round, sg_tee_per_round, sg_approach_per_round, sg_around_green_per_round, sg_putting_per_round,
    is_stale, next_refresh_due, created_at, updated_at
  ) VALUES (
    v_player_id, v_scoring_average, v_scoring_average_vs_par, v_rounds_played,
    COALESCE(v_best_round_normalized::INTEGER, v_best_round), COALESCE(v_worst_round_normalized::INTEGER, v_worst_round),
    v_par3_average, v_par4_average, v_par5_average, v_total_eagles, v_total_birdies, v_total_pars, v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_driving_accuracy, v_total_fairways_hit, v_total_fairways, v_gir_percentage, v_total_greens_hit, v_total_greens,
    v_scrambling_percentage, v_total_scrambles_converted, v_total_scramble_attempts, v_sand_save_percentage, v_total_sand_saves, v_total_sand_attempts,
    v_putts_per_round, v_one_putt_percentage, v_three_putt_percentage, v_total_putts, v_penalty_per_round, v_total_penalties,
    v_last_round_date, v_rounds_played, v_first_round_date, v_last_round_date,
    v_last_5_avg, v_last_10_avg, v_improvement, v_trend, v_rounds_this_season, v_season_start, v_round_ids,
    v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum,
    ROUND(v_sg_total_avg, 2), ROUND(v_sg_tee_avg, 2), ROUND(v_sg_approach_avg, 2), ROUND(v_sg_ag_avg, 2), ROUND(v_sg_putting_avg, 2),
    FALSE, NOW() + INTERVAL '1 hour', NOW(), NOW()
  ) ON CONFLICT (player_id) DO UPDATE SET
    scoring_average=EXCLUDED.scoring_average, scoring_average_vs_par=EXCLUDED.scoring_average_vs_par,
    rounds_played=EXCLUDED.rounds_played, best_round=EXCLUDED.best_round, worst_round=EXCLUDED.worst_round,
    par3_average=EXCLUDED.par3_average, par4_average=EXCLUDED.par4_average, par5_average=EXCLUDED.par5_average,
    eagles=EXCLUDED.eagles, birdies=EXCLUDED.birdies, pars=EXCLUDED.pars, bogeys=EXCLUDED.bogeys, double_bogeys=EXCLUDED.double_bogeys, triple_plus=EXCLUDED.triple_plus,
    driving_accuracy_percentage=EXCLUDED.driving_accuracy_percentage, fairways_hit=EXCLUDED.fairways_hit, fairways_total=EXCLUDED.fairways_total,
    gir_percentage=EXCLUDED.gir_percentage, greens_hit=EXCLUDED.greens_hit, greens_total=EXCLUDED.greens_total,
    scrambling_percentage=EXCLUDED.scrambling_percentage, scrambles_converted=EXCLUDED.scrambles_converted, scramble_attempts=EXCLUDED.scramble_attempts,
    sand_save_percentage=EXCLUDED.sand_save_percentage, sand_saves=EXCLUDED.sand_saves, sand_attempts=EXCLUDED.sand_attempts,
    putts_per_round=EXCLUDED.putts_per_round, one_putt_percentage=EXCLUDED.one_putt_percentage, three_putt_percentage=EXCLUDED.three_putt_percentage,
    total_putts=EXCLUDED.total_putts, penalty_strokes_per_round=EXCLUDED.penalty_strokes_per_round, total_penalties=EXCLUDED.total_penalties,
    last_round_date=EXCLUDED.last_round_date, rounds_in_calculation=EXCLUDED.rounds_in_calculation,
    calculation_period_start=EXCLUDED.calculation_period_start, calculation_period_end=EXCLUDED.calculation_period_end,
    last_5_average=EXCLUDED.last_5_average, last_10_average=EXCLUDED.last_10_average, improvement_trend=EXCLUDED.improvement_trend, trend_direction=EXCLUDED.trend_direction,
    rounds_this_season=EXCLUDED.rounds_this_season, season_start_date=EXCLUDED.season_start_date, round_ids_included=EXCLUDED.round_ids_included,
    strokes_gained_total=EXCLUDED.strokes_gained_total, strokes_gained_tee=EXCLUDED.strokes_gained_tee, strokes_gained_approach=EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green=EXCLUDED.strokes_gained_around_green, strokes_gained_putting=EXCLUDED.strokes_gained_putting,
    sg_total_per_round=EXCLUDED.sg_total_per_round, sg_tee_per_round=EXCLUDED.sg_tee_per_round, sg_approach_per_round=EXCLUDED.sg_approach_per_round,
    sg_around_green_per_round=EXCLUDED.sg_around_green_per_round, sg_putting_per_round=EXCLUDED.sg_putting_per_round,
    is_stale=FALSE, next_refresh_due=NOW()+INTERVAL '1 hour', updated_at=NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_player_stats_strokes_gained(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_player_stats_strokes_gained() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_player_id UUID; v_sg RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN v_player_id := OLD.player_id; ELSE v_player_id := NEW.player_id; END IF;
  SELECT AVG(strokes_gained_total) sg_total_avg, AVG(strokes_gained_tee) sg_tee_avg,
    AVG(strokes_gained_approach) sg_approach_avg, AVG(strokes_gained_around_green) sg_ag_avg,
    AVG(strokes_gained_putting) sg_putting_avg,
    SUM(strokes_gained_total) sg_total_sum, SUM(strokes_gained_tee) sg_tee_sum,
    SUM(strokes_gained_approach) sg_approach_sum, SUM(strokes_gained_around_green) sg_ag_sum,
    SUM(strokes_gained_putting) sg_putting_sum
  INTO v_sg FROM golf_round_stats_cache WHERE player_id = v_player_id AND strokes_gained_total IS NOT NULL;
  UPDATE golf_player_stats_cache SET
    strokes_gained_total=v_sg.sg_total_sum, strokes_gained_tee=v_sg.sg_tee_sum,
    strokes_gained_approach=v_sg.sg_approach_sum, strokes_gained_around_green=v_sg.sg_ag_sum,
    strokes_gained_putting=v_sg.sg_putting_sum,
    sg_total_per_round=ROUND(v_sg.sg_total_avg,2), sg_tee_per_round=ROUND(v_sg.sg_tee_avg,2),
    sg_approach_per_round=ROUND(v_sg.sg_approach_avg,2), sg_around_green_per_round=ROUND(v_sg.sg_ag_avg,2),
    sg_putting_per_round=ROUND(v_sg.sg_putting_avg,2), updated_at=NOW()
  WHERE player_id = v_player_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_player_stats_strokes_gained(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_player_stats_strokes_gained(p_player_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count          INTEGER;
  v_sg_total       NUMERIC;
  v_sg_tee         NUMERIC;
  v_sg_approach    NUMERIC;
  v_sg_around      NUMERIC;
  v_sg_putting     NUMERIC;
BEGIN
  SELECT
    COUNT(*),
    SUM(rsc.strokes_gained_total),
    SUM(rsc.strokes_gained_tee),
    SUM(rsc.strokes_gained_approach),
    SUM(rsc.strokes_gained_around_green),
    SUM(rsc.strokes_gained_putting)
  INTO v_count, v_sg_total, v_sg_tee, v_sg_approach, v_sg_around, v_sg_putting
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id    = p_player_id
    AND r.status         = 'completed'
    AND rsc.strokes_gained_total IS NOT NULL;

  IF v_count = 0 THEN RETURN; END IF;

  UPDATE golf_player_stats_cache
  SET
    strokes_gained_total        = ROUND(v_sg_total::NUMERIC,    3),
    strokes_gained_tee          = ROUND(v_sg_tee::NUMERIC,      3),
    strokes_gained_approach     = ROUND(v_sg_approach::NUMERIC, 3),
    strokes_gained_around_green = ROUND(v_sg_around::NUMERIC,   3),
    strokes_gained_putting      = ROUND(v_sg_putting::NUMERIC,  3),
    sg_total_per_round          = ROUND((v_sg_total    / v_count)::NUMERIC, 3),
    sg_tee_per_round            = ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
    sg_approach_per_round       = ROUND((v_sg_approach / v_count)::NUMERIC, 3),
    sg_around_green_per_round   = ROUND((v_sg_around   / v_count)::NUMERIC, 3),
    sg_putting_per_round        = ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
    updated_at                  = now()
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    INSERT INTO golf_player_stats_cache (
      id, player_id,
      strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
      strokes_gained_around_green, strokes_gained_putting,
      sg_total_per_round, sg_tee_per_round, sg_approach_per_round,
      sg_around_green_per_round, sg_putting_per_round,
      rounds_played, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_player_id,
      ROUND(v_sg_total::NUMERIC,    3),
      ROUND(v_sg_tee::NUMERIC,      3),
      ROUND(v_sg_approach::NUMERIC, 3),
      ROUND(v_sg_around::NUMERIC,   3),
      ROUND(v_sg_putting::NUMERIC,  3),
      ROUND((v_sg_total    / v_count)::NUMERIC, 3),
      ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
      ROUND((v_sg_approach / v_count)::NUMERIC, 3),
      ROUND((v_sg_around   / v_count)::NUMERIC, 3),
      ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
      v_count, now(), now()
    );
  END IF;
END;
$$;


--
-- Name: update_push_subscriptions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_push_subscriptions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_qualifier_leaderboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_qualifier_leaderboard(p_qualifier_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Update entry totals from rounds
  UPDATE golf_qualifier_entries qe
  SET
    total_score = sub.sum_score,
    total_to_par = sub.sum_to_par,
    rounds_completed = sub.round_count,
    score = sub.sum_score
  FROM (
    SELECT
      player_id,
      COALESCE(SUM(total_score), 0) AS sum_score,
      COALESCE(SUM(score_to_par), 0) AS sum_to_par,
      COUNT(*) FILTER (WHERE status = 'completed') AS round_count
    FROM golf_rounds
    WHERE qualifier_id = p_qualifier_id
    GROUP BY player_id
  ) sub
  WHERE qe.qualifier_id = p_qualifier_id
    AND qe.player_id = sub.player_id;

  -- Update positions based on total_to_par
  WITH ranked AS (
    SELECT
      id,
      RANK() OVER (ORDER BY total_to_par ASC) as pos,
      COUNT(*) OVER (PARTITION BY total_to_par) > 1 as tied
    FROM golf_qualifier_entries
    WHERE qualifier_id = p_qualifier_id
      AND rounds_completed > 0
  )
  UPDATE golf_qualifier_entries qe
  SET
    position = ranked.pos,
    is_tied = ranked.tied
  FROM ranked
  WHERE qe.id = ranked.id;
END;
$$;


--
-- Name: update_round_stats_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_round_stats_cache() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_front_nine INTEGER; v_back_nine INTEGER;
  v_eagles INTEGER; v_birdies INTEGER; v_pars INTEGER;
  v_bogeys INTEGER; v_double_bogeys INTEGER; v_triple_plus INTEGER;
  v_one_putts INTEGER; v_three_putts INTEGER;
  v_scrambles_converted INTEGER; v_scramble_attempts INTEGER;
  v_sand_saves INTEGER; v_sand_attempts INTEGER;
  v_total_putts_from_holes INTEGER; v_total_penalties_from_holes INTEGER;
  v_hole_count INTEGER;
  v_driving_distance_avg NUMERIC;
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_hole_count FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  -- Compute driving distance average from tee shot distances
  SELECT AVG(gs.shot_distance)
  INTO v_driving_distance_avg
  FROM golf_shots gs
  JOIN golf_holes gh ON gh.id = gs.hole_id
  WHERE gh.round_id = NEW.id
    AND gs.shot_type = 'tee'
    AND gs.shot_distance IS NOT NULL
    AND gs.shot_distance > 0;

  IF v_hole_count = 0 THEN
    INSERT INTO golf_round_stats_cache (
      round_id, player_id, total_score, score_to_par, front_nine, back_nine,
      fairways_hit, fairways_total, greens_hit, greens_total,
      total_putts, one_putts, three_putts, scrambles_converted, scramble_attempts,
      sand_saves, sand_attempts, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
      penalty_strokes, driving_distance_avg,
      strokes_gained_total, strokes_gained_tee,
      strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
      created_at, updated_at
    ) VALUES (
      NEW.id, NEW.player_id, NEW.total_score, NEW.score_to_par,
      NEW.front_nine, NEW.back_nine, NEW.total_fairways_hit, NEW.total_fairways,
      NEW.total_gir, NEW.total_gir_possible, NEW.total_putts, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, v_driving_distance_avg,
      NEW.strokes_gained_total, NEW.strokes_gained_tee,
      NEW.strokes_gained_approach, NEW.strokes_gained_around_green,
      NEW.strokes_gained_putting, NOW(), NOW()
    ) ON CONFLICT (round_id) DO UPDATE SET
      total_score = EXCLUDED.total_score, score_to_par = EXCLUDED.score_to_par,
      front_nine = EXCLUDED.front_nine, back_nine = EXCLUDED.back_nine,
      fairways_hit = EXCLUDED.fairways_hit, fairways_total = EXCLUDED.fairways_total,
      greens_hit = EXCLUDED.greens_hit, greens_total = EXCLUDED.greens_total,
      total_putts = EXCLUDED.total_putts,
      driving_distance_avg = EXCLUDED.driving_distance_avg,
      strokes_gained_total = EXCLUDED.strokes_gained_total,
      strokes_gained_tee = EXCLUDED.strokes_gained_tee,
      strokes_gained_approach = EXCLUDED.strokes_gained_approach,
      strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
      strokes_gained_putting = EXCLUDED.strokes_gained_putting, updated_at = NOW();
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN hole_number <= 9 THEN score ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hole_number > 9 THEN score ELSE 0 END), 0)
  INTO v_front_nine, v_back_nine FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN (score-par)<=-2 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=-1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=2 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)>=3 THEN 1 ELSE 0 END),0)
  INTO v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN putts=1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN putts>=3 THEN 1 ELSE 0 END),0), COALESCE(SUM(putts),0)
  INTO v_one_putts, v_three_putts, v_total_putts_from_holes
  FROM golf_holes WHERE round_id = NEW.id AND putts IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN gir=false AND (score-par)<=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN gir=false THEN 1 ELSE 0 END),0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN sand_save=true THEN 1 ELSE 0 END),0),
    COALESCE(COUNT(*) FILTER (WHERE sand_save IS NOT NULL),0)
  INTO v_sand_saves, v_sand_attempts FROM golf_holes WHERE round_id = NEW.id;

  SELECT COALESCE(SUM(COALESCE(penalty_strokes,0)),0) INTO v_total_penalties_from_holes
  FROM golf_holes WHERE round_id = NEW.id;

  INSERT INTO golf_round_stats_cache (
    round_id, player_id, total_score, score_to_par, front_nine, back_nine,
    fairways_hit, fairways_total, greens_hit, greens_total,
    total_putts, one_putts, three_putts, scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    penalty_strokes, driving_distance_avg,
    strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.player_id,
    COALESCE(NEW.total_score, v_front_nine + v_back_nine),
    COALESCE(NEW.score_to_par, (v_front_nine + v_back_nine) - (SELECT COALESCE(SUM(par),0) FROM golf_holes WHERE round_id = NEW.id)),
    v_front_nine, v_back_nine,
    COALESCE(NEW.total_fairways_hit, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND fairway_hit = true)),
    COALESCE(NEW.total_fairways, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND par > 3 AND fairway_hit IS NOT NULL)),
    COALESCE(NEW.total_gir, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND gir = true)),
    COALESCE(NEW.total_gir_possible, v_hole_count),
    COALESCE(NEW.total_putts, v_total_putts_from_holes),
    v_one_putts, v_three_putts, v_scrambles_converted, v_scramble_attempts,
    v_sand_saves, v_sand_attempts,
    v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus,
    v_total_penalties_from_holes, v_driving_distance_avg,
    NEW.strokes_gained_total, NEW.strokes_gained_tee,
    NEW.strokes_gained_approach, NEW.strokes_gained_around_green,
    NEW.strokes_gained_putting, NOW(), NOW()
  ) ON CONFLICT (round_id) DO UPDATE SET
    total_score=EXCLUDED.total_score, score_to_par=EXCLUDED.score_to_par,
    front_nine=EXCLUDED.front_nine, back_nine=EXCLUDED.back_nine,
    fairways_hit=EXCLUDED.fairways_hit, fairways_total=EXCLUDED.fairways_total,
    greens_hit=EXCLUDED.greens_hit, greens_total=EXCLUDED.greens_total,
    total_putts=EXCLUDED.total_putts, one_putts=EXCLUDED.one_putts, three_putts=EXCLUDED.three_putts,
    scrambles_converted=EXCLUDED.scrambles_converted, scramble_attempts=EXCLUDED.scramble_attempts,
    sand_saves=EXCLUDED.sand_saves, sand_attempts=EXCLUDED.sand_attempts,
    eagles=EXCLUDED.eagles, birdies=EXCLUDED.birdies, pars=EXCLUDED.pars,
    bogeys=EXCLUDED.bogeys, double_bogeys=EXCLUDED.double_bogeys, triple_plus=EXCLUDED.triple_plus,
    penalty_strokes=EXCLUDED.penalty_strokes,
    driving_distance_avg=EXCLUDED.driving_distance_avg,
    strokes_gained_total=EXCLUDED.strokes_gained_total, strokes_gained_tee=EXCLUDED.strokes_gained_tee,
    strokes_gained_approach=EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green=EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting=EXCLUDED.strokes_gained_putting, updated_at=NOW();

  RETURN NEW;
END;
$$;


--
-- Name: update_round_stats_cache_with_sg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_round_stats_cache_with_sg() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;
  UPDATE golf_round_stats_cache SET
    strokes_gained_total=NEW.strokes_gained_total, strokes_gained_tee=NEW.strokes_gained_tee,
    strokes_gained_approach=NEW.strokes_gained_approach,
    strokes_gained_around_green=NEW.strokes_gained_around_green,
    strokes_gained_putting=NEW.strokes_gained_putting, updated_at=NOW()
  WHERE round_id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_user_last_seen(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_last_seen(target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE users
  SET last_seen = NOW()
  WHERE id = target_user_id
    AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL '5 minutes');
END;
$$;


--
-- Name: user_conversation_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_conversation_ids(p_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT conversation_id 
  FROM golf_conversation_participants 
  WHERE user_id = p_user_id;
$$;


--
-- Name: user_has_pending_join_request_to_coach_team(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_pending_join_request_to_coach_team(check_player_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM golf_team_join_requests jr
    JOIN golf_teams gt ON gt.id = jr.team_id
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE jr.player_id = check_player_id
    AND jr.status = 'pending'
    AND gc.user_id = auth.uid()
  )
$$;


--
-- Name: user_is_coach_of_golf_player(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_coach_of_golf_player(check_player_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM golf_coaches gc
    JOIN golf_teams gt ON gt.organization_id = gc.organization_id
    JOIN golf_team_members gtm ON gtm.team_id = gt.id
    WHERE gc.user_id = auth.uid()
      AND gtm.player_id = check_player_id
      AND gtm.status = 'active'
  )
$$;


--
-- Name: user_is_golf_team_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_golf_team_member(check_team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM golf_team_members gtm
    WHERE gtm.team_id = check_team_id
    AND gtm.player_id = get_current_golf_player_id()
    AND gtm.status = 'active'
  )
$$;


--
-- Name: user_is_teammate_of_golf_player(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_teammate_of_golf_player(check_player_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM golf_team_members my_tm
    JOIN golf_players my_gp ON my_gp.id = my_tm.player_id
    JOIN golf_team_members their_tm ON their_tm.team_id = my_tm.team_id
    WHERE my_gp.user_id = auth.uid()
      AND my_tm.status = 'active'
      AND their_tm.player_id = check_player_id
      AND their_tm.status = 'active'
  )
$$;


--
-- Name: validate_notification_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_notification_preferences() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- Ensure notification_preferences is always a valid JSONB object
  IF NEW.notification_preferences IS NOT NULL THEN
    -- Validate required keys exist with defaults
    NEW.notification_preferences = jsonb_build_object(
      'email_messages', COALESCE((NEW.notification_preferences->>'email_messages')::boolean, true),
      'email_pipeline_updates', COALESCE((NEW.notification_preferences->>'email_pipeline_updates')::boolean, true),
      'email_event_reminders', COALESCE((NEW.notification_preferences->>'email_event_reminders')::boolean, true),
      'email_profile_views', COALESCE((NEW.notification_preferences->>'email_profile_views')::boolean, false),
      'email_announcements', COALESCE((NEW.notification_preferences->>'email_announcements')::boolean, true),
      'push_enabled', COALESCE((NEW.notification_preferences->>'push_enabled')::boolean, true),
      'push_messages', COALESCE((NEW.notification_preferences->>'push_messages')::boolean, true),
      'push_events', COALESCE((NEW.notification_preferences->>'push_events')::boolean, true),
      'digest_frequency', COALESCE(NEW.notification_preferences->>'digest_frequency', 'daily')
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_notification_preferences(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_notification_preferences() IS 'Validates and normalizes notification_preferences JSONB column on users table';


--
-- Name: verify_coach_owns_player(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_coach_owns_player(p_player_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.golf_team_members gtm
    JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtm.player_id = p_player_id
      AND gtm.status = 'active'::team_member_status
      AND gc.user_id = p_user_id
  );
END
$$;


--
-- Name: verify_coach_owns_team(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_coach_owns_team(p_team_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff gtcs
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = p_team_id
      AND gc.user_id = p_user_id
  );
END
$$;


--
-- Name: write_suppression_on_unsubscribe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.write_suppression_on_unsubscribe() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.event_type = 'email.unsubscribed' AND NEW.recipient_email IS NOT NULL THEN
    INSERT INTO crm_email_suppressions (email, reason, source, metadata, suppressed_at)
    VALUES (
      NEW.recipient_email::citext,
      'unsubscribed',
      'resend_webhook',
      jsonb_build_object('email_id', NEW.resend_message_id, 'event_id', NEW.id),
      NEW.occurred_at
    )
    ON CONFLICT (email, reason) DO NOTHING;

    UPDATE crm_coaches c
       SET email_status = 'unsubscribed', updated_at = now()
      FROM crm_contact_log cl
     WHERE cl.id = NEW.contact_log_id AND cl.coach_id = c.id;
  END IF;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    page_path text,
    feature_name text,
    metadata jsonb DEFAULT '{}'::jsonb,
    session_id text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_analytics_events_event_type_check CHECK ((event_type = ANY (ARRAY['page_view'::text, 'feature_use'::text, 'session_start'::text, 'session_end'::text])))
);


--
-- Name: admin_api_perf_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_api_perf_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_name text NOT NULL,
    duration_ms integer NOT NULL,
    status text NOT NULL,
    error_message text,
    user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_api_perf_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text])))
);


--
-- Name: admin_client_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_client_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    error_message text NOT NULL,
    error_stack text,
    page_url text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    severity public.admin_event_severity DEFAULT 'info'::public.admin_event_severity NOT NULL,
    title text NOT NULL,
    message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    user_id uuid,
    user_email text,
    url text,
    stack_trace text,
    browser_info jsonb,
    resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route text NOT NULL,
    method text DEFAULT 'POST'::text,
    request_count integer DEFAULT 0,
    error_count integer DEFAULT 0,
    avg_duration_ms integer DEFAULT 0,
    p50_ms integer DEFAULT 0,
    p95_ms integer DEFAULT 0,
    p99_ms integer DEFAULT 0,
    recorded_at timestamp with time zone DEFAULT now()
);


--
-- Name: approach_miss_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approach_miss_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shot_id uuid NOT NULL,
    miss_direction text,
    lie_type text,
    distance_from_green_yards numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT approach_miss_details_distance_from_green_yards_check CHECK (((distance_from_green_yards IS NULL) OR (distance_from_green_yards >= (0)::numeric))),
    CONSTRAINT approach_miss_details_lie_type_check CHECK (((lie_type IS NULL) OR (lie_type = ANY (ARRAY['fairway'::text, 'rough'::text, 'sand'::text, 'bunker'::text, 'recovery'::text, 'hazard'::text, 'green'::text, 'tee'::text, 'other'::text, 'penalty'::text, 'deep_rough'::text])))),
    CONSTRAINT approach_miss_details_miss_direction_check CHECK (((miss_direction IS NULL) OR (miss_direction = ANY (ARRAY['short'::text, 'long'::text, 'left'::text, 'right'::text, 'short_left'::text, 'short_right'::text, 'long_left'::text, 'long_right'::text]))))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    table_name text,
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: auth_metrics_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_metrics_hourly (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hour timestamp with time zone NOT NULL,
    successful_logins integer DEFAULT 0,
    failed_logins integer DEFAULT 0,
    active_sessions integer DEFAULT 0,
    new_sessions integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: auth_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rate_limits (
    key text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    blocked_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE auth_rate_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auth_rate_limits IS 'DB-backed rate limit window state - service_role only. Replaces the in-memory Map.';


--
-- Name: background_job_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_job_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_type text NOT NULL,
    job_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    duration_ms integer,
    error_message text,
    retry_count integer DEFAULT 0,
    metadata jsonb,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: baseball_academic_eligibility; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_academic_eligibility (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    semester text NOT NULL,
    gpa numeric(4,2),
    credits_completed integer,
    credits_required integer,
    is_eligible boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    team_id uuid,
    updated_by uuid,
    academic_standing text,
    CONSTRAINT baseball_academic_eligibility_academic_standing_check CHECK ((academic_standing = ANY (ARRAY['good'::text, 'warning'::text, 'probation'::text])))
);


--
-- Name: baseball_announcement_acknowledgements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_announcement_acknowledgements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    player_id uuid NOT NULL,
    acknowledged_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_announcement_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_announcement_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    player_id uuid NOT NULL
);


--
-- Name: baseball_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    urgency text DEFAULT 'normal'::text NOT NULL,
    is_pinned boolean DEFAULT false,
    published_at timestamp with time zone DEFAULT now(),
    created_by_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_announcements_urgency_check CHECK ((urgency = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))
);


--
-- Name: baseball_box_score_batting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_box_score_batting (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid NOT NULL,
    ab integer DEFAULT 0 NOT NULL,
    r integer DEFAULT 0 NOT NULL,
    h integer DEFAULT 0 NOT NULL,
    doubles integer DEFAULT 0 NOT NULL,
    triples integer DEFAULT 0 NOT NULL,
    hr integer DEFAULT 0 NOT NULL,
    rbi integer DEFAULT 0 NOT NULL,
    bb integer DEFAULT 0 NOT NULL,
    k integer DEFAULT 0 NOT NULL,
    sb integer DEFAULT 0 NOT NULL,
    cs integer DEFAULT 0 NOT NULL,
    hbp integer DEFAULT 0 NOT NULL,
    sac integer DEFAULT 0 NOT NULL,
    sf integer DEFAULT 0 NOT NULL,
    lob integer DEFAULT 0 NOT NULL,
    batting_order integer,
    avg numeric(5,3),
    obp numeric(5,3),
    slg numeric(5,3),
    ops numeric(5,3),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_box_score_pitching; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_box_score_pitching (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid NOT NULL,
    ip numeric(4,1) DEFAULT 0 NOT NULL,
    h integer DEFAULT 0 NOT NULL,
    r integer DEFAULT 0 NOT NULL,
    er integer DEFAULT 0 NOT NULL,
    bb integer DEFAULT 0 NOT NULL,
    k integer DEFAULT 0 NOT NULL,
    hr integer DEFAULT 0 NOT NULL,
    pitch_count integer,
    strikes integer,
    result text,
    era numeric(5,2),
    whip numeric(5,3),
    k9 numeric(5,2),
    bb9 numeric(5,2),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_box_score_pitching_result_check CHECK ((result = ANY (ARRAY['W'::text, 'L'::text, 'S'::text, 'H'::text, 'BS'::text, 'ND'::text])))
);


--
-- Name: baseball_box_score_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_box_score_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    game_id uuid,
    coach_id uuid NOT NULL,
    filename text NOT NULL,
    upload_type text DEFAULT 'manual'::text NOT NULL,
    raw_content text,
    parsed_data jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    matched_players jsonb DEFAULT '[]'::jsonb,
    unmatched_players jsonb DEFAULT '[]'::jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_box_score_uploads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'review_needed'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT baseball_box_score_uploads_upload_type_check CHECK ((upload_type = ANY (ARRAY['csv'::text, 'pdf'::text, 'manual'::text])))
);


--
-- Name: baseball_camp_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_camp_registrations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    camp_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status text DEFAULT 'registered'::text,
    payment_status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_camps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_camps (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    description text,
    location text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    registration_deadline date,
    capacity integer,
    price_cents integer,
    is_free boolean DEFAULT false,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_coach_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_coach_insights (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    team_id uuid,
    player_id uuid,
    insight_type text NOT NULL,
    title text NOT NULL,
    body text,
    priority text DEFAULT 'medium'::text,
    status text DEFAULT 'active'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone
);


--
-- Name: baseball_coach_philosophy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_coach_philosophy (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    alert_sensitivity text DEFAULT 'balanced'::text,
    decline_threshold numeric DEFAULT 3.0,
    pressure_gap_threshold numeric DEFAULT 2.0,
    bubble_zone_range numeric DEFAULT 1.5,
    priority_hitting integer DEFAULT 1,
    priority_power integer DEFAULT 2,
    priority_plate_discipline integer DEFAULT 3,
    priority_speed integer DEFAULT 4,
    priority_defense integer DEFAULT 5,
    looking_for_offense text,
    looking_for_defense text,
    looking_for_intangibles text,
    program_values text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_coach_recruiting_philosophy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_coach_recruiting_philosophy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    weight_exit_velocity integer DEFAULT 20,
    weight_pitch_velocity integer DEFAULT 20,
    weight_sixty_time integer DEFAULT 15,
    weight_gpa integer DEFAULT 15,
    weight_height integer DEFAULT 10,
    weight_weight integer DEFAULT 10,
    weight_arm_strength integer DEFAULT 10,
    position_priorities jsonb DEFAULT '[]'::jsonb,
    min_gpa numeric(3,2),
    min_exit_velocity integer,
    min_pitch_velocity integer,
    max_sixty_time numeric(4,2),
    preferred_states jsonb DEFAULT '[]'::jsonb,
    max_distance_miles integer,
    target_grad_years jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_coaches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_coaches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    coach_type public.baseball_coach_type NOT NULL,
    full_name text,
    email text,
    phone text,
    avatar_url text,
    title text,
    bio text,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_conversation_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone
);


--
-- Name: baseball_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_conversations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid,
    is_team_chat boolean DEFAULT false,
    title text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_developmental_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_developmental_plans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text,
    start_date date,
    end_date date,
    goals jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    file_url text NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    file_name text,
    file_size integer,
    mime_type text,
    storage_path text,
    change_notes text
);


--
-- Name: baseball_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    category text DEFAULT 'general'::text,
    is_player_visible boolean DEFAULT true,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    version_count integer DEFAULT 1,
    folder text,
    CONSTRAINT baseball_documents_category_check CHECK ((category = ANY (ARRAY['general'::text, 'playbook'::text, 'rules'::text, 'conditioning'::text, 'scouting'::text, 'academic'::text, 'administrative'::text, 'media'::text])))
);


--
-- Name: baseball_event_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_event_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    check_in_at timestamp with time zone,
    absence_reason text,
    responded_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_event_attendance_status_check CHECK ((status = ANY (ARRAY['going'::text, 'maybe'::text, 'not_going'::text, 'pending'::text])))
);


--
-- Name: baseball_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    description text,
    event_type text NOT NULL,
    location text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    all_day boolean DEFAULT false,
    recurring boolean DEFAULT false,
    recurrence_rule text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    max_attendees integer,
    is_mandatory boolean DEFAULT false,
    rsvp_deadline timestamp with time zone,
    cancellation_reason text,
    is_recurring boolean DEFAULT false,
    created_by_id uuid
);


--
-- Name: baseball_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_games (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    event_id uuid,
    game_date date NOT NULL,
    game_type text DEFAULT 'game'::text NOT NULL,
    opponent_name text,
    location text,
    home_away text,
    our_score integer,
    opponent_score integer,
    innings_played integer DEFAULT 9,
    status text DEFAULT 'scheduled'::text NOT NULL,
    notes text,
    weather text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_games_game_type_check CHECK ((game_type = ANY (ARRAY['game'::text, 'scrimmage'::text]))),
    CONSTRAINT baseball_games_home_away_check CHECK ((home_away = ANY (ARRAY['home'::text, 'away'::text, 'neutral'::text]))),
    CONSTRAINT baseball_games_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'postponed'::text])))
);


--
-- Name: baseball_lineup_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_lineup_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lineup_id uuid NOT NULL,
    batting_order integer NOT NULL,
    player_id uuid NOT NULL,
    "position" text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_lineup_positions_batting_order_check CHECK (((batting_order >= 1) AND (batting_order <= 9)))
);


--
-- Name: baseball_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb DEFAULT '{}'::jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_player_aggregates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_aggregates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    career_avg numeric,
    last_5_avg numeric,
    last_10_avg numeric,
    practice_avg numeric,
    game_avg numeric,
    pressure_gap numeric,
    total_at_bats integer DEFAULT 0,
    total_hits integer DEFAULT 0,
    total_sessions integer DEFAULT 0,
    recent_trend text,
    trend_data jsonb DEFAULT '{}'::jsonb,
    last_session_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_player_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    class_name text NOT NULL,
    instructor text,
    days text[] DEFAULT '{}'::text[],
    start_time time without time zone,
    end_time time without time zone,
    building text,
    room text,
    credits numeric(3,1),
    semester text,
    color text DEFAULT '#16A34A'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    team_id uuid,
    notes text
);


--
-- Name: baseball_player_comparisons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_comparisons (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    name text,
    player_ids uuid[] NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_player_engagement_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_engagement_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    coach_id uuid,
    engagement_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    engagement_date timestamp with time zone GENERATED ALWAYS AS (created_at) STORED
);


--
-- Name: baseball_player_percentiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_percentiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    grad_year integer NOT NULL,
    percentile_exit_velocity integer,
    percentile_pitch_velocity integer,
    percentile_sixty_time integer,
    percentile_gpa integer,
    composite_athletic integer,
    composite_academic integer,
    is_stale boolean DEFAULT false,
    calculated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_player_percentiles_composite_academic_check CHECK (((composite_academic >= 0) AND (composite_academic <= 100))),
    CONSTRAINT baseball_player_percentiles_composite_athletic_check CHECK (((composite_athletic >= 0) AND (composite_athletic <= 100))),
    CONSTRAINT baseball_player_percentiles_percentile_exit_velocity_check CHECK (((percentile_exit_velocity >= 0) AND (percentile_exit_velocity <= 100))),
    CONSTRAINT baseball_player_percentiles_percentile_gpa_check CHECK (((percentile_gpa >= 0) AND (percentile_gpa <= 100))),
    CONSTRAINT baseball_player_percentiles_percentile_pitch_velocity_check CHECK (((percentile_pitch_velocity >= 0) AND (percentile_pitch_velocity <= 100))),
    CONSTRAINT baseball_player_percentiles_percentile_sixty_time_check CHECK (((percentile_sixty_time >= 0) AND (percentile_sixty_time <= 100)))
);


--
-- Name: baseball_player_season_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_season_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid NOT NULL,
    season_year integer DEFAULT (EXTRACT(year FROM now()))::integer NOT NULL,
    g integer DEFAULT 0 NOT NULL,
    ab integer DEFAULT 0 NOT NULL,
    r integer DEFAULT 0 NOT NULL,
    h integer DEFAULT 0 NOT NULL,
    doubles integer DEFAULT 0 NOT NULL,
    triples integer DEFAULT 0 NOT NULL,
    hr integer DEFAULT 0 NOT NULL,
    rbi integer DEFAULT 0 NOT NULL,
    bb integer DEFAULT 0 NOT NULL,
    k integer DEFAULT 0 NOT NULL,
    sb integer DEFAULT 0 NOT NULL,
    cs integer DEFAULT 0 NOT NULL,
    hbp integer DEFAULT 0 NOT NULL,
    sac integer DEFAULT 0 NOT NULL,
    sf integer DEFAULT 0 NOT NULL,
    avg numeric(5,3),
    obp numeric(5,3),
    slg numeric(5,3),
    ops numeric(5,3),
    g_p integer DEFAULT 0 NOT NULL,
    gs integer DEFAULT 0 NOT NULL,
    w integer DEFAULT 0 NOT NULL,
    l integer DEFAULT 0 NOT NULL,
    sv integer DEFAULT 0 NOT NULL,
    ip numeric(6,1) DEFAULT 0 NOT NULL,
    h_allowed integer DEFAULT 0 NOT NULL,
    r_allowed integer DEFAULT 0 NOT NULL,
    er integer DEFAULT 0 NOT NULL,
    bb_allowed integer DEFAULT 0 NOT NULL,
    k_thrown integer DEFAULT 0 NOT NULL,
    hr_allowed integer DEFAULT 0 NOT NULL,
    era numeric(5,2),
    whip numeric(5,3),
    k9 numeric(5,2),
    bb9 numeric(5,2),
    last_updated timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_player_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    profile_visibility text DEFAULT 'public'::text,
    show_academics boolean DEFAULT true,
    show_contact_info boolean DEFAULT false,
    show_dream_schools boolean DEFAULT true,
    email_notifications boolean DEFAULT true,
    push_notifications boolean DEFAULT true,
    notify_profile_views boolean DEFAULT true,
    notify_watchlist_adds boolean DEFAULT true,
    notify_messages boolean DEFAULT true,
    notify_team_activity boolean DEFAULT true,
    timezone text DEFAULT 'America/Chicago'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_player_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_player_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    stat_type text NOT NULL,
    session_date date NOT NULL,
    session_name text,
    at_bats integer DEFAULT 0,
    hits integer DEFAULT 0,
    doubles integer DEFAULT 0,
    triples integer DEFAULT 0,
    home_runs integer DEFAULT 0,
    rbis integer DEFAULT 0,
    walks integer DEFAULT 0,
    strikeouts integer DEFAULT 0,
    stolen_bases integer DEFAULT 0,
    innings_pitched numeric(4,1) DEFAULT 0,
    earned_runs integer DEFAULT 0,
    hits_allowed integer DEFAULT 0,
    walks_allowed integer DEFAULT 0,
    strikeouts_thrown integer DEFAULT 0,
    putouts integer DEFAULT 0,
    assists integer DEFAULT 0,
    errors integer DEFAULT 0,
    exit_velocity numeric(5,1),
    pitch_velocity numeric(5,1),
    source text DEFAULT 'manual'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_player_stats_stat_type_check CHECK ((stat_type = ANY (ARRAY['practice'::text, 'game'::text, 'other'::text])))
);


--
-- Name: baseball_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_players (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    player_type public.baseball_player_type NOT NULL,
    first_name text,
    last_name text,
    email text,
    phone text,
    avatar_url text,
    city text,
    state text,
    primary_position text,
    secondary_position text,
    grad_year integer,
    bats text,
    throws text,
    height_feet integer,
    height_inches integer,
    weight_lbs integer,
    pitch_velo numeric,
    exit_velo numeric,
    sixty_time numeric,
    pop_time numeric,
    arm_strength numeric,
    gpa numeric,
    sat_score integer,
    act_score integer,
    high_school_name text,
    high_school_city text,
    high_school_state text,
    instagram text,
    twitter text,
    about_me text,
    has_video boolean DEFAULT false,
    recruiting_activated boolean DEFAULT false,
    recruiting_activated_at timestamp with time zone,
    onboarding_completed boolean DEFAULT false,
    profile_completion_percent integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_recruiting_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_recruiting_interests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    interest_level text,
    notes text,
    status text DEFAULT 'interested'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_stat_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_stat_uploads (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    team_id uuid NOT NULL,
    filename text NOT NULL,
    file_url text,
    status text DEFAULT 'pending'::text,
    row_count integer,
    processed_count integer DEFAULT 0,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: baseball_task_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_task_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    notes text,
    CONSTRAINT baseball_task_assignments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])))
);


--
-- Name: baseball_task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_task_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text DEFAULT 'general'::text,
    created_by_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    category text DEFAULT 'general'::text,
    priority text DEFAULT 'normal'::text,
    reminder_at timestamp with time zone,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    created_by_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT baseball_tasks_category_check CHECK ((category = ANY (ARRAY['general'::text, 'conditioning'::text, 'academic'::text, 'administrative'::text, 'practice'::text, 'game_prep'::text]))),
    CONSTRAINT baseball_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))),
    CONSTRAINT baseball_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'overdue'::text, 'cancelled'::text])))
);


--
-- Name: baseball_team_coach_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_team_coach_staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    role text DEFAULT 'head_coach'::text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_team_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_team_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    code character varying(8) NOT NULL,
    created_by_coach_id uuid NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_team_lineups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_team_lineups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    created_by_coach_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_team_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status public.team_member_status DEFAULT 'pending'::public.team_member_status,
    jersey_number integer,
    "position" text,
    joined_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_teams (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    team_type public.baseball_coach_type NOT NULL,
    join_code text NOT NULL,
    logo_url text,
    primary_color text,
    secondary_color text,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_travel_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_travel_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid NOT NULL,
    category text NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text,
    paid_by text,
    created_at timestamp with time zone DEFAULT now(),
    team_id uuid,
    expense_date date,
    vendor_name text,
    notes text,
    receipt_url text,
    created_by uuid,
    CONSTRAINT baseball_travel_expenses_category_check CHECK ((category = ANY (ARRAY['transport'::text, 'lodging'::text, 'meals'::text, 'equipment'::text, 'other'::text])))
);


--
-- Name: baseball_travel_itineraries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_travel_itineraries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    event_name text NOT NULL,
    departure_date date,
    return_date date,
    location text,
    accommodation text,
    transportation text,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_videos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    title text NOT NULL,
    description text,
    video_type text,
    url text,
    thumbnail_url text,
    duration integer,
    view_count integer DEFAULT 0,
    is_primary boolean DEFAULT false,
    is_clip boolean DEFAULT false,
    parent_video_id uuid,
    clip_start_time integer,
    clip_end_time integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: baseball_watchlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baseball_watchlists (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    player_id uuid NOT NULL,
    pipeline_stage public.baseball_pipeline_stage DEFAULT 'watchlist'::public.baseball_pipeline_stage,
    notes text,
    priority integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    fit_score integer,
    source text,
    last_contact timestamp with time zone,
    added_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL,
    changed_by uuid,
    old_values jsonb,
    new_values jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_activity_log_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'status_change'::text, 'email_sent'::text, 'contact_logged'::text])))
);


--
-- Name: crm_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    trigger_event text NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    actions jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    priority smallint DEFAULT 100 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_automations_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT crm_automations_trigger_event_check CHECK ((trigger_event = ANY (ARRAY['email.opened'::text, 'email.clicked'::text, 'email.bounced'::text, 'email.complained'::text, 'email.unsubscribed'::text, 'email.replied'::text, 'status_change.engaged'::text, 'status_change.contacted'::text, 'no_contact_30d'::text])))
);


--
-- Name: crm_coaches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_coaches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    title text,
    email text,
    phone text,
    school text NOT NULL,
    conference text NOT NULL,
    division public.ncaa_division NOT NULL,
    program public.program_type DEFAULT 'both'::public.program_type NOT NULL,
    priority integer DEFAULT 0,
    highlight_color text,
    is_starred boolean DEFAULT false,
    notes text,
    internal_comments text,
    tags text[],
    team_size integer,
    current_software text,
    budget_range text,
    decision_timeline text,
    pain_points text[],
    best_contact_method text,
    best_contact_time text,
    timezone text,
    last_contacted_at timestamp with time zone,
    next_follow_up_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    status public.coach_status DEFAULT 'new_lead'::public.coach_status NOT NULL,
    source text,
    is_archived boolean DEFAULT false,
    archived_at timestamp with time zone,
    archived_by uuid,
    athletics_url text,
    last_email_event_type text,
    last_email_event_at timestamp with time zone,
    email_status public.email_status DEFAULT 'valid'::public.email_status NOT NULL
);


--
-- Name: COLUMN crm_coaches.last_email_event_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.crm_coaches.last_email_event_type IS 'Latest Resend event type for this coach (sent|delivered|delivery_delayed|opened|clicked|bounced|complained), stripped of the email. prefix. Maintained by trigger on email_events.';


--
-- Name: COLUMN crm_coaches.last_email_event_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.crm_coaches.last_email_event_at IS 'Timestamp of the latest Resend webhook event linked to this coach. Maintained by trigger on email_events.';


--
-- Name: crm_contact_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contact_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    contact_type public.contact_type NOT NULL,
    contact_date timestamp with time zone DEFAULT now() NOT NULL,
    subject text,
    notes text,
    next_action text,
    next_action_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    resend_message_id text
);


--
-- Name: email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_log_id uuid,
    resend_message_id text NOT NULL,
    event_type text NOT NULL,
    recipient_email text,
    occurred_at timestamp with time zone NOT NULL,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE email_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_events IS 'Immutable event log for all Resend webhook events. Renamed from crm_email_events (view kept for back-compat).';


--
-- Name: crm_coach_engagement; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.crm_coach_engagement AS
 WITH windowed AS (
         SELECT cl.coach_id,
            ee.event_type,
            ee.occurred_at,
            exp(((- EXTRACT(epoch FROM (now() - ee.occurred_at))) / ((14)::numeric * 86400.0))) AS decay
           FROM (public.email_events ee
             JOIN public.crm_contact_log cl ON ((cl.id = ee.contact_log_id)))
          WHERE (ee.occurred_at > (now() - '90 days'::interval))
        ), agg AS (
         SELECT windowed.coach_id,
            COALESCE(sum(windowed.decay) FILTER (WHERE (windowed.event_type = 'email.opened'::text)), (0)::numeric) AS open_score,
            COALESCE(sum(windowed.decay) FILTER (WHERE (windowed.event_type = 'email.clicked'::text)), (0)::numeric) AS click_score,
            count(*) FILTER (WHERE (windowed.event_type = 'email.opened'::text)) AS opens_90d,
            count(*) FILTER (WHERE (windowed.event_type = 'email.clicked'::text)) AS clicks_90d,
            max(windowed.occurred_at) AS last_event_at
           FROM windowed
          GROUP BY windowed.coach_id
        )
 SELECT c.id AS coach_id,
    COALESCE(a.opens_90d, (0)::bigint) AS opens_90d,
    COALESCE(a.clicks_90d, (0)::bigint) AS clicks_90d,
    a.last_event_at,
    (LEAST((100)::numeric, GREATEST((0)::numeric, round((((COALESCE(a.open_score, (0)::numeric) * 1.0) + (COALESCE(a.click_score, (0)::numeric) * 3.0)) * (10)::numeric)))))::integer AS score,
        CASE
            WHEN ((COALESCE(a.click_score, (0)::numeric) > 0.5) OR (COALESCE(a.open_score, (0)::numeric) > (2)::numeric)) THEN 'hot'::text
            WHEN (COALESCE(a.open_score, (0)::numeric) > 0.5) THEN 'warm'::text
            ELSE 'cold'::text
        END AS temperature
   FROM (public.crm_coaches c
     LEFT JOIN agg a ON ((a.coach_id = c.id)))
  WHERE (c.is_archived = false)
  WITH NO DATA;


--
-- Name: crm_email_events; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.crm_email_events WITH (security_invoker='true') AS
 SELECT id,
    contact_log_id,
    resend_message_id,
    event_type,
    recipient_email,
    occurred_at,
    raw_payload,
    created_at
   FROM public.email_events;


--
-- Name: crm_email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_email_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    reason text NOT NULL,
    source text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    suppressed_at timestamp with time zone DEFAULT now() NOT NULL,
    suppressed_by uuid,
    CONSTRAINT crm_email_suppressions_reason_check CHECK ((reason = ANY (ARRAY['unsubscribed'::text, 'hard_bounce'::text, 'complained'::text, 'manual'::text, 'invalid'::text]))),
    CONSTRAINT crm_email_suppressions_source_check CHECK ((source = ANY (ARRAY['resend_webhook'::text, 'admin'::text, 'import'::text, 'system'::text])))
);


--
-- Name: crm_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    merge_tags text[] DEFAULT '{}'::text[],
    is_default boolean DEFAULT false,
    usage_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    format text DEFAULT 'plain'::text NOT NULL,
    CONSTRAINT crm_email_templates_category_check CHECK ((category = ANY (ARRAY['intro'::text, 'follow_up'::text, 'demo_invite'::text, 'proposal'::text, 'check_in'::text, 'general'::text, 'cold_outreach'::text, 'active_conversation'::text, 're_engage'::text, 'close'::text, 'post_close'::text]))),
    CONSTRAINT crm_email_templates_format_check CHECK ((format = ANY (ARRAY['plain'::text, 'html'::text])))
);


--
-- Name: COLUMN crm_email_templates.format; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.crm_email_templates.format IS 'Body format. plain = legacy paragraph-text wrapped in greeting/signature shell. html = full HTML document, sent as-is (merge tags still substituted).';


--
-- Name: crm_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    event_type public.crm_event_type DEFAULT 'follow_up'::public.crm_event_type NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    all_day boolean DEFAULT false,
    location text,
    meeting_url text,
    coach_id uuid,
    status text DEFAULT 'scheduled'::text,
    completed_at timestamp with time zone,
    notes text,
    outcome text,
    google_event_id text,
    google_calendar_id text,
    google_sync_status text DEFAULT 'pending'::text,
    google_last_synced_at timestamp with time zone,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    parent_event_id uuid,
    reminder_sent boolean DEFAULT false,
    reminder_time integer DEFAULT 30,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: crm_google_calendar_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_google_calendar_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    token_type text DEFAULT 'Bearer'::text,
    expires_at timestamp with time zone NOT NULL,
    scope text,
    calendar_id text DEFAULT 'primary'::text,
    calendar_name text,
    is_active boolean DEFAULT true,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    kind text DEFAULT 'note'::text NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_notes_body_check CHECK ((length(body) <= 8000)),
    CONSTRAINT crm_notes_kind_check CHECK ((kind = ANY (ARRAY['note'::text, 'call_log'::text, 'meeting_summary'::text, 'internal'::text])))
);


--
-- Name: crm_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid,
    contact_log_id uuid,
    thread_id text,
    message_id text NOT NULL,
    in_reply_to text,
    from_address text NOT NULL,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    subject text,
    body_text text,
    body_html text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_payload jsonb,
    is_read boolean DEFAULT false NOT NULL
);


--
-- Name: crm_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    definition jsonb NOT NULL,
    created_by uuid NOT NULL,
    is_shared boolean DEFAULT true NOT NULL,
    pin_order smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_segments_description_check CHECK (((description IS NULL) OR (length(description) <= 500))),
    CONSTRAINT crm_segments_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80)))
);


--
-- Name: crm_sequence_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sequence_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_step smallint DEFAULT 0 NOT NULL,
    next_send_at timestamp with time zone,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    stopped_at timestamp with time zone,
    stop_reason text,
    enrolled_by uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT crm_sequence_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'stopped'::text]))),
    CONSTRAINT crm_sequence_enrollments_stop_reason_check CHECK (((stop_reason IS NULL) OR (stop_reason = ANY (ARRAY['replied'::text, 'unsubscribed'::text, 'bounced'::text, 'manual'::text, 'sequence_completed'::text]))))
);


--
-- Name: crm_sequence_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sequence_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    step_order smallint NOT NULL,
    delay_hours integer DEFAULT 0 NOT NULL,
    template_id uuid,
    subject_override text,
    body_override text,
    condition jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_sequence_steps_delay_hours_check CHECK ((delay_hours >= 0)),
    CONSTRAINT crm_sequence_steps_step_order_check CHECK ((step_order > 0))
);


--
-- Name: crm_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    trigger_kind text DEFAULT 'manual'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_sequences_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT crm_sequences_trigger_kind_check CHECK ((trigger_kind = ANY (ARRAY['manual'::text, 'status_change'::text, 'segment_match'::text])))
);


--
-- Name: crm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    assignee_id uuid,
    created_by uuid NOT NULL,
    title text NOT NULL,
    description text,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    kind text DEFAULT 'general'::text,
    source text DEFAULT 'manual'::text,
    reminder_at timestamp with time zone,
    reminder_sent boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_tasks_description_check CHECK (((description IS NULL) OR (length(description) <= 2000))),
    CONSTRAINT crm_tasks_kind_check CHECK ((kind = ANY (ARRAY['general'::text, 'follow_up'::text, 'call'::text, 'demo'::text, 'email'::text, 'research'::text]))),
    CONSTRAINT crm_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT crm_tasks_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'automation'::text, 'sequence'::text, 'ai_suggestion'::text]))),
    CONSTRAINT crm_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'canceled'::text]))),
    CONSTRAINT crm_tasks_title_check CHECK ((length(title) <= 200))
);


--
-- Name: demo_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    organization text,
    phone text,
    interest_type text,
    message text,
    status text DEFAULT 'pending'::text,
    notes text,
    contacted_by text,
    contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT demo_requests_interest_type_check CHECK ((interest_type = ANY (ARRAY['baseball_coach'::text, 'baseball_player'::text, 'golf_coach'::text, 'golf_player'::text, 'organization'::text, 'other'::text]))),
    CONSTRAINT demo_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'scheduled'::text, 'completed'::text, 'declined'::text])))
);


--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    device_name text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_push_at timestamp with time zone,
    failed_count integer DEFAULT 0,
    CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);


--
-- Name: email_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_event_id uuid NOT NULL,
    resend_message_id text NOT NULL,
    recipient_email text NOT NULL,
    clicked_url text,
    user_agent text,
    ip_address text,
    occurred_at timestamp with time zone NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE email_clicks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_clicks IS 'Per-click telemetry (URL, UA, IP) extracted from email.clicked webhook events.';


--
-- Name: emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emails (
    resend_message_id text NOT NULL,
    from_address text,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    subject text,
    tags jsonb,
    contact_log_id uuid,
    source text DEFAULT 'unknown'::text NOT NULL,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    delivery_delayed_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    bounced_at timestamp with time zone,
    complained_at timestamp with time zone,
    last_event_type text,
    last_event_at timestamp with time zone,
    open_count integer DEFAULT 0 NOT NULL,
    click_count integer DEFAULT 0 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.emails IS 'Per-message snapshot for all Resend emails (mirrors resend.com/emails).';


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message text NOT NULL,
    severity text DEFAULT 'error'::text,
    stack text,
    context jsonb,
    user_agent text,
    ip text,
    url text,
    user_id uuid,
    "timestamp" timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT error_logs_severity_check CHECK ((severity = ANY (ARRAY['debug'::text, 'info'::text, 'warning'::text, 'error'::text, 'critical'::text])))
);


--
-- Name: error_rate_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_rate_hourly (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hour timestamp with time zone NOT NULL,
    total_errors integer DEFAULT 0,
    critical_errors integer DEFAULT 0,
    user_facing_errors integer DEFAULT 0,
    internal_errors integer DEFAULT 0,
    affected_users integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_academic_exclusions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_academic_exclusions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    excluded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_announcement_acknowledgements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_announcement_acknowledgements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    player_id uuid NOT NULL,
    acknowledged_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE golf_announcement_acknowledgements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_announcement_acknowledgements IS 'Player acknowledgements of announcements';


--
-- Name: golf_announcement_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_announcement_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    document_id uuid NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE golf_announcement_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_announcement_documents IS 'Documents attached to announcements (links to golf_documents)';


--
-- Name: golf_announcement_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_announcement_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    player_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE golf_announcement_recipients; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_announcement_recipients IS 'Specific player recipients for announcements. Empty = all team members.';


--
-- Name: golf_announcement_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_announcement_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    task_id uuid NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE golf_announcement_tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_announcement_tasks IS 'Tasks attached to announcements (links to golf_tasks)';


--
-- Name: golf_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    urgency text DEFAULT 'normal'::text,
    requires_acknowledgement boolean DEFAULT false,
    send_push boolean DEFAULT false,
    send_email boolean DEFAULT false,
    publish_at timestamp with time zone,
    published_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_announcements_urgency_check CHECK ((urgency = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))
);


--
-- Name: golf_attendance_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_attendance_summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid NOT NULL,
    total_events integer DEFAULT 0,
    attended_count integer DEFAULT 0,
    absent_count integer DEFAULT 0,
    excused_count integer DEFAULT 0,
    attendance_percentage numeric(5,2),
    period_start_date date,
    period_end_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_calendar_feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_calendar_feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text DEFAULT 'Calendar Feed'::text NOT NULL,
    feed_type text DEFAULT 'all_events'::text,
    feed_token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    team_id uuid,
    player_id uuid,
    is_active boolean DEFAULT true,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_calendar_feeds_feed_type_check CHECK ((feed_type = ANY (ARRAY['all_events'::text, 'practices'::text, 'tournaments'::text, 'qualifying'::text])))
);


--
-- Name: golf_calendar_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_calendar_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    user_id uuid NOT NULL,
    notification_type text NOT NULL,
    message text,
    sent_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    title text,
    action_url text,
    CONSTRAINT golf_calendar_notifications_notification_type_check CHECK (((notification_type = ANY (ARRAY['event_invitation'::text, 'event_updated'::text, 'event_cancelled'::text, 'rsvp_response'::text, 'rsvp_reminder'::text, 'event_reminder'::text, 'event_reminder_24h'::text, 'event_reminder_1h'::text, 'event_reminder_manual'::text, 'message'::text, 'announcement'::text, 'task_assigned'::text, 'qualifier_created'::text, 'reminder'::text, 'update'::text, 'cancellation'::text, 'rsvp_request'::text])) OR (notification_type ~~ 'rsvp_response:%'::text)))
);


--
-- Name: golf_causal_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_causal_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid,
    team_id uuid,
    cause text NOT NULL,
    cause_metric text,
    effect text NOT NULL,
    effect_metric text,
    relationship_type text NOT NULL,
    strength numeric(5,4) DEFAULT 0 NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    mechanism text NOT NULL,
    confounders jsonb DEFAULT '[]'::jsonb NOT NULL,
    dose_response boolean DEFAULT false NOT NULL,
    intervention_potential numeric(5,4) DEFAULT 0 NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    validation_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_causal_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['direct'::text, 'mediated'::text, 'moderated'::text, 'bidirectional'::text])))
);


--
-- Name: golf_coach_behavior_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coach_behavior_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    action_type text NOT NULL,
    target_id text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_coach_blocked_time; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coach_blocked_time (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    reason text,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    title text,
    all_day boolean DEFAULT false,
    description text
);


--
-- Name: golf_coach_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coach_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid,
    player_id uuid,
    team_id uuid,
    insight_type text NOT NULL,
    title text NOT NULL,
    content text,
    priority text DEFAULT 'medium'::text,
    status text DEFAULT 'active'::text,
    acknowledged_at timestamp with time zone,
    dismissed boolean DEFAULT false,
    dismissed_at timestamp with time zone,
    resolved_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    source_type text DEFAULT 'system'::text,
    source_id uuid,
    action_taken boolean DEFAULT false,
    action_type text,
    action_date timestamp with time zone,
    outcome_status text,
    outcome_measured_at timestamp with time zone,
    outcome_notes text,
    outcome_metric_name text,
    outcome_metric_before numeric(10,2),
    outcome_metric_after numeric(10,2),
    evidence jsonb,
    signature text,
    category text,
    lifecycle_state text DEFAULT 'detected'::text NOT NULL,
    addressed_at timestamp with time zone,
    archived_at timestamp with time zone,
    engine_version text DEFAULT 'v2'::text NOT NULL,
    CONSTRAINT golf_coach_insights_engine_version_check CHECK ((engine_version = ANY (ARRAY['v2'::text, 'v3'::text]))),
    CONSTRAINT golf_coach_insights_insight_type_check CHECK ((insight_type = ANY (ARRAY['performance_decline'::text, 'performance_improvement'::text, 'pattern_detected'::text, 'practice_recommendation'::text, 'roster_alert'::text, 'qualifying_watch'::text, 'attendance_concern'::text, 'milestone_reached'::text, 'comparison_insight'::text, 'scoring_decline'::text, 'stat_regression'::text, 'tournament_pressure'::text, 'plateau'::text, 'bubble_player'::text, 'surge_player'::text, 'streak'::text, 'recurring_weakness'::text, 'closing_holes'::text, 'par_3_issues'::text, 'team_trend'::text, 'roster_recommendation'::text, 'putting'::text, 'tee'::text, 'approach'::text, 'short_game'::text, 'scoring'::text, 'pressure'::text, 'course_management'::text, 'approach_miss'::text, 'par_scoring'::text, 'pressure_gap'::text, 'putt_bias'::text, 'putt_distance'::text, 'scrambling'::text, 'warmup_hole'::text, 'composite'::text]))),
    CONSTRAINT golf_coach_insights_lifecycle_state_check CHECK (((lifecycle_state IS NULL) OR (lifecycle_state = ANY (ARRAY['tentative'::text, 'detected'::text, 'matured'::text, 'addressed'::text, 'resolved'::text, 'archived'::text])))),
    CONSTRAINT golf_coach_insights_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT golf_coach_insights_status_check CHECK ((status = ANY (ARRAY['active'::text, 'acknowledged'::text, 'dismissed'::text, 'resolved'::text])))
);


--
-- Name: COLUMN golf_coach_insights.engine_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_coach_insights.engine_version IS 'v3 W21. ''v2'' = legacy mining/* generator output; ''v3'' = BaseGenerator output. Combined with the v3: signature prefix lets both engines coexist during W21-W25 transition + lets W35 outcome attribution score them separately.';


--
-- Name: golf_coach_philosophy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coach_philosophy (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    priority_ball_striking integer DEFAULT 1,
    priority_short_game integer DEFAULT 2,
    priority_putting integer DEFAULT 3,
    priority_course_management integer DEFAULT 4,
    priority_mental_game integer DEFAULT 5,
    alert_sensitivity text DEFAULT 'balanced'::text,
    decline_threshold numeric DEFAULT 2.0,
    pressure_gap_threshold numeric DEFAULT 2.0,
    bubble_zone_range numeric DEFAULT 1.5,
    coaching_philosophy text,
    expectations text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    weight_historical integer DEFAULT 35 NOT NULL,
    weight_recent_form integer DEFAULT 30 NOT NULL,
    weight_tournament integer DEFAULT 20 NOT NULL,
    weight_qualifying integer DEFAULT 10 NOT NULL,
    weight_subjective integer DEFAULT 5 NOT NULL,
    alert_scoring_decline boolean DEFAULT true NOT NULL,
    alert_stat_regression boolean DEFAULT true NOT NULL,
    alert_tournament_pressure boolean DEFAULT true NOT NULL,
    alert_plateau boolean DEFAULT false NOT NULL,
    alert_bubble_player boolean DEFAULT true NOT NULL,
    alert_surge_player boolean DEFAULT true NOT NULL,
    alert_streaks boolean DEFAULT true NOT NULL,
    alert_recurring_weakness boolean DEFAULT true NOT NULL,
    alert_closing_holes boolean DEFAULT false NOT NULL,
    alert_par_3_issues boolean DEFAULT false NOT NULL,
    show_strokes_gained boolean DEFAULT true NOT NULL,
    show_advanced_stats boolean DEFAULT true NOT NULL,
    insight_verbosity text DEFAULT 'detailed'::text NOT NULL,
    email_digest_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT golf_coach_philosophy_insight_verbosity_check CHECK ((insight_verbosity = ANY (ARRAY['brief'::text, 'detailed'::text])))
);


--
-- Name: COLUMN golf_coach_philosophy.email_digest_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_coach_philosophy.email_digest_enabled IS 'Coach opt-in for daily 06:30 UTC morning digest email of top insights.';


--
-- Name: golf_coach_player_intent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coach_player_intent (
    coach_id uuid NOT NULL,
    player_id uuid NOT NULL,
    narrative_goal text DEFAULT 'develop'::text NOT NULL,
    alert_posture text DEFAULT 'balanced'::text NOT NULL,
    highlight_categories text[] DEFAULT '{}'::text[] NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_coach_player_intent_narrative_check CHECK ((narrative_goal = ANY (ARRAY['breakout'::text, 'maintain'::text, 'bubble'::text, 'develop'::text, 'rehabilitate'::text]))),
    CONSTRAINT golf_coach_player_intent_posture_check CHECK ((alert_posture = ANY (ARRAY['aggressive'::text, 'balanced'::text, 'conservative'::text, 'silent'::text])))
);


--
-- Name: TABLE golf_coach_player_intent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_coach_player_intent IS 'v3 W27 coach narrative posture per player. Locked decision: invisible to player. alert_posture modulates Wave 7 confidence gate threshold: aggressive=0.85×, balanced=1.0×, conservative=1.15×, silent=∞.';


--
-- Name: golf_coaches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coaches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    full_name text,
    email text,
    phone text,
    avatar_url text,
    title text,
    bio text,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_coachhelm_chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coachhelm_chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    title text,
    pinned boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE golf_coachhelm_chat_conversations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_coachhelm_chat_conversations IS 'v3 W32 coach chat thread. Per Part XII coach-only (player chat deferred to v2). pinned + archived_at drive the history UX sort.';


--
-- Name: golf_coachhelm_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coachhelm_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text,
    tool_calls jsonb,
    tool_results jsonb,
    cost_usd numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_coachhelm_chat_messages_cost_usd_check CHECK (((cost_usd IS NULL) OR (cost_usd >= (0)::numeric))),
    CONSTRAINT golf_coachhelm_chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])))
);


--
-- Name: TABLE golf_coachhelm_chat_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_coachhelm_chat_messages IS 'v3 W32 coach chat messages. Append-only. tool_calls + tool_results are jsonb so the agent can replay/inspect a turn without re-running the model.';


--
-- Name: golf_coachhelm_coach_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coachhelm_coach_weights (
    coach_id uuid NOT NULL,
    insight_type text NOT NULL,
    intent text NOT NULL,
    weight numeric DEFAULT 1.0 NOT NULL,
    sample_n integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_coachhelm_coach_weights_sample_n_check CHECK ((sample_n >= 0)),
    CONSTRAINT golf_coachhelm_coach_weights_weight_check CHECK ((weight >= (0)::numeric))
);


--
-- Name: TABLE golf_coachhelm_coach_weights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_coachhelm_coach_weights IS 'v3 W35 Bayesian-updated per-coach weights. weight × |strokes_impact| × confidence = ranker score (W36). Default 1.0 until sample_n ≥ 10.';


--
-- Name: golf_coachhelm_llm_budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coachhelm_llm_budget (
    coach_id uuid NOT NULL,
    date date NOT NULL,
    spent_usd numeric DEFAULT 0 NOT NULL,
    budget_usd numeric NOT NULL,
    task_class_usage jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_coachhelm_llm_budget_budget_usd_check CHECK ((budget_usd >= (0)::numeric)),
    CONSTRAINT golf_coachhelm_llm_budget_spent_usd_check CHECK ((spent_usd >= (0)::numeric))
);


--
-- Name: TABLE golf_coachhelm_llm_budget; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_coachhelm_llm_budget IS 'v3 W30 per-coach daily LLM spend cap. compose() reads (coach_id, today) before every call; on exhaustion falls back to non-LLM template path per Part XI.4 priority (round_review > coach_chat > hero_narrative).';


--
-- Name: golf_coachhelm_llm_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coachhelm_llm_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task text NOT NULL,
    coach_id uuid,
    player_id uuid,
    prompt_hash text NOT NULL,
    model_id text NOT NULL,
    prompt_tokens integer NOT NULL,
    completion_tokens integer NOT NULL,
    cost_usd numeric NOT NULL,
    citations jsonb,
    verified boolean NOT NULL,
    fallback_to_template boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_coachhelm_llm_calls_completion_tokens_check CHECK ((completion_tokens >= 0)),
    CONSTRAINT golf_coachhelm_llm_calls_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT golf_coachhelm_llm_calls_prompt_tokens_check CHECK ((prompt_tokens >= 0)),
    CONSTRAINT golf_coachhelm_llm_calls_task_check CHECK ((task = ANY (ARRAY['round_review'::text, 'hero_narrative'::text, 'coach_chat'::text])))
);


--
-- Name: TABLE golf_coachhelm_llm_calls; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_coachhelm_llm_calls IS 'v3 W30 append-only LLM call log. One row per compose() invocation. Used for cost attribution, dedup diagnostics, citation audit, and admin spend dashboard (deferred).';


--
-- Name: golf_coachhelm_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_coachhelm_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    team_id uuid,
    enabled boolean DEFAULT true,
    auto_insights boolean DEFAULT true,
    weekly_summary boolean DEFAULT true,
    trend_alerts boolean DEFAULT true,
    insight_frequency text DEFAULT 'daily'::text,
    min_rounds_for_insights integer DEFAULT 3,
    focus_areas text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    disabled_at timestamp with time zone,
    disabled_reason text,
    goal_assignment_default text DEFAULT 'suggested'::text NOT NULL,
    llm_narrative_enabled boolean DEFAULT false NOT NULL,
    llm_budget_usd_per_day numeric,
    CONSTRAINT golf_coachhelm_settings_goal_assignment_default_check CHECK ((goal_assignment_default = ANY (ARRAY['mandatory'::text, 'suggested'::text]))),
    CONSTRAINT golf_coachhelm_settings_llm_budget_nonneg_check CHECK (((llm_budget_usd_per_day IS NULL) OR (llm_budget_usd_per_day >= (0)::numeric)))
);


--
-- Name: COLUMN golf_coachhelm_settings.goal_assignment_default; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_coachhelm_settings.goal_assignment_default IS 'v3 goal-assignment default: ''mandatory'' (player must accept; forced active) or ''suggested'' (player chooses). Default ''suggested''. Overridable per-goal at creation.';


--
-- Name: COLUMN golf_coachhelm_settings.llm_narrative_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_coachhelm_settings.llm_narrative_enabled IS 'v3 LLM gate: when false, all three LLM surfaces (round_review, hero_narrative, coach_chat) fall back to deterministic templates for this coach''s players. Default false at W9; flipped per-coach via GrowthBook in W30+.';


--
-- Name: COLUMN golf_coachhelm_settings.llm_budget_usd_per_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_coachhelm_settings.llm_budget_usd_per_day IS 'v3 LLM spend cap (USD/day) for this coach''s players combined. NULL = use platform default. Enforced in v3/llm/budget.ts before every compose() call. Exhaustion triggers priority fallback: round_review > coach_chat > hero_narrative -> template.';


--
-- Name: golf_confidence_calibration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_confidence_calibration (
    bucket numeric(3,1) NOT NULL,
    prediction_type text NOT NULL,
    predictions_count integer DEFAULT 0 NOT NULL,
    correct_count integer DEFAULT 0 NOT NULL,
    actual_accuracy numeric(5,4) DEFAULT 0 NOT NULL,
    sample_size integer DEFAULT 0 NOT NULL,
    calibration_error numeric(5,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: golf_conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_conversation_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone
);


--
-- Name: golf_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_conversations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid,
    is_team_chat boolean DEFAULT false,
    title text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_team_channel boolean DEFAULT false
);


--
-- Name: golf_course_holes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_course_holes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    hole_number integer NOT NULL,
    par integer NOT NULL,
    yardage integer,
    handicap_index integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_course_holes_handicap_index_check CHECK (((handicap_index >= 1) AND (handicap_index <= 18))),
    CONSTRAINT golf_course_holes_hole_number_check CHECK (((hole_number >= 1) AND (hole_number <= 18))),
    CONSTRAINT golf_course_holes_par_check CHECK (((par >= 3) AND (par <= 6)))
);


--
-- Name: golf_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_courses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    city text,
    state text,
    country text DEFAULT 'USA'::text,
    holes integer DEFAULT 18,
    par integer,
    course_rating numeric,
    slope_rating integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version_number integer NOT NULL,
    file_url text NOT NULL,
    file_size bigint,
    uploaded_by uuid,
    change_notes text,
    created_at timestamp with time zone DEFAULT now(),
    file_name text,
    mime_type text,
    storage_path text
);


--
-- Name: TABLE golf_document_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_document_versions IS 'Version history for golf team documents';


--
-- Name: COLUMN golf_document_versions.version_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_document_versions.version_number IS 'Auto-incrementing version number per document';


--
-- Name: COLUMN golf_document_versions.change_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_document_versions.change_notes IS 'Optional notes describing changes in this version';


--
-- Name: golf_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_documents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    uploaded_by uuid,
    title text NOT NULL,
    description text,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    category text,
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    current_version_id uuid,
    version_count integer DEFAULT 1,
    folder text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: COLUMN golf_documents.current_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_documents.current_version_id IS 'Reference to the current/latest version';


--
-- Name: COLUMN golf_documents.version_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_documents.version_count IS 'Total number of versions for quick display';


--
-- Name: COLUMN golf_documents.folder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_documents.folder IS 'Optional folder name for document organization';


--
-- Name: golf_drills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_drills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    description text NOT NULL,
    duration_min integer NOT NULL,
    difficulty text NOT NULL,
    video_url text,
    created_at timestamp with time zone DEFAULT now(),
    impacts_metric_id text,
    CONSTRAINT golf_drills_difficulty_check CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])))
);


--
-- Name: golf_event_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_event_attendance (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    rsvp_at timestamp with time zone,
    checked_in boolean DEFAULT false,
    checked_in_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    notified_at timestamp with time zone,
    CONSTRAINT golf_event_attendance_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'tentative'::text, 'attending'::text, 'not_attending'::text, 'maybe'::text, 'excused'::text, 'unexcused'::text])))
);


--
-- Name: golf_event_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_event_documents (
    event_id uuid NOT NULL,
    document_id uuid NOT NULL,
    attached_by uuid,
    attached_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);


--
-- Name: golf_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    description text,
    event_type text NOT NULL,
    location text,
    course_id uuid,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    all_day boolean DEFAULT false,
    recurring boolean DEFAULT false,
    recurrence_rule text,
    parent_event_id uuid,
    status text DEFAULT 'scheduled'::text,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    requires_rsvp boolean DEFAULT false,
    rsvp_deadline timestamp with time zone,
    max_attendees integer
);


--
-- Name: golf_global_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_global_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    signature text NOT NULL,
    pattern_type text NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    outcomes jsonb DEFAULT '{}'::jsonb NOT NULL,
    prevalence numeric(5,4) DEFAULT 0 NOT NULL,
    average_impact numeric(6,3) DEFAULT 0 NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    instance_count integer DEFAULT 0 NOT NULL,
    player_count integer DEFAULT 0 NOT NULL,
    varied_by_tier jsonb DEFAULT '{}'::jsonb NOT NULL,
    varied_by_handicap jsonb DEFAULT '{}'::jsonb NOT NULL,
    contributing_players uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: golf_goal_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_goal_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    metric_id text NOT NULL,
    suggested_at timestamp with time zone DEFAULT now() NOT NULL,
    suggested_target_value numeric,
    suggested_window_days integer DEFAULT 30 NOT NULL,
    origin_insight_id uuid,
    state text DEFAULT 'pending'::text NOT NULL,
    acted_at timestamp with time zone,
    snooze_until timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    CONSTRAINT golf_goal_suggestions_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'accepted'::text, 'dismissed'::text, 'snoozed'::text, 'expired'::text]))),
    CONSTRAINT golf_goal_suggestions_window_range CHECK (((suggested_window_days >= 7) AND (suggested_window_days <= 365)))
);


--
-- Name: TABLE golf_goal_suggestions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_goal_suggestions IS 'v3 W19. Engine-emitted goal suggestions per Part VI.5. Player accepts (→ golf_goals row created) / dismisses / snoozes; 14-day default TTL.';


--
-- Name: golf_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    created_by_user_id uuid NOT NULL,
    creator_role text NOT NULL,
    coach_id_if_assigned uuid,
    metric_id text NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    window_days integer GENERATED ALWAYS AS ((EXTRACT(day FROM (ends_at - started_at)))::integer) STORED,
    baseline_value numeric,
    current_value numeric,
    target_value numeric,
    target_source text,
    state text DEFAULT 'active'::text NOT NULL,
    outcome_evaluated_at timestamp with time zone,
    shared_with_coach boolean DEFAULT false NOT NULL,
    shared_at timestamp with time zone,
    coach_assignment_mode text,
    player_accepted_at timestamp with time zone,
    player_declined_at timestamp with time zone,
    player_decline_reason text,
    transfer_reason text,
    origin text DEFAULT 'manual'::text NOT NULL,
    origin_insight_id uuid,
    snapshots jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_goals_coach_assignment_mode_check CHECK (((coach_assignment_mode IS NULL) OR (coach_assignment_mode = ANY (ARRAY['mandatory'::text, 'suggested'::text])))),
    CONSTRAINT golf_goals_creator_role_check CHECK ((creator_role = ANY (ARRAY['player'::text, 'coach'::text]))),
    CONSTRAINT golf_goals_ends_after_started CHECK ((ends_at > started_at)),
    CONSTRAINT golf_goals_origin_check CHECK ((origin = ANY (ARRAY['manual'::text, 'engine_suggested'::text, 'from_insight'::text]))),
    CONSTRAINT golf_goals_state_check CHECK ((state = ANY (ARRAY['active'::text, 'paused'::text, 'achieved'::text, 'missed'::text, 'partial'::text, 'abandoned'::text, 'pending_baseline'::text]))),
    CONSTRAINT golf_goals_target_source_check CHECK (((target_source IS NULL) OR (target_source = ANY (ARRAY['manual'::text, 'team_avg'::text, 'pga_value'::text, 'midpoint'::text])))),
    CONSTRAINT golf_goals_window_range CHECK (((window_days >= 7) AND (window_days <= 365)))
);


--
-- Name: TABLE golf_goals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_goals IS 'v3 Goals primitive (W18). Replaces v2 golf_player_focus_areas + arcs + drill compliance per master plan Part III locked decisions. State machine: active / paused / achieved / missed / partial / abandoned / pending_baseline. Soft cap of 5 active goals per player enforced at app layer (UI warns, schema does not block).';


--
-- Name: COLUMN golf_goals.window_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_goals.window_days IS 'Generated column = days between started_at and ends_at. CHECK constraint enforces 7-365 range per locked decision.';


--
-- Name: COLUMN golf_goals.shared_with_coach; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_goals.shared_with_coach IS 'Player-set sharing toggle. DEFAULT false per master plan locked decision — coach sees only assigned goals OR explicitly shared player goals.';


--
-- Name: COLUMN golf_goals.coach_assignment_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_goals.coach_assignment_mode IS 'When creator_role=coach: ''mandatory'' (forced active for player) or ''suggested'' (player accepts/declines). Per-team default lives in golf_coachhelm_settings.goal_assignment_default.';


--
-- Name: COLUMN golf_goals.snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_goals.snapshots IS 'jsonb[] — weekly cron appends {date, value, team_avg} snapshots so the UI can render progress sparklines without recomputing.';


--
-- Name: golf_holes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_holes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    round_id uuid NOT NULL,
    hole_number integer NOT NULL,
    par integer NOT NULL,
    score integer,
    putts integer,
    fairway_hit boolean,
    gir boolean,
    up_and_down boolean,
    sand_save boolean,
    penalty_strokes integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    yardage integer,
    CONSTRAINT golf_holes_hole_number_check CHECK (((hole_number >= 1) AND (hole_number <= 18)))
);


--
-- Name: COLUMN golf_holes.yardage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_holes.yardage IS 'Actual yardage played for this hole in this round (may differ from course default)';


--
-- Name: golf_ingest_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_ingest_connections (
    player_id uuid NOT NULL,
    provider text NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text,
    expires_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    state text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_ingest_connections_provider_check CHECK ((provider = ANY (ARRAY['arccos'::text, 'garmin'::text, 'trackman'::text]))),
    CONSTRAINT golf_ingest_connections_state_check CHECK ((state = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'error'::text])))
);


--
-- Name: TABLE golf_ingest_connections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_ingest_connections IS 'v3 W39-41 OAuth-state per (player, provider). access_token_encrypted is ciphertext — adapters round-trip plaintext via app-layer KMS.';


--
-- Name: golf_ingest_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_ingest_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    provider text NOT NULL,
    shots_inserted integer DEFAULT 0 NOT NULL,
    rounds_inserted integer DEFAULT 0 NOT NULL,
    errors_count integer DEFAULT 0 NOT NULL,
    error_detail text,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_ingest_sync_log_errors_count_check CHECK ((errors_count >= 0)),
    CONSTRAINT golf_ingest_sync_log_rounds_inserted_check CHECK ((rounds_inserted >= 0)),
    CONSTRAINT golf_ingest_sync_log_shots_inserted_check CHECK ((shots_inserted >= 0))
);


--
-- Name: golf_insight_drill_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_insight_drill_attachments (
    insight_id uuid NOT NULL,
    drill_id uuid NOT NULL,
    rank integer DEFAULT 0 NOT NULL
);


--
-- Name: golf_insight_effectiveness; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_insight_effectiveness (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    insight_type text NOT NULL,
    insights_generated integer DEFAULT 0,
    insights_dismissed integer DEFAULT 0,
    insights_acted_upon integer DEFAULT 0,
    insights_with_outcome integer DEFAULT 0,
    outcomes_improved integer DEFAULT 0,
    outcomes_no_change integer DEFAULT 0,
    outcomes_worsened integer DEFAULT 0,
    action_rate numeric(5,4),
    improvement_rate numeric(5,4),
    effectiveness_score numeric(5,4),
    predictions_made integer DEFAULT 0,
    predictions_accurate integer DEFAULT 0,
    mean_absolute_error numeric(6,2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_insight_generation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_insight_generation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    player_id uuid,
    insight_type text,
    rounds_analyzed integer,
    insights_generated integer,
    engine_version text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_insight_outcome_attribution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_insight_outcome_attribution (
    insight_id uuid NOT NULL,
    surfaced_at timestamp with time zone NOT NULL,
    target_metric_id text NOT NULL,
    baseline_value numeric NOT NULL,
    post_value numeric NOT NULL,
    delta numeric NOT NULL,
    n_rounds_before integer NOT NULL,
    n_rounds_after integer NOT NULL,
    lift numeric,
    attributed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_insight_outcome_attribution_n_rounds_after_check CHECK ((n_rounds_after >= 0)),
    CONSTRAINT golf_insight_outcome_attribution_n_rounds_before_check CHECK ((n_rounds_before >= 0))
);


--
-- Name: TABLE golf_insight_outcome_attribution; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_insight_outcome_attribution IS 'v3 W35 per-insight outcome attribution. surfaced_at + baseline/post + delta + lift fuels coach-weights Bayesian updates and feeds golf_insight_effectiveness aggregates.';


--
-- Name: golf_insight_player_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_insight_player_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    insight_id uuid NOT NULL,
    player_id uuid NOT NULL,
    rating text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_insight_player_feedback_rating_check CHECK ((rating = ANY (ARRAY['helpful'::text, 'not_helpful'::text, 'dismissed'::text, 'acknowledged'::text])))
);


--
-- Name: golf_learned_behavior; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_learned_behavior (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    entity_type text NOT NULL,
    interaction_type text NOT NULL,
    target_type text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_learned_behavior_entity_type_check CHECK ((entity_type = ANY (ARRAY['coach'::text, 'player'::text])))
);


--
-- Name: golf_message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_message_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    storage_path text NOT NULL,
    url text,
    thumbnail_url text,
    width integer,
    height integer,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE golf_message_attachments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_message_attachments IS 'File and video attachments for golf messages';


--
-- Name: COLUMN golf_message_attachments.file_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_message_attachments.file_type IS 'Category: image, video, document, audio';


--
-- Name: COLUMN golf_message_attachments.mime_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_message_attachments.mime_type IS 'MIME type like image/jpeg, video/mp4';


--
-- Name: COLUMN golf_message_attachments.storage_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_message_attachments.storage_path IS 'Path in Supabase storage bucket';


--
-- Name: COLUMN golf_message_attachments.thumbnail_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_message_attachments.thumbnail_url IS 'Thumbnail preview URL for images/videos';


--
-- Name: golf_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    has_attachments boolean DEFAULT false,
    edited_at timestamp with time zone,
    is_deleted boolean DEFAULT false
);


--
-- Name: golf_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_metrics (
    metric_id text NOT NULL,
    display_label text NOT NULL,
    unit text NOT NULL,
    direction text NOT NULL,
    category text NOT NULL,
    description text,
    introduced_in_wave text DEFAULT 'W9'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_metrics_category_check CHECK ((category = ANY (ARRAY['sg'::text, 'putting'::text, 'approach'::text, 'short_game'::text, 'course_mgmt'::text, 'scoring'::text, 'pressure'::text]))),
    CONSTRAINT golf_metrics_direction_check CHECK ((direction = ANY (ARRAY['higher_better'::text, 'lower_better'::text]))),
    CONSTRAINT golf_metrics_unit_check CHECK ((unit = ANY (ARRAY['percent'::text, 'strokes'::text, 'yards'::text, 'feet'::text, 'count'::text])))
);


--
-- Name: TABLE golf_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_metrics IS 'v3 canonical metric registry. Every metric the engine surfaces (in goals, standing, generators, genome) must have a row here. Schema-of-truth that the TS registry at src/lib/coachhelm/v3/metrics/registry.ts mirrors; CI check validates parity. Seeded with 28 metrics in the next migration.';


--
-- Name: COLUMN golf_metrics.metric_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_metrics.metric_id IS 'Stable canonical ID. Format: snake_case with underscore-separated buckets where applicable (e.g. putts_made_3_5ft_pct, scoring_par_4). Never rename — referenced from FK columns across the engine.';


--
-- Name: COLUMN golf_metrics.direction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_metrics.direction IS 'higher_better: higher player value is better (make %, GIR %, SG). lower_better: lower value is better (penalty rate, scoring vs par, pressure delta).';


--
-- Name: COLUMN golf_metrics.active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_metrics.active IS 'False signals deprecated. Existing rows referencing inactive metrics stay valid; new goals/standing rows should not be written against inactive metrics. Drop via separate retire-wave migration.';


--
-- Name: golf_patterns_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_patterns_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    pattern_type text NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    outcome jsonb,
    support numeric DEFAULT 0 NOT NULL,
    confidence numeric DEFAULT 0 NOT NULL,
    lift numeric DEFAULT 1,
    conviction numeric DEFAULT 1,
    stroke_impact numeric DEFAULT 0,
    actionability numeric DEFAULT 0,
    sample_size integer DEFAULT 0,
    first_detected timestamp with time zone DEFAULT now(),
    last_occurrence timestamp with time zone DEFAULT now(),
    occurrence_count integer DEFAULT 1,
    trend text,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    severity text DEFAULT 'medium'::text,
    strokes_impact numeric(4,2),
    validated_by_coach boolean DEFAULT false,
    validation_date timestamp with time zone,
    validator_coach_id uuid,
    source_round_ids uuid[] DEFAULT '{}'::uuid[],
    lifecycle_state text DEFAULT 'detected'::text,
    resolved_at timestamp with time zone,
    resolution_notes text,
    dismissed_at timestamp with time zone,
    dismissed_reason text,
    CONSTRAINT golf_patterns_v2_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['detected'::text, 'confirmed'::text, 'addressed'::text, 'resolved'::text, 'dismissed'::text]))),
    CONSTRAINT golf_patterns_v2_pattern_type_check CHECK ((pattern_type = ANY (ARRAY['conditional'::text, 'compound'::text, 'anomaly'::text, 'regression'::text, 'temporal'::text, 'contextual'::text, 'sequence'::text, 'cluster'::text]))),
    CONSTRAINT golf_patterns_v2_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT golf_patterns_v2_trend_check CHECK ((trend = ANY (ARRAY['strengthening'::text, 'stable'::text, 'weakening'::text, 'new'::text])))
);


--
-- Name: golf_percentile_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_percentile_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    metric_name text NOT NULL,
    team_percentile numeric(5,2),
    platform_percentile numeric(5,2),
    division_percentile numeric(5,2),
    calculated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_pga_standards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_pga_standards (
    metric_id text NOT NULL,
    season text NOT NULL,
    display_label text NOT NULL,
    pga_tour_value numeric,
    korn_ferry_value numeric,
    div1_avg_value numeric,
    div2_avg_value numeric,
    div3_avg_value numeric,
    hs_avg_value numeric,
    pga_p25 numeric,
    pga_p50 numeric,
    pga_p75 numeric,
    source text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE golf_pga_standards; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_pga_standards IS 'v3 baseline registry. Per (metric_id, season) values for each cohort tier — Tour, Korn Ferry, D1/D2/D3, HS — plus Tour distributional percentiles. Read by standing bars (W11+) and counterfactuals (W17). FK to golf_metrics enforces TS<->DB parity.';


--
-- Name: COLUMN golf_pga_standards.season; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_pga_standards.season IS 'Season identifier — typically "2024" for Tour data. Allows historical baselines to coexist; standing surfaces always select the most recent season available.';


--
-- Name: COLUMN golf_pga_standards.pga_p50; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_pga_standards.pga_p50 IS 'PGA Tour median (50th percentile). Used as the "Tour average" reference line when pga_tour_value is null OR when the metric is zero-sum (SG cluster).';


--
-- Name: COLUMN golf_pga_standards.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_pga_standards.source IS 'Free-text citation pointing into docs/v3-research-golf-domain.md or the source URL. Required per master plan Part V — every causal claim and PGA baseline must trace back to a source.';


--
-- Name: golf_platform_metrics_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_platform_metrics_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_date date NOT NULL,
    daily_active_users integer DEFAULT 0,
    weekly_active_users integer DEFAULT 0,
    monthly_active_users integer DEFAULT 0,
    total_users integer DEFAULT 0,
    new_signups integer DEFAULT 0,
    rounds_today integer DEFAULT 0,
    rounds_this_week integer DEFAULT 0,
    total_rounds integer DEFAULT 0,
    avg_rounds_per_active_player numeric(6,2),
    insights_generated integer DEFAULT 0,
    reviews_created integer DEFAULT 0,
    patterns_detected integer DEFAULT 0,
    active_teams integer DEFAULT 0,
    avg_engagement_score numeric(5,2),
    churn_at_risk_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_player_attendance_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_attendance_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_events integer DEFAULT 0,
    attended_events integer DEFAULT 0,
    excused_absences integer DEFAULT 0,
    unexcused_absences integer DEFAULT 0,
    attendance_rate numeric(5,2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_player_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_baselines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    metric_name text NOT NULL,
    ewma_value numeric(10,4),
    rolling_mean numeric(10,4),
    rolling_stddev numeric(10,4),
    sample_size integer DEFAULT 0,
    decay_factor numeric(5,4) DEFAULT 0.15,
    last_updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_player_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_classes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    class_name text NOT NULL,
    instructor text,
    days text[],
    start_time time without time zone,
    end_time time without time zone,
    building text,
    room text,
    credits integer,
    color text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_player_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    course_id uuid,
    course_name text,
    relationship text DEFAULT 'played'::text,
    rounds_played integer DEFAULT 0,
    best_score integer,
    average_score numeric(5,2),
    last_played_at date,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_player_courses_relationship_check CHECK ((relationship = ANY (ARRAY['home'::text, 'frequent'::text, 'played'::text, 'favorite'::text])))
);


--
-- Name: golf_player_focus_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_focus_areas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    coach_id uuid,
    area_type text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'active'::text,
    target_metric text,
    current_value numeric,
    target_value numeric,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    from_review_id uuid,
    from_insight_id uuid,
    review_context text,
    progress_notes jsonb DEFAULT '[]'::jsonb,
    priority integer DEFAULT 1
);


--
-- Name: golf_player_genome; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_genome (
    player_id uuid NOT NULL,
    vector jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    rounds_basis integer NOT NULL,
    CONSTRAINT golf_player_genome_rounds_basis_check CHECK ((rounds_basis >= 0))
);


--
-- Name: TABLE golf_player_genome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_player_genome IS 'v3 W33 per-player 80-dim genome vector. jsonb keyed by dimension_id. Computed nightly. rounds_basis lets the UI show "8 of 10 dims unlocked" progress states.';


--
-- Name: golf_player_notification_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_notification_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    last_announcements_seen_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_travel_seen_at timestamp with time zone DEFAULT now(),
    prefs jsonb DEFAULT '{"goal_missed": {"push": false, "email": false, "in_app": true}, "new_insight": {"push": false, "email": false, "in_app": true}, "goal_achieved": {"push": true, "email": false, "in_app": true}, "weekly_digest": {"push": false, "email": true, "in_app": false}, "coach_commented": {"push": true, "email": false, "in_app": true}, "composite_insight": {"push": true, "email": false, "in_app": true}, "round_review_ready": {"push": true, "email": false, "in_app": true}, "coach_assigned_goal": {"push": true, "email": false, "in_app": true}, "engine_suggested_goal": {"push": false, "email": false, "in_app": true}, "standing_percentile_changed": {"push": false, "email": false, "in_app": false}}'::jsonb NOT NULL,
    quiet_mode boolean DEFAULT false NOT NULL
);


--
-- Name: golf_player_standing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_standing (
    player_id uuid NOT NULL,
    metric_id text NOT NULL,
    player_value numeric NOT NULL,
    team_avg numeric,
    team_n integer DEFAULT 0 NOT NULL,
    team_pct numeric,
    level_avg numeric,
    level_n integer DEFAULT 0 NOT NULL,
    level_pct numeric,
    pga_value numeric NOT NULL,
    pga_delta numeric,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE golf_player_standing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_player_standing IS 'v3 standing snapshots — one row per (player_id, metric_id). Computed nightly by /api/cron/v3/standing-refresh. Powers every StandingBar render plus W17 counterfactuals. pga_value NOT NULL — metric must have a PGA baseline to land here.';


--
-- Name: COLUMN golf_player_standing.team_n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_standing.team_n IS 'Number of teammates contributing to team_avg / team_pct. When < 5, StandingBar omits the team marker (cold-start rule per master plan Part VII.3). Row still writes for the player vs PGA comparison.';


--
-- Name: COLUMN golf_player_standing.team_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_standing.team_pct IS 'Player percentile (0-100) within the team for this metric. Computed via SQL PERCENT_RANK() OVER (PARTITION BY team_id ORDER BY player_value [ASC|DESC depending on metric direction]).';


--
-- Name: COLUMN golf_player_standing.pga_delta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_standing.pga_delta IS 'Signed delta: player_value - pga_value. Sign meaning depends on metric.direction in golf_metrics — consumers should join to determine "better" vs "worse". W17 counterfactual reads this to compute strokes-gained-if-closed.';


--
-- Name: golf_player_stats_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_player_stats_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    scoring_average numeric(5,2),
    scoring_average_vs_par numeric(5,2),
    rounds_played integer DEFAULT 0,
    best_round integer,
    worst_round integer,
    par3_average numeric(5,2),
    par4_average numeric(5,2),
    par5_average numeric(5,2),
    eagles integer DEFAULT 0,
    birdies integer DEFAULT 0,
    pars integer DEFAULT 0,
    bogeys integer DEFAULT 0,
    double_bogeys integer DEFAULT 0,
    triple_plus integer DEFAULT 0,
    strokes_gained_total numeric(5,2),
    strokes_gained_tee numeric(5,2),
    strokes_gained_approach numeric(5,2),
    strokes_gained_around_green numeric(5,2),
    strokes_gained_putting numeric(5,2),
    driving_accuracy_percentage numeric(5,2),
    fairways_hit integer DEFAULT 0,
    fairways_total integer DEFAULT 0,
    driving_distance_average numeric(6,1),
    gir_percentage numeric(5,2),
    greens_hit integer DEFAULT 0,
    greens_total integer DEFAULT 0,
    approach_proximity_average numeric(6,1),
    scrambling_percentage numeric(5,2),
    scrambles_converted integer DEFAULT 0,
    scramble_attempts integer DEFAULT 0,
    sand_save_percentage numeric(5,2),
    sand_saves integer DEFAULT 0,
    sand_attempts integer DEFAULT 0,
    up_and_down_percentage numeric(5,2),
    putts_per_round numeric(4,2),
    putts_per_gir numeric(4,2),
    one_putt_percentage numeric(5,2),
    three_putt_percentage numeric(5,2),
    total_putts integer DEFAULT 0,
    putt_make_pct_0_3ft numeric(5,2),
    putt_make_pct_3_5ft numeric(5,2),
    putt_make_pct_5_10ft numeric(5,2),
    putt_make_pct_10_15ft numeric(5,2),
    putt_make_pct_15_20ft numeric(5,2),
    putt_make_pct_20_plus_ft numeric(5,2),
    putt_make_pct_left_to_right numeric(5,2),
    putt_make_pct_right_to_left numeric(5,2),
    putt_make_pct_straight numeric(5,2),
    penalty_strokes_per_round numeric(4,2),
    total_penalties integer DEFAULT 0,
    approach_miss_left_pct numeric(5,2),
    approach_miss_right_pct numeric(5,2),
    approach_miss_short_pct numeric(5,2),
    approach_miss_long_pct numeric(5,2),
    last_round_date date,
    rounds_in_calculation integer DEFAULT 0,
    calculation_period_start date,
    calculation_period_end date,
    engine_version text DEFAULT 'v2'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    rounds_this_season integer DEFAULT 0,
    season_start_date date,
    last_5_average numeric(5,2),
    last_10_average numeric(5,2),
    improvement_trend numeric(5,2),
    trend_direction text,
    sg_total_per_round numeric(5,2),
    sg_tee_per_round numeric(5,2),
    sg_approach_per_round numeric(5,2),
    sg_around_green_per_round numeric(5,2),
    sg_putting_per_round numeric(5,2),
    is_stale boolean DEFAULT false,
    next_refresh_due timestamp with time zone,
    round_ids_included uuid[],
    CONSTRAINT golf_player_stats_cache_trend_direction_check CHECK ((trend_direction = ANY (ARRAY['improving'::text, 'stable'::text, 'declining'::text])))
);


--
-- Name: COLUMN golf_player_stats_cache.last_5_average; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_stats_cache.last_5_average IS 'Average score of last 5 completed rounds';


--
-- Name: COLUMN golf_player_stats_cache.last_10_average; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_stats_cache.last_10_average IS 'Average score of last 10 completed rounds';


--
-- Name: COLUMN golf_player_stats_cache.improvement_trend; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_stats_cache.improvement_trend IS 'Score improvement trend: positive means improving (lower scores)';


--
-- Name: COLUMN golf_player_stats_cache.trend_direction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_stats_cache.trend_direction IS 'Quick indicator: improving, stable, or declining';


--
-- Name: COLUMN golf_player_stats_cache.is_stale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_stats_cache.is_stale IS 'TRUE if cache needs recalculation (e.g., after round edit/delete)';


--
-- Name: COLUMN golf_player_stats_cache.round_ids_included; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_player_stats_cache.round_ids_included IS 'Array of round IDs included in the calculation for verification';


--
-- Name: golf_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_players (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    first_name text,
    last_name text,
    email text,
    phone text,
    avatar_url text,
    hometown text,
    state text,
    handicap numeric,
    handicap_index numeric,
    high_school_name text,
    graduation_year integer,
    gpa numeric,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    profile_complete boolean DEFAULT false
);


--
-- Name: golf_practice_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_practice_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    source text NOT NULL,
    session_date date NOT NULL,
    shots_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: golf_prediction_model_performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_prediction_model_performance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    model_type text NOT NULL,
    model_version text,
    period_start date NOT NULL,
    period_end date NOT NULL,
    predictions_made integer DEFAULT 0,
    predictions_validated integer DEFAULT 0,
    accuracy_rate numeric(5,4),
    mean_absolute_error numeric(6,2),
    root_mean_square_error numeric(6,2),
    calibration_score numeric(5,4),
    overconfidence_rate numeric(5,4),
    underconfidence_rate numeric(5,4),
    accuracy_by_confidence jsonb DEFAULT '{}'::jsonb,
    error_distribution jsonb DEFAULT '{}'::jsonb,
    systematic_bias numeric(6,2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_prediction_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_prediction_validations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prediction_id uuid,
    player_id uuid NOT NULL,
    predicted_value numeric(6,2),
    actual_value numeric(6,2),
    error numeric(6,2),
    error_pct numeric(5,2),
    within_interval boolean,
    direction text,
    validated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_prediction_validations_direction_check CHECK ((direction = ANY (ARRAY['overestimate'::text, 'underestimate'::text, 'accurate'::text])))
);


--
-- Name: golf_predictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    metric text NOT NULL,
    predicted_value numeric NOT NULL,
    confidence numeric DEFAULT 0 NOT NULL,
    confidence_interval_low numeric,
    confidence_interval_high numeric,
    prediction_window_days integer DEFAULT 30,
    trend text,
    key_drivers jsonb DEFAULT '[]'::jsonb,
    input_features jsonb DEFAULT '[]'::jsonb,
    model_version text DEFAULT 'v2'::text,
    due_date date,
    validated_at timestamp with time zone,
    actual_value numeric,
    was_accurate boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    prediction_context jsonb DEFAULT '{}'::jsonb,
    confidence_factors jsonb DEFAULT '[]'::jsonb,
    error_analysis jsonb DEFAULT '{}'::jsonb,
    error_category text,
    related_round_id uuid,
    related_event_id uuid,
    predicted_low numeric(6,2),
    predicted_high numeric(6,2),
    CONSTRAINT golf_predictions_trend_check CHECK ((trend = ANY (ARRAY['improving'::text, 'stable'::text, 'declining'::text])))
);


--
-- Name: golf_qualifier_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_qualifier_entries (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    qualifier_id uuid NOT NULL,
    player_id uuid NOT NULL,
    round_id uuid,
    status text DEFAULT 'entered'::text,
    score integer,
    "position" integer,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    total_score integer,
    total_to_par integer,
    rounds_completed integer DEFAULT 0,
    is_tied boolean DEFAULT false
);


--
-- Name: golf_qualifier_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_qualifier_selections (
    qualifier_id uuid NOT NULL,
    player_id uuid NOT NULL,
    selection_type text NOT NULL,
    coach_reasoning text,
    selected_at timestamp with time zone DEFAULT now() NOT NULL,
    selected_by_user_id uuid NOT NULL,
    CONSTRAINT golf_qualifier_selections_type_check CHECK ((selection_type = ANY (ARRAY['top_score'::text, 'coach_pick'::text])))
);


--
-- Name: TABLE golf_qualifier_selections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_qualifier_selections IS 'v3 W29 per-player picks for a qualifier. selection_type=top_score is auto-locked from top-N position; coach_pick is discretionary (coach_reasoning expected).';


--
-- Name: golf_qualifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_qualifiers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    created_by uuid,
    name text NOT NULL,
    description text,
    course_id uuid,
    course_name text,
    start_date date NOT NULL,
    end_date date,
    status text DEFAULT 'upcoming'::text,
    spots_available integer,
    entry_deadline date,
    rules text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    selection_slots_total integer DEFAULT 5 NOT NULL,
    selection_slots_coach_pick integer DEFAULT 1 NOT NULL,
    target_tournament_id uuid,
    selection_state text DEFAULT 'open'::text NOT NULL,
    CONSTRAINT golf_qualifiers_check CHECK (((selection_slots_coach_pick >= 0) AND (selection_slots_coach_pick <= selection_slots_total))),
    CONSTRAINT golf_qualifiers_selection_slots_total_check CHECK (((selection_slots_total >= 1) AND (selection_slots_total <= 12))),
    CONSTRAINT golf_qualifiers_selection_state_check CHECK ((selection_state = ANY (ARRAY['open'::text, 'scoring'::text, 'closed'::text, 'selected'::text])))
);


--
-- Name: golf_recruits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_recruits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    created_by uuid,
    first_name text NOT NULL,
    last_name text,
    hs_class integer,
    email text,
    phone text,
    hometown text,
    state text,
    notes text,
    status text DEFAULT 'recruiting'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_recruits_lengths CHECK (((length(first_name) <= 120) AND ((last_name IS NULL) OR (length(last_name) <= 120)) AND ((email IS NULL) OR (length(email) <= 254)) AND ((phone IS NULL) OR (length(phone) <= 40)) AND ((hometown IS NULL) OR (length(hometown) <= 120)) AND ((state IS NULL) OR (length(state) <= 2)) AND ((notes IS NULL) OR (length(notes) <= 5000)) AND ((hs_class IS NULL) OR ((hs_class >= 2020) AND (hs_class <= 2040))))),
    CONSTRAINT golf_recruits_status_check CHECK ((status = ANY (ARRAY['recruiting'::text, 'watched'::text, 'offered'::text, 'committed'::text])))
);


--
-- Name: golf_review_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_review_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    player_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_review_events_event_type_check CHECK ((event_type = ANY (ARRAY['review_generated'::text, 'review_regenerated'::text, 'coach_viewed'::text, 'coach_annotated'::text, 'coach_published'::text, 'player_viewed'::text, 'player_acknowledged'::text, 'focus_area_created'::text, 'focus_area_completed'::text, 'insight_feedback_given'::text])))
);


--
-- Name: TABLE golf_review_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_review_events IS 'Timeline of events related to reviews for history display';


--
-- Name: golf_round_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_round_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    player_id uuid NOT NULL,
    round_score integer,
    round_score_to_par integer,
    scoring_avg_before numeric(4,2),
    scoring_avg_after numeric(4,2),
    highlights jsonb DEFAULT '[]'::jsonb,
    areas_to_review jsonb DEFAULT '[]'::jsonb,
    round_stats jsonb,
    patterns_detected jsonb DEFAULT '[]'::jsonb,
    summary text,
    primary_takeaway text,
    next_practice_priority text,
    coach_notes text,
    coach_viewed_at timestamp with time zone,
    shared_with_coach boolean DEFAULT false,
    shared_at timestamp with time zone,
    engine_version text DEFAULT 'v2'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ai_model_version text,
    sentiment_score numeric(3,2),
    regeneration_count integer DEFAULT 0,
    last_regenerated_at timestamp with time zone,
    insights_count integer DEFAULT 0,
    highlights_count integer DEFAULT 0,
    areas_count integer DEFAULT 0,
    status text DEFAULT 'draft'::text,
    published_at timestamp with time zone,
    published_by uuid,
    coach_rating integer,
    coach_feedback_text text,
    player_viewed_at timestamp with time zone,
    player_acknowledged_at timestamp with time zone,
    action_items jsonb DEFAULT '[]'::jsonb,
    version integer DEFAULT 1,
    generation_method text DEFAULT 'v1'::text,
    shared_with_player boolean DEFAULT false,
    CONSTRAINT golf_round_reviews_coach_rating_check CHECK (((coach_rating >= 1) AND (coach_rating <= 5))),
    CONSTRAINT golf_round_reviews_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: COLUMN golf_round_reviews.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_round_reviews.status IS 'Review workflow status: draft (coach editing), published (visible to player), archived';


--
-- Name: golf_round_stats_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_round_stats_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    player_id uuid NOT NULL,
    total_score integer,
    score_to_par integer,
    front_nine integer,
    back_nine integer,
    strokes_gained_total numeric(5,2),
    strokes_gained_tee numeric(5,2),
    strokes_gained_approach numeric(5,2),
    strokes_gained_around_green numeric(5,2),
    strokes_gained_putting numeric(5,2),
    fairways_hit integer,
    fairways_total integer,
    driving_distance_avg numeric(6,1),
    greens_hit integer,
    greens_total integer,
    total_putts integer,
    one_putts integer,
    three_putts integer,
    scrambles_converted integer,
    scramble_attempts integer,
    sand_saves integer,
    sand_attempts integer,
    eagles integer DEFAULT 0,
    birdies integer DEFAULT 0,
    pars integer DEFAULT 0,
    bogeys integer DEFAULT 0,
    double_bogeys integer DEFAULT 0,
    triple_plus integer DEFAULT 0,
    penalty_strokes integer DEFAULT 0,
    detailed_stats jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_rounds (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    course_id uuid,
    course_name text,
    course_city text,
    course_state text,
    course_rating numeric,
    course_slope integer,
    tees_played text,
    round_date date NOT NULL,
    round_type text DEFAULT 'practice'::text,
    holes_played integer DEFAULT 18,
    total_score integer,
    front_nine integer,
    back_nine integer,
    score_to_par integer,
    status text DEFAULT 'in_progress'::text,
    current_hole integer DEFAULT 1,
    total_putts integer,
    total_fairways_hit integer,
    total_fairways integer,
    total_gir integer,
    total_gir_possible integer,
    weather_conditions text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    strokes_gained_total numeric(5,2),
    strokes_gained_tee numeric(5,2),
    strokes_gained_approach numeric(5,2),
    strokes_gained_around_green numeric(5,2),
    strokes_gained_putting numeric(5,2),
    qualifier_id uuid,
    qualifier_round_number integer,
    draft_data jsonb,
    total_penalties integer DEFAULT 0,
    ai_recap text,
    ai_recap_generated_at timestamp with time zone,
    coachhelm_analyzed_at timestamp with time zone,
    coachhelm_failed_at timestamp with time zone,
    coachhelm_failure_reason text
);


--
-- Name: COLUMN golf_rounds.draft_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_rounds.draft_data IS 'JSON blob storing full draft state for in-progress rounds (step, setupData, holes, completedHoleStats, etc.)';


--
-- Name: COLUMN golf_rounds.ai_recap; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_rounds.ai_recap IS 'Two-sentence editorial recap of the round, generated by Vercel AI Gateway / Claude when the round completes. Brand voice — magazine-style beat-reporter recap.';


--
-- Name: COLUMN golf_rounds.coachhelm_analyzed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_rounds.coachhelm_analyzed_at IS 'Timestamp when triggerPlayerInsightsAfterRound completed for this round. NULL = pending or never ran.';


--
-- Name: COLUMN golf_rounds.coachhelm_failed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_rounds.coachhelm_failed_at IS 'Timestamp when triggerPlayerInsightsAfterRound terminated with an error. Set alongside coachhelm_failure_reason.';


--
-- Name: COLUMN golf_rounds.coachhelm_failure_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_rounds.coachhelm_failure_reason IS 'Short error reason captured by postRoundTrigger on the failure path. Truncated to ~500 chars.';


--
-- Name: golf_shots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_shots (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    round_id uuid NOT NULL,
    hole_id uuid,
    hole_number integer NOT NULL,
    shot_number integer NOT NULL,
    shot_type text,
    distance_to_hole_before numeric,
    distance_to_hole_after numeric,
    distance_unit text DEFAULT 'yards'::text,
    shot_distance numeric,
    lie_before text,
    lie_after text,
    result text,
    is_penalty boolean DEFAULT false,
    penalty_type text,
    putt_made boolean,
    putt_distance_feet numeric,
    putt_break text,
    putt_slope text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    club_type text,
    distance_unit_before text DEFAULT 'yards'::text,
    distance_unit_after text DEFAULT 'yards'::text,
    miss_direction text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_shots_club_type_check CHECK (((club_type IS NULL) OR (club_type = ANY (ARRAY['driver'::text, 'non_driver'::text, 'putter'::text])))),
    CONSTRAINT golf_shots_distance_unit_after_check CHECK (((distance_unit_after IS NULL) OR (distance_unit_after = ANY (ARRAY['yards'::text, 'feet'::text])))),
    CONSTRAINT golf_shots_distance_unit_before_check CHECK (((distance_unit_before IS NULL) OR (distance_unit_before = ANY (ARRAY['yards'::text, 'feet'::text])))),
    CONSTRAINT golf_shots_lie_after_check CHECK (((lie_after IS NULL) OR (lie_after = ANY (ARRAY['tee'::text, 'fairway'::text, 'rough'::text, 'sand'::text, 'green'::text, 'other'::text, 'penalty'::text])))),
    CONSTRAINT golf_shots_lie_before_check CHECK (((lie_before IS NULL) OR (lie_before = ANY (ARRAY['tee'::text, 'fairway'::text, 'rough'::text, 'sand'::text, 'green'::text, 'other'::text, 'penalty'::text])))),
    CONSTRAINT golf_shots_putt_break_check CHECK (((putt_break IS NULL) OR (putt_break = ANY (ARRAY['left_to_right'::text, 'right_to_left'::text, 'straight'::text, 'multiple'::text])))),
    CONSTRAINT golf_shots_result_check CHECK (((result IS NULL) OR (result = ANY (ARRAY['fairway'::text, 'rough'::text, 'deep_rough'::text, 'sand'::text, 'green'::text, 'hole'::text, 'other'::text, 'penalty'::text, 'recovery'::text])))),
    CONSTRAINT golf_shots_shot_type_check CHECK (((shot_type IS NULL) OR (shot_type = ANY (ARRAY['tee'::text, 'approach'::text, 'around_green'::text, 'putting'::text, 'penalty'::text]))))
);


--
-- Name: TABLE golf_shots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_shots IS 'Golf shot data. Migration 065 fixed around_green shots that had incorrect lie_before=green values.';


--
-- Name: COLUMN golf_shots.distance_to_hole_before; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.distance_to_hole_before IS 'Distance from ball to hole before this shot. Units specified by distance_unit_before (yards or feet)';


--
-- Name: COLUMN golf_shots.distance_to_hole_after; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.distance_to_hole_after IS 'Distance from ball to hole after this shot. Units specified by distance_unit_after (yards or feet)';


--
-- Name: COLUMN golf_shots.shot_distance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.shot_distance IS 'Distance the ball traveled on this shot, in yards';


--
-- Name: COLUMN golf_shots.lie_after; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.lie_after IS 'Where the ball ended up (derived from result): tee, fairway, rough, sand, green, other';


--
-- Name: COLUMN golf_shots.is_penalty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.is_penalty IS 'Whether this shot was a penalty stroke';


--
-- Name: COLUMN golf_shots.penalty_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.penalty_type IS 'Type of penalty: ob, water, unplayable, lost';


--
-- Name: COLUMN golf_shots.putt_made; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.putt_made IS 'Whether the putt was holed (for putting shots only)';


--
-- Name: COLUMN golf_shots.putt_distance_feet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.putt_distance_feet IS 'Distance of putt in feet (for putting shots only)';


--
-- Name: COLUMN golf_shots.club_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.club_type IS 'driver | non_driver | putter - used for strokes gained benchmarks';


--
-- Name: COLUMN golf_shots.distance_unit_before; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.distance_unit_before IS 'yards | feet - unit for distance_to_hole_before';


--
-- Name: COLUMN golf_shots.distance_unit_after; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.distance_unit_after IS 'yards | feet - unit for distance_to_hole_after';


--
-- Name: COLUMN golf_shots.miss_direction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_shots.miss_direction IS 'left | right | short | long - for approach miss tracking';


--
-- Name: golf_task_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_task_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    completed_at timestamp with time zone,
    upload_url text,
    notes text,
    assigned_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_task_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_task_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    reminder_type public.reminder_type DEFAULT 'in_app'::public.reminder_type NOT NULL,
    sent boolean DEFAULT false NOT NULL,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE golf_task_reminders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_task_reminders IS 'Queue for scheduled task reminders processed by edge function';


--
-- Name: COLUMN golf_task_reminders.scheduled_for; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_task_reminders.scheduled_for IS 'When the reminder should be sent';


--
-- Name: COLUMN golf_task_reminders.reminder_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_task_reminders.reminder_type IS 'How to send: in_app, email, push, or all';


--
-- Name: COLUMN golf_task_reminders.sent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_task_reminders.sent IS 'Whether the reminder has been processed';


--
-- Name: COLUMN golf_task_reminders.sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_task_reminders.sent_at IS 'When the reminder was actually sent';


--
-- Name: COLUMN golf_task_reminders.error; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_task_reminders.error IS 'Error message if sending failed';


--
-- Name: golf_task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_task_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    default_assignee_type text DEFAULT 'all_players'::text,
    category text,
    default_priority text DEFAULT 'normal'::text,
    default_due_days integer,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE golf_task_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_task_templates IS 'Reusable task templates for quick task creation';


--
-- Name: COLUMN golf_task_templates.default_assignee_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_task_templates.default_assignee_type IS 'Who to assign by default: all_players, specific_role, coach, individual';


--
-- Name: COLUMN golf_task_templates.default_due_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_task_templates.default_due_days IS 'Number of days from task creation for the default due date';


--
-- Name: golf_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    assigned_by uuid,
    assigned_to uuid,
    title text NOT NULL,
    description text,
    task_type text,
    due_date date,
    status text DEFAULT 'pending'::text,
    completed_at timestamp with time zone,
    priority text DEFAULT 'medium'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reminder_at timestamp with time zone,
    reminder_type public.reminder_type,
    reminder_sent boolean DEFAULT false,
    category text
);


--
-- Name: COLUMN golf_tasks.reminder_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_tasks.reminder_at IS 'When to send a reminder notification for this task';


--
-- Name: COLUMN golf_tasks.reminder_sent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_tasks.reminder_sent IS 'Whether the reminder notification has been sent';


--
-- Name: COLUMN golf_tasks.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_tasks.category IS 'Task category for organization and filtering';


--
-- Name: golf_team_coach_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_team_coach_staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    role text DEFAULT 'head_coach'::text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_team_coachhelm_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_team_coachhelm_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    disabled_at timestamp with time zone,
    disabled_by uuid,
    disabled_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: golf_team_join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_team_join_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_team_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: TABLE golf_team_join_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_team_join_requests IS 'Tracks player requests to join golf teams, requiring coach approval';


--
-- Name: COLUMN golf_team_join_requests.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_team_join_requests.status IS 'Request status: pending (awaiting review), approved (player added to team), rejected (denied by coach)';


--
-- Name: COLUMN golf_team_join_requests.message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_team_join_requests.message IS 'Optional message from player explaining why they want to join';


--
-- Name: COLUMN golf_team_join_requests.rejection_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_team_join_requests.rejection_reason IS 'Optional explanation from coach when rejecting a request';


--
-- Name: golf_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_team_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status public.team_member_status DEFAULT 'pending'::public.team_member_status,
    jersey_number integer,
    joined_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_team_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_team_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    scoring_format text DEFAULT 'stroke_play'::text,
    handicap_system text DEFAULT 'usga'::text,
    default_tees text DEFAULT 'blue'::text,
    timezone text DEFAULT 'America/New_York'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_teams (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    join_code text NOT NULL,
    logo_url text,
    primary_color text,
    secondary_color text,
    description text,
    season text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    timezone text DEFAULT 'America/New_York'::text NOT NULL
);


--
-- Name: golf_tracer_health_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_tracer_health_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapped_at timestamp with time zone DEFAULT now(),
    health_score numeric(5,2),
    completion_pct numeric(5,2),
    quality_score numeric(5,2),
    error_count_7d integer DEFAULT 0,
    players_with_stale_cache integer DEFAULT 0,
    avg_round_quality_score numeric(5,2),
    stuck_rounds integer DEFAULT 0,
    total_rounds_tracked integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: golf_travel_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_travel_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid NOT NULL,
    category public.golf_expense_category NOT NULL,
    budgeted_amount numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_travel_budgets_budgeted_amount_check CHECK ((budgeted_amount >= (0)::numeric))
);


--
-- Name: TABLE golf_travel_budgets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_travel_budgets IS 'Budget allocations per category for travel itineraries';


--
-- Name: golf_travel_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_travel_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid,
    team_id uuid NOT NULL,
    category public.golf_expense_category DEFAULT 'other'::public.golf_expense_category NOT NULL,
    description text NOT NULL,
    amount numeric(10,2) NOT NULL,
    receipt_url text,
    paid_by public.golf_expense_paid_by DEFAULT 'team'::public.golf_expense_paid_by NOT NULL,
    vendor_name text,
    expense_date date,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_travel_expenses_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: TABLE golf_travel_expenses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.golf_travel_expenses IS 'Travel expenses for golf team trips';


--
-- Name: COLUMN golf_travel_expenses.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_travel_expenses.category IS 'Expense category: lodging, transportation, meals, entry_fees, equipment, other';


--
-- Name: COLUMN golf_travel_expenses.paid_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.golf_travel_expenses.paid_by IS 'Who paid: team, player, pending_reimbursement, split';


--
-- Name: golf_travel_itineraries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_travel_itineraries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    event_id uuid,
    event_name text,
    destination text,
    transportation_type text,
    departure_date date,
    departure_time time without time zone,
    departure_location text,
    return_date date,
    return_time time without time zone,
    flight_info jsonb,
    hotel_name text,
    hotel_address text,
    hotel_phone text,
    hotel_confirmation text,
    room_assignments jsonb,
    uniform_requirements text,
    gear_list text[],
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT golf_travel_itineraries_transportation_type_check CHECK ((transportation_type = ANY (ARRAY['bus'::text, 'van'::text, 'flight'::text, 'carpool'::text, 'other'::text])))
);


--
-- Name: golf_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_validations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prediction_id uuid,
    player_id uuid NOT NULL,
    stated_confidence numeric NOT NULL,
    actual_value numeric,
    predicted_value numeric NOT NULL,
    was_correct boolean,
    error_margin numeric,
    calibration_bucket text,
    validated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    failed_attempts integer DEFAULT 0,
    last_attempt timestamp with time zone DEFAULT now(),
    last_ip text,
    last_user_agent text,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb DEFAULT '{}'::jsonb,
    read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    action_url text
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    type public.organization_type NOT NULL,
    division text,
    conference text,
    location_city text,
    location_state text,
    logo_url text,
    banner_url text,
    website_url text,
    description text,
    primary_color text DEFAULT '#16A34A'::text,
    secondary_color text DEFAULT '#FFFFFF'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    expiration_time timestamp with time zone,
    keys jsonb NOT NULL,
    user_agent text,
    device_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_push_at timestamp with time zone,
    failed_count integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE push_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.push_subscriptions IS 'Stores Web Push notification subscriptions for users';


--
-- Name: COLUMN push_subscriptions.endpoint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscriptions.endpoint IS 'The push service endpoint URL unique to each browser/device';


--
-- Name: COLUMN push_subscriptions.expiration_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscriptions.expiration_time IS 'When the subscription expires (if set by browser)';


--
-- Name: COLUMN push_subscriptions.keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscriptions.keys IS 'JSON object containing p256dh and auth keys for encryption';


--
-- Name: COLUMN push_subscriptions.user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscriptions.user_agent IS 'Browser user agent string for debugging';


--
-- Name: COLUMN push_subscriptions.device_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscriptions.device_name IS 'Friendly name for the device (e.g., "Chrome on MacBook")';


--
-- Name: COLUMN push_subscriptions.last_push_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscriptions.last_push_at IS 'Timestamp of last successful push to this subscription';


--
-- Name: COLUMN push_subscriptions.failed_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscriptions.failed_count IS 'Number of consecutive failed push attempts';


--
-- Name: putt_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.putt_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shot_id uuid NOT NULL,
    miss_tags text[] DEFAULT '{}'::text[],
    break_direction text,
    estimated_break_inches integer,
    distance_feet numeric,
    made boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT putt_details_break_direction_check CHECK (((break_direction IS NULL) OR (break_direction = ANY (ARRAY['left_to_right'::text, 'right_to_left'::text, 'straight'::text, 'multiple'::text])))),
    CONSTRAINT putt_details_distance_feet_check CHECK (((distance_feet IS NULL) OR ((distance_feet >= (0)::numeric) AND (distance_feet <= (500)::numeric)))),
    CONSTRAINT putt_details_estimated_break_inches_check CHECK (((estimated_break_inches IS NULL) OR ((estimated_break_inches >= 0) AND (estimated_break_inches <= 120))))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    role public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    notification_preferences jsonb DEFAULT '{"push_events": true, "push_enabled": true, "push_messages": true, "email_messages": true, "digest_frequency": "daily", "email_announcements": true, "email_profile_views": false, "email_event_reminders": true, "email_pipeline_updates": true}'::jsonb,
    last_seen timestamp with time zone
);


--
-- Name: COLUMN users.notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.notification_preferences IS 'User notification preferences for email and push notifications. Fields: email_messages, email_pipeline_updates, email_event_reminders, email_profile_views, email_announcements, push_messages, push_events';


--
-- Name: admin_analytics_events admin_analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_analytics_events
    ADD CONSTRAINT admin_analytics_events_pkey PRIMARY KEY (id);


--
-- Name: admin_api_perf_log admin_api_perf_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_api_perf_log
    ADD CONSTRAINT admin_api_perf_log_pkey PRIMARY KEY (id);


--
-- Name: admin_client_errors admin_client_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_client_errors
    ADD CONSTRAINT admin_client_errors_pkey PRIMARY KEY (id);


--
-- Name: admin_events admin_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_events
    ADD CONSTRAINT admin_events_pkey PRIMARY KEY (id);


--
-- Name: api_call_logs api_call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_call_logs
    ADD CONSTRAINT api_call_logs_pkey PRIMARY KEY (id);


--
-- Name: approach_miss_details approach_miss_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approach_miss_details
    ADD CONSTRAINT approach_miss_details_pkey PRIMARY KEY (id);


--
-- Name: approach_miss_details approach_miss_details_shot_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approach_miss_details
    ADD CONSTRAINT approach_miss_details_shot_id_unique UNIQUE (shot_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: auth_metrics_hourly auth_metrics_hourly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_metrics_hourly
    ADD CONSTRAINT auth_metrics_hourly_pkey PRIMARY KEY (id);


--
-- Name: auth_rate_limits auth_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_rate_limits
    ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (key);


--
-- Name: background_job_logs background_job_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_job_logs
    ADD CONSTRAINT background_job_logs_pkey PRIMARY KEY (id);


--
-- Name: baseball_academic_eligibility baseball_academic_eligibility_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_academic_eligibility
    ADD CONSTRAINT baseball_academic_eligibility_pkey PRIMARY KEY (id);


--
-- Name: baseball_announcement_acknowledgements baseball_announcement_acknowledge_announcement_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_acknowledgements
    ADD CONSTRAINT baseball_announcement_acknowledge_announcement_id_player_id_key UNIQUE (announcement_id, player_id);


--
-- Name: baseball_announcement_acknowledgements baseball_announcement_acknowledgements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_acknowledgements
    ADD CONSTRAINT baseball_announcement_acknowledgements_pkey PRIMARY KEY (id);


--
-- Name: baseball_announcement_recipients baseball_announcement_recipients_announcement_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_recipients
    ADD CONSTRAINT baseball_announcement_recipients_announcement_id_player_id_key UNIQUE (announcement_id, player_id);


--
-- Name: baseball_announcement_recipients baseball_announcement_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_recipients
    ADD CONSTRAINT baseball_announcement_recipients_pkey PRIMARY KEY (id);


--
-- Name: baseball_announcements baseball_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcements
    ADD CONSTRAINT baseball_announcements_pkey PRIMARY KEY (id);


--
-- Name: baseball_box_score_batting baseball_box_score_batting_game_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_batting
    ADD CONSTRAINT baseball_box_score_batting_game_id_player_id_key UNIQUE (game_id, player_id);


--
-- Name: baseball_box_score_batting baseball_box_score_batting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_batting
    ADD CONSTRAINT baseball_box_score_batting_pkey PRIMARY KEY (id);


--
-- Name: baseball_box_score_pitching baseball_box_score_pitching_game_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_pitching
    ADD CONSTRAINT baseball_box_score_pitching_game_id_player_id_key UNIQUE (game_id, player_id);


--
-- Name: baseball_box_score_pitching baseball_box_score_pitching_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_pitching
    ADD CONSTRAINT baseball_box_score_pitching_pkey PRIMARY KEY (id);


--
-- Name: baseball_box_score_uploads baseball_box_score_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_uploads
    ADD CONSTRAINT baseball_box_score_uploads_pkey PRIMARY KEY (id);


--
-- Name: baseball_camp_registrations baseball_camp_registrations_camp_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_camp_registrations
    ADD CONSTRAINT baseball_camp_registrations_camp_id_player_id_key UNIQUE (camp_id, player_id);


--
-- Name: baseball_camp_registrations baseball_camp_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_camp_registrations
    ADD CONSTRAINT baseball_camp_registrations_pkey PRIMARY KEY (id);


--
-- Name: baseball_camps baseball_camps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_camps
    ADD CONSTRAINT baseball_camps_pkey PRIMARY KEY (id);


--
-- Name: baseball_coach_insights baseball_coach_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_insights
    ADD CONSTRAINT baseball_coach_insights_pkey PRIMARY KEY (id);


--
-- Name: baseball_coach_philosophy baseball_coach_philosophy_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_philosophy
    ADD CONSTRAINT baseball_coach_philosophy_coach_id_key UNIQUE (coach_id);


--
-- Name: baseball_coach_philosophy baseball_coach_philosophy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_philosophy
    ADD CONSTRAINT baseball_coach_philosophy_pkey PRIMARY KEY (id);


--
-- Name: baseball_coach_recruiting_philosophy baseball_coach_recruiting_philosophy_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_recruiting_philosophy
    ADD CONSTRAINT baseball_coach_recruiting_philosophy_coach_id_key UNIQUE (coach_id);


--
-- Name: baseball_coach_recruiting_philosophy baseball_coach_recruiting_philosophy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_recruiting_philosophy
    ADD CONSTRAINT baseball_coach_recruiting_philosophy_pkey PRIMARY KEY (id);


--
-- Name: baseball_coaches baseball_coaches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coaches
    ADD CONSTRAINT baseball_coaches_pkey PRIMARY KEY (id);


--
-- Name: baseball_coaches baseball_coaches_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coaches
    ADD CONSTRAINT baseball_coaches_user_id_key UNIQUE (user_id);


--
-- Name: baseball_conversation_participants baseball_conversation_participants_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_conversation_participants
    ADD CONSTRAINT baseball_conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: baseball_conversation_participants baseball_conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_conversation_participants
    ADD CONSTRAINT baseball_conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: baseball_conversations baseball_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_conversations
    ADD CONSTRAINT baseball_conversations_pkey PRIMARY KEY (id);


--
-- Name: baseball_developmental_plans baseball_developmental_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_developmental_plans
    ADD CONSTRAINT baseball_developmental_plans_pkey PRIMARY KEY (id);


--
-- Name: baseball_document_versions baseball_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_document_versions
    ADD CONSTRAINT baseball_document_versions_pkey PRIMARY KEY (id);


--
-- Name: baseball_documents baseball_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_documents
    ADD CONSTRAINT baseball_documents_pkey PRIMARY KEY (id);


--
-- Name: baseball_event_attendance baseball_event_attendance_event_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_event_attendance
    ADD CONSTRAINT baseball_event_attendance_event_id_player_id_key UNIQUE (event_id, player_id);


--
-- Name: baseball_event_attendance baseball_event_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_event_attendance
    ADD CONSTRAINT baseball_event_attendance_pkey PRIMARY KEY (id);


--
-- Name: baseball_events baseball_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_events
    ADD CONSTRAINT baseball_events_pkey PRIMARY KEY (id);


--
-- Name: baseball_games baseball_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_games
    ADD CONSTRAINT baseball_games_pkey PRIMARY KEY (id);


--
-- Name: baseball_lineup_positions baseball_lineup_positions_lineup_id_batting_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_lineup_positions
    ADD CONSTRAINT baseball_lineup_positions_lineup_id_batting_order_key UNIQUE (lineup_id, batting_order);


--
-- Name: baseball_lineup_positions baseball_lineup_positions_lineup_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_lineup_positions
    ADD CONSTRAINT baseball_lineup_positions_lineup_id_player_id_key UNIQUE (lineup_id, player_id);


--
-- Name: baseball_lineup_positions baseball_lineup_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_lineup_positions
    ADD CONSTRAINT baseball_lineup_positions_pkey PRIMARY KEY (id);


--
-- Name: baseball_messages baseball_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_messages
    ADD CONSTRAINT baseball_messages_pkey PRIMARY KEY (id);


--
-- Name: baseball_notifications baseball_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_notifications
    ADD CONSTRAINT baseball_notifications_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_aggregates baseball_player_aggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_aggregates
    ADD CONSTRAINT baseball_player_aggregates_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_aggregates baseball_player_aggregates_player_id_team_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_aggregates
    ADD CONSTRAINT baseball_player_aggregates_player_id_team_id_key UNIQUE (player_id, team_id);


--
-- Name: baseball_player_classes baseball_player_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_classes
    ADD CONSTRAINT baseball_player_classes_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_comparisons baseball_player_comparisons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_comparisons
    ADD CONSTRAINT baseball_player_comparisons_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_engagement_events baseball_player_engagement_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_engagement_events
    ADD CONSTRAINT baseball_player_engagement_events_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_percentiles baseball_player_percentiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_percentiles
    ADD CONSTRAINT baseball_player_percentiles_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_percentiles baseball_player_percentiles_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_percentiles
    ADD CONSTRAINT baseball_player_percentiles_player_id_key UNIQUE (player_id);


--
-- Name: baseball_player_season_stats baseball_player_season_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_season_stats
    ADD CONSTRAINT baseball_player_season_stats_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_season_stats baseball_player_season_stats_player_id_team_id_season_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_season_stats
    ADD CONSTRAINT baseball_player_season_stats_player_id_team_id_season_year_key UNIQUE (player_id, team_id, season_year);


--
-- Name: baseball_player_settings baseball_player_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_settings
    ADD CONSTRAINT baseball_player_settings_pkey PRIMARY KEY (id);


--
-- Name: baseball_player_settings baseball_player_settings_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_settings
    ADD CONSTRAINT baseball_player_settings_player_id_key UNIQUE (player_id);


--
-- Name: baseball_player_stats baseball_player_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_stats
    ADD CONSTRAINT baseball_player_stats_pkey PRIMARY KEY (id);


--
-- Name: baseball_players baseball_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_players
    ADD CONSTRAINT baseball_players_pkey PRIMARY KEY (id);


--
-- Name: baseball_players baseball_players_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_players
    ADD CONSTRAINT baseball_players_user_id_key UNIQUE (user_id);


--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_recruiting_interests
    ADD CONSTRAINT baseball_recruiting_interests_pkey PRIMARY KEY (id);


--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_player_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_recruiting_interests
    ADD CONSTRAINT baseball_recruiting_interests_player_id_organization_id_key UNIQUE (player_id, organization_id);


--
-- Name: baseball_stat_uploads baseball_stat_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_stat_uploads
    ADD CONSTRAINT baseball_stat_uploads_pkey PRIMARY KEY (id);


--
-- Name: baseball_task_assignments baseball_task_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_task_assignments
    ADD CONSTRAINT baseball_task_assignments_pkey PRIMARY KEY (id);


--
-- Name: baseball_task_assignments baseball_task_assignments_task_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_task_assignments
    ADD CONSTRAINT baseball_task_assignments_task_id_player_id_key UNIQUE (task_id, player_id);


--
-- Name: baseball_task_templates baseball_task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_task_templates
    ADD CONSTRAINT baseball_task_templates_pkey PRIMARY KEY (id);


--
-- Name: baseball_tasks baseball_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_tasks
    ADD CONSTRAINT baseball_tasks_pkey PRIMARY KEY (id);


--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_coach_staff
    ADD CONSTRAINT baseball_team_coach_staff_pkey PRIMARY KEY (id);


--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_team_id_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_coach_staff
    ADD CONSTRAINT baseball_team_coach_staff_team_id_coach_id_key UNIQUE (team_id, coach_id);


--
-- Name: baseball_team_invitations baseball_team_invitations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_invitations
    ADD CONSTRAINT baseball_team_invitations_code_key UNIQUE (code);


--
-- Name: baseball_team_invitations baseball_team_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_invitations
    ADD CONSTRAINT baseball_team_invitations_pkey PRIMARY KEY (id);


--
-- Name: baseball_team_lineups baseball_team_lineups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_lineups
    ADD CONSTRAINT baseball_team_lineups_pkey PRIMARY KEY (id);


--
-- Name: baseball_team_members baseball_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_members
    ADD CONSTRAINT baseball_team_members_pkey PRIMARY KEY (id);


--
-- Name: baseball_team_members baseball_team_members_team_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_members
    ADD CONSTRAINT baseball_team_members_team_id_player_id_key UNIQUE (team_id, player_id);


--
-- Name: baseball_teams baseball_teams_join_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_teams
    ADD CONSTRAINT baseball_teams_join_code_key UNIQUE (join_code);


--
-- Name: baseball_teams baseball_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_teams
    ADD CONSTRAINT baseball_teams_pkey PRIMARY KEY (id);


--
-- Name: baseball_travel_expenses baseball_travel_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_travel_expenses
    ADD CONSTRAINT baseball_travel_expenses_pkey PRIMARY KEY (id);


--
-- Name: baseball_travel_itineraries baseball_travel_itineraries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_travel_itineraries
    ADD CONSTRAINT baseball_travel_itineraries_pkey PRIMARY KEY (id);


--
-- Name: baseball_videos baseball_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_videos
    ADD CONSTRAINT baseball_videos_pkey PRIMARY KEY (id);


--
-- Name: baseball_watchlists baseball_watchlists_coach_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_watchlists
    ADD CONSTRAINT baseball_watchlists_coach_id_player_id_key UNIQUE (coach_id, player_id);


--
-- Name: baseball_watchlists baseball_watchlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_watchlists
    ADD CONSTRAINT baseball_watchlists_pkey PRIMARY KEY (id);


--
-- Name: crm_activity_log crm_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activity_log
    ADD CONSTRAINT crm_activity_log_pkey PRIMARY KEY (id);


--
-- Name: crm_automations crm_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automations
    ADD CONSTRAINT crm_automations_pkey PRIMARY KEY (id);


--
-- Name: crm_coaches crm_coaches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_coaches
    ADD CONSTRAINT crm_coaches_pkey PRIMARY KEY (id);


--
-- Name: crm_contact_log crm_contact_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contact_log
    ADD CONSTRAINT crm_contact_log_pkey PRIMARY KEY (id);


--
-- Name: email_events crm_email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT crm_email_events_pkey PRIMARY KEY (id);


--
-- Name: crm_email_suppressions crm_email_suppressions_email_reason_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_suppressions
    ADD CONSTRAINT crm_email_suppressions_email_reason_key UNIQUE (email, reason);


--
-- Name: crm_email_suppressions crm_email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_suppressions
    ADD CONSTRAINT crm_email_suppressions_pkey PRIMARY KEY (id);


--
-- Name: crm_email_templates crm_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_templates
    ADD CONSTRAINT crm_email_templates_pkey PRIMARY KEY (id);


--
-- Name: crm_events crm_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_pkey PRIMARY KEY (id);


--
-- Name: crm_google_calendar_tokens crm_google_calendar_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_google_calendar_tokens
    ADD CONSTRAINT crm_google_calendar_tokens_pkey PRIMARY KEY (id);


--
-- Name: crm_notes crm_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_notes
    ADD CONSTRAINT crm_notes_pkey PRIMARY KEY (id);


--
-- Name: crm_replies crm_replies_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_replies
    ADD CONSTRAINT crm_replies_message_id_key UNIQUE (message_id);


--
-- Name: crm_replies crm_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_replies
    ADD CONSTRAINT crm_replies_pkey PRIMARY KEY (id);


--
-- Name: crm_segments crm_segments_created_by_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments
    ADD CONSTRAINT crm_segments_created_by_name_key UNIQUE (created_by, name);


--
-- Name: crm_segments crm_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments
    ADD CONSTRAINT crm_segments_pkey PRIMARY KEY (id);


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_pkey PRIMARY KEY (id);


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_sequence_id_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_sequence_id_coach_id_key UNIQUE (sequence_id, coach_id);


--
-- Name: crm_sequence_steps crm_sequence_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_steps
    ADD CONSTRAINT crm_sequence_steps_pkey PRIMARY KEY (id);


--
-- Name: crm_sequence_steps crm_sequence_steps_sequence_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_steps
    ADD CONSTRAINT crm_sequence_steps_sequence_id_step_order_key UNIQUE (sequence_id, step_order);


--
-- Name: crm_sequences crm_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequences
    ADD CONSTRAINT crm_sequences_pkey PRIMARY KEY (id);


--
-- Name: crm_tasks crm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);


--
-- Name: demo_requests demo_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests
    ADD CONSTRAINT demo_requests_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_token_key UNIQUE (token);


--
-- Name: email_clicks email_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_clicks
    ADD CONSTRAINT email_clicks_pkey PRIMARY KEY (id);


--
-- Name: email_events email_events_dedup; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_dedup UNIQUE (resend_message_id, event_type, occurred_at);


--
-- Name: emails emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_pkey PRIMARY KEY (resend_message_id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: error_rate_hourly error_rate_hourly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_rate_hourly
    ADD CONSTRAINT error_rate_hourly_pkey PRIMARY KEY (id);


--
-- Name: golf_academic_exclusions golf_academic_exclusions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_academic_exclusions
    ADD CONSTRAINT golf_academic_exclusions_pkey PRIMARY KEY (id);


--
-- Name: golf_announcement_acknowledgements golf_announcement_acknowledgement_announcement_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_acknowledgements
    ADD CONSTRAINT golf_announcement_acknowledgement_announcement_id_player_id_key UNIQUE (announcement_id, player_id);


--
-- Name: golf_announcement_acknowledgements golf_announcement_acknowledgements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_acknowledgements
    ADD CONSTRAINT golf_announcement_acknowledgements_pkey PRIMARY KEY (id);


--
-- Name: golf_announcement_documents golf_announcement_documents_announcement_id_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_documents
    ADD CONSTRAINT golf_announcement_documents_announcement_id_document_id_key UNIQUE (announcement_id, document_id);


--
-- Name: golf_announcement_documents golf_announcement_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_documents
    ADD CONSTRAINT golf_announcement_documents_pkey PRIMARY KEY (id);


--
-- Name: golf_announcement_recipients golf_announcement_recipients_announcement_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_recipients
    ADD CONSTRAINT golf_announcement_recipients_announcement_id_player_id_key UNIQUE (announcement_id, player_id);


--
-- Name: golf_announcement_recipients golf_announcement_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_recipients
    ADD CONSTRAINT golf_announcement_recipients_pkey PRIMARY KEY (id);


--
-- Name: golf_announcement_tasks golf_announcement_tasks_announcement_id_task_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_tasks
    ADD CONSTRAINT golf_announcement_tasks_announcement_id_task_id_key UNIQUE (announcement_id, task_id);


--
-- Name: golf_announcement_tasks golf_announcement_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_tasks
    ADD CONSTRAINT golf_announcement_tasks_pkey PRIMARY KEY (id);


--
-- Name: golf_announcements golf_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcements
    ADD CONSTRAINT golf_announcements_pkey PRIMARY KEY (id);


--
-- Name: golf_attendance_summary golf_attendance_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_attendance_summary
    ADD CONSTRAINT golf_attendance_summary_pkey PRIMARY KEY (id);


--
-- Name: golf_attendance_summary golf_attendance_summary_player_id_team_id_period_start_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_attendance_summary
    ADD CONSTRAINT golf_attendance_summary_player_id_team_id_period_start_date_key UNIQUE (player_id, team_id, period_start_date, period_end_date);


--
-- Name: golf_calendar_feeds golf_calendar_feeds_feed_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_feeds
    ADD CONSTRAINT golf_calendar_feeds_feed_token_key UNIQUE (feed_token);


--
-- Name: golf_calendar_feeds golf_calendar_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_feeds
    ADD CONSTRAINT golf_calendar_feeds_pkey PRIMARY KEY (id);


--
-- Name: golf_calendar_notifications golf_calendar_notifications_event_id_user_id_notification_t_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_notifications
    ADD CONSTRAINT golf_calendar_notifications_event_id_user_id_notification_t_key UNIQUE (event_id, user_id, notification_type);


--
-- Name: golf_calendar_notifications golf_calendar_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_notifications
    ADD CONSTRAINT golf_calendar_notifications_pkey PRIMARY KEY (id);


--
-- Name: golf_causal_relationships golf_causal_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_causal_relationships
    ADD CONSTRAINT golf_causal_relationships_pkey PRIMARY KEY (id);


--
-- Name: golf_coach_behavior_log golf_coach_behavior_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_behavior_log
    ADD CONSTRAINT golf_coach_behavior_log_pkey PRIMARY KEY (id);


--
-- Name: golf_coach_blocked_time golf_coach_blocked_time_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_blocked_time
    ADD CONSTRAINT golf_coach_blocked_time_pkey PRIMARY KEY (id);


--
-- Name: golf_coach_insights golf_coach_insights_dedup_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_insights
    ADD CONSTRAINT golf_coach_insights_dedup_key UNIQUE NULLS NOT DISTINCT (signature, player_id, coach_id, team_id);


--
-- Name: golf_coach_insights golf_coach_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_insights
    ADD CONSTRAINT golf_coach_insights_pkey PRIMARY KEY (id);


--
-- Name: golf_coach_philosophy golf_coach_philosophy_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_philosophy
    ADD CONSTRAINT golf_coach_philosophy_coach_id_key UNIQUE (coach_id);


--
-- Name: golf_coach_philosophy golf_coach_philosophy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_philosophy
    ADD CONSTRAINT golf_coach_philosophy_pkey PRIMARY KEY (id);


--
-- Name: golf_coach_player_intent golf_coach_player_intent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_player_intent
    ADD CONSTRAINT golf_coach_player_intent_pkey PRIMARY KEY (coach_id, player_id);


--
-- Name: golf_coaches golf_coaches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coaches
    ADD CONSTRAINT golf_coaches_pkey PRIMARY KEY (id);


--
-- Name: golf_coaches golf_coaches_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coaches
    ADD CONSTRAINT golf_coaches_user_id_key UNIQUE (user_id);


--
-- Name: golf_coachhelm_chat_conversations golf_coachhelm_chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_chat_conversations
    ADD CONSTRAINT golf_coachhelm_chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: golf_coachhelm_chat_messages golf_coachhelm_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_chat_messages
    ADD CONSTRAINT golf_coachhelm_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: golf_coachhelm_coach_weights golf_coachhelm_coach_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_coach_weights
    ADD CONSTRAINT golf_coachhelm_coach_weights_pkey PRIMARY KEY (coach_id, insight_type, intent);


--
-- Name: golf_coachhelm_llm_budget golf_coachhelm_llm_budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_llm_budget
    ADD CONSTRAINT golf_coachhelm_llm_budget_pkey PRIMARY KEY (coach_id, date);


--
-- Name: golf_coachhelm_llm_calls golf_coachhelm_llm_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_llm_calls
    ADD CONSTRAINT golf_coachhelm_llm_calls_pkey PRIMARY KEY (id);


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_settings
    ADD CONSTRAINT golf_coachhelm_settings_coach_id_key UNIQUE (coach_id);


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_settings
    ADD CONSTRAINT golf_coachhelm_settings_pkey PRIMARY KEY (id);


--
-- Name: golf_confidence_calibration golf_confidence_calibration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_confidence_calibration
    ADD CONSTRAINT golf_confidence_calibration_pkey PRIMARY KEY (bucket, prediction_type);


--
-- Name: golf_conversation_participants golf_conversation_participants_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_conversation_participants
    ADD CONSTRAINT golf_conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: golf_conversation_participants golf_conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_conversation_participants
    ADD CONSTRAINT golf_conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: golf_conversations golf_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_conversations
    ADD CONSTRAINT golf_conversations_pkey PRIMARY KEY (id);


--
-- Name: golf_course_holes golf_course_holes_course_id_hole_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_course_holes
    ADD CONSTRAINT golf_course_holes_course_id_hole_number_key UNIQUE (course_id, hole_number);


--
-- Name: golf_course_holes golf_course_holes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_course_holes
    ADD CONSTRAINT golf_course_holes_pkey PRIMARY KEY (id);


--
-- Name: golf_courses golf_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_courses
    ADD CONSTRAINT golf_courses_pkey PRIMARY KEY (id);


--
-- Name: golf_document_versions golf_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_document_versions
    ADD CONSTRAINT golf_document_versions_pkey PRIMARY KEY (id);


--
-- Name: golf_documents golf_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_documents
    ADD CONSTRAINT golf_documents_pkey PRIMARY KEY (id);


--
-- Name: golf_drills golf_drills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_drills
    ADD CONSTRAINT golf_drills_pkey PRIMARY KEY (id);


--
-- Name: golf_drills golf_drills_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_drills
    ADD CONSTRAINT golf_drills_slug_key UNIQUE (slug);


--
-- Name: golf_event_attendance golf_event_attendance_event_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_attendance
    ADD CONSTRAINT golf_event_attendance_event_id_player_id_key UNIQUE (event_id, player_id);


--
-- Name: golf_event_attendance golf_event_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_attendance
    ADD CONSTRAINT golf_event_attendance_pkey PRIMARY KEY (id);


--
-- Name: golf_event_documents golf_event_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_documents
    ADD CONSTRAINT golf_event_documents_pkey PRIMARY KEY (event_id, document_id);


--
-- Name: golf_events golf_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_events
    ADD CONSTRAINT golf_events_pkey PRIMARY KEY (id);


--
-- Name: golf_global_patterns golf_global_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_global_patterns
    ADD CONSTRAINT golf_global_patterns_pkey PRIMARY KEY (id);


--
-- Name: golf_global_patterns golf_global_patterns_signature_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_global_patterns
    ADD CONSTRAINT golf_global_patterns_signature_unique UNIQUE (signature);


--
-- Name: golf_goal_suggestions golf_goal_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goal_suggestions
    ADD CONSTRAINT golf_goal_suggestions_pkey PRIMARY KEY (id);


--
-- Name: golf_goals golf_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goals
    ADD CONSTRAINT golf_goals_pkey PRIMARY KEY (id);


--
-- Name: golf_holes golf_holes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_holes
    ADD CONSTRAINT golf_holes_pkey PRIMARY KEY (id);


--
-- Name: golf_holes golf_holes_round_id_hole_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_holes
    ADD CONSTRAINT golf_holes_round_id_hole_number_key UNIQUE (round_id, hole_number);


--
-- Name: golf_ingest_connections golf_ingest_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_ingest_connections
    ADD CONSTRAINT golf_ingest_connections_pkey PRIMARY KEY (player_id, provider);


--
-- Name: golf_ingest_sync_log golf_ingest_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_ingest_sync_log
    ADD CONSTRAINT golf_ingest_sync_log_pkey PRIMARY KEY (id);


--
-- Name: golf_insight_drill_attachments golf_insight_drill_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_drill_attachments
    ADD CONSTRAINT golf_insight_drill_attachments_pkey PRIMARY KEY (insight_id, drill_id);


--
-- Name: golf_insight_effectiveness golf_insight_effectiveness_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_effectiveness
    ADD CONSTRAINT golf_insight_effectiveness_pkey PRIMARY KEY (id);


--
-- Name: golf_insight_generation_log golf_insight_generation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_generation_log
    ADD CONSTRAINT golf_insight_generation_log_pkey PRIMARY KEY (id);


--
-- Name: golf_insight_outcome_attribution golf_insight_outcome_attribution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_outcome_attribution
    ADD CONSTRAINT golf_insight_outcome_attribution_pkey PRIMARY KEY (insight_id);


--
-- Name: golf_insight_player_feedback golf_insight_player_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_player_feedback
    ADD CONSTRAINT golf_insight_player_feedback_pkey PRIMARY KEY (id);


--
-- Name: golf_insight_player_feedback golf_insight_player_feedback_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_player_feedback
    ADD CONSTRAINT golf_insight_player_feedback_unique UNIQUE (insight_id, player_id);


--
-- Name: golf_learned_behavior golf_learned_behavior_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_learned_behavior
    ADD CONSTRAINT golf_learned_behavior_pkey PRIMARY KEY (id);


--
-- Name: golf_message_attachments golf_message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_message_attachments
    ADD CONSTRAINT golf_message_attachments_pkey PRIMARY KEY (id);


--
-- Name: golf_messages golf_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_messages
    ADD CONSTRAINT golf_messages_pkey PRIMARY KEY (id);


--
-- Name: golf_metrics golf_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_metrics
    ADD CONSTRAINT golf_metrics_pkey PRIMARY KEY (metric_id);


--
-- Name: golf_patterns_v2 golf_patterns_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_patterns_v2
    ADD CONSTRAINT golf_patterns_v2_pkey PRIMARY KEY (id);


--
-- Name: golf_percentile_cache golf_percentile_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_percentile_cache
    ADD CONSTRAINT golf_percentile_cache_pkey PRIMARY KEY (id);


--
-- Name: golf_percentile_cache golf_percentile_cache_player_id_metric_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_percentile_cache
    ADD CONSTRAINT golf_percentile_cache_player_id_metric_name_key UNIQUE (player_id, metric_name);


--
-- Name: golf_pga_standards golf_pga_standards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_pga_standards
    ADD CONSTRAINT golf_pga_standards_pkey PRIMARY KEY (metric_id, season);


--
-- Name: golf_platform_metrics_daily golf_platform_metrics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_platform_metrics_daily
    ADD CONSTRAINT golf_platform_metrics_daily_pkey PRIMARY KEY (id);


--
-- Name: golf_platform_metrics_daily golf_platform_metrics_daily_snapshot_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_platform_metrics_daily
    ADD CONSTRAINT golf_platform_metrics_daily_snapshot_date_key UNIQUE (snapshot_date);


--
-- Name: golf_player_attendance_stats golf_player_attendance_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_attendance_stats
    ADD CONSTRAINT golf_player_attendance_stats_pkey PRIMARY KEY (id);


--
-- Name: golf_player_attendance_stats golf_player_attendance_stats_player_id_team_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_attendance_stats
    ADD CONSTRAINT golf_player_attendance_stats_player_id_team_id_period_start_key UNIQUE (player_id, team_id, period_start, period_end);


--
-- Name: golf_player_baselines golf_player_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_baselines
    ADD CONSTRAINT golf_player_baselines_pkey PRIMARY KEY (id);


--
-- Name: golf_player_baselines golf_player_baselines_player_id_metric_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_baselines
    ADD CONSTRAINT golf_player_baselines_player_id_metric_name_key UNIQUE (player_id, metric_name);


--
-- Name: golf_player_classes golf_player_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_classes
    ADD CONSTRAINT golf_player_classes_pkey PRIMARY KEY (id);


--
-- Name: golf_player_courses golf_player_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_courses
    ADD CONSTRAINT golf_player_courses_pkey PRIMARY KEY (id);


--
-- Name: golf_player_focus_areas golf_player_focus_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_focus_areas
    ADD CONSTRAINT golf_player_focus_areas_pkey PRIMARY KEY (id);


--
-- Name: golf_player_genome golf_player_genome_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_genome
    ADD CONSTRAINT golf_player_genome_pkey PRIMARY KEY (player_id);


--
-- Name: golf_player_notification_state golf_player_notification_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_notification_state
    ADD CONSTRAINT golf_player_notification_state_pkey PRIMARY KEY (id);


--
-- Name: golf_player_notification_state golf_player_notification_state_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_notification_state
    ADD CONSTRAINT golf_player_notification_state_player_id_key UNIQUE (player_id);


--
-- Name: golf_player_standing golf_player_standing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_standing
    ADD CONSTRAINT golf_player_standing_pkey PRIMARY KEY (player_id, metric_id);


--
-- Name: golf_player_stats_cache golf_player_stats_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_stats_cache
    ADD CONSTRAINT golf_player_stats_cache_pkey PRIMARY KEY (id);


--
-- Name: golf_player_stats_cache golf_player_stats_cache_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_stats_cache
    ADD CONSTRAINT golf_player_stats_cache_player_id_key UNIQUE (player_id);


--
-- Name: golf_players golf_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_players
    ADD CONSTRAINT golf_players_pkey PRIMARY KEY (id);


--
-- Name: golf_players golf_players_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_players
    ADD CONSTRAINT golf_players_user_id_key UNIQUE (user_id);


--
-- Name: golf_practice_sessions golf_practice_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_practice_sessions
    ADD CONSTRAINT golf_practice_sessions_pkey PRIMARY KEY (id);


--
-- Name: golf_prediction_model_performance golf_prediction_model_perform_team_id_model_type_period_sta_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_prediction_model_performance
    ADD CONSTRAINT golf_prediction_model_perform_team_id_model_type_period_sta_key UNIQUE (team_id, model_type, period_start, period_end);


--
-- Name: golf_prediction_model_performance golf_prediction_model_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_prediction_model_performance
    ADD CONSTRAINT golf_prediction_model_performance_pkey PRIMARY KEY (id);


--
-- Name: golf_prediction_validations golf_prediction_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_prediction_validations
    ADD CONSTRAINT golf_prediction_validations_pkey PRIMARY KEY (id);


--
-- Name: golf_predictions golf_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_predictions
    ADD CONSTRAINT golf_predictions_pkey PRIMARY KEY (id);


--
-- Name: golf_qualifier_entries golf_qualifier_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_entries
    ADD CONSTRAINT golf_qualifier_entries_pkey PRIMARY KEY (id);


--
-- Name: golf_qualifier_entries golf_qualifier_entries_qualifier_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_entries
    ADD CONSTRAINT golf_qualifier_entries_qualifier_id_player_id_key UNIQUE (qualifier_id, player_id);


--
-- Name: golf_qualifier_selections golf_qualifier_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_selections
    ADD CONSTRAINT golf_qualifier_selections_pkey PRIMARY KEY (qualifier_id, player_id);


--
-- Name: golf_qualifiers golf_qualifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifiers
    ADD CONSTRAINT golf_qualifiers_pkey PRIMARY KEY (id);


--
-- Name: golf_recruits golf_recruits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_recruits
    ADD CONSTRAINT golf_recruits_pkey PRIMARY KEY (id);


--
-- Name: golf_review_events golf_review_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_review_events
    ADD CONSTRAINT golf_review_events_pkey PRIMARY KEY (id);


--
-- Name: golf_round_reviews golf_round_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_reviews
    ADD CONSTRAINT golf_round_reviews_pkey PRIMARY KEY (id);


--
-- Name: golf_round_reviews golf_round_reviews_round_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_reviews
    ADD CONSTRAINT golf_round_reviews_round_id_key UNIQUE (round_id);


--
-- Name: golf_round_stats_cache golf_round_stats_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_stats_cache
    ADD CONSTRAINT golf_round_stats_cache_pkey PRIMARY KEY (id);


--
-- Name: golf_round_stats_cache golf_round_stats_cache_round_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_stats_cache
    ADD CONSTRAINT golf_round_stats_cache_round_id_key UNIQUE (round_id);


--
-- Name: golf_rounds golf_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_rounds
    ADD CONSTRAINT golf_rounds_pkey PRIMARY KEY (id);


--
-- Name: golf_shots golf_shots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_shots
    ADD CONSTRAINT golf_shots_pkey PRIMARY KEY (id);


--
-- Name: golf_task_assignments golf_task_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_assignments
    ADD CONSTRAINT golf_task_assignments_pkey PRIMARY KEY (id);


--
-- Name: golf_task_assignments golf_task_assignments_task_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_assignments
    ADD CONSTRAINT golf_task_assignments_task_id_player_id_key UNIQUE (task_id, player_id);


--
-- Name: golf_task_reminders golf_task_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_reminders
    ADD CONSTRAINT golf_task_reminders_pkey PRIMARY KEY (id);


--
-- Name: golf_task_templates golf_task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_templates
    ADD CONSTRAINT golf_task_templates_pkey PRIMARY KEY (id);


--
-- Name: golf_tasks golf_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_tasks
    ADD CONSTRAINT golf_tasks_pkey PRIMARY KEY (id);


--
-- Name: golf_team_coach_staff golf_team_coach_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coach_staff
    ADD CONSTRAINT golf_team_coach_staff_pkey PRIMARY KEY (id);


--
-- Name: golf_team_coach_staff golf_team_coach_staff_team_id_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coach_staff
    ADD CONSTRAINT golf_team_coach_staff_team_id_coach_id_key UNIQUE (team_id, coach_id);


--
-- Name: golf_team_coachhelm_settings golf_team_coachhelm_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coachhelm_settings
    ADD CONSTRAINT golf_team_coachhelm_settings_pkey PRIMARY KEY (id);


--
-- Name: golf_team_coachhelm_settings golf_team_coachhelm_settings_team_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coachhelm_settings
    ADD CONSTRAINT golf_team_coachhelm_settings_team_id_key UNIQUE (team_id);


--
-- Name: golf_team_join_requests golf_team_join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_join_requests
    ADD CONSTRAINT golf_team_join_requests_pkey PRIMARY KEY (id);


--
-- Name: golf_team_join_requests golf_team_join_requests_team_id_player_id_status_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_join_requests
    ADD CONSTRAINT golf_team_join_requests_team_id_player_id_status_key UNIQUE (team_id, player_id, status);


--
-- Name: golf_team_members golf_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_members
    ADD CONSTRAINT golf_team_members_pkey PRIMARY KEY (id);


--
-- Name: golf_team_members golf_team_members_team_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_members
    ADD CONSTRAINT golf_team_members_team_id_player_id_key UNIQUE (team_id, player_id);


--
-- Name: golf_team_settings golf_team_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_settings
    ADD CONSTRAINT golf_team_settings_pkey PRIMARY KEY (id);


--
-- Name: golf_team_settings golf_team_settings_team_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_settings
    ADD CONSTRAINT golf_team_settings_team_id_key UNIQUE (team_id);


--
-- Name: golf_teams golf_teams_join_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_teams
    ADD CONSTRAINT golf_teams_join_code_key UNIQUE (join_code);


--
-- Name: golf_teams golf_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_teams
    ADD CONSTRAINT golf_teams_pkey PRIMARY KEY (id);


--
-- Name: golf_tracer_health_snapshot golf_tracer_health_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_tracer_health_snapshot
    ADD CONSTRAINT golf_tracer_health_snapshot_pkey PRIMARY KEY (id);


--
-- Name: golf_travel_budgets golf_travel_budgets_itinerary_id_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_budgets
    ADD CONSTRAINT golf_travel_budgets_itinerary_id_category_key UNIQUE (itinerary_id, category);


--
-- Name: golf_travel_budgets golf_travel_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_budgets
    ADD CONSTRAINT golf_travel_budgets_pkey PRIMARY KEY (id);


--
-- Name: golf_travel_expenses golf_travel_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_expenses
    ADD CONSTRAINT golf_travel_expenses_pkey PRIMARY KEY (id);


--
-- Name: golf_travel_itineraries golf_travel_itineraries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_itineraries
    ADD CONSTRAINT golf_travel_itineraries_pkey PRIMARY KEY (id);


--
-- Name: golf_validations golf_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_validations
    ADD CONSTRAINT golf_validations_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: putt_details putt_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.putt_details
    ADD CONSTRAINT putt_details_pkey PRIMARY KEY (id);


--
-- Name: putt_details putt_details_shot_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.putt_details
    ADD CONSTRAINT putt_details_shot_id_unique UNIQUE (shot_id);


--
-- Name: baseball_document_versions unique_baseball_document_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_document_versions
    ADD CONSTRAINT unique_baseball_document_version UNIQUE (document_id, version_number);


--
-- Name: golf_document_versions unique_document_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_document_versions
    ADD CONSTRAINT unique_document_version UNIQUE (document_id, version_number);


--
-- Name: crm_google_calendar_tokens unique_user_calendar; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_google_calendar_tokens
    ADD CONSTRAINT unique_user_calendar UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: golf_coachhelm_chat_conversations_coach_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_coachhelm_chat_conversations_coach_idx ON public.golf_coachhelm_chat_conversations USING btree (coach_id, updated_at DESC);


--
-- Name: golf_coachhelm_chat_messages_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_coachhelm_chat_messages_conv_idx ON public.golf_coachhelm_chat_messages USING btree (conversation_id, created_at);


--
-- Name: golf_coachhelm_llm_budget_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_coachhelm_llm_budget_date_idx ON public.golf_coachhelm_llm_budget USING btree (date DESC);


--
-- Name: golf_coachhelm_llm_calls_coach_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_coachhelm_llm_calls_coach_task_idx ON public.golf_coachhelm_llm_calls USING btree (coach_id, task, created_at DESC);


--
-- Name: golf_coachhelm_llm_calls_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_coachhelm_llm_calls_created_idx ON public.golf_coachhelm_llm_calls USING btree (created_at DESC);


--
-- Name: golf_drills_impacts_metric_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_drills_impacts_metric_idx ON public.golf_drills USING btree (impacts_metric_id) WHERE (impacts_metric_id IS NOT NULL);


--
-- Name: golf_ingest_sync_log_player_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_ingest_sync_log_player_idx ON public.golf_ingest_sync_log USING btree (player_id, ran_at DESC);


--
-- Name: golf_insight_effectiveness_natural_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX golf_insight_effectiveness_natural_key ON public.golf_insight_effectiveness USING btree (team_id, insight_type, period_start, period_end);


--
-- Name: INDEX golf_insight_effectiveness_natural_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.golf_insight_effectiveness_natural_key IS 'Daily rollup natural key written by src/lib/coachhelm/v2/analytics/effectiveness-writer.ts';


--
-- Name: golf_insight_outcome_attribution_metric_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_insight_outcome_attribution_metric_idx ON public.golf_insight_outcome_attribution USING btree (target_metric_id, attributed_at DESC);


--
-- Name: golf_player_genome_computed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_player_genome_computed_idx ON public.golf_player_genome USING btree (computed_at DESC);


--
-- Name: golf_practice_sessions_player_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_practice_sessions_player_idx ON public.golf_practice_sessions USING btree (player_id, session_date DESC);


--
-- Name: golf_prediction_model_performance_natural_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX golf_prediction_model_performance_natural_key ON public.golf_prediction_model_performance USING btree (team_id, model_type, period_start, period_end);


--
-- Name: INDEX golf_prediction_model_performance_natural_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.golf_prediction_model_performance_natural_key IS 'Rolling 30d snapshot natural key written by src/lib/coachhelm/v2/analytics/prediction-performance-writer.ts';


--
-- Name: golf_predictions_natural_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX golf_predictions_natural_key ON public.golf_predictions USING btree (player_id, metric, due_date);


--
-- Name: INDEX golf_predictions_natural_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.golf_predictions_natural_key IS 'Natural key for upsert: one prediction per (player, metric, due_date). Non-partial so PostgREST onConflict can infer it.';


--
-- Name: golf_qualifier_selections_player_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_qualifier_selections_player_idx ON public.golf_qualifier_selections USING btree (player_id);


--
-- Name: golf_qualifiers_selection_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_qualifiers_selection_state_idx ON public.golf_qualifiers USING btree (team_id, selection_state) WHERE (selection_state = ANY (ARRAY['scoring'::text, 'closed'::text]));


--
-- Name: golf_rounds_pending_coachhelm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX golf_rounds_pending_coachhelm_idx ON public.golf_rounds USING btree (created_at) WHERE ((coachhelm_analyzed_at IS NULL) AND (coachhelm_failed_at IS NULL) AND (status = 'completed'::text));


--
-- Name: idx_admin_analytics_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_analytics_events_created ON public.admin_analytics_events USING btree (created_at DESC);


--
-- Name: idx_admin_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_created ON public.admin_events USING btree (created_at DESC);


--
-- Name: idx_admin_events_dashboard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_dashboard ON public.admin_events USING btree (event_type, severity, created_at DESC);


--
-- Name: idx_admin_events_errors_only; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_errors_only ON public.admin_events USING btree (created_at DESC) WHERE (event_type = 'error'::text);


--
-- Name: idx_admin_events_event_severity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_event_severity_created ON public.admin_events USING btree (event_type, severity, created_at DESC);


--
-- Name: idx_admin_events_resolved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_resolved_by ON public.admin_events USING btree (resolved_by) WHERE (resolved_by IS NOT NULL);


--
-- Name: idx_admin_events_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_severity ON public.admin_events USING btree (severity);


--
-- Name: idx_admin_events_severity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_severity_created ON public.admin_events USING btree (severity, created_at DESC);


--
-- Name: idx_admin_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_type ON public.admin_events USING btree (event_type);


--
-- Name: idx_admin_events_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_unresolved ON public.admin_events USING btree (resolved, severity, created_at DESC) WHERE (NOT resolved);


--
-- Name: idx_admin_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_user ON public.admin_events USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_analytics_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_events_created_at ON public.admin_analytics_events USING btree (created_at DESC);


--
-- Name: idx_analytics_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_events_event_type ON public.admin_analytics_events USING btree (event_type);


--
-- Name: idx_analytics_events_page_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_events_page_path ON public.admin_analytics_events USING btree (page_path);


--
-- Name: idx_analytics_events_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_events_session_id ON public.admin_analytics_events USING btree (session_id);


--
-- Name: idx_analytics_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_events_user_id ON public.admin_analytics_events USING btree (user_id);


--
-- Name: idx_api_call_logs_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_call_logs_recorded ON public.api_call_logs USING btree (recorded_at DESC);


--
-- Name: idx_api_perf_log_action_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_perf_log_action_name ON public.admin_api_perf_log USING btree (action_name);


--
-- Name: idx_api_perf_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_perf_log_created_at ON public.admin_api_perf_log USING btree (created_at DESC);


--
-- Name: idx_approach_miss_details_shot_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approach_miss_details_shot_id ON public.approach_miss_details USING btree (shot_id);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action);


--
-- Name: idx_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_log_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_table ON public.audit_log USING btree (table_name);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id);


--
-- Name: idx_auth_metrics_hour; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_metrics_hour ON public.auth_metrics_hourly USING btree (hour DESC);


--
-- Name: idx_auth_rate_limits_blocked_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_rate_limits_blocked_until ON public.auth_rate_limits USING btree (blocked_until) WHERE (blocked_until IS NOT NULL);


--
-- Name: idx_background_job_logs_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_background_job_logs_started_at ON public.background_job_logs USING btree (started_at DESC);


--
-- Name: idx_baseball_acad_elig_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_acad_elig_team ON public.baseball_academic_eligibility USING btree (team_id);


--
-- Name: idx_baseball_academic_eligibility_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_academic_eligibility_player ON public.baseball_academic_eligibility USING btree (player_id);


--
-- Name: idx_baseball_academic_eligibility_semester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_academic_eligibility_semester ON public.baseball_academic_eligibility USING btree (semester);


--
-- Name: idx_baseball_academic_eligibility_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_academic_eligibility_updated_by ON public.baseball_academic_eligibility USING btree (updated_by) WHERE (updated_by IS NOT NULL);


--
-- Name: idx_baseball_aggregates_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_aggregates_player_id ON public.baseball_player_aggregates USING btree (player_id);


--
-- Name: idx_baseball_aggregates_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_aggregates_team_id ON public.baseball_player_aggregates USING btree (team_id);


--
-- Name: idx_baseball_ann_acks_announcement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_ann_acks_announcement ON public.baseball_announcement_acknowledgements USING btree (announcement_id);


--
-- Name: idx_baseball_ann_acks_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_ann_acks_player ON public.baseball_announcement_acknowledgements USING btree (player_id);


--
-- Name: idx_baseball_ann_recipients_announcement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_ann_recipients_announcement ON public.baseball_announcement_recipients USING btree (announcement_id);


--
-- Name: idx_baseball_ann_recipients_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_ann_recipients_player ON public.baseball_announcement_recipients USING btree (player_id);


--
-- Name: idx_baseball_announcements_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_announcements_created_by ON public.baseball_announcements USING btree (created_by_id);


--
-- Name: idx_baseball_announcements_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_announcements_published ON public.baseball_announcements USING btree (published_at DESC);


--
-- Name: idx_baseball_announcements_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_announcements_team ON public.baseball_announcements USING btree (team_id);


--
-- Name: idx_baseball_bsb_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsb_game_id ON public.baseball_box_score_batting USING btree (game_id);


--
-- Name: idx_baseball_bsb_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsb_player_id ON public.baseball_box_score_batting USING btree (player_id);


--
-- Name: idx_baseball_bsb_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsb_team_id ON public.baseball_box_score_batting USING btree (team_id);


--
-- Name: idx_baseball_bsp_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsp_game_id ON public.baseball_box_score_pitching USING btree (game_id);


--
-- Name: idx_baseball_bsp_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsp_player_id ON public.baseball_box_score_pitching USING btree (player_id);


--
-- Name: idx_baseball_bsp_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsp_team_id ON public.baseball_box_score_pitching USING btree (team_id);


--
-- Name: idx_baseball_bsu_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsu_coach_id ON public.baseball_box_score_uploads USING btree (coach_id);


--
-- Name: idx_baseball_bsu_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsu_game_id ON public.baseball_box_score_uploads USING btree (game_id);


--
-- Name: idx_baseball_bsu_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_bsu_team_id ON public.baseball_box_score_uploads USING btree (team_id);


--
-- Name: idx_baseball_camp_regs_camp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_camp_regs_camp_id ON public.baseball_camp_registrations USING btree (camp_id);


--
-- Name: idx_baseball_camp_regs_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_camp_regs_player_id ON public.baseball_camp_registrations USING btree (player_id);


--
-- Name: idx_baseball_camps_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_camps_coach_id ON public.baseball_camps USING btree (coach_id);


--
-- Name: idx_baseball_camps_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_camps_org_id ON public.baseball_camps USING btree (organization_id);


--
-- Name: idx_baseball_coach_philosophy_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_coach_philosophy_coach_id ON public.baseball_coach_philosophy USING btree (coach_id);


--
-- Name: idx_baseball_coaches_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_coaches_org_id ON public.baseball_coaches USING btree (organization_id);


--
-- Name: idx_baseball_coaches_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_coaches_type ON public.baseball_coaches USING btree (coach_type);


--
-- Name: idx_baseball_coaches_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_coaches_user_id ON public.baseball_coaches USING btree (user_id);


--
-- Name: idx_baseball_comparisons_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_comparisons_coach_id ON public.baseball_player_comparisons USING btree (coach_id);


--
-- Name: idx_baseball_conv_participants_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_conv_participants_conv ON public.baseball_conversation_participants USING btree (conversation_id);


--
-- Name: idx_baseball_conv_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_conv_participants_user ON public.baseball_conversation_participants USING btree (user_id);


--
-- Name: idx_baseball_conversations_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_conversations_created ON public.baseball_conversations USING btree (created_at DESC);


--
-- Name: idx_baseball_conversations_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_conversations_created_by ON public.baseball_conversations USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_baseball_conversations_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_conversations_team ON public.baseball_conversations USING btree (team_id) WHERE (team_id IS NOT NULL);


--
-- Name: idx_baseball_conversations_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_conversations_team_id ON public.baseball_conversations USING btree (team_id);


--
-- Name: idx_baseball_dev_plans_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_dev_plans_coach_id ON public.baseball_developmental_plans USING btree (coach_id);


--
-- Name: idx_baseball_dev_plans_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_dev_plans_player_id ON public.baseball_developmental_plans USING btree (player_id);


--
-- Name: idx_baseball_dev_plans_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_dev_plans_team_id ON public.baseball_developmental_plans USING btree (team_id);


--
-- Name: idx_baseball_document_versions_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_document_versions_document ON public.baseball_document_versions USING btree (document_id);


--
-- Name: idx_baseball_document_versions_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_document_versions_uploaded_by ON public.baseball_document_versions USING btree (uploaded_by) WHERE (uploaded_by IS NOT NULL);


--
-- Name: idx_baseball_documents_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_documents_category ON public.baseball_documents USING btree (category);


--
-- Name: idx_baseball_documents_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_documents_team ON public.baseball_documents USING btree (team_id);


--
-- Name: idx_baseball_documents_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_documents_uploaded_by ON public.baseball_documents USING btree (uploaded_by) WHERE (uploaded_by IS NOT NULL);


--
-- Name: idx_baseball_documents_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_documents_visible ON public.baseball_documents USING btree (is_player_visible);


--
-- Name: idx_baseball_engagement_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_coach_id ON public.baseball_player_engagement_events USING btree (coach_id);


--
-- Name: idx_baseball_engagement_coach_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_coach_type_date ON public.baseball_player_engagement_events USING btree (coach_id, engagement_type, created_at DESC) WHERE (coach_id IS NOT NULL);


--
-- Name: idx_baseball_engagement_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_created ON public.baseball_player_engagement_events USING btree (created_at DESC);


--
-- Name: idx_baseball_engagement_events_coach_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_events_coach_type_date ON public.baseball_player_engagement_events USING btree (coach_id, engagement_type, engagement_date DESC);


--
-- Name: idx_baseball_engagement_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_events_date ON public.baseball_player_engagement_events USING btree (engagement_date DESC);


--
-- Name: idx_baseball_engagement_events_player_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_events_player_type_date ON public.baseball_player_engagement_events USING btree (player_id, engagement_type, engagement_date DESC);


--
-- Name: idx_baseball_engagement_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_player_id ON public.baseball_player_engagement_events USING btree (player_id);


--
-- Name: idx_baseball_engagement_player_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_player_type_date ON public.baseball_player_engagement_events USING btree (player_id, engagement_type, created_at DESC);


--
-- Name: idx_baseball_engagement_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_engagement_type ON public.baseball_player_engagement_events USING btree (engagement_type);


--
-- Name: idx_baseball_event_attendance_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_event_attendance_event ON public.baseball_event_attendance USING btree (event_id);


--
-- Name: idx_baseball_event_attendance_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_event_attendance_player ON public.baseball_event_attendance USING btree (player_id);


--
-- Name: idx_baseball_event_attendance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_event_attendance_status ON public.baseball_event_attendance USING btree (status);


--
-- Name: idx_baseball_events_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_events_created_by ON public.baseball_events USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_baseball_events_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_events_start ON public.baseball_events USING btree (start_time);


--
-- Name: idx_baseball_events_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_events_team_id ON public.baseball_events USING btree (team_id);


--
-- Name: idx_baseball_games_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_games_created_by ON public.baseball_games USING btree (created_by);


--
-- Name: idx_baseball_games_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_games_event_id ON public.baseball_games USING btree (event_id);


--
-- Name: idx_baseball_games_game_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_games_game_date ON public.baseball_games USING btree (game_date DESC);


--
-- Name: idx_baseball_games_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_games_status ON public.baseball_games USING btree (status);


--
-- Name: idx_baseball_games_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_games_team_id ON public.baseball_games USING btree (team_id);


--
-- Name: idx_baseball_insights_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_insights_coach_id ON public.baseball_coach_insights USING btree (coach_id);


--
-- Name: idx_baseball_insights_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_insights_player_id ON public.baseball_coach_insights USING btree (player_id);


--
-- Name: idx_baseball_insights_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_insights_status ON public.baseball_coach_insights USING btree (status);


--
-- Name: idx_baseball_insights_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_insights_team_id ON public.baseball_coach_insights USING btree (team_id);


--
-- Name: idx_baseball_lineup_positions_lineup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_lineup_positions_lineup ON public.baseball_lineup_positions USING btree (lineup_id);


--
-- Name: idx_baseball_messages_conv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_messages_conv_id ON public.baseball_messages USING btree (conversation_id);


--
-- Name: idx_baseball_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_messages_conversation ON public.baseball_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_baseball_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_messages_sender ON public.baseball_messages USING btree (sender_id);


--
-- Name: idx_baseball_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_messages_unread ON public.baseball_messages USING btree (conversation_id, read) WHERE (read = false);


--
-- Name: idx_baseball_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_notifications_user_unread ON public.baseball_notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: idx_baseball_player_classes_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_classes_player ON public.baseball_player_classes USING btree (player_id);


--
-- Name: idx_baseball_player_classes_semester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_classes_semester ON public.baseball_player_classes USING btree (semester);


--
-- Name: idx_baseball_player_classes_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_classes_team ON public.baseball_player_classes USING btree (team_id);


--
-- Name: idx_baseball_player_percentiles_grad_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_percentiles_grad_year ON public.baseball_player_percentiles USING btree (grad_year);


--
-- Name: idx_baseball_player_settings_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_settings_player_id ON public.baseball_player_settings USING btree (player_id);


--
-- Name: idx_baseball_player_stats_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_stats_coach_id ON public.baseball_player_stats USING btree (coach_id) WHERE (coach_id IS NOT NULL);


--
-- Name: idx_baseball_player_stats_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_stats_player ON public.baseball_player_stats USING btree (player_id);


--
-- Name: idx_baseball_player_stats_team_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_player_stats_team_date ON public.baseball_player_stats USING btree (team_id, session_date DESC);


--
-- Name: idx_baseball_players_grad_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_players_grad_year ON public.baseball_players USING btree (grad_year);


--
-- Name: idx_baseball_players_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_players_position ON public.baseball_players USING btree (primary_position);


--
-- Name: idx_baseball_players_recruiting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_players_recruiting ON public.baseball_players USING btree (recruiting_activated) WHERE (recruiting_activated = true);


--
-- Name: idx_baseball_players_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_players_state ON public.baseball_players USING btree (state);


--
-- Name: idx_baseball_players_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_players_type ON public.baseball_players USING btree (player_type);


--
-- Name: idx_baseball_players_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_players_user_id ON public.baseball_players USING btree (user_id);


--
-- Name: idx_baseball_pss_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_pss_player_id ON public.baseball_player_season_stats USING btree (player_id);


--
-- Name: idx_baseball_pss_season_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_pss_season_year ON public.baseball_player_season_stats USING btree (season_year);


--
-- Name: idx_baseball_pss_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_pss_team_id ON public.baseball_player_season_stats USING btree (team_id);


--
-- Name: idx_baseball_recruiting_interests_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_recruiting_interests_org_id ON public.baseball_recruiting_interests USING btree (organization_id);


--
-- Name: idx_baseball_recruiting_interests_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_recruiting_interests_player_id ON public.baseball_recruiting_interests USING btree (player_id);


--
-- Name: idx_baseball_recruiting_philosophy_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_recruiting_philosophy_coach ON public.baseball_coach_recruiting_philosophy USING btree (coach_id);


--
-- Name: idx_baseball_stat_uploads_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_stat_uploads_coach_id ON public.baseball_stat_uploads USING btree (coach_id);


--
-- Name: idx_baseball_stat_uploads_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_stat_uploads_team_id ON public.baseball_stat_uploads USING btree (team_id);


--
-- Name: idx_baseball_task_assignments_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_task_assignments_player ON public.baseball_task_assignments USING btree (player_id);


--
-- Name: idx_baseball_task_assignments_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_task_assignments_task ON public.baseball_task_assignments USING btree (task_id);


--
-- Name: idx_baseball_task_templates_created_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_task_templates_created_by_id ON public.baseball_task_templates USING btree (created_by_id) WHERE (created_by_id IS NOT NULL);


--
-- Name: idx_baseball_task_templates_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_task_templates_team ON public.baseball_task_templates USING btree (team_id);


--
-- Name: idx_baseball_tasks_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_tasks_created_by ON public.baseball_tasks USING btree (created_by_id);


--
-- Name: idx_baseball_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_tasks_due_date ON public.baseball_tasks USING btree (due_date);


--
-- Name: idx_baseball_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_tasks_status ON public.baseball_tasks USING btree (status);


--
-- Name: idx_baseball_tasks_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_tasks_team ON public.baseball_tasks USING btree (team_id);


--
-- Name: idx_baseball_team_coach_staff_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_coach_staff_coach_id ON public.baseball_team_coach_staff USING btree (coach_id);


--
-- Name: idx_baseball_team_coach_staff_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_coach_staff_team_id ON public.baseball_team_coach_staff USING btree (team_id);


--
-- Name: idx_baseball_team_invitations_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_invitations_code ON public.baseball_team_invitations USING btree (code);


--
-- Name: idx_baseball_team_invitations_created_by_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_invitations_created_by_coach_id ON public.baseball_team_invitations USING btree (created_by_coach_id) WHERE (created_by_coach_id IS NOT NULL);


--
-- Name: idx_baseball_team_invitations_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_invitations_team ON public.baseball_team_invitations USING btree (team_id);


--
-- Name: idx_baseball_team_lineups_created_by_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_lineups_created_by_coach_id ON public.baseball_team_lineups USING btree (created_by_coach_id) WHERE (created_by_coach_id IS NOT NULL);


--
-- Name: idx_baseball_team_lineups_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_lineups_team ON public.baseball_team_lineups USING btree (team_id);


--
-- Name: idx_baseball_team_members_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_members_approved_by ON public.baseball_team_members USING btree (approved_by) WHERE (approved_by IS NOT NULL);


--
-- Name: idx_baseball_team_members_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_members_player_id ON public.baseball_team_members USING btree (player_id);


--
-- Name: idx_baseball_team_members_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_members_status ON public.baseball_team_members USING btree (status);


--
-- Name: idx_baseball_team_members_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_team_members_team_id ON public.baseball_team_members USING btree (team_id);


--
-- Name: idx_baseball_teams_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_teams_created_by ON public.baseball_teams USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_baseball_teams_join_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_teams_join_code ON public.baseball_teams USING btree (join_code);


--
-- Name: idx_baseball_teams_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_teams_org_id ON public.baseball_teams USING btree (organization_id);


--
-- Name: idx_baseball_teams_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_teams_type ON public.baseball_teams USING btree (team_type);


--
-- Name: idx_baseball_travel_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_travel_expenses_category ON public.baseball_travel_expenses USING btree (category);


--
-- Name: idx_baseball_travel_expenses_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_travel_expenses_created_by ON public.baseball_travel_expenses USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_baseball_travel_expenses_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_travel_expenses_itinerary ON public.baseball_travel_expenses USING btree (itinerary_id);


--
-- Name: idx_baseball_travel_expenses_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_travel_expenses_team ON public.baseball_travel_expenses USING btree (team_id);


--
-- Name: idx_baseball_travel_itineraries_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_travel_itineraries_created_by ON public.baseball_travel_itineraries USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_baseball_travel_itineraries_departure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_travel_itineraries_departure ON public.baseball_travel_itineraries USING btree (departure_date);


--
-- Name: idx_baseball_travel_itineraries_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_travel_itineraries_team ON public.baseball_travel_itineraries USING btree (team_id);


--
-- Name: idx_baseball_videos_parent_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_videos_parent_video_id ON public.baseball_videos USING btree (parent_video_id) WHERE (parent_video_id IS NOT NULL);


--
-- Name: idx_baseball_videos_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_videos_player_id ON public.baseball_videos USING btree (player_id);


--
-- Name: idx_baseball_videos_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_videos_primary ON public.baseball_videos USING btree (player_id) WHERE (is_primary = true);


--
-- Name: idx_baseball_videos_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_videos_team_id ON public.baseball_videos USING btree (team_id);


--
-- Name: idx_baseball_watchlists_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_watchlists_coach_id ON public.baseball_watchlists USING btree (coach_id);


--
-- Name: idx_baseball_watchlists_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_watchlists_player_id ON public.baseball_watchlists USING btree (player_id);


--
-- Name: idx_baseball_watchlists_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baseball_watchlists_stage ON public.baseball_watchlists USING btree (pipeline_stage);


--
-- Name: idx_bg_jobs_type_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_type_started ON public.background_job_logs USING btree (job_type, started_at DESC);


--
-- Name: idx_client_errors_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_errors_created_at ON public.admin_client_errors USING btree (created_at DESC);


--
-- Name: idx_coach_insights_engine_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coach_insights_engine_version ON public.golf_coach_insights USING btree (engine_version, created_at DESC);


--
-- Name: idx_coach_player_intent_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coach_player_intent_coach ON public.golf_coach_player_intent USING btree (coach_id);


--
-- Name: idx_crm_activity_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activity_log_action ON public.crm_activity_log USING btree (action);


--
-- Name: idx_crm_activity_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activity_log_created ON public.crm_activity_log USING btree (created_at DESC);


--
-- Name: idx_crm_activity_log_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activity_log_record ON public.crm_activity_log USING btree (record_id);


--
-- Name: idx_crm_automations_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_automations_event ON public.crm_automations USING btree (trigger_event, is_active, priority);


--
-- Name: idx_crm_coach_engagement_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_coach_engagement_pk ON public.crm_coach_engagement USING btree (coach_id);


--
-- Name: idx_crm_coach_engagement_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coach_engagement_score ON public.crm_coach_engagement USING btree (score DESC);


--
-- Name: idx_crm_coaches_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_archived ON public.crm_coaches USING btree (is_archived) WHERE (is_archived = true);


--
-- Name: idx_crm_coaches_conference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_conference ON public.crm_coaches USING btree (conference);


--
-- Name: idx_crm_coaches_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_created_at ON public.crm_coaches USING btree (created_at);


--
-- Name: idx_crm_coaches_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_created_by ON public.crm_coaches USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_crm_coaches_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_division ON public.crm_coaches USING btree (division);


--
-- Name: idx_crm_coaches_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_email ON public.crm_coaches USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_crm_coaches_last_email_event_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_last_email_event_at ON public.crm_coaches USING btree (last_email_event_at DESC) WHERE (last_email_event_at IS NOT NULL);


--
-- Name: idx_crm_coaches_list_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_list_sort ON public.crm_coaches USING btree (is_starred DESC, priority DESC, updated_at DESC);


--
-- Name: idx_crm_coaches_next_follow_up; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_next_follow_up ON public.crm_coaches USING btree (next_follow_up_at) WHERE (next_follow_up_at IS NOT NULL);


--
-- Name: idx_crm_coaches_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_coaches_school ON public.crm_coaches USING btree (school);


--
-- Name: idx_crm_contact_log_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contact_log_coach ON public.crm_contact_log USING btree (coach_id);


--
-- Name: idx_crm_contact_log_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contact_log_created_by ON public.crm_contact_log USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_crm_contact_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contact_log_date ON public.crm_contact_log USING btree (contact_date DESC);


--
-- Name: idx_crm_contact_log_resend_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contact_log_resend_msg ON public.crm_contact_log USING btree (resend_message_id) WHERE (resend_message_id IS NOT NULL);


--
-- Name: idx_crm_contact_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contact_log_type ON public.crm_contact_log USING btree (contact_type);


--
-- Name: idx_crm_email_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_email_events_created_at ON public.email_events USING btree (created_at);


--
-- Name: idx_crm_events_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_events_coach_id ON public.crm_events USING btree (coach_id) WHERE (coach_id IS NOT NULL);


--
-- Name: idx_crm_events_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_events_created_by ON public.crm_events USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_crm_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_events_event_type ON public.crm_events USING btree (event_type);


--
-- Name: idx_crm_events_google_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_events_google_event_id ON public.crm_events USING btree (google_event_id) WHERE (google_event_id IS NOT NULL);


--
-- Name: idx_crm_events_parent_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_events_parent_event_id ON public.crm_events USING btree (parent_event_id) WHERE (parent_event_id IS NOT NULL);


--
-- Name: idx_crm_events_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_events_start_time ON public.crm_events USING btree (start_time);


--
-- Name: idx_crm_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_events_status ON public.crm_events USING btree (status);


--
-- Name: idx_crm_google_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_google_tokens_user ON public.crm_google_calendar_tokens USING btree (user_id);


--
-- Name: idx_crm_notes_coach_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_notes_coach_created ON public.crm_notes USING btree (coach_id, created_at DESC);


--
-- Name: idx_crm_replies_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_replies_coach ON public.crm_replies USING btree (coach_id, received_at DESC) WHERE (coach_id IS NOT NULL);


--
-- Name: idx_crm_replies_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_replies_thread ON public.crm_replies USING btree (thread_id, received_at DESC) WHERE (thread_id IS NOT NULL);


--
-- Name: idx_crm_replies_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_replies_unread ON public.crm_replies USING btree (received_at DESC) WHERE (is_read = false);


--
-- Name: idx_crm_segments_pin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_segments_pin ON public.crm_segments USING btree (pin_order) WHERE (pin_order IS NOT NULL);


--
-- Name: idx_crm_sequence_steps_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_sequence_steps_sequence ON public.crm_sequence_steps USING btree (sequence_id, step_order);


--
-- Name: idx_crm_tasks_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_assignee ON public.crm_tasks USING btree (assignee_id, status, due_at) WHERE (status = ANY (ARRAY['pending'::text, 'in_progress'::text]));


--
-- Name: idx_crm_tasks_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_coach ON public.crm_tasks USING btree (coach_id, status, due_at);


--
-- Name: idx_crm_tasks_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_due ON public.crm_tasks USING btree (due_at) WHERE ((status = ANY (ARRAY['pending'::text, 'in_progress'::text])) AND (due_at IS NOT NULL));


--
-- Name: idx_demo_requests_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_requests_created ON public.demo_requests USING btree (created_at DESC);


--
-- Name: idx_demo_requests_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_requests_email ON public.demo_requests USING btree (email);


--
-- Name: idx_demo_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_requests_status ON public.demo_requests USING btree (status);


--
-- Name: idx_device_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_tokens_active ON public.device_tokens USING btree (active) WHERE (active = true);


--
-- Name: idx_device_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_tokens_user_id ON public.device_tokens USING btree (user_id);


--
-- Name: idx_drill_attachments_insight; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drill_attachments_insight ON public.golf_insight_drill_attachments USING btree (insight_id, rank);


--
-- Name: idx_drills_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drills_category ON public.golf_drills USING btree (category);


--
-- Name: idx_drills_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drills_tags ON public.golf_drills USING gin (tags);


--
-- Name: idx_email_clicks_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_clicks_occurred_at ON public.email_clicks USING btree (occurred_at DESC);


--
-- Name: idx_email_clicks_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_clicks_recipient ON public.email_clicks USING btree (recipient_email);


--
-- Name: idx_email_clicks_resend_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_clicks_resend_msg ON public.email_clicks USING btree (resend_message_id);


--
-- Name: idx_email_events_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_contact ON public.email_events USING btree (contact_log_id);


--
-- Name: idx_email_events_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_msg ON public.email_events USING btree (resend_message_id);


--
-- Name: idx_email_events_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_occurred_at ON public.email_events USING btree (occurred_at DESC);


--
-- Name: idx_email_events_occurred_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_occurred_at_desc ON public.email_events USING btree (occurred_at DESC);


--
-- Name: idx_email_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_type ON public.email_events USING btree (event_type);


--
-- Name: idx_email_events_type_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_type_occurred ON public.email_events USING btree (event_type, occurred_at DESC);


--
-- Name: idx_emails_contact_log; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_contact_log ON public.emails USING btree (contact_log_id) WHERE (contact_log_id IS NOT NULL);


--
-- Name: idx_emails_first_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_first_seen_at ON public.emails USING btree (first_seen_at DESC) WHERE (first_seen_at IS NOT NULL);


--
-- Name: idx_emails_last_event_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_last_event_at ON public.emails USING btree (last_event_at DESC);


--
-- Name: idx_emails_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_sent_at ON public.emails USING btree (sent_at DESC) WHERE (sent_at IS NOT NULL);


--
-- Name: idx_emails_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_source ON public.emails USING btree (source);


--
-- Name: idx_emails_subject_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_subject_trgm ON public.emails USING gin (subject public.gin_trgm_ops);


--
-- Name: idx_emails_to_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_to_gin ON public.emails USING gin (to_addresses);


--
-- Name: idx_error_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created ON public.error_logs USING btree (created_at DESC);


--
-- Name: idx_error_logs_created_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created_severity ON public.error_logs USING btree (created_at DESC, severity);


--
-- Name: idx_error_logs_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_severity ON public.error_logs USING btree (severity);


--
-- Name: idx_error_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_user ON public.error_logs USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_error_rate_hour; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_rate_hour ON public.error_rate_hourly USING btree (hour DESC);


--
-- Name: idx_goal_suggestions_due_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_suggestions_due_expiry ON public.golf_goal_suggestions USING btree (expires_at) WHERE (state = ANY (ARRAY['pending'::text, 'snoozed'::text]));


--
-- Name: idx_goal_suggestions_player_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_suggestions_player_pending ON public.golf_goal_suggestions USING btree (player_id, expires_at) WHERE (state = 'pending'::text);


--
-- Name: idx_goals_due_evaluation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goals_due_evaluation ON public.golf_goals USING btree (ends_at) WHERE (state = 'active'::text);


--
-- Name: idx_goals_player_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goals_player_active ON public.golf_goals USING btree (player_id, state) WHERE (state = 'active'::text);


--
-- Name: idx_goals_team_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goals_team_active ON public.golf_goals USING btree (team_id, state) WHERE (state = 'active'::text);


--
-- Name: idx_golf_academic_exclusions_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_academic_exclusions_dates ON public.golf_academic_exclusions USING btree (start_date, end_date);


--
-- Name: idx_golf_academic_exclusions_excluded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_academic_exclusions_excluded_by ON public.golf_academic_exclusions USING btree (excluded_by) WHERE (excluded_by IS NOT NULL);


--
-- Name: idx_golf_academic_exclusions_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_academic_exclusions_player ON public.golf_academic_exclusions USING btree (player_id);


--
-- Name: idx_golf_acknowledgements_announcement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_acknowledgements_announcement ON public.golf_announcement_acknowledgements USING btree (announcement_id);


--
-- Name: idx_golf_acknowledgements_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_acknowledgements_player ON public.golf_announcement_acknowledgements USING btree (player_id);


--
-- Name: idx_golf_ann_documents_announcement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_ann_documents_announcement ON public.golf_announcement_documents USING btree (announcement_id);


--
-- Name: idx_golf_ann_documents_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_ann_documents_document ON public.golf_announcement_documents USING btree (document_id);


--
-- Name: idx_golf_ann_recipients_announcement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_ann_recipients_announcement ON public.golf_announcement_recipients USING btree (announcement_id);


--
-- Name: idx_golf_ann_recipients_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_ann_recipients_player ON public.golf_announcement_recipients USING btree (player_id);


--
-- Name: idx_golf_ann_tasks_announcement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_ann_tasks_announcement ON public.golf_announcement_tasks USING btree (announcement_id);


--
-- Name: idx_golf_ann_tasks_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_ann_tasks_task ON public.golf_announcement_tasks USING btree (task_id);


--
-- Name: idx_golf_announcements_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_announcements_created_by ON public.golf_announcements USING btree (created_by);


--
-- Name: idx_golf_announcements_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_announcements_published ON public.golf_announcements USING btree (published_at DESC);


--
-- Name: idx_golf_announcements_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_announcements_team ON public.golf_announcements USING btree (team_id);


--
-- Name: idx_golf_attendance_summary_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_attendance_summary_player ON public.golf_attendance_summary USING btree (player_id);


--
-- Name: idx_golf_attendance_summary_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_attendance_summary_team ON public.golf_attendance_summary USING btree (team_id);


--
-- Name: idx_golf_calendar_feeds_active_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_feeds_active_token ON public.golf_calendar_feeds USING btree (feed_token) WHERE (is_active = true);


--
-- Name: idx_golf_calendar_feeds_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_feeds_player_id ON public.golf_calendar_feeds USING btree (player_id) WHERE (player_id IS NOT NULL);


--
-- Name: idx_golf_calendar_feeds_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_feeds_team_id ON public.golf_calendar_feeds USING btree (team_id) WHERE (team_id IS NOT NULL);


--
-- Name: idx_golf_calendar_feeds_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_feeds_token ON public.golf_calendar_feeds USING btree (feed_token);


--
-- Name: idx_golf_calendar_feeds_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_feeds_user ON public.golf_calendar_feeds USING btree (user_id);


--
-- Name: idx_golf_calendar_notifications_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_notifications_event ON public.golf_calendar_notifications USING btree (event_id);


--
-- Name: idx_golf_calendar_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_notifications_user ON public.golf_calendar_notifications USING btree (user_id);


--
-- Name: idx_golf_calendar_notifications_user_unread_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_calendar_notifications_user_unread_type ON public.golf_calendar_notifications USING btree (user_id, notification_type) WHERE (read_at IS NULL);


--
-- Name: idx_golf_causal_relationships_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_causal_relationships_player ON public.golf_causal_relationships USING btree (player_id);


--
-- Name: idx_golf_causal_relationships_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_causal_relationships_team ON public.golf_causal_relationships USING btree (team_id) WHERE (team_id IS NOT NULL);


--
-- Name: idx_golf_classes_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_classes_player_id ON public.golf_player_classes USING btree (player_id);


--
-- Name: idx_golf_coach_blocked_time_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coach_blocked_time_coach ON public.golf_coach_blocked_time USING btree (coach_id);


--
-- Name: idx_golf_coach_insights_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coach_insights_coach ON public.golf_coach_insights USING btree (coach_id);


--
-- Name: idx_golf_coach_insights_coach_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coach_insights_coach_created ON public.golf_coach_insights USING btree (coach_id, created_at DESC) WHERE (coach_id IS NOT NULL);


--
-- Name: idx_golf_coach_insights_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coach_insights_player ON public.golf_coach_insights USING btree (player_id);


--
-- Name: idx_golf_coach_insights_player_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coach_insights_player_created ON public.golf_coach_insights USING btree (player_id, created_at DESC);


--
-- Name: idx_golf_coach_insights_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coach_insights_status ON public.golf_coach_insights USING btree (status) WHERE (status = 'active'::text);


--
-- Name: idx_golf_coach_insights_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coach_insights_team_id ON public.golf_coach_insights USING btree (team_id);


--
-- Name: idx_golf_coaches_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coaches_org_id ON public.golf_coaches USING btree (organization_id);


--
-- Name: idx_golf_coaches_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coaches_user_id ON public.golf_coaches USING btree (user_id);


--
-- Name: idx_golf_coachhelm_settings_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coachhelm_settings_coach_id ON public.golf_coachhelm_settings USING btree (coach_id);


--
-- Name: idx_golf_coachhelm_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_coachhelm_settings_user_id ON public.golf_coachhelm_settings USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_golf_conv_participants_conv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_conv_participants_conv_id ON public.golf_conversation_participants USING btree (conversation_id);


--
-- Name: idx_golf_conv_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_conv_participants_user_id ON public.golf_conversation_participants USING btree (user_id);


--
-- Name: idx_golf_conversations_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_conversations_created_by ON public.golf_conversations USING btree (created_by);


--
-- Name: idx_golf_conversations_team_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_conversations_team_channel ON public.golf_conversations USING btree (team_id, is_team_channel) WHERE (is_team_channel = true);


--
-- Name: idx_golf_conversations_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_conversations_team_id ON public.golf_conversations USING btree (team_id);


--
-- Name: idx_golf_conversations_team_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_conversations_team_updated ON public.golf_conversations USING btree (team_id, updated_at DESC);


--
-- Name: idx_golf_course_holes_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_course_holes_course ON public.golf_course_holes USING btree (course_id);


--
-- Name: idx_golf_courses_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_courses_name ON public.golf_courses USING btree (name);


--
-- Name: idx_golf_courses_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_courses_state ON public.golf_courses USING btree (state);


--
-- Name: idx_golf_document_versions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_document_versions_created ON public.golf_document_versions USING btree (created_at DESC);


--
-- Name: idx_golf_document_versions_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_document_versions_document ON public.golf_document_versions USING btree (document_id);


--
-- Name: idx_golf_documents_current_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_documents_current_version ON public.golf_documents USING btree (current_version_id);


--
-- Name: idx_golf_documents_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_documents_folder ON public.golf_documents USING btree (folder);


--
-- Name: idx_golf_documents_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_documents_team_id ON public.golf_documents USING btree (team_id);


--
-- Name: idx_golf_documents_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_documents_uploaded_by ON public.golf_documents USING btree (uploaded_by);


--
-- Name: idx_golf_event_attendance_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_event_attendance_event_id ON public.golf_event_attendance USING btree (event_id);


--
-- Name: idx_golf_event_attendance_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_event_attendance_event_status ON public.golf_event_attendance USING btree (event_id, status);


--
-- Name: INDEX idx_golf_event_attendance_event_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_event_attendance_event_status IS 'Optimizes RSVP count aggregation per event with status filtering';


--
-- Name: idx_golf_event_attendance_player_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_event_attendance_player_event ON public.golf_event_attendance USING btree (player_id, event_id);


--
-- Name: INDEX idx_golf_event_attendance_player_event; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_event_attendance_player_event IS 'Optimizes player-specific RSVP lookup across multiple events';


--
-- Name: idx_golf_event_attendance_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_event_attendance_player_id ON public.golf_event_attendance USING btree (player_id);


--
-- Name: idx_golf_event_documents_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_event_documents_document_id ON public.golf_event_documents USING btree (document_id);


--
-- Name: idx_golf_event_documents_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_event_documents_event_id ON public.golf_event_documents USING btree (event_id);


--
-- Name: idx_golf_events_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_course_id ON public.golf_events USING btree (course_id);


--
-- Name: idx_golf_events_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_created_by ON public.golf_events USING btree (created_by);


--
-- Name: idx_golf_events_parent_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_parent_event_id ON public.golf_events USING btree (parent_event_id) WHERE (parent_event_id IS NOT NULL);


--
-- Name: idx_golf_events_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_start_time ON public.golf_events USING btree (start_time);


--
-- Name: idx_golf_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_status ON public.golf_events USING btree (status);


--
-- Name: idx_golf_events_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_team_id ON public.golf_events USING btree (team_id);


--
-- Name: idx_golf_events_team_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_team_start ON public.golf_events USING btree (team_id, start_time);


--
-- Name: idx_golf_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_events_type ON public.golf_events USING btree (event_type);


--
-- Name: idx_golf_focus_areas_from_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_focus_areas_from_review ON public.golf_player_focus_areas USING btree (from_review_id) WHERE (from_review_id IS NOT NULL);


--
-- Name: idx_golf_focus_areas_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_focus_areas_player_id ON public.golf_player_focus_areas USING btree (player_id);


--
-- Name: idx_golf_focus_areas_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_focus_areas_team_id ON public.golf_player_focus_areas USING btree (team_id);


--
-- Name: idx_golf_global_patterns_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_global_patterns_confidence ON public.golf_global_patterns USING btree (confidence DESC);


--
-- Name: idx_golf_global_patterns_pattern_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_global_patterns_pattern_type ON public.golf_global_patterns USING btree (pattern_type);


--
-- Name: idx_golf_holes_round_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_holes_round_id ON public.golf_holes USING btree (round_id);


--
-- Name: idx_golf_holes_round_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_holes_round_order ON public.golf_holes USING btree (round_id, hole_number);


--
-- Name: idx_golf_insight_effectiveness_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_insight_effectiveness_team ON public.golf_insight_effectiveness USING btree (team_id, period_start DESC);


--
-- Name: idx_golf_insight_gen_log_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_insight_gen_log_player_id ON public.golf_insight_generation_log USING btree (player_id);


--
-- Name: idx_golf_insight_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_insight_log_created ON public.golf_insight_generation_log USING btree (created_at DESC);


--
-- Name: idx_golf_insight_player_feedback_insight; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_insight_player_feedback_insight ON public.golf_insight_player_feedback USING btree (insight_id);


--
-- Name: idx_golf_learned_behavior_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_learned_behavior_entity ON public.golf_learned_behavior USING btree (entity_id, entity_type);


--
-- Name: idx_golf_learned_behavior_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_learned_behavior_timestamp ON public.golf_learned_behavior USING btree ("timestamp");


--
-- Name: idx_golf_message_attachments_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_message_attachments_created ON public.golf_message_attachments USING btree (created_at DESC);


--
-- Name: idx_golf_message_attachments_file_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_message_attachments_file_type ON public.golf_message_attachments USING btree (file_type);


--
-- Name: idx_golf_message_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_message_attachments_message ON public.golf_message_attachments USING btree (message_id);


--
-- Name: idx_golf_messages_conv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_messages_conv_id ON public.golf_messages USING btree (conversation_id);


--
-- Name: idx_golf_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_messages_conversation_created ON public.golf_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_golf_messages_has_attachments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_messages_has_attachments ON public.golf_messages USING btree (conversation_id, has_attachments) WHERE (has_attachments = true);


--
-- Name: idx_golf_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_messages_sender_id ON public.golf_messages USING btree (sender_id);


--
-- Name: idx_golf_metrics_active_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_metrics_active_category ON public.golf_metrics USING btree (category) WHERE (active = true);


--
-- Name: idx_golf_patterns_v2_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_patterns_v2_active ON public.golf_patterns_v2 USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_golf_patterns_v2_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_patterns_v2_confidence ON public.golf_patterns_v2 USING btree (confidence) WHERE (confidence >= 0.6);


--
-- Name: idx_golf_patterns_v2_lifecycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_patterns_v2_lifecycle ON public.golf_patterns_v2 USING btree (lifecycle_state, player_id);


--
-- Name: idx_golf_patterns_v2_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_patterns_v2_player_id ON public.golf_patterns_v2 USING btree (player_id);


--
-- Name: idx_golf_patterns_v2_validator_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_patterns_v2_validator_coach_id ON public.golf_patterns_v2 USING btree (validator_coach_id) WHERE (validator_coach_id IS NOT NULL);


--
-- Name: idx_golf_player_attendance_stats_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_attendance_stats_player ON public.golf_player_attendance_stats USING btree (player_id);


--
-- Name: idx_golf_player_attendance_stats_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_attendance_stats_team ON public.golf_player_attendance_stats USING btree (team_id);


--
-- Name: idx_golf_player_classes_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_classes_team_id ON public.golf_player_classes USING btree (team_id) WHERE (team_id IS NOT NULL);


--
-- Name: idx_golf_player_courses_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_courses_course ON public.golf_player_courses USING btree (course_id);


--
-- Name: idx_golf_player_courses_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_courses_player ON public.golf_player_courses USING btree (player_id);


--
-- Name: idx_golf_player_focus_areas_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_focus_areas_coach_id ON public.golf_player_focus_areas USING btree (coach_id) WHERE (coach_id IS NOT NULL);


--
-- Name: idx_golf_player_stats_cache_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_stats_cache_player ON public.golf_player_stats_cache USING btree (player_id);


--
-- Name: idx_golf_player_stats_cache_refresh; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_stats_cache_refresh ON public.golf_player_stats_cache USING btree (next_refresh_due) WHERE (next_refresh_due IS NOT NULL);


--
-- Name: idx_golf_player_stats_cache_stale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_stats_cache_stale ON public.golf_player_stats_cache USING btree (is_stale) WHERE (is_stale = true);


--
-- Name: idx_golf_player_stats_cache_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_player_stats_cache_updated ON public.golf_player_stats_cache USING btree (updated_at DESC);


--
-- Name: idx_golf_players_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_players_state ON public.golf_players USING btree (state);


--
-- Name: idx_golf_players_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_players_user_id ON public.golf_players USING btree (user_id);


--
-- Name: idx_golf_predictions_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_predictions_due_date ON public.golf_predictions USING btree (due_date) WHERE (validated_at IS NULL);


--
-- Name: idx_golf_predictions_player_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_predictions_player_created ON public.golf_predictions USING btree (player_id, created_at DESC);


--
-- Name: idx_golf_predictions_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_predictions_player_id ON public.golf_predictions USING btree (player_id);


--
-- Name: idx_golf_predictions_related_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_predictions_related_event_id ON public.golf_predictions USING btree (related_event_id) WHERE (related_event_id IS NOT NULL);


--
-- Name: idx_golf_predictions_related_round_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_predictions_related_round_id ON public.golf_predictions USING btree (related_round_id) WHERE (related_round_id IS NOT NULL);


--
-- Name: idx_golf_qualifier_entries_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifier_entries_player_id ON public.golf_qualifier_entries USING btree (player_id);


--
-- Name: idx_golf_qualifier_entries_qualifier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifier_entries_qualifier_id ON public.golf_qualifier_entries USING btree (qualifier_id);


--
-- Name: idx_golf_qualifier_entries_round_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifier_entries_round_id ON public.golf_qualifier_entries USING btree (round_id);


--
-- Name: idx_golf_qualifiers_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifiers_course_id ON public.golf_qualifiers USING btree (course_id);


--
-- Name: idx_golf_qualifiers_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifiers_created_by ON public.golf_qualifiers USING btree (created_by);


--
-- Name: idx_golf_qualifiers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifiers_status ON public.golf_qualifiers USING btree (status);


--
-- Name: idx_golf_qualifiers_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifiers_team_id ON public.golf_qualifiers USING btree (team_id);


--
-- Name: idx_golf_qualifiers_team_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_qualifiers_team_status ON public.golf_qualifiers USING btree (team_id, status);


--
-- Name: idx_golf_recruits_team_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_recruits_team_class ON public.golf_recruits USING btree (team_id, hs_class);


--
-- Name: idx_golf_recruits_team_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_recruits_team_status ON public.golf_recruits USING btree (team_id, status);


--
-- Name: idx_golf_review_events_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_review_events_actor_id ON public.golf_review_events USING btree (actor_id) WHERE (actor_id IS NOT NULL);


--
-- Name: idx_golf_review_events_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_review_events_player ON public.golf_review_events USING btree (player_id, created_at DESC);


--
-- Name: idx_golf_review_events_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_review_events_review ON public.golf_review_events USING btree (review_id);


--
-- Name: idx_golf_round_reviews_coach_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_round_reviews_coach_workflow ON public.golf_round_reviews USING btree (player_id, status, created_at DESC);


--
-- Name: idx_golf_round_reviews_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_round_reviews_created_at ON public.golf_round_reviews USING btree (created_at DESC);


--
-- Name: idx_golf_round_reviews_player_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_round_reviews_player_created ON public.golf_round_reviews USING btree (player_id, created_at DESC);


--
-- Name: idx_golf_round_stats_cache_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_round_stats_cache_player ON public.golf_round_stats_cache USING btree (player_id);


--
-- Name: idx_golf_round_stats_cache_player_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_round_stats_cache_player_date ON public.golf_round_stats_cache USING btree (player_id, created_at DESC);


--
-- Name: idx_golf_round_stats_cache_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_round_stats_cache_round ON public.golf_round_stats_cache USING btree (round_id);


--
-- Name: idx_golf_rounds_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_course_id ON public.golf_rounds USING btree (course_id);


--
-- Name: idx_golf_rounds_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_date ON public.golf_rounds USING btree (round_date DESC);


--
-- Name: idx_golf_rounds_player_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_completed ON public.golf_rounds USING btree (player_id, round_date DESC) WHERE (status = 'completed'::text);


--
-- Name: idx_golf_rounds_player_completed_scored; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_completed_scored ON public.golf_rounds USING btree (player_id, round_date DESC) WHERE ((status = 'completed'::text) AND (total_score IS NOT NULL));


--
-- Name: INDEX idx_golf_rounds_player_completed_scored; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_rounds_player_completed_scored IS 'Partial index for the most common query pattern: completed rounds with scores, sorted by date';


--
-- Name: idx_golf_rounds_player_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_course ON public.golf_rounds USING btree (player_id, course_name) WHERE ((status = 'completed'::text) AND (course_name IS NOT NULL));


--
-- Name: INDEX idx_golf_rounds_player_course; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_rounds_player_course IS 'Optimizes course breakdown and filter options queries that group by player + course';


--
-- Name: idx_golf_rounds_player_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_created ON public.golf_rounds USING btree (player_id, created_at DESC) WHERE (player_id IS NOT NULL);


--
-- Name: idx_golf_rounds_player_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_created_at ON public.golf_rounds USING btree (player_id, created_at DESC);


--
-- Name: idx_golf_rounds_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_id ON public.golf_rounds USING btree (player_id);


--
-- Name: idx_golf_rounds_player_sg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_sg ON public.golf_rounds USING btree (player_id, strokes_gained_total) WHERE (strokes_gained_total IS NOT NULL);


--
-- Name: idx_golf_rounds_player_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_player_type ON public.golf_rounds USING btree (player_id, round_type, round_date DESC) WHERE (status = 'completed'::text);


--
-- Name: INDEX idx_golf_rounds_player_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_rounds_player_type IS 'Optimizes round queries filtered by type (tournament/practice/qualifier) within completed rounds';


--
-- Name: idx_golf_rounds_qualifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_qualifier ON public.golf_rounds USING btree (qualifier_id) WHERE (qualifier_id IS NOT NULL);


--
-- Name: idx_golf_rounds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_status ON public.golf_rounds USING btree (status);


--
-- Name: idx_golf_rounds_team_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_team_created ON public.golf_rounds USING btree (team_id, created_at DESC) WHERE (team_id IS NOT NULL);


--
-- Name: idx_golf_rounds_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_team_id ON public.golf_rounds USING btree (team_id);


--
-- Name: idx_golf_rounds_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_rounds_type ON public.golf_rounds USING btree (round_type);


--
-- Name: idx_golf_shots_distance_before; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_distance_before ON public.golf_shots USING btree (distance_to_hole_before) WHERE (distance_to_hole_before IS NOT NULL);


--
-- Name: idx_golf_shots_hole_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_hole_id ON public.golf_shots USING btree (hole_id);


--
-- Name: idx_golf_shots_lie_after; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_lie_after ON public.golf_shots USING btree (lie_after) WHERE (lie_after IS NOT NULL);


--
-- Name: idx_golf_shots_lie_before; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_lie_before ON public.golf_shots USING btree (lie_before);


--
-- Name: idx_golf_shots_putt_made; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_putt_made ON public.golf_shots USING btree (putt_made) WHERE (putt_made IS NOT NULL);


--
-- Name: idx_golf_shots_putting_analysis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_putting_analysis ON public.golf_shots USING btree (shot_type, putt_made, putt_distance_feet) WHERE (shot_type = 'putting'::text);


--
-- Name: idx_golf_shots_result; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_result ON public.golf_shots USING btree (result);


--
-- Name: idx_golf_shots_round_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_round_created ON public.golf_shots USING btree (round_id, created_at);


--
-- Name: idx_golf_shots_round_hole; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_round_hole ON public.golf_shots USING btree (round_id, hole_number);


--
-- Name: idx_golf_shots_round_hole_shot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_golf_shots_round_hole_shot ON public.golf_shots USING btree (round_id, hole_number, shot_number);


--
-- Name: INDEX idx_golf_shots_round_hole_shot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_shots_round_hole_shot IS 'UNIQUE constraint: prevents duplicate shot numbers per hole per round. Replaces prior non-unique index.';


--
-- Name: idx_golf_shots_round_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_round_id ON public.golf_shots USING btree (round_id);


--
-- Name: idx_golf_shots_round_id_covering; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_round_id_covering ON public.golf_shots USING btree (round_id, hole_number, shot_number) INCLUDE (id, hole_id, shot_type, club_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, result, distance_to_hole_after, distance_unit_after, shot_distance, miss_direction, putt_break, putt_distance_feet, putt_slope, putt_made, is_penalty, penalty_type);


--
-- Name: idx_golf_shots_shot_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_shots_shot_type ON public.golf_shots USING btree (shot_type);


--
-- Name: idx_golf_task_assignments_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_assignments_player_id ON public.golf_task_assignments USING btree (player_id);


--
-- Name: idx_golf_task_assignments_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_assignments_task_id ON public.golf_task_assignments USING btree (task_id);


--
-- Name: idx_golf_task_reminders_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_reminders_pending ON public.golf_task_reminders USING btree (sent, scheduled_for) WHERE (sent = false);


--
-- Name: idx_golf_task_reminders_scheduled_for; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_reminders_scheduled_for ON public.golf_task_reminders USING btree (scheduled_for) WHERE (sent = false);


--
-- Name: idx_golf_task_reminders_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_reminders_task_id ON public.golf_task_reminders USING btree (task_id);


--
-- Name: idx_golf_task_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_templates_category ON public.golf_task_templates USING btree (team_id, category);


--
-- Name: idx_golf_task_templates_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_templates_created_by ON public.golf_task_templates USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_golf_task_templates_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_task_templates_team_id ON public.golf_task_templates USING btree (team_id);


--
-- Name: idx_golf_tasks_assigned_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_tasks_assigned_by ON public.golf_tasks USING btree (assigned_by);


--
-- Name: idx_golf_tasks_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_tasks_assigned_to ON public.golf_tasks USING btree (assigned_to);


--
-- Name: idx_golf_tasks_reminder_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_tasks_reminder_pending ON public.golf_tasks USING btree (reminder_at) WHERE ((reminder_at IS NOT NULL) AND (reminder_sent = false));


--
-- Name: idx_golf_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_tasks_status ON public.golf_tasks USING btree (status);


--
-- Name: idx_golf_tasks_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_tasks_team_id ON public.golf_tasks USING btree (team_id);


--
-- Name: idx_golf_team_coach_staff_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_coach_staff_coach_id ON public.golf_team_coach_staff USING btree (coach_id);


--
-- Name: idx_golf_team_coach_staff_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_coach_staff_team_id ON public.golf_team_coach_staff USING btree (team_id);


--
-- Name: idx_golf_team_coachhelm_settings_disabled_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_coachhelm_settings_disabled_by ON public.golf_team_coachhelm_settings USING btree (disabled_by) WHERE (disabled_by IS NOT NULL);


--
-- Name: idx_golf_team_coachhelm_settings_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_coachhelm_settings_team ON public.golf_team_coachhelm_settings USING btree (team_id);


--
-- Name: idx_golf_team_join_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_join_requests_pending ON public.golf_team_join_requests USING btree (team_id) WHERE (status = 'pending'::text);


--
-- Name: idx_golf_team_join_requests_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_join_requests_player ON public.golf_team_join_requests USING btree (player_id);


--
-- Name: idx_golf_team_join_requests_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_join_requests_reviewed_by ON public.golf_team_join_requests USING btree (reviewed_by) WHERE (reviewed_by IS NOT NULL);


--
-- Name: idx_golf_team_join_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_join_requests_status ON public.golf_team_join_requests USING btree (status);


--
-- Name: idx_golf_team_join_requests_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_join_requests_team ON public.golf_team_join_requests USING btree (team_id);


--
-- Name: idx_golf_team_members_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_members_approved_by ON public.golf_team_members USING btree (approved_by) WHERE (approved_by IS NOT NULL);


--
-- Name: idx_golf_team_members_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_members_player ON public.golf_team_members USING btree (player_id);


--
-- Name: idx_golf_team_members_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_members_status ON public.golf_team_members USING btree (status);


--
-- Name: idx_golf_team_members_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_members_team ON public.golf_team_members USING btree (team_id);


--
-- Name: idx_golf_team_members_team_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_team_members_team_active ON public.golf_team_members USING btree (team_id, player_id) WHERE (status = 'active'::public.team_member_status);


--
-- Name: idx_golf_teams_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_teams_created_by ON public.golf_teams USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_golf_teams_join_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_teams_join_code ON public.golf_teams USING btree (join_code);


--
-- Name: idx_golf_teams_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_teams_org_id ON public.golf_teams USING btree (organization_id);


--
-- Name: idx_golf_travel_budgets_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_budgets_itinerary ON public.golf_travel_budgets USING btree (itinerary_id);


--
-- Name: idx_golf_travel_departure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_departure ON public.golf_travel_itineraries USING btree (departure_date);


--
-- Name: idx_golf_travel_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_category ON public.golf_travel_expenses USING btree (category);


--
-- Name: idx_golf_travel_expenses_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_created_at ON public.golf_travel_expenses USING btree (created_at);


--
-- Name: idx_golf_travel_expenses_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_created_by ON public.golf_travel_expenses USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_golf_travel_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_date ON public.golf_travel_expenses USING btree (expense_date);


--
-- Name: idx_golf_travel_expenses_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_itinerary ON public.golf_travel_expenses USING btree (itinerary_id);


--
-- Name: idx_golf_travel_expenses_itinerary_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_itinerary_date ON public.golf_travel_expenses USING btree (itinerary_id, expense_date DESC);


--
-- Name: INDEX idx_golf_travel_expenses_itinerary_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_travel_expenses_itinerary_date IS 'Optimizes itinerary expense listing sorted by date';


--
-- Name: idx_golf_travel_expenses_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_team ON public.golf_travel_expenses USING btree (team_id);


--
-- Name: idx_golf_travel_expenses_team_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_expenses_team_date ON public.golf_travel_expenses USING btree (team_id, expense_date DESC);


--
-- Name: INDEX idx_golf_travel_expenses_team_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_golf_travel_expenses_team_date IS 'Optimizes team expense summary and filtered expense queries with date ordering';


--
-- Name: idx_golf_travel_itineraries_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_itineraries_created_by ON public.golf_travel_itineraries USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_golf_travel_itineraries_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_itineraries_event_id ON public.golf_travel_itineraries USING btree (event_id);


--
-- Name: idx_golf_travel_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_travel_team ON public.golf_travel_itineraries USING btree (team_id);


--
-- Name: idx_golf_validations_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_validations_player_id ON public.golf_validations USING btree (player_id);


--
-- Name: idx_golf_validations_prediction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_validations_prediction_id ON public.golf_validations USING btree (prediction_id) WHERE (prediction_id IS NOT NULL);


--
-- Name: idx_golf_validations_stated_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_validations_stated_confidence ON public.golf_validations USING btree (stated_confidence, was_correct);


--
-- Name: idx_insights_category_lifecycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insights_category_lifecycle ON public.golf_coach_insights USING btree (player_id, category, lifecycle_state);


--
-- Name: idx_insights_signature_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insights_signature_recent ON public.golf_coach_insights USING btree (player_id, signature, created_at DESC);


--
-- Name: idx_login_attempts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_email ON public.login_attempts USING btree (email);


--
-- Name: idx_login_attempts_last_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_last_attempt ON public.login_attempts USING btree (last_attempt);


--
-- Name: idx_login_attempts_locked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_locked ON public.login_attempts USING btree (locked_until) WHERE (locked_until IS NOT NULL);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (read = false);


--
-- Name: idx_organizations_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_state ON public.organizations USING btree (location_state);


--
-- Name: idx_organizations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_type ON public.organizations USING btree (type);


--
-- Name: idx_percentile_cache_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_percentile_cache_player ON public.golf_percentile_cache USING btree (player_id);


--
-- Name: idx_pga_standards_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pga_standards_metric ON public.golf_pga_standards USING btree (metric_id, season DESC);


--
-- Name: idx_player_baselines_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_baselines_player ON public.golf_player_baselines USING btree (player_id);


--
-- Name: idx_pred_validations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pred_validations_date ON public.golf_prediction_validations USING btree (validated_at DESC);


--
-- Name: idx_pred_validations_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pred_validations_player ON public.golf_prediction_validations USING btree (player_id);


--
-- Name: idx_push_subscriptions_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_endpoint ON public.push_subscriptions USING btree (endpoint);


--
-- Name: idx_push_subscriptions_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_failed ON public.push_subscriptions USING btree (failed_count) WHERE (failed_count > 0);


--
-- Name: idx_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_putt_details_shot_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_putt_details_shot_id ON public.putt_details USING btree (shot_id);


--
-- Name: idx_seq_enrollments_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seq_enrollments_coach ON public.crm_sequence_enrollments USING btree (coach_id, status);


--
-- Name: idx_seq_enrollments_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seq_enrollments_due ON public.crm_sequence_enrollments USING btree (next_send_at, status) WHERE ((status = 'active'::text) AND (next_send_at IS NOT NULL));


--
-- Name: idx_standing_computed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standing_computed_at ON public.golf_player_standing USING btree (computed_at DESC);


--
-- Name: idx_standing_team_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standing_team_metric ON public.golf_player_standing USING btree (metric_id, team_pct) INCLUDE (player_id);


--
-- Name: idx_suppressions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppressions_email ON public.crm_email_suppressions USING btree (email);


--
-- Name: idx_suppressions_suppressed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppressions_suppressed_at ON public.crm_email_suppressions USING btree (suppressed_at DESC);


--
-- Name: idx_tracer_health_snapped; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracer_health_snapped ON public.golf_tracer_health_snapshot USING btree (snapped_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_seen ON public.users USING btree (last_seen) WHERE (last_seen IS NOT NULL);


--
-- Name: idx_users_notification_prefs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_notification_prefs ON public.users USING gin (notification_preferences);


--
-- Name: idx_users_notification_prefs_email_messages; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_notification_prefs_email_messages ON public.users USING btree (((notification_preferences ->> 'email_messages'::text))) WHERE ((notification_preferences ->> 'email_messages'::text) = 'true'::text);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: device_tokens device_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER device_tokens_updated_at BEFORE UPDATE ON public.device_tokens FOR EACH ROW EXECUTE FUNCTION public.update_device_tokens_updated_at();


--
-- Name: email_events email_events_extract_click; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_events_extract_click AFTER INSERT ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.extract_email_click_from_event();


--
-- Name: email_events email_events_sync_coach; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_events_sync_coach AFTER INSERT ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.sync_coach_last_email_event();


--
-- Name: email_events email_events_sync_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_events_sync_snapshot AFTER INSERT ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.sync_email_snapshot_from_event();


--
-- Name: golf_event_documents golf_event_documents_team_consistency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER golf_event_documents_team_consistency BEFORE INSERT OR UPDATE ON public.golf_event_documents FOR EACH ROW EXECUTE FUNCTION public.golf_event_documents_assert_same_team();


--
-- Name: golf_global_patterns golf_global_patterns_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER golf_global_patterns_touch BEFORE UPDATE ON public.golf_global_patterns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: golf_holes golf_holes_recompute_round_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER golf_holes_recompute_round_totals AFTER INSERT OR DELETE OR UPDATE ON public.golf_holes FOR EACH ROW EXECUTE FUNCTION public.golf_holes_recompute_round_totals_fn();


--
-- Name: golf_holes golf_holes_set_gir; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER golf_holes_set_gir BEFORE INSERT OR UPDATE OF par, score, putts ON public.golf_holes FOR EACH ROW EXECUTE FUNCTION public.golf_holes_set_gir_fn();


--
-- Name: golf_task_reminders golf_task_reminders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER golf_task_reminders_updated_at BEFORE UPDATE ON public.golf_task_reminders FOR EACH ROW EXECUTE FUNCTION public.update_golf_task_reminders_updated_at();


--
-- Name: golf_team_join_requests golf_team_join_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER golf_team_join_requests_updated_at BEFORE UPDATE ON public.golf_team_join_requests FOR EACH ROW EXECUTE FUNCTION public.update_golf_team_join_requests_updated_at();


--
-- Name: push_subscriptions push_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER push_subscriptions_updated_at BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_push_subscriptions_updated_at();


--
-- Name: golf_document_versions set_document_version_number_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_document_version_number_trigger BEFORE INSERT ON public.golf_document_versions FOR EACH ROW WHEN (((new.version_number IS NULL) OR (new.version_number = 0))) EXECUTE FUNCTION public.set_document_version_number();


--
-- Name: crm_automations trg_crm_automations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_automations_updated_at BEFORE UPDATE ON public.crm_automations FOR EACH ROW EXECUTE FUNCTION public.update_crm_automations_updated_at();


--
-- Name: crm_coaches trg_crm_coaches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_coaches_updated_at BEFORE UPDATE ON public.crm_coaches FOR EACH ROW EXECUTE FUNCTION public.update_crm_coaches_updated_at();


--
-- Name: crm_events trg_crm_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_events_updated_at BEFORE UPDATE ON public.crm_events FOR EACH ROW EXECUTE FUNCTION public.update_crm_events_updated_at();


--
-- Name: crm_google_calendar_tokens trg_crm_google_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_google_tokens_updated_at BEFORE UPDATE ON public.crm_google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION public.update_crm_google_tokens_updated_at();


--
-- Name: crm_notes trg_crm_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_notes_updated_at BEFORE UPDATE ON public.crm_notes FOR EACH ROW EXECUTE FUNCTION public.update_crm_notes_updated_at();


--
-- Name: crm_segments trg_crm_segments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_segments_updated_at BEFORE UPDATE ON public.crm_segments FOR EACH ROW EXECUTE FUNCTION public.update_crm_segments_updated_at();


--
-- Name: crm_sequences trg_crm_sequences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_sequences_updated_at BEFORE UPDATE ON public.crm_sequences FOR EACH ROW EXECUTE FUNCTION public.update_crm_sequences_updated_at();


--
-- Name: crm_tasks trg_crm_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_tasks_updated_at BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.update_crm_tasks_updated_at();


--
-- Name: golf_task_templates trg_golf_task_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_golf_task_templates_updated_at BEFORE UPDATE ON public.golf_task_templates FOR EACH ROW EXECUTE FUNCTION public.update_golf_task_templates_updated_at();


--
-- Name: crm_replies trg_stop_sequences_on_reply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stop_sequences_on_reply AFTER INSERT ON public.crm_replies FOR EACH ROW EXECUTE FUNCTION public.stop_sequences_on_reply();


--
-- Name: golf_message_attachments trg_update_message_has_attachments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_message_has_attachments AFTER INSERT OR DELETE ON public.golf_message_attachments FOR EACH ROW EXECUTE FUNCTION public.update_message_has_attachments();


--
-- Name: golf_round_stats_cache trg_update_player_stats_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_player_stats_complete AFTER INSERT OR DELETE OR UPDATE ON public.golf_round_stats_cache FOR EACH ROW EXECUTE FUNCTION public.update_player_stats_complete();


--
-- Name: golf_rounds trg_update_round_stats_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_round_stats_cache AFTER INSERT OR UPDATE OF status, total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible ON public.golf_rounds FOR EACH ROW WHEN ((new.status = 'completed'::text)) EXECUTE FUNCTION public.update_round_stats_cache();


--
-- Name: email_events trg_write_suppression_on_unsubscribe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_write_suppression_on_unsubscribe AFTER INSERT ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.write_suppression_on_unsubscribe();


--
-- Name: golf_round_reviews trigger_review_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_review_status_change AFTER UPDATE ON public.golf_round_reviews FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.log_review_status_change();


--
-- Name: golf_calendar_feeds trigger_set_calendar_feed_token; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_calendar_feed_token BEFORE INSERT ON public.golf_calendar_feeds FOR EACH ROW EXECUTE FUNCTION public.set_calendar_feed_token();


--
-- Name: approach_miss_details update_approach_miss_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_approach_miss_details_updated_at BEFORE UPDATE ON public.approach_miss_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: baseball_coach_recruiting_philosophy update_baseball_coach_recruiting_philosophy_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_baseball_coach_recruiting_philosophy_updated_at BEFORE UPDATE ON public.baseball_coach_recruiting_philosophy FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: baseball_conversations update_baseball_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_baseball_conversations_updated_at BEFORE UPDATE ON public.baseball_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: baseball_player_percentiles update_baseball_player_percentiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_baseball_player_percentiles_updated_at BEFORE UPDATE ON public.baseball_player_percentiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: baseball_player_stats update_baseball_player_stats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_baseball_player_stats_updated_at BEFORE UPDATE ON public.baseball_player_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: baseball_team_invitations update_baseball_team_invitations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_baseball_team_invitations_updated_at BEFORE UPDATE ON public.baseball_team_invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: baseball_team_lineups update_baseball_team_lineups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_baseball_team_lineups_updated_at BEFORE UPDATE ON public.baseball_team_lineups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: demo_requests update_demo_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_demo_requests_updated_at BEFORE UPDATE ON public.demo_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_document_versions update_document_version_info_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_document_version_info_trigger AFTER INSERT ON public.golf_document_versions FOR EACH ROW EXECUTE FUNCTION public.update_document_version_info();


--
-- Name: golf_academic_exclusions update_golf_academic_exclusions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_academic_exclusions_updated_at BEFORE UPDATE ON public.golf_academic_exclusions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_announcements update_golf_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_announcements_updated_at BEFORE UPDATE ON public.golf_announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_attendance_summary update_golf_attendance_summary_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_attendance_summary_updated_at BEFORE UPDATE ON public.golf_attendance_summary FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_calendar_feeds update_golf_calendar_feeds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_calendar_feeds_updated_at BEFORE UPDATE ON public.golf_calendar_feeds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_causal_relationships update_golf_causal_relationships_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_causal_relationships_timestamp BEFORE UPDATE ON public.golf_causal_relationships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_coach_blocked_time update_golf_coach_blocked_time_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_coach_blocked_time_updated_at BEFORE UPDATE ON public.golf_coach_blocked_time FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_coach_insights update_golf_coach_insights_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_coach_insights_updated_at BEFORE UPDATE ON public.golf_coach_insights FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_confidence_calibration update_golf_confidence_calibration_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_confidence_calibration_timestamp BEFORE UPDATE ON public.golf_confidence_calibration FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_message_attachments update_golf_message_attachments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_message_attachments_updated_at BEFORE UPDATE ON public.golf_message_attachments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: golf_player_stats_cache update_golf_player_stats_cache_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_player_stats_cache_updated_at BEFORE UPDATE ON public.golf_player_stats_cache FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_round_reviews update_golf_round_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_round_reviews_updated_at BEFORE UPDATE ON public.golf_round_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_round_stats_cache update_golf_round_stats_cache_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_round_stats_cache_updated_at BEFORE UPDATE ON public.golf_round_stats_cache FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_shots update_golf_shots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_shots_updated_at BEFORE UPDATE ON public.golf_shots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_team_coachhelm_settings update_golf_team_coachhelm_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_team_coachhelm_settings_updated_at BEFORE UPDATE ON public.golf_team_coachhelm_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_team_members update_golf_team_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_team_members_updated_at BEFORE UPDATE ON public.golf_team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: golf_team_settings update_golf_team_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_team_settings_updated_at BEFORE UPDATE ON public.golf_team_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: golf_travel_budgets update_golf_travel_budgets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_travel_budgets_updated_at BEFORE UPDATE ON public.golf_travel_budgets FOR EACH ROW EXECUTE FUNCTION public.update_golf_expenses_updated_at();


--
-- Name: golf_travel_expenses update_golf_travel_expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_travel_expenses_updated_at BEFORE UPDATE ON public.golf_travel_expenses FOR EACH ROW EXECUTE FUNCTION public.update_golf_expenses_updated_at();


--
-- Name: golf_travel_itineraries update_golf_travel_itineraries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_golf_travel_itineraries_updated_at BEFORE UPDATE ON public.golf_travel_itineraries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: login_attempts update_login_attempts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_login_attempts_updated_at BEFORE UPDATE ON public.login_attempts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: putt_details update_putt_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_putt_details_updated_at BEFORE UPDATE ON public.putt_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users validate_notification_preferences_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_notification_preferences_trigger BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.validate_notification_preferences();


--
-- Name: admin_analytics_events admin_analytics_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_analytics_events
    ADD CONSTRAINT admin_analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_api_perf_log admin_api_perf_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_api_perf_log
    ADD CONSTRAINT admin_api_perf_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_client_errors admin_client_errors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_client_errors
    ADD CONSTRAINT admin_client_errors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_events admin_events_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_events
    ADD CONSTRAINT admin_events_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_events admin_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_events
    ADD CONSTRAINT admin_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: approach_miss_details approach_miss_details_shot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approach_miss_details
    ADD CONSTRAINT approach_miss_details_shot_id_fkey FOREIGN KEY (shot_id) REFERENCES public.golf_shots(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: baseball_academic_eligibility baseball_academic_eligibility_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_academic_eligibility
    ADD CONSTRAINT baseball_academic_eligibility_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_academic_eligibility baseball_academic_eligibility_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_academic_eligibility
    ADD CONSTRAINT baseball_academic_eligibility_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_academic_eligibility baseball_academic_eligibility_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_academic_eligibility
    ADD CONSTRAINT baseball_academic_eligibility_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: baseball_announcement_acknowledgements baseball_announcement_acknowledgements_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_acknowledgements
    ADD CONSTRAINT baseball_announcement_acknowledgements_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.baseball_announcements(id) ON DELETE CASCADE;


--
-- Name: baseball_announcement_acknowledgements baseball_announcement_acknowledgements_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_acknowledgements
    ADD CONSTRAINT baseball_announcement_acknowledgements_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_announcement_recipients baseball_announcement_recipients_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_recipients
    ADD CONSTRAINT baseball_announcement_recipients_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.baseball_announcements(id) ON DELETE CASCADE;


--
-- Name: baseball_announcement_recipients baseball_announcement_recipients_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcement_recipients
    ADD CONSTRAINT baseball_announcement_recipients_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_announcements baseball_announcements_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcements
    ADD CONSTRAINT baseball_announcements_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_announcements baseball_announcements_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_announcements
    ADD CONSTRAINT baseball_announcements_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_box_score_batting baseball_box_score_batting_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_batting
    ADD CONSTRAINT baseball_box_score_batting_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.baseball_games(id) ON DELETE CASCADE;


--
-- Name: baseball_box_score_batting baseball_box_score_batting_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_batting
    ADD CONSTRAINT baseball_box_score_batting_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_box_score_batting baseball_box_score_batting_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_batting
    ADD CONSTRAINT baseball_box_score_batting_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_box_score_pitching baseball_box_score_pitching_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_pitching
    ADD CONSTRAINT baseball_box_score_pitching_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.baseball_games(id) ON DELETE CASCADE;


--
-- Name: baseball_box_score_pitching baseball_box_score_pitching_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_pitching
    ADD CONSTRAINT baseball_box_score_pitching_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_box_score_pitching baseball_box_score_pitching_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_pitching
    ADD CONSTRAINT baseball_box_score_pitching_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_box_score_uploads baseball_box_score_uploads_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_uploads
    ADD CONSTRAINT baseball_box_score_uploads_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id);


--
-- Name: baseball_box_score_uploads baseball_box_score_uploads_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_uploads
    ADD CONSTRAINT baseball_box_score_uploads_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.baseball_games(id) ON DELETE SET NULL;


--
-- Name: baseball_box_score_uploads baseball_box_score_uploads_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_box_score_uploads
    ADD CONSTRAINT baseball_box_score_uploads_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_camp_registrations baseball_camp_registrations_camp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_camp_registrations
    ADD CONSTRAINT baseball_camp_registrations_camp_id_fkey FOREIGN KEY (camp_id) REFERENCES public.baseball_camps(id) ON DELETE CASCADE;


--
-- Name: baseball_camp_registrations baseball_camp_registrations_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_camp_registrations
    ADD CONSTRAINT baseball_camp_registrations_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_camps baseball_camps_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_camps
    ADD CONSTRAINT baseball_camps_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_camps baseball_camps_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_camps
    ADD CONSTRAINT baseball_camps_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: baseball_coach_insights baseball_coach_insights_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_insights
    ADD CONSTRAINT baseball_coach_insights_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_coach_insights baseball_coach_insights_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_insights
    ADD CONSTRAINT baseball_coach_insights_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_coach_insights baseball_coach_insights_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_insights
    ADD CONSTRAINT baseball_coach_insights_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_coach_philosophy baseball_coach_philosophy_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_philosophy
    ADD CONSTRAINT baseball_coach_philosophy_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_coach_recruiting_philosophy baseball_coach_recruiting_philosophy_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coach_recruiting_philosophy
    ADD CONSTRAINT baseball_coach_recruiting_philosophy_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_coaches baseball_coaches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coaches
    ADD CONSTRAINT baseball_coaches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: baseball_coaches baseball_coaches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_coaches
    ADD CONSTRAINT baseball_coaches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: baseball_conversation_participants baseball_conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_conversation_participants
    ADD CONSTRAINT baseball_conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.baseball_conversations(id) ON DELETE CASCADE;


--
-- Name: baseball_conversation_participants baseball_conversation_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_conversation_participants
    ADD CONSTRAINT baseball_conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: baseball_conversations baseball_conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_conversations
    ADD CONSTRAINT baseball_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: baseball_conversations baseball_conversations_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_conversations
    ADD CONSTRAINT baseball_conversations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_developmental_plans baseball_developmental_plans_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_developmental_plans
    ADD CONSTRAINT baseball_developmental_plans_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_developmental_plans baseball_developmental_plans_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_developmental_plans
    ADD CONSTRAINT baseball_developmental_plans_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_developmental_plans baseball_developmental_plans_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_developmental_plans
    ADD CONSTRAINT baseball_developmental_plans_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_document_versions baseball_document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_document_versions
    ADD CONSTRAINT baseball_document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.baseball_documents(id) ON DELETE CASCADE;


--
-- Name: baseball_document_versions baseball_document_versions_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_document_versions
    ADD CONSTRAINT baseball_document_versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: baseball_documents baseball_documents_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_documents
    ADD CONSTRAINT baseball_documents_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_documents baseball_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_documents
    ADD CONSTRAINT baseball_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: baseball_event_attendance baseball_event_attendance_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_event_attendance
    ADD CONSTRAINT baseball_event_attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.baseball_events(id) ON DELETE CASCADE;


--
-- Name: baseball_event_attendance baseball_event_attendance_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_event_attendance
    ADD CONSTRAINT baseball_event_attendance_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_events baseball_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_events
    ADD CONSTRAINT baseball_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;


--
-- Name: baseball_events baseball_events_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_events
    ADD CONSTRAINT baseball_events_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_games baseball_games_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_games
    ADD CONSTRAINT baseball_games_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.baseball_coaches(id);


--
-- Name: baseball_games baseball_games_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_games
    ADD CONSTRAINT baseball_games_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.baseball_events(id) ON DELETE SET NULL;


--
-- Name: baseball_games baseball_games_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_games
    ADD CONSTRAINT baseball_games_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_lineup_positions baseball_lineup_positions_lineup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_lineup_positions
    ADD CONSTRAINT baseball_lineup_positions_lineup_id_fkey FOREIGN KEY (lineup_id) REFERENCES public.baseball_team_lineups(id) ON DELETE CASCADE;


--
-- Name: baseball_lineup_positions baseball_lineup_positions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_lineup_positions
    ADD CONSTRAINT baseball_lineup_positions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_messages baseball_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_messages
    ADD CONSTRAINT baseball_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.baseball_conversations(id) ON DELETE CASCADE;


--
-- Name: baseball_messages baseball_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_messages
    ADD CONSTRAINT baseball_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: baseball_notifications baseball_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_notifications
    ADD CONSTRAINT baseball_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: baseball_player_aggregates baseball_player_aggregates_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_aggregates
    ADD CONSTRAINT baseball_player_aggregates_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_player_aggregates baseball_player_aggregates_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_aggregates
    ADD CONSTRAINT baseball_player_aggregates_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_player_classes baseball_player_classes_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_classes
    ADD CONSTRAINT baseball_player_classes_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_player_classes baseball_player_classes_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_classes
    ADD CONSTRAINT baseball_player_classes_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_player_comparisons baseball_player_comparisons_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_comparisons
    ADD CONSTRAINT baseball_player_comparisons_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_player_engagement_events baseball_player_engagement_events_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_engagement_events
    ADD CONSTRAINT baseball_player_engagement_events_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;


--
-- Name: baseball_player_engagement_events baseball_player_engagement_events_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_engagement_events
    ADD CONSTRAINT baseball_player_engagement_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_player_percentiles baseball_player_percentiles_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_percentiles
    ADD CONSTRAINT baseball_player_percentiles_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_player_season_stats baseball_player_season_stats_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_season_stats
    ADD CONSTRAINT baseball_player_season_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_player_season_stats baseball_player_season_stats_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_season_stats
    ADD CONSTRAINT baseball_player_season_stats_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_player_settings baseball_player_settings_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_settings
    ADD CONSTRAINT baseball_player_settings_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_player_stats baseball_player_stats_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_stats
    ADD CONSTRAINT baseball_player_stats_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id);


--
-- Name: baseball_player_stats baseball_player_stats_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_stats
    ADD CONSTRAINT baseball_player_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_player_stats baseball_player_stats_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_player_stats
    ADD CONSTRAINT baseball_player_stats_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_players baseball_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_players
    ADD CONSTRAINT baseball_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_recruiting_interests
    ADD CONSTRAINT baseball_recruiting_interests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_recruiting_interests
    ADD CONSTRAINT baseball_recruiting_interests_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_stat_uploads baseball_stat_uploads_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_stat_uploads
    ADD CONSTRAINT baseball_stat_uploads_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_stat_uploads baseball_stat_uploads_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_stat_uploads
    ADD CONSTRAINT baseball_stat_uploads_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_task_assignments baseball_task_assignments_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_task_assignments
    ADD CONSTRAINT baseball_task_assignments_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_task_assignments baseball_task_assignments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_task_assignments
    ADD CONSTRAINT baseball_task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.baseball_tasks(id) ON DELETE CASCADE;


--
-- Name: baseball_task_templates baseball_task_templates_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_task_templates
    ADD CONSTRAINT baseball_task_templates_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_task_templates baseball_task_templates_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_task_templates
    ADD CONSTRAINT baseball_task_templates_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_tasks baseball_tasks_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_tasks
    ADD CONSTRAINT baseball_tasks_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_tasks baseball_tasks_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_tasks
    ADD CONSTRAINT baseball_tasks_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_coach_staff
    ADD CONSTRAINT baseball_team_coach_staff_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_coach_staff
    ADD CONSTRAINT baseball_team_coach_staff_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_team_invitations baseball_team_invitations_created_by_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_invitations
    ADD CONSTRAINT baseball_team_invitations_created_by_coach_id_fkey FOREIGN KEY (created_by_coach_id) REFERENCES public.baseball_coaches(id);


--
-- Name: baseball_team_invitations baseball_team_invitations_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_invitations
    ADD CONSTRAINT baseball_team_invitations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_team_lineups baseball_team_lineups_created_by_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_lineups
    ADD CONSTRAINT baseball_team_lineups_created_by_coach_id_fkey FOREIGN KEY (created_by_coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_team_lineups baseball_team_lineups_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_lineups
    ADD CONSTRAINT baseball_team_lineups_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_team_members baseball_team_members_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_members
    ADD CONSTRAINT baseball_team_members_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;


--
-- Name: baseball_team_members baseball_team_members_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_members
    ADD CONSTRAINT baseball_team_members_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_team_members baseball_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_team_members
    ADD CONSTRAINT baseball_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_teams baseball_teams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_teams
    ADD CONSTRAINT baseball_teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;


--
-- Name: baseball_teams baseball_teams_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_teams
    ADD CONSTRAINT baseball_teams_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: baseball_travel_expenses baseball_travel_expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_travel_expenses
    ADD CONSTRAINT baseball_travel_expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: baseball_travel_expenses baseball_travel_expenses_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_travel_expenses
    ADD CONSTRAINT baseball_travel_expenses_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.baseball_travel_itineraries(id) ON DELETE CASCADE;


--
-- Name: baseball_travel_expenses baseball_travel_expenses_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_travel_expenses
    ADD CONSTRAINT baseball_travel_expenses_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_travel_itineraries baseball_travel_itineraries_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_travel_itineraries
    ADD CONSTRAINT baseball_travel_itineraries_created_by_id_fkey FOREIGN KEY (created_by) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_travel_itineraries baseball_travel_itineraries_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_travel_itineraries
    ADD CONSTRAINT baseball_travel_itineraries_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;


--
-- Name: baseball_videos baseball_videos_parent_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_videos
    ADD CONSTRAINT baseball_videos_parent_video_id_fkey FOREIGN KEY (parent_video_id) REFERENCES public.baseball_videos(id) ON DELETE CASCADE;


--
-- Name: baseball_videos baseball_videos_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_videos
    ADD CONSTRAINT baseball_videos_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: baseball_videos baseball_videos_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_videos
    ADD CONSTRAINT baseball_videos_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;


--
-- Name: baseball_watchlists baseball_watchlists_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_watchlists
    ADD CONSTRAINT baseball_watchlists_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;


--
-- Name: baseball_watchlists baseball_watchlists_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baseball_watchlists
    ADD CONSTRAINT baseball_watchlists_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;


--
-- Name: crm_activity_log crm_activity_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activity_log
    ADD CONSTRAINT crm_activity_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: crm_automations crm_automations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automations
    ADD CONSTRAINT crm_automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: crm_coaches crm_coaches_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_coaches
    ADD CONSTRAINT crm_coaches_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id);


--
-- Name: crm_coaches crm_coaches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_coaches
    ADD CONSTRAINT crm_coaches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: crm_contact_log crm_contact_log_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contact_log
    ADD CONSTRAINT crm_contact_log_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.crm_coaches(id) ON DELETE CASCADE;


--
-- Name: crm_contact_log crm_contact_log_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contact_log
    ADD CONSTRAINT crm_contact_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: email_events crm_email_events_contact_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT crm_email_events_contact_log_id_fkey FOREIGN KEY (contact_log_id) REFERENCES public.crm_contact_log(id) ON DELETE CASCADE;


--
-- Name: crm_email_suppressions crm_email_suppressions_suppressed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_suppressions
    ADD CONSTRAINT crm_email_suppressions_suppressed_by_fkey FOREIGN KEY (suppressed_by) REFERENCES auth.users(id);


--
-- Name: crm_email_templates crm_email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_templates
    ADD CONSTRAINT crm_email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: crm_events crm_events_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.crm_coaches(id) ON DELETE SET NULL;


--
-- Name: crm_events crm_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: crm_events crm_events_parent_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_parent_event_id_fkey FOREIGN KEY (parent_event_id) REFERENCES public.crm_events(id) ON DELETE SET NULL;


--
-- Name: crm_google_calendar_tokens crm_google_calendar_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_google_calendar_tokens
    ADD CONSTRAINT crm_google_calendar_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: crm_notes crm_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_notes
    ADD CONSTRAINT crm_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id);


--
-- Name: crm_notes crm_notes_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_notes
    ADD CONSTRAINT crm_notes_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.crm_coaches(id) ON DELETE CASCADE;


--
-- Name: crm_replies crm_replies_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_replies
    ADD CONSTRAINT crm_replies_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.crm_coaches(id) ON DELETE SET NULL;


--
-- Name: crm_replies crm_replies_contact_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_replies
    ADD CONSTRAINT crm_replies_contact_log_id_fkey FOREIGN KEY (contact_log_id) REFERENCES public.crm_contact_log(id) ON DELETE SET NULL;


--
-- Name: crm_segments crm_segments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments
    ADD CONSTRAINT crm_segments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.crm_coaches(id) ON DELETE CASCADE;


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_enrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES auth.users(id);


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.crm_sequences(id) ON DELETE CASCADE;


--
-- Name: crm_sequence_steps crm_sequence_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_steps
    ADD CONSTRAINT crm_sequence_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.crm_sequences(id) ON DELETE CASCADE;


--
-- Name: crm_sequence_steps crm_sequence_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_steps
    ADD CONSTRAINT crm_sequence_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.crm_email_templates(id) ON DELETE SET NULL;


--
-- Name: crm_sequences crm_sequences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequences
    ADD CONSTRAINT crm_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: crm_tasks crm_tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id);


--
-- Name: crm_tasks crm_tasks_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.crm_coaches(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: device_tokens device_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_clicks email_clicks_email_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_clicks
    ADD CONSTRAINT email_clicks_email_event_id_fkey FOREIGN KEY (email_event_id) REFERENCES public.email_events(id) ON DELETE CASCADE;


--
-- Name: emails emails_contact_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_contact_log_id_fkey FOREIGN KEY (contact_log_id) REFERENCES public.crm_contact_log(id) ON DELETE SET NULL;


--
-- Name: error_logs error_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: golf_academic_exclusions golf_academic_exclusions_excluded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_academic_exclusions
    ADD CONSTRAINT golf_academic_exclusions_excluded_by_fkey FOREIGN KEY (excluded_by) REFERENCES public.golf_coaches(id);


--
-- Name: golf_academic_exclusions golf_academic_exclusions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_academic_exclusions
    ADD CONSTRAINT golf_academic_exclusions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_acknowledgements golf_announcement_acknowledgements_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_acknowledgements
    ADD CONSTRAINT golf_announcement_acknowledgements_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.golf_announcements(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_acknowledgements golf_announcement_acknowledgements_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_acknowledgements
    ADD CONSTRAINT golf_announcement_acknowledgements_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_documents golf_announcement_documents_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_documents
    ADD CONSTRAINT golf_announcement_documents_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.golf_announcements(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_documents golf_announcement_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_documents
    ADD CONSTRAINT golf_announcement_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.golf_documents(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_recipients golf_announcement_recipients_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_recipients
    ADD CONSTRAINT golf_announcement_recipients_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.golf_announcements(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_recipients golf_announcement_recipients_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_recipients
    ADD CONSTRAINT golf_announcement_recipients_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_tasks golf_announcement_tasks_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_tasks
    ADD CONSTRAINT golf_announcement_tasks_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.golf_announcements(id) ON DELETE CASCADE;


--
-- Name: golf_announcement_tasks golf_announcement_tasks_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcement_tasks
    ADD CONSTRAINT golf_announcement_tasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.golf_tasks(id) ON DELETE CASCADE;


--
-- Name: golf_announcements golf_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcements
    ADD CONSTRAINT golf_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.golf_coaches(id);


--
-- Name: golf_announcements golf_announcements_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_announcements
    ADD CONSTRAINT golf_announcements_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_attendance_summary golf_attendance_summary_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_attendance_summary
    ADD CONSTRAINT golf_attendance_summary_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_attendance_summary golf_attendance_summary_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_attendance_summary
    ADD CONSTRAINT golf_attendance_summary_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_calendar_feeds golf_calendar_feeds_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_feeds
    ADD CONSTRAINT golf_calendar_feeds_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_calendar_feeds golf_calendar_feeds_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_feeds
    ADD CONSTRAINT golf_calendar_feeds_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_calendar_feeds golf_calendar_feeds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_feeds
    ADD CONSTRAINT golf_calendar_feeds_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_calendar_notifications golf_calendar_notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_notifications
    ADD CONSTRAINT golf_calendar_notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.golf_events(id) ON DELETE CASCADE;


--
-- Name: golf_calendar_notifications golf_calendar_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_calendar_notifications
    ADD CONSTRAINT golf_calendar_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_causal_relationships golf_causal_relationships_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_causal_relationships
    ADD CONSTRAINT golf_causal_relationships_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_causal_relationships golf_causal_relationships_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_causal_relationships
    ADD CONSTRAINT golf_causal_relationships_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_coach_blocked_time golf_coach_blocked_time_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_blocked_time
    ADD CONSTRAINT golf_coach_blocked_time_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coach_insights golf_coach_insights_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_insights
    ADD CONSTRAINT golf_coach_insights_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coach_insights golf_coach_insights_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_insights
    ADD CONSTRAINT golf_coach_insights_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_coach_insights golf_coach_insights_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_insights
    ADD CONSTRAINT golf_coach_insights_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_coach_philosophy golf_coach_philosophy_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_philosophy
    ADD CONSTRAINT golf_coach_philosophy_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coach_player_intent golf_coach_player_intent_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_player_intent
    ADD CONSTRAINT golf_coach_player_intent_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coach_player_intent golf_coach_player_intent_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coach_player_intent
    ADD CONSTRAINT golf_coach_player_intent_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_coaches golf_coaches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coaches
    ADD CONSTRAINT golf_coaches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: golf_coaches golf_coaches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coaches
    ADD CONSTRAINT golf_coaches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_coachhelm_chat_conversations golf_coachhelm_chat_conversations_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_chat_conversations
    ADD CONSTRAINT golf_coachhelm_chat_conversations_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coachhelm_chat_messages golf_coachhelm_chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_chat_messages
    ADD CONSTRAINT golf_coachhelm_chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.golf_coachhelm_chat_conversations(id) ON DELETE CASCADE;


--
-- Name: golf_coachhelm_coach_weights golf_coachhelm_coach_weights_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_coach_weights
    ADD CONSTRAINT golf_coachhelm_coach_weights_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coachhelm_llm_budget golf_coachhelm_llm_budget_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_llm_budget
    ADD CONSTRAINT golf_coachhelm_llm_budget_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coachhelm_llm_calls golf_coachhelm_llm_calls_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_llm_calls
    ADD CONSTRAINT golf_coachhelm_llm_calls_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_coachhelm_llm_calls golf_coachhelm_llm_calls_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_llm_calls
    ADD CONSTRAINT golf_coachhelm_llm_calls_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE SET NULL;


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_settings
    ADD CONSTRAINT golf_coachhelm_settings_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_settings
    ADD CONSTRAINT golf_coachhelm_settings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE SET NULL;


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_coachhelm_settings
    ADD CONSTRAINT golf_coachhelm_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_conversation_participants golf_conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_conversation_participants
    ADD CONSTRAINT golf_conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.golf_conversations(id) ON DELETE CASCADE;


--
-- Name: golf_conversation_participants golf_conversation_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_conversation_participants
    ADD CONSTRAINT golf_conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_conversations golf_conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_conversations
    ADD CONSTRAINT golf_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_conversations golf_conversations_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_conversations
    ADD CONSTRAINT golf_conversations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE SET NULL;


--
-- Name: golf_course_holes golf_course_holes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_course_holes
    ADD CONSTRAINT golf_course_holes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.golf_courses(id) ON DELETE CASCADE;


--
-- Name: golf_document_versions golf_document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_document_versions
    ADD CONSTRAINT golf_document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.golf_documents(id) ON DELETE CASCADE;


--
-- Name: golf_documents golf_documents_current_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_documents
    ADD CONSTRAINT golf_documents_current_version_id_fkey FOREIGN KEY (current_version_id) REFERENCES public.golf_document_versions(id);


--
-- Name: golf_documents golf_documents_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_documents
    ADD CONSTRAINT golf_documents_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_documents golf_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_documents
    ADD CONSTRAINT golf_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: golf_drills golf_drills_impacts_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_drills
    ADD CONSTRAINT golf_drills_impacts_metric_id_fkey FOREIGN KEY (impacts_metric_id) REFERENCES public.golf_metrics(metric_id);


--
-- Name: golf_event_attendance golf_event_attendance_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_attendance
    ADD CONSTRAINT golf_event_attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.golf_events(id) ON DELETE CASCADE;


--
-- Name: golf_event_attendance golf_event_attendance_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_attendance
    ADD CONSTRAINT golf_event_attendance_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_event_documents golf_event_documents_attached_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_documents
    ADD CONSTRAINT golf_event_documents_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_event_documents golf_event_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_documents
    ADD CONSTRAINT golf_event_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.golf_documents(id) ON DELETE CASCADE;


--
-- Name: golf_event_documents golf_event_documents_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_event_documents
    ADD CONSTRAINT golf_event_documents_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.golf_events(id) ON DELETE CASCADE;


--
-- Name: golf_events golf_events_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_events
    ADD CONSTRAINT golf_events_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.golf_courses(id) ON DELETE SET NULL;


--
-- Name: golf_events golf_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_events
    ADD CONSTRAINT golf_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_events golf_events_parent_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_events
    ADD CONSTRAINT golf_events_parent_event_id_fkey FOREIGN KEY (parent_event_id) REFERENCES public.golf_events(id) ON DELETE CASCADE;


--
-- Name: golf_events golf_events_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_events
    ADD CONSTRAINT golf_events_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_goal_suggestions golf_goal_suggestions_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goal_suggestions
    ADD CONSTRAINT golf_goal_suggestions_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.golf_metrics(metric_id);


--
-- Name: golf_goal_suggestions golf_goal_suggestions_origin_insight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goal_suggestions
    ADD CONSTRAINT golf_goal_suggestions_origin_insight_id_fkey FOREIGN KEY (origin_insight_id) REFERENCES public.golf_coach_insights(id);


--
-- Name: golf_goal_suggestions golf_goal_suggestions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goal_suggestions
    ADD CONSTRAINT golf_goal_suggestions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_goals golf_goals_coach_id_if_assigned_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goals
    ADD CONSTRAINT golf_goals_coach_id_if_assigned_fkey FOREIGN KEY (coach_id_if_assigned) REFERENCES public.golf_coaches(id);


--
-- Name: golf_goals golf_goals_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goals
    ADD CONSTRAINT golf_goals_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: golf_goals golf_goals_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goals
    ADD CONSTRAINT golf_goals_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.golf_metrics(metric_id);


--
-- Name: golf_goals golf_goals_origin_insight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goals
    ADD CONSTRAINT golf_goals_origin_insight_id_fkey FOREIGN KEY (origin_insight_id) REFERENCES public.golf_coach_insights(id);


--
-- Name: golf_goals golf_goals_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goals
    ADD CONSTRAINT golf_goals_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_goals golf_goals_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_goals
    ADD CONSTRAINT golf_goals_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE SET NULL;


--
-- Name: golf_holes golf_holes_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_holes
    ADD CONSTRAINT golf_holes_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.golf_rounds(id) ON DELETE CASCADE;


--
-- Name: golf_ingest_connections golf_ingest_connections_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_ingest_connections
    ADD CONSTRAINT golf_ingest_connections_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_insight_drill_attachments golf_insight_drill_attachments_drill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_drill_attachments
    ADD CONSTRAINT golf_insight_drill_attachments_drill_id_fkey FOREIGN KEY (drill_id) REFERENCES public.golf_drills(id) ON DELETE CASCADE;


--
-- Name: golf_insight_drill_attachments golf_insight_drill_attachments_insight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_drill_attachments
    ADD CONSTRAINT golf_insight_drill_attachments_insight_id_fkey FOREIGN KEY (insight_id) REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE;


--
-- Name: golf_insight_effectiveness golf_insight_effectiveness_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_effectiveness
    ADD CONSTRAINT golf_insight_effectiveness_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_insight_generation_log golf_insight_generation_log_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_generation_log
    ADD CONSTRAINT golf_insight_generation_log_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_insight_generation_log golf_insight_generation_log_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_generation_log
    ADD CONSTRAINT golf_insight_generation_log_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_insight_outcome_attribution golf_insight_outcome_attribution_insight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_outcome_attribution
    ADD CONSTRAINT golf_insight_outcome_attribution_insight_id_fkey FOREIGN KEY (insight_id) REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE;


--
-- Name: golf_insight_outcome_attribution golf_insight_outcome_attribution_target_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_outcome_attribution
    ADD CONSTRAINT golf_insight_outcome_attribution_target_metric_id_fkey FOREIGN KEY (target_metric_id) REFERENCES public.golf_metrics(metric_id);


--
-- Name: golf_insight_player_feedback golf_insight_player_feedback_insight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_player_feedback
    ADD CONSTRAINT golf_insight_player_feedback_insight_id_fkey FOREIGN KEY (insight_id) REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE;


--
-- Name: golf_insight_player_feedback golf_insight_player_feedback_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_insight_player_feedback
    ADD CONSTRAINT golf_insight_player_feedback_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_message_attachments golf_message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_message_attachments
    ADD CONSTRAINT golf_message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.golf_messages(id) ON DELETE CASCADE;


--
-- Name: golf_messages golf_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_messages
    ADD CONSTRAINT golf_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.golf_conversations(id) ON DELETE CASCADE;


--
-- Name: golf_messages golf_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_messages
    ADD CONSTRAINT golf_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_patterns_v2 golf_patterns_v2_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_patterns_v2
    ADD CONSTRAINT golf_patterns_v2_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_patterns_v2 golf_patterns_v2_validator_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_patterns_v2
    ADD CONSTRAINT golf_patterns_v2_validator_coach_id_fkey FOREIGN KEY (validator_coach_id) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_percentile_cache golf_percentile_cache_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_percentile_cache
    ADD CONSTRAINT golf_percentile_cache_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_pga_standards golf_pga_standards_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_pga_standards
    ADD CONSTRAINT golf_pga_standards_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.golf_metrics(metric_id) ON DELETE RESTRICT;


--
-- Name: golf_player_attendance_stats golf_player_attendance_stats_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_attendance_stats
    ADD CONSTRAINT golf_player_attendance_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_attendance_stats golf_player_attendance_stats_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_attendance_stats
    ADD CONSTRAINT golf_player_attendance_stats_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_player_baselines golf_player_baselines_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_baselines
    ADD CONSTRAINT golf_player_baselines_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_classes golf_player_classes_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_classes
    ADD CONSTRAINT golf_player_classes_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_classes golf_player_classes_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_classes
    ADD CONSTRAINT golf_player_classes_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE SET NULL;


--
-- Name: golf_player_courses golf_player_courses_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_courses
    ADD CONSTRAINT golf_player_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.golf_courses(id) ON DELETE SET NULL;


--
-- Name: golf_player_courses golf_player_courses_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_courses
    ADD CONSTRAINT golf_player_courses_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_focus_areas golf_player_focus_areas_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_focus_areas
    ADD CONSTRAINT golf_player_focus_areas_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_player_focus_areas golf_player_focus_areas_from_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_focus_areas
    ADD CONSTRAINT golf_player_focus_areas_from_review_id_fkey FOREIGN KEY (from_review_id) REFERENCES public.golf_round_reviews(id) ON DELETE SET NULL;


--
-- Name: golf_player_focus_areas golf_player_focus_areas_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_focus_areas
    ADD CONSTRAINT golf_player_focus_areas_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_focus_areas golf_player_focus_areas_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_focus_areas
    ADD CONSTRAINT golf_player_focus_areas_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE SET NULL;


--
-- Name: golf_player_genome golf_player_genome_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_genome
    ADD CONSTRAINT golf_player_genome_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_notification_state golf_player_notification_state_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_notification_state
    ADD CONSTRAINT golf_player_notification_state_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_standing golf_player_standing_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_standing
    ADD CONSTRAINT golf_player_standing_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.golf_metrics(metric_id) ON DELETE RESTRICT;


--
-- Name: golf_player_standing golf_player_standing_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_standing
    ADD CONSTRAINT golf_player_standing_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_player_stats_cache golf_player_stats_cache_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_player_stats_cache
    ADD CONSTRAINT golf_player_stats_cache_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_players golf_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_players
    ADD CONSTRAINT golf_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: golf_practice_sessions golf_practice_sessions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_practice_sessions
    ADD CONSTRAINT golf_practice_sessions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_prediction_model_performance golf_prediction_model_performance_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_prediction_model_performance
    ADD CONSTRAINT golf_prediction_model_performance_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_prediction_validations golf_prediction_validations_prediction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_prediction_validations
    ADD CONSTRAINT golf_prediction_validations_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES public.golf_predictions(id) ON DELETE CASCADE NOT VALID;


--
-- Name: golf_predictions golf_predictions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_predictions
    ADD CONSTRAINT golf_predictions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_predictions golf_predictions_related_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_predictions
    ADD CONSTRAINT golf_predictions_related_event_id_fkey FOREIGN KEY (related_event_id) REFERENCES public.golf_events(id) ON DELETE SET NULL;


--
-- Name: golf_predictions golf_predictions_related_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_predictions
    ADD CONSTRAINT golf_predictions_related_round_id_fkey FOREIGN KEY (related_round_id) REFERENCES public.golf_rounds(id) ON DELETE SET NULL;


--
-- Name: golf_qualifier_entries golf_qualifier_entries_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_entries
    ADD CONSTRAINT golf_qualifier_entries_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_qualifier_entries golf_qualifier_entries_qualifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_entries
    ADD CONSTRAINT golf_qualifier_entries_qualifier_id_fkey FOREIGN KEY (qualifier_id) REFERENCES public.golf_qualifiers(id) ON DELETE CASCADE;


--
-- Name: golf_qualifier_entries golf_qualifier_entries_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_entries
    ADD CONSTRAINT golf_qualifier_entries_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.golf_rounds(id) ON DELETE SET NULL;


--
-- Name: golf_qualifier_selections golf_qualifier_selections_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_selections
    ADD CONSTRAINT golf_qualifier_selections_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_qualifier_selections golf_qualifier_selections_qualifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_selections
    ADD CONSTRAINT golf_qualifier_selections_qualifier_id_fkey FOREIGN KEY (qualifier_id) REFERENCES public.golf_qualifiers(id) ON DELETE CASCADE;


--
-- Name: golf_qualifier_selections golf_qualifier_selections_selected_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifier_selections
    ADD CONSTRAINT golf_qualifier_selections_selected_by_user_id_fkey FOREIGN KEY (selected_by_user_id) REFERENCES public.users(id);


--
-- Name: golf_qualifiers golf_qualifiers_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifiers
    ADD CONSTRAINT golf_qualifiers_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.golf_courses(id) ON DELETE SET NULL;


--
-- Name: golf_qualifiers golf_qualifiers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifiers
    ADD CONSTRAINT golf_qualifiers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_qualifiers golf_qualifiers_target_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifiers
    ADD CONSTRAINT golf_qualifiers_target_tournament_id_fkey FOREIGN KEY (target_tournament_id) REFERENCES public.golf_events(id) ON DELETE SET NULL;


--
-- Name: golf_qualifiers golf_qualifiers_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_qualifiers
    ADD CONSTRAINT golf_qualifiers_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_recruits golf_recruits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_recruits
    ADD CONSTRAINT golf_recruits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_recruits golf_recruits_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_recruits
    ADD CONSTRAINT golf_recruits_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_review_events golf_review_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_review_events
    ADD CONSTRAINT golf_review_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: golf_review_events golf_review_events_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_review_events
    ADD CONSTRAINT golf_review_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_review_events golf_review_events_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_review_events
    ADD CONSTRAINT golf_review_events_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.golf_round_reviews(id) ON DELETE CASCADE;


--
-- Name: golf_round_reviews golf_round_reviews_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_reviews
    ADD CONSTRAINT golf_round_reviews_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_round_reviews golf_round_reviews_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_reviews
    ADD CONSTRAINT golf_round_reviews_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_round_reviews golf_round_reviews_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_reviews
    ADD CONSTRAINT golf_round_reviews_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.golf_rounds(id) ON DELETE CASCADE;


--
-- Name: golf_round_stats_cache golf_round_stats_cache_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_stats_cache
    ADD CONSTRAINT golf_round_stats_cache_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_round_stats_cache golf_round_stats_cache_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_round_stats_cache
    ADD CONSTRAINT golf_round_stats_cache_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.golf_rounds(id) ON DELETE CASCADE;


--
-- Name: golf_rounds golf_rounds_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_rounds
    ADD CONSTRAINT golf_rounds_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.golf_courses(id) ON DELETE SET NULL;


--
-- Name: golf_rounds golf_rounds_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_rounds
    ADD CONSTRAINT golf_rounds_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_rounds golf_rounds_qualifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_rounds
    ADD CONSTRAINT golf_rounds_qualifier_id_fkey FOREIGN KEY (qualifier_id) REFERENCES public.golf_qualifiers(id) ON DELETE SET NULL;


--
-- Name: golf_rounds golf_rounds_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_rounds
    ADD CONSTRAINT golf_rounds_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE SET NULL;


--
-- Name: golf_shots golf_shots_hole_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_shots
    ADD CONSTRAINT golf_shots_hole_id_fkey FOREIGN KEY (hole_id) REFERENCES public.golf_holes(id) ON DELETE CASCADE;


--
-- Name: golf_shots golf_shots_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_shots
    ADD CONSTRAINT golf_shots_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.golf_rounds(id) ON DELETE CASCADE;


--
-- Name: golf_task_assignments golf_task_assignments_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_assignments
    ADD CONSTRAINT golf_task_assignments_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_task_assignments golf_task_assignments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_assignments
    ADD CONSTRAINT golf_task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.golf_tasks(id) ON DELETE CASCADE;


--
-- Name: golf_task_reminders golf_task_reminders_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_reminders
    ADD CONSTRAINT golf_task_reminders_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.golf_tasks(id) ON DELETE CASCADE;


--
-- Name: golf_task_templates golf_task_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_templates
    ADD CONSTRAINT golf_task_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: golf_task_templates golf_task_templates_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_task_templates
    ADD CONSTRAINT golf_task_templates_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_tasks golf_tasks_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_tasks
    ADD CONSTRAINT golf_tasks_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_tasks golf_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_tasks
    ADD CONSTRAINT golf_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_tasks golf_tasks_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_tasks
    ADD CONSTRAINT golf_tasks_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_team_coach_staff golf_team_coach_staff_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coach_staff
    ADD CONSTRAINT golf_team_coach_staff_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;


--
-- Name: golf_team_coach_staff golf_team_coach_staff_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coach_staff
    ADD CONSTRAINT golf_team_coach_staff_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_team_coachhelm_settings golf_team_coachhelm_settings_disabled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coachhelm_settings
    ADD CONSTRAINT golf_team_coachhelm_settings_disabled_by_fkey FOREIGN KEY (disabled_by) REFERENCES public.users(id);


--
-- Name: golf_team_coachhelm_settings golf_team_coachhelm_settings_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_coachhelm_settings
    ADD CONSTRAINT golf_team_coachhelm_settings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_team_join_requests golf_team_join_requests_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_join_requests
    ADD CONSTRAINT golf_team_join_requests_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_team_join_requests golf_team_join_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_join_requests
    ADD CONSTRAINT golf_team_join_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_team_join_requests golf_team_join_requests_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_join_requests
    ADD CONSTRAINT golf_team_join_requests_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_team_members golf_team_members_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_members
    ADD CONSTRAINT golf_team_members_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_team_members golf_team_members_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_members
    ADD CONSTRAINT golf_team_members_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_team_members golf_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_members
    ADD CONSTRAINT golf_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_team_settings golf_team_settings_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_team_settings
    ADD CONSTRAINT golf_team_settings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_teams golf_teams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_teams
    ADD CONSTRAINT golf_teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.golf_coaches(id) ON DELETE SET NULL;


--
-- Name: golf_teams golf_teams_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_teams
    ADD CONSTRAINT golf_teams_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: golf_travel_budgets golf_travel_budgets_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_budgets
    ADD CONSTRAINT golf_travel_budgets_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.golf_travel_itineraries(id) ON DELETE CASCADE;


--
-- Name: golf_travel_expenses golf_travel_expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_expenses
    ADD CONSTRAINT golf_travel_expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: golf_travel_expenses golf_travel_expenses_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_expenses
    ADD CONSTRAINT golf_travel_expenses_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.golf_travel_itineraries(id) ON DELETE CASCADE;


--
-- Name: golf_travel_expenses golf_travel_expenses_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_expenses
    ADD CONSTRAINT golf_travel_expenses_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_travel_itineraries golf_travel_itineraries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_itineraries
    ADD CONSTRAINT golf_travel_itineraries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.golf_coaches(id);


--
-- Name: golf_travel_itineraries golf_travel_itineraries_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_itineraries
    ADD CONSTRAINT golf_travel_itineraries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.golf_events(id) ON DELETE SET NULL;


--
-- Name: golf_travel_itineraries golf_travel_itineraries_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_travel_itineraries
    ADD CONSTRAINT golf_travel_itineraries_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;


--
-- Name: golf_validations golf_validations_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_validations
    ADD CONSTRAINT golf_validations_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;


--
-- Name: golf_validations golf_validations_prediction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_validations
    ADD CONSTRAINT golf_validations_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES public.golf_predictions(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: putt_details putt_details_shot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.putt_details
    ADD CONSTRAINT putt_details_shot_id_fkey FOREIGN KEY (shot_id) REFERENCES public.golf_shots(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: golf_prediction_validations Admins and coaches can view validations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and coaches can view validations" ON public.golf_prediction_validations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::public.user_role, 'coach'::public.user_role]))))));


--
-- Name: crm_events Admins can delete CRM events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete CRM events" ON public.crm_events FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_automations Admins can delete automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete automations" ON public.crm_automations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_coaches Admins can delete coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete coaches" ON public.crm_coaches FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_contact_log Admins can delete contact logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete contact logs" ON public.crm_contact_log FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_notes Admins can delete notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete notes" ON public.crm_notes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_google_calendar_tokens Admins can delete own calendar tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete own calendar tokens" ON public.crm_google_calendar_tokens FOR DELETE USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role))))));


--
-- Name: crm_replies Admins can delete replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete replies" ON public.crm_replies FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_segments Admins can delete segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete segments" ON public.crm_segments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_enrollments Admins can delete sequence enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete sequence enrollments" ON public.crm_sequence_enrollments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_steps Admins can delete sequence steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete sequence steps" ON public.crm_sequence_steps FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequences Admins can delete sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete sequences" ON public.crm_sequences FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_email_suppressions Admins can delete suppressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete suppressions" ON public.crm_email_suppressions FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_tasks Admins can delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete tasks" ON public.crm_tasks FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_events Admins can insert CRM events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert CRM events" ON public.crm_events FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_activity_log Admins can insert activity log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert activity log" ON public.crm_activity_log FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_automations Admins can insert automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert automations" ON public.crm_automations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_coaches Admins can insert coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert coaches" ON public.crm_coaches FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_contact_log Admins can insert contact logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert contact logs" ON public.crm_contact_log FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_notes Admins can insert notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert notes" ON public.crm_notes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_google_calendar_tokens Admins can insert own calendar tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert own calendar tokens" ON public.crm_google_calendar_tokens FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role))))));


--
-- Name: crm_replies Admins can insert replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert replies" ON public.crm_replies FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_segments Admins can insert segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert segments" ON public.crm_segments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_enrollments Admins can insert sequence enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert sequence enrollments" ON public.crm_sequence_enrollments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_steps Admins can insert sequence steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert sequence steps" ON public.crm_sequence_steps FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequences Admins can insert sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert sequences" ON public.crm_sequences FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_email_suppressions Admins can insert suppressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert suppressions" ON public.crm_email_suppressions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_tasks Admins can insert tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert tasks" ON public.crm_tasks FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_email_templates Admins can manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage templates" ON public.crm_email_templates USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: admin_events Admins can read admin_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read admin_events" ON public.admin_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: admin_analytics_events Admins can read all analytics events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all analytics events" ON public.admin_analytics_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: admin_client_errors Admins can read all client errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all client errors" ON public.admin_client_errors FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: audit_log Admins can read audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read audit logs" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: error_logs Admins can read error logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read error logs" ON public.error_logs FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: login_attempts Admins can read login attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read login attempts" ON public.login_attempts FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: crm_events Admins can update CRM events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update CRM events" ON public.crm_events FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: admin_events Admins can update admin_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update admin_events" ON public.admin_events FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_automations Admins can update automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update automations" ON public.crm_automations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_coaches Admins can update coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update coaches" ON public.crm_coaches FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_contact_log Admins can update contact logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update contact logs" ON public.crm_contact_log FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_notes Admins can update notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update notes" ON public.crm_notes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_google_calendar_tokens Admins can update own calendar tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update own calendar tokens" ON public.crm_google_calendar_tokens FOR UPDATE USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role))))));


--
-- Name: crm_replies Admins can update replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update replies" ON public.crm_replies FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_segments Admins can update segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update segments" ON public.crm_segments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_enrollments Admins can update sequence enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update sequence enrollments" ON public.crm_sequence_enrollments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_steps Admins can update sequence steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update sequence steps" ON public.crm_sequence_steps FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequences Admins can update sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update sequences" ON public.crm_sequences FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_email_suppressions Admins can update suppressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update suppressions" ON public.crm_email_suppressions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_tasks Admins can update tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update tasks" ON public.crm_tasks FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_activity_log Admins can view activity log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view activity log" ON public.crm_activity_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_events Admins can view all CRM events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all CRM events" ON public.crm_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_automations Admins can view all automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all automations" ON public.crm_automations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_coaches Admins can view all coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all coaches" ON public.crm_coaches FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_contact_log Admins can view all contact logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all contact logs" ON public.crm_contact_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_notes Admins can view all notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all notes" ON public.crm_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_replies Admins can view all replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all replies" ON public.crm_replies FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_segments Admins can view all segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all segments" ON public.crm_segments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_enrollments Admins can view all sequence enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all sequence enrollments" ON public.crm_sequence_enrollments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequence_steps Admins can view all sequence steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all sequence steps" ON public.crm_sequence_steps FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_sequences Admins can view all sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all sequences" ON public.crm_sequences FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_email_suppressions Admins can view all suppressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all suppressions" ON public.crm_email_suppressions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_tasks Admins can view all tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all tasks" ON public.crm_tasks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: email_clicks Admins can view email clicks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view email clicks" ON public.email_clicks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: email_events Admins can view email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view email events" ON public.email_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: emails Admins can view emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view emails" ON public.emails FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: crm_google_calendar_tokens Admins can view own calendar tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view own calendar tokens" ON public.crm_google_calendar_tokens FOR SELECT USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role))))));


--
-- Name: demo_requests Anyone can create demo requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create demo requests" ON public.demo_requests FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: baseball_team_invitations Anyone can view active invitations by code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active invitations by code" ON public.baseball_team_invitations FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: golf_course_holes Anyone can view course holes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view course holes" ON public.golf_course_holes FOR SELECT TO authenticated USING (true);


--
-- Name: baseball_player_percentiles Anyone can view percentiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view percentiles" ON public.baseball_player_percentiles FOR SELECT TO authenticated USING (true);


--
-- Name: audit_log Authenticated users can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: golf_task_reminders Coaches can create team task reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can create team task reminders" ON public.golf_task_reminders FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.golf_tasks t
     JOIN public.golf_teams tm ON ((tm.id = t.team_id)))
     JOIN public.golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));


--
-- Name: baseball_box_score_batting Coaches can delete batting stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can delete batting stats" ON public.baseball_box_score_batting FOR DELETE USING (public.is_baseball_team_coach_v2(team_id));


--
-- Name: golf_document_versions Coaches can delete document versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can delete document versions" ON public.golf_document_versions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.golf_documents d
     JOIN public.golf_teams t ON ((d.team_id = t.id)))
     JOIN public.golf_coaches c ON ((t.organization_id = c.organization_id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (c.user_id = auth.uid())))));


--
-- Name: baseball_games Coaches can delete games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can delete games" ON public.baseball_games FOR DELETE USING (public.is_baseball_team_coach_v2(team_id));


--
-- Name: baseball_box_score_pitching Coaches can delete pitching stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can delete pitching stats" ON public.baseball_box_score_pitching FOR DELETE USING (public.is_baseball_team_coach_v2(team_id));


--
-- Name: golf_task_reminders Coaches can delete team task reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can delete team task reminders" ON public.golf_task_reminders FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((public.golf_tasks t
     JOIN public.golf_teams tm ON ((tm.id = t.team_id)))
     JOIN public.golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));


--
-- Name: baseball_box_score_batting Coaches can insert batting stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can insert batting stats" ON public.baseball_box_score_batting FOR INSERT WITH CHECK (public.is_baseball_team_coach_v2(team_id));


--
-- Name: golf_document_versions Coaches can insert document versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can insert document versions" ON public.golf_document_versions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.golf_documents d
     JOIN public.golf_teams t ON ((d.team_id = t.id)))
     JOIN public.golf_coaches c ON ((t.organization_id = c.organization_id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (c.user_id = auth.uid())))));


--
-- Name: baseball_games Coaches can insert games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can insert games" ON public.baseball_games FOR INSERT WITH CHECK (public.is_baseball_team_coach_v2(team_id));


--
-- Name: golf_insight_generation_log Coaches can insert generation logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can insert generation logs" ON public.golf_insight_generation_log FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_insight_generation_log.team_id)))));


--
-- Name: baseball_box_score_pitching Coaches can insert pitching stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can insert pitching stats" ON public.baseball_box_score_pitching FOR INSERT WITH CHECK (public.is_baseball_team_coach_v2(team_id));


--
-- Name: golf_announcements Coaches can manage announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage announcements" ON public.golf_announcements TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_announcements.team_id)))));


--
-- Name: golf_course_holes Coaches can manage course holes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage course holes" ON public.golf_course_holes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches c
  WHERE (c.user_id = auth.uid()))));


--
-- Name: golf_academic_exclusions Coaches can manage exclusions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage exclusions" ON public.golf_academic_exclusions TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.golf_team_members tm
     JOIN public.golf_team_coach_staff tcs ON ((tcs.team_id = tm.team_id)))
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((tm.player_id = golf_academic_exclusions.player_id) AND (c.user_id = auth.uid())))));


--
-- Name: baseball_lineup_positions Coaches can manage lineup positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage lineup positions" ON public.baseball_lineup_positions TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.baseball_team_lineups l
     JOIN public.baseball_team_coach_staff tcs ON ((tcs.team_id = l.team_id)))
     JOIN public.baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((l.id = baseball_lineup_positions.lineup_id) AND (c.user_id = auth.uid())))));


--
-- Name: baseball_player_stats Coaches can manage player stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage player stats" ON public.baseball_player_stats TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff tcs
     JOIN public.baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = baseball_player_stats.team_id)))));


--
-- Name: golf_round_stats_cache Coaches can manage round stats cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage round stats cache" ON public.golf_round_stats_cache TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE ((gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: baseball_player_season_stats Coaches can manage season stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage season stats" ON public.baseball_player_season_stats USING (public.is_baseball_team_coach_v2(team_id)) WITH CHECK (public.is_baseball_team_coach_v2(team_id));


--
-- Name: golf_team_settings Coaches can manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage settings" ON public.golf_team_settings TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_team_settings.team_id)))));


--
-- Name: golf_player_stats_cache Coaches can manage team stats cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage team stats cache" ON public.golf_player_stats_cache TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE ((gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_coach_insights Coaches can manage their insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage their insights" ON public.golf_coach_insights TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = golf_coach_insights.coach_id)))) OR (EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_coach_insights.team_id)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = golf_coach_insights.coach_id)))) OR (EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_coach_insights.team_id))))));


--
-- Name: golf_coach_blocked_time Coaches can manage their own blocked time; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage their own blocked time" ON public.golf_coach_blocked_time TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = golf_coach_blocked_time.coach_id)))));


--
-- Name: baseball_coach_recruiting_philosophy Coaches can manage their own philosophy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage their own philosophy" ON public.baseball_coach_recruiting_philosophy TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = baseball_coach_recruiting_philosophy.coach_id)))));


--
-- Name: baseball_team_invitations Coaches can manage their team invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage their team invitations" ON public.baseball_team_invitations TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff tcs
     JOIN public.baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = baseball_team_invitations.team_id)))));


--
-- Name: baseball_team_lineups Coaches can manage their team lineups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage their team lineups" ON public.baseball_team_lineups TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff tcs
     JOIN public.baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = baseball_team_lineups.team_id)))));


--
-- Name: baseball_box_score_uploads Coaches can manage their uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage their uploads" ON public.baseball_box_score_uploads USING ((coach_id = ( SELECT baseball_coaches.id
   FROM public.baseball_coaches
  WHERE (baseball_coaches.user_id = auth.uid())
 LIMIT 1))) WITH CHECK ((coach_id = ( SELECT baseball_coaches.id
   FROM public.baseball_coaches
  WHERE (baseball_coaches.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: golf_travel_itineraries Coaches can manage travel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage travel" ON public.golf_travel_itineraries TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_travel_itineraries.team_id)))));


--
-- Name: golf_team_join_requests Coaches can review team join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can review team join requests" ON public.golf_team_join_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_coaches gc
     JOIN public.golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_team_join_requests.team_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.golf_coaches gc
     JOIN public.golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_team_join_requests.team_id)))));


--
-- Name: baseball_box_score_batting Coaches can update batting stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can update batting stats" ON public.baseball_box_score_batting FOR UPDATE USING (public.is_baseball_team_coach_v2(team_id));


--
-- Name: baseball_games Coaches can update games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can update games" ON public.baseball_games FOR UPDATE USING (public.is_baseball_team_coach_v2(team_id));


--
-- Name: baseball_box_score_pitching Coaches can update pitching stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can update pitching stats" ON public.baseball_box_score_pitching FOR UPDATE USING (public.is_baseball_team_coach_v2(team_id));


--
-- Name: golf_task_reminders Coaches can update team task reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can update team task reminders" ON public.golf_task_reminders FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((public.golf_tasks t
     JOIN public.golf_teams tm ON ((tm.id = t.team_id)))
     JOIN public.golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));


--
-- Name: golf_document_versions Coaches can view document versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view document versions" ON public.golf_document_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.golf_documents d
     JOIN public.golf_teams t ON ((d.team_id = t.id)))
     JOIN public.golf_coaches c ON ((t.organization_id = c.organization_id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (c.user_id = auth.uid())))));


--
-- Name: golf_player_attendance_stats Coaches can view golf attendance stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view golf attendance stats" ON public.golf_player_attendance_stats FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_coaches gc
     JOIN public.golf_teams gt ON ((gt.id = golf_player_attendance_stats.team_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gc.organization_id = gt.organization_id)))));


--
-- Name: golf_patterns_v2 Coaches can view patterns for their team players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view patterns for their team players" ON public.golf_patterns_v2 FOR SELECT TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE public.is_golf_team_coach(gtm.team_id))));


--
-- Name: golf_predictions Coaches can view predictions for their team players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view predictions for their team players" ON public.golf_predictions FOR SELECT TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE public.is_golf_team_coach(gtm.team_id))));


--
-- Name: golf_attendance_summary Coaches can view team attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view team attendance" ON public.golf_attendance_summary TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_attendance_summary.team_id)))));


--
-- Name: golf_team_join_requests Coaches can view team join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view team join requests" ON public.golf_team_join_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_coaches gc
     JOIN public.golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_team_join_requests.team_id)))));


--
-- Name: golf_player_courses Coaches can view team player courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view team player courses" ON public.golf_player_courses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.golf_team_members gtm
     JOIN public.golf_team_coach_staff tcs ON ((tcs.team_id = gtm.team_id)))
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((gtm.player_id = golf_player_courses.player_id) AND (c.user_id = auth.uid())))));


--
-- Name: golf_player_stats_cache Coaches can view team player stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view team player stats" ON public.golf_player_stats_cache FOR SELECT TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE ((gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_round_stats_cache Coaches can view team round stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view team round stats" ON public.golf_round_stats_cache FOR SELECT TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE ((gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_task_reminders Coaches can view team task reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view team task reminders" ON public.golf_task_reminders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.golf_tasks t
     JOIN public.golf_teams tm ON ((tm.id = t.team_id)))
     JOIN public.golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));


--
-- Name: golf_coach_insights Coaches can view their own insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view their own insights" ON public.golf_coach_insights FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = golf_coach_insights.coach_id)))) OR (EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_coach_insights.team_id))))));


--
-- Name: golf_learned_behavior Coaches can view their own learned behavior; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view their own learned behavior" ON public.golf_learned_behavior FOR SELECT USING (((entity_type = 'coach'::text) AND (entity_id IN ( SELECT golf_coaches.id
   FROM public.golf_coaches
  WHERE (golf_coaches.user_id = auth.uid())))));


--
-- Name: golf_insight_generation_log Coaches can view their team logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view their team logs" ON public.golf_insight_generation_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_insight_generation_log.team_id)))));


--
-- Name: golf_validations Coaches can view validations for their team players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view validations for their team players" ON public.golf_validations FOR SELECT USING ((player_id IN ( SELECT gp.id
   FROM (((public.golf_players gp
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: email_clicks No direct deletes by users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct deletes by users" ON public.email_clicks FOR DELETE USING (false);


--
-- Name: emails No direct deletes by users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct deletes by users" ON public.emails FOR DELETE USING (false);


--
-- Name: email_clicks No direct inserts by users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct inserts by users" ON public.email_clicks FOR INSERT WITH CHECK (false);


--
-- Name: emails No direct inserts by users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct inserts by users" ON public.emails FOR INSERT WITH CHECK (false);


--
-- Name: email_clicks No direct updates by users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct updates by users" ON public.email_clicks FOR UPDATE USING (false);


--
-- Name: emails No direct updates by users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct updates by users" ON public.emails FOR UPDATE USING (false);


--
-- Name: golf_team_join_requests Players can cancel their pending requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can cancel their pending requests" ON public.golf_team_join_requests FOR DELETE TO authenticated USING (((status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_team_join_requests.player_id) AND (gp.user_id = auth.uid()))))));


--
-- Name: golf_team_join_requests Players can create their own join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can create their own join requests" ON public.golf_team_join_requests FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_team_join_requests.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_round_reviews Players can create their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can create their own reviews" ON public.golf_round_reviews FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_round_reviews.player_id)))));


--
-- Name: golf_team_members Players can join teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can join teams" ON public.golf_team_members FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_team_members.player_id) AND (gp.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.golf_teams gt
  WHERE ((gt.id = golf_team_members.team_id) AND (gt.join_code IS NOT NULL))))));


--
-- Name: golf_team_members Players can leave teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can leave teams" ON public.golf_team_members FOR DELETE TO authenticated USING ((player_id = public.get_current_golf_player_id()));


--
-- Name: golf_player_courses Players can manage their golf courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can manage their golf courses" ON public.golf_player_courses TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = golf_player_courses.player_id)))));


--
-- Name: golf_round_reviews Players can update their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can update their own reviews" ON public.golf_round_reviews FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_round_reviews.player_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_round_reviews.player_id)))));


--
-- Name: golf_document_versions Players can view document versions for visible docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view document versions for visible docs" ON public.golf_document_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.golf_documents d
     JOIN public.golf_team_members tm ON ((d.team_id = tm.team_id)))
     JOIN public.golf_players p ON ((tm.player_id = p.id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (d.is_public = true) AND (p.user_id = auth.uid())))));


--
-- Name: baseball_lineup_positions Players can view lineup positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view lineup positions" ON public.baseball_lineup_positions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.baseball_team_lineups l
     JOIN public.baseball_team_members tm ON ((tm.team_id = l.team_id)))
     JOIN public.baseball_players p ON ((p.id = tm.player_id)))
  WHERE ((l.id = baseball_lineup_positions.lineup_id) AND (p.user_id = auth.uid())))));


--
-- Name: golf_round_stats_cache Players can view own round stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view own round stats" ON public.golf_round_stats_cache FOR SELECT TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: golf_player_stats_cache Players can view own stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view own stats" ON public.golf_player_stats_cache FOR SELECT TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: golf_player_stats_cache Players can view teammates stats cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view teammates stats cache" ON public.golf_player_stats_cache FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.golf_team_members me
     JOIN public.golf_team_members teammate ON ((teammate.team_id = me.team_id)))
     JOIN public.golf_players gp ON ((gp.id = me.player_id)))
  WHERE ((gp.user_id = auth.uid()) AND (me.status = 'active'::public.team_member_status) AND (teammate.status = 'active'::public.team_member_status) AND (teammate.player_id = golf_player_stats_cache.player_id)))));


--
-- Name: golf_attendance_summary Players can view their own attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own attendance" ON public.golf_attendance_summary FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_attendance_summary.player_id)))));


--
-- Name: golf_player_attendance_stats Players can view their own attendance stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own attendance stats" ON public.golf_player_attendance_stats FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = golf_player_attendance_stats.player_id)))));


--
-- Name: golf_academic_exclusions Players can view their own exclusions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own exclusions" ON public.golf_academic_exclusions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_academic_exclusions.player_id)))));


--
-- Name: golf_team_join_requests Players can view their own join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own join requests" ON public.golf_team_join_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_team_join_requests.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_learned_behavior Players can view their own learned behavior; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own learned behavior" ON public.golf_learned_behavior FOR SELECT USING (((entity_type = 'player'::text) AND (entity_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid())))));


--
-- Name: golf_patterns_v2 Players can view their own patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own patterns" ON public.golf_patterns_v2 FOR SELECT TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: golf_predictions Players can view their own predictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own predictions" ON public.golf_predictions FOR SELECT TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: baseball_player_stats Players can view their own stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their own stats" ON public.baseball_player_stats FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = baseball_player_stats.player_id)))));


--
-- Name: baseball_team_lineups Players can view their team lineups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can view their team lineups" ON public.baseball_team_lineups FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_members tm
     JOIN public.baseball_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = baseball_team_lineups.team_id)))));


--
-- Name: golf_player_notification_state Players manage own notification state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players manage own notification state" ON public.golf_player_notification_state USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: baseball_box_score_batting Players see own + coaches see team batting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players see own + coaches see team batting" ON public.baseball_box_score_batting FOR SELECT USING (((player_id = ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid())
 LIMIT 1)) OR public.is_baseball_team_coach_v2(team_id)));


--
-- Name: baseball_box_score_pitching Players see own + coaches see team pitching; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players see own + coaches see team pitching" ON public.baseball_box_score_pitching FOR SELECT USING (((player_id = ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid())
 LIMIT 1)) OR public.is_baseball_team_coach_v2(team_id)));


--
-- Name: baseball_player_season_stats Players see own + coaches see team season stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players see own + coaches see team season stats" ON public.baseball_player_season_stats FOR SELECT USING (((player_id = ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid())
 LIMIT 1)) OR public.is_baseball_team_coach_v2(team_id)));


--
-- Name: admin_events Service role can insert admin_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert admin_events" ON public.admin_events FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: golf_patterns_v2 Service role can insert patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert patterns" ON public.golf_patterns_v2 FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: admin_events Service role can manage admin_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage admin_events" ON public.admin_events TO service_role USING (true);


--
-- Name: audit_log Service role can manage audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage audit logs" ON public.audit_log TO service_role USING (true);


--
-- Name: demo_requests Service role can manage demo requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage demo requests" ON public.demo_requests TO service_role USING (true);


--
-- Name: error_logs Service role can manage error logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage error logs" ON public.error_logs TO service_role USING (true);


--
-- Name: golf_learned_behavior Service role can manage learned behavior; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage learned behavior" ON public.golf_learned_behavior USING ((auth.role() = 'service_role'::text));


--
-- Name: login_attempts Service role can manage login attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage login attempts" ON public.login_attempts TO service_role USING (true);


--
-- Name: golf_predictions Service role can manage predictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage predictions" ON public.golf_predictions TO authenticated USING ((auth.role() = 'service_role'::text));


--
-- Name: golf_validations Service role can manage validations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage validations" ON public.golf_validations USING ((auth.role() = 'service_role'::text));


--
-- Name: golf_patterns_v2 Service role can update patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update patterns" ON public.golf_patterns_v2 FOR UPDATE TO authenticated USING ((auth.role() = 'service_role'::text));


--
-- Name: device_tokens Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.device_tokens USING ((auth.role() = 'service_role'::text));


--
-- Name: golf_task_reminders Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.golf_task_reminders USING ((auth.role() = 'service_role'::text));


--
-- Name: push_subscriptions Service role full access on push_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on push_subscriptions" ON public.push_subscriptions USING ((auth.role() = 'service_role'::text));


--
-- Name: admin_api_perf_log Service role only for api perf log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only for api perf log" ON public.admin_api_perf_log USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));


--
-- Name: baseball_player_percentiles System can manage percentiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage percentiles" ON public.baseball_player_percentiles TO service_role USING (true);


--
-- Name: baseball_games Team members and coaches can view games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members and coaches can view games" ON public.baseball_games FOR SELECT USING ((public.is_baseball_team_member_v2(team_id) OR public.is_baseball_team_coach_v2(team_id)));


--
-- Name: golf_announcements Team members can view announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can view announcements" ON public.golf_announcements FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_announcements.team_id)))) OR (EXISTS ( SELECT 1
   FROM (public.golf_team_members tm
     JOIN public.golf_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = golf_announcements.team_id))))));


--
-- Name: golf_team_settings Team members can view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can view settings" ON public.golf_team_settings FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_team_settings.team_id)))) OR (EXISTS ( SELECT 1
   FROM (public.golf_team_members tm
     JOIN public.golf_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = golf_team_settings.team_id))))));


--
-- Name: golf_travel_itineraries Team members can view travel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can view travel" ON public.golf_travel_itineraries FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff tcs
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_travel_itineraries.team_id)))) OR (EXISTS ( SELECT 1
   FROM (public.golf_team_members tm
     JOIN public.golf_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = golf_travel_itineraries.team_id))))));


--
-- Name: golf_message_attachments Users can add attachments to their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add attachments to their own messages" ON public.golf_message_attachments FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_messages m
  WHERE ((m.id = golf_message_attachments.message_id) AND (m.sender_id = auth.uid())))));


--
-- Name: push_subscriptions Users can create own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own push subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscriptions Users can delete own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: device_tokens Users can delete own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tokens" ON public.device_tokens FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: golf_message_attachments Users can delete their own attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own attachments" ON public.golf_message_attachments FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_messages m
  WHERE ((m.id = golf_message_attachments.message_id) AND (m.sender_id = auth.uid())))));


--
-- Name: admin_analytics_events Users can insert own analytics events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own analytics events" ON public.admin_analytics_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: admin_client_errors Users can insert own client errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own client errors" ON public.admin_client_errors FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: device_tokens Users can insert own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tokens" ON public.device_tokens FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: baseball_messages Users can send baseball messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send baseball messages" ON public.baseball_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.baseball_conversation_participants cp
  WHERE ((cp.conversation_id = cp.conversation_id) AND (cp.user_id = auth.uid()))))));


--
-- Name: baseball_messages Users can update baseball message read status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update baseball message read status" ON public.baseball_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_conversation_participants cp
  WHERE ((cp.conversation_id = cp.conversation_id) AND (cp.user_id = auth.uid())))));


--
-- Name: push_subscriptions Users can update own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own push subscriptions" ON public.push_subscriptions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: device_tokens Users can update own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tokens" ON public.device_tokens FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: golf_calendar_notifications Users can update their golf notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their golf notifications" ON public.golf_calendar_notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: golf_message_attachments Users can view attachments in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view attachments in their conversations" ON public.golf_message_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_messages m
     JOIN public.golf_conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = golf_message_attachments.message_id) AND (cp.user_id = auth.uid())))));


--
-- Name: baseball_messages Users can view baseball messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view baseball messages" ON public.baseball_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_conversation_participants cp
  WHERE ((cp.conversation_id = cp.conversation_id) AND (cp.user_id = auth.uid())))));


--
-- Name: push_subscriptions Users can view own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own push subscriptions" ON public.push_subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: device_tokens Users can view own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tokens" ON public.device_tokens FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: golf_review_events Users can view relevant review events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant review events" ON public.golf_review_events FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ((public.golf_coaches gc
     JOIN public.golf_teams gt ON ((gt.organization_id = gc.organization_id)))
     JOIN public.golf_team_members gtm ON ((gtm.team_id = gt.id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.player_id = golf_review_events.player_id)))) OR (EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = golf_review_events.player_id))))));


--
-- Name: golf_calendar_notifications Users can view their golf calendar notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their golf calendar notifications" ON public.golf_calendar_notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: admin_analytics_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_analytics_events ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_api_perf_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_api_perf_log ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_client_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_client_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_events ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_announcements admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_announcements FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_attendance_summary admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_attendance_summary FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_coach_insights admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_coach_insights FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_coach_philosophy admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_coach_philosophy FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_documents admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_documents FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_events admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_events FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_insight_generation_log admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_insight_generation_log FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_messages admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_messages FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_patterns_v2 admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_patterns_v2 FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_player_stats_cache admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_player_stats_cache FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_players admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_players FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_predictions admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_predictions FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_qualifiers admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_qualifiers FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_round_reviews admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_round_reviews FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_rounds admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_rounds FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_shots admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_shots FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_tasks admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_tasks FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_team_members admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_team_members FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_teams admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_teams FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_travel_itineraries admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.golf_travel_itineraries FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: users admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all ON public.users FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_announcement_documents ann_documents_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ann_documents_select_team ON public.golf_announcement_documents FOR SELECT TO authenticated USING ((announcement_id IN ( SELECT a.id
   FROM public.golf_announcements a
  WHERE (public.is_golf_team_coach(a.team_id) OR public.is_golf_team_player(a.team_id)))));


--
-- Name: golf_announcement_tasks ann_tasks_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ann_tasks_select_team ON public.golf_announcement_tasks FOR SELECT TO authenticated USING ((announcement_id IN ( SELECT a.id
   FROM public.golf_announcements a
  WHERE (public.is_golf_team_coach(a.team_id) OR public.is_golf_team_player(a.team_id)))));


--
-- Name: api_call_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: api_call_logs api_call_logs_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_call_logs_admin_read ON public.api_call_logs FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: api_call_logs api_call_logs_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_call_logs_service_write ON public.api_call_logs TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: approach_miss_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approach_miss_details ENABLE ROW LEVEL SECURITY;

--
-- Name: approach_miss_details approach_miss_details_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approach_miss_details_delete_own ON public.approach_miss_details FOR DELETE TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: approach_miss_details approach_miss_details_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approach_miss_details_insert_own ON public.approach_miss_details FOR INSERT TO authenticated WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: approach_miss_details approach_miss_details_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approach_miss_details_select_own ON public.approach_miss_details FOR SELECT TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: approach_miss_details approach_miss_details_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approach_miss_details_select_team ON public.approach_miss_details FOR SELECT TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM ((((((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: approach_miss_details approach_miss_details_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approach_miss_details_update_own ON public.approach_miss_details FOR UPDATE TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))) WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: golf_insight_outcome_attribution attribution_coach_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attribution_coach_read ON public.golf_insight_outcome_attribution FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coach_insights i
  WHERE ((i.id = golf_insight_outcome_attribution.insight_id) AND (i.coach_id = public.current_coach_id())))));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_metrics_hourly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_metrics_hourly ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_metrics_hourly auth_metrics_hourly_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_metrics_hourly_admin_read ON public.auth_metrics_hourly FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: auth_metrics_hourly auth_metrics_hourly_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_metrics_hourly_service_write ON public.auth_metrics_hourly TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: auth_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: background_job_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.background_job_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: background_job_logs background_job_logs_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY background_job_logs_admin_read ON public.background_job_logs FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: background_job_logs background_job_logs_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY background_job_logs_service_write ON public.background_job_logs TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: baseball_academic_eligibility baseball_acad_elig_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_acad_elig_delete ON public.baseball_academic_eligibility FOR DELETE TO authenticated USING ((((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM public.baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND public.is_baseball_team_coach(btm.team_id))))));


--
-- Name: baseball_academic_eligibility baseball_acad_elig_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_acad_elig_insert ON public.baseball_academic_eligibility FOR INSERT TO authenticated WITH CHECK ((((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM public.baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND public.is_baseball_team_coach(btm.team_id))))));


--
-- Name: baseball_academic_eligibility baseball_acad_elig_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_acad_elig_select_coach ON public.baseball_academic_eligibility FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND public.is_baseball_team_coach(btm.team_id)))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id))));


--
-- Name: baseball_academic_eligibility baseball_acad_elig_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_acad_elig_select_player ON public.baseball_academic_eligibility FOR SELECT TO authenticated USING ((player_id IN ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));


--
-- Name: baseball_academic_eligibility baseball_acad_elig_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_acad_elig_update ON public.baseball_academic_eligibility FOR UPDATE TO authenticated USING ((((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM public.baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND public.is_baseball_team_coach(btm.team_id))))));


--
-- Name: baseball_academic_eligibility; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_academic_eligibility ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_aggregates baseball_aggregates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_aggregates_insert ON public.baseball_player_aggregates FOR INSERT TO authenticated WITH CHECK (((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)));


--
-- Name: baseball_player_aggregates baseball_aggregates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_aggregates_select ON public.baseball_player_aggregates FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_aggregates.player_id) AND (baseball_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id))));


--
-- Name: baseball_player_aggregates baseball_aggregates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_aggregates_update ON public.baseball_player_aggregates FOR UPDATE TO authenticated USING (((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)));


--
-- Name: baseball_announcement_acknowledgements baseball_ann_acks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_ann_acks_insert ON public.baseball_announcement_acknowledgements FOR INSERT TO authenticated WITH CHECK ((player_id = public.get_my_player_id()));


--
-- Name: baseball_announcement_acknowledgements baseball_ann_acks_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_ann_acks_select_coach ON public.baseball_announcement_acknowledgements FOR SELECT TO authenticated USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM public.baseball_announcements
  WHERE public.is_baseball_team_coach(baseball_announcements.team_id))));


--
-- Name: baseball_announcement_acknowledgements baseball_ann_acks_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_ann_acks_select_player ON public.baseball_announcement_acknowledgements FOR SELECT TO authenticated USING ((player_id = public.get_my_player_id()));


--
-- Name: baseball_announcement_recipients baseball_ann_recipients_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_ann_recipients_delete ON public.baseball_announcement_recipients FOR DELETE TO authenticated USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM public.baseball_announcements
  WHERE public.is_baseball_team_coach(baseball_announcements.team_id))));


--
-- Name: baseball_announcement_recipients baseball_ann_recipients_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_ann_recipients_insert ON public.baseball_announcement_recipients FOR INSERT TO authenticated WITH CHECK ((announcement_id IN ( SELECT baseball_announcements.id
   FROM public.baseball_announcements
  WHERE public.is_baseball_team_coach(baseball_announcements.team_id))));


--
-- Name: baseball_announcement_recipients baseball_ann_recipients_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_ann_recipients_select_coach ON public.baseball_announcement_recipients FOR SELECT TO authenticated USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM public.baseball_announcements
  WHERE public.is_baseball_team_coach(baseball_announcements.team_id))));


--
-- Name: baseball_announcement_recipients baseball_ann_recipients_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_ann_recipients_select_player ON public.baseball_announcement_recipients FOR SELECT TO authenticated USING ((player_id = public.get_my_player_id()));


--
-- Name: baseball_announcement_acknowledgements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_announcement_acknowledgements ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_announcement_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_announcement_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_announcements baseball_announcements_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_announcements_delete ON public.baseball_announcements FOR DELETE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_announcements baseball_announcements_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_announcements_insert ON public.baseball_announcements FOR INSERT TO authenticated WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_announcements baseball_announcements_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_announcements_select_coach ON public.baseball_announcements FOR SELECT TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_announcements baseball_announcements_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_announcements_select_player ON public.baseball_announcements FOR SELECT TO authenticated USING ((public.is_baseball_team_member(team_id) AND ((NOT (EXISTS ( SELECT 1
   FROM public.baseball_announcement_recipients
  WHERE (baseball_announcement_recipients.announcement_id = baseball_announcements.id)))) OR (EXISTS ( SELECT 1
   FROM public.baseball_announcement_recipients
  WHERE ((baseball_announcement_recipients.announcement_id = baseball_announcements.id) AND (baseball_announcement_recipients.player_id = public.get_my_player_id())))))));


--
-- Name: baseball_announcements baseball_announcements_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_announcements_update ON public.baseball_announcements FOR UPDATE TO authenticated USING (public.is_baseball_team_coach(team_id)) WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_box_score_batting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_box_score_batting ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_box_score_pitching; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_box_score_pitching ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_box_score_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_box_score_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_camp_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_camp_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_camp_registrations baseball_camp_regs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_camp_regs_insert ON public.baseball_camp_registrations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_camp_registrations baseball_camp_regs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_camp_regs_select ON public.baseball_camp_registrations FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.baseball_camps bc
     JOIN public.baseball_coaches bco ON ((bco.id = bc.coach_id)))
  WHERE ((bc.id = baseball_camp_registrations.camp_id) AND (bco.user_id = auth.uid()))))));


--
-- Name: baseball_camp_registrations baseball_camp_regs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_camp_regs_update ON public.baseball_camp_registrations FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.baseball_camps bc
     JOIN public.baseball_coaches bco ON ((bco.id = bc.coach_id)))
  WHERE ((bc.id = baseball_camp_registrations.camp_id) AND (bco.user_id = auth.uid()))))));


--
-- Name: baseball_camps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_camps ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_camps baseball_camps_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_camps_delete ON public.baseball_camps FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_camps baseball_camps_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_camps_insert ON public.baseball_camps FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_camps baseball_camps_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_camps_select ON public.baseball_camps FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))) OR (status = 'published'::text)));


--
-- Name: baseball_camps baseball_camps_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_camps_update ON public.baseball_camps FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_coach_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_coach_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_coach_philosophy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_coach_philosophy ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_coach_philosophy baseball_coach_philosophy_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_coach_philosophy_insert ON public.baseball_coach_philosophy FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_philosophy.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_coach_philosophy baseball_coach_philosophy_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_coach_philosophy_select ON public.baseball_coach_philosophy FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_philosophy.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_coach_philosophy baseball_coach_philosophy_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_coach_philosophy_update ON public.baseball_coach_philosophy FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_philosophy.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_coach_recruiting_philosophy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_coach_recruiting_philosophy ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_coaches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_coaches ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_coaches baseball_coaches_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_coaches_insert_own ON public.baseball_coaches FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: baseball_coaches baseball_coaches_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_coaches_select ON public.baseball_coaches FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (public.get_my_coach_id() IS NOT NULL)));


--
-- Name: baseball_coaches baseball_coaches_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_coaches_select_all ON public.baseball_coaches FOR SELECT TO authenticated USING (true);


--
-- Name: baseball_coaches baseball_coaches_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_coaches_update_own ON public.baseball_coaches FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: baseball_player_comparisons baseball_comparisons_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_comparisons_delete_own ON public.baseball_player_comparisons FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_player_comparisons baseball_comparisons_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_comparisons_insert_own ON public.baseball_player_comparisons FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_player_comparisons baseball_comparisons_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_comparisons_select_own ON public.baseball_player_comparisons FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_player_comparisons baseball_comparisons_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_comparisons_update_own ON public.baseball_player_comparisons FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_conversation_participants baseball_conversation_participants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_conversation_participants_select ON public.baseball_conversation_participants FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (conversation_id IN ( SELECT public.get_my_baseball_conversation_ids() AS get_my_baseball_conversation_ids))));


--
-- Name: baseball_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_conversations baseball_conversations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_conversations_insert ON public.baseball_conversations FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));


--
-- Name: baseball_conversations baseball_conversations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_conversations_select ON public.baseball_conversations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_conversations.id) AND (baseball_conversation_participants.user_id = auth.uid())))));


--
-- Name: baseball_developmental_plans baseball_dev_plans_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_dev_plans_delete_coach ON public.baseball_developmental_plans FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_developmental_plans baseball_dev_plans_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_dev_plans_insert_coach ON public.baseball_developmental_plans FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_developmental_plans baseball_dev_plans_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_dev_plans_select ON public.baseball_developmental_plans FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_developmental_plans.player_id) AND (baseball_players.user_id = auth.uid()))))));


--
-- Name: baseball_developmental_plans baseball_dev_plans_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_dev_plans_update_coach ON public.baseball_developmental_plans FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_developmental_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_developmental_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_document_versions baseball_document_versions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_document_versions_insert ON public.baseball_document_versions FOR INSERT TO authenticated WITH CHECK ((document_id IN ( SELECT baseball_documents.id
   FROM public.baseball_documents
  WHERE public.is_baseball_team_coach(baseball_documents.team_id))));


--
-- Name: baseball_document_versions baseball_document_versions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_document_versions_select ON public.baseball_document_versions FOR SELECT TO authenticated USING ((document_id IN ( SELECT baseball_documents.id
   FROM public.baseball_documents
  WHERE (public.is_baseball_team_coach(baseball_documents.team_id) OR ((baseball_documents.is_player_visible = true) AND public.is_baseball_team_player(baseball_documents.team_id))))));


--
-- Name: baseball_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_documents baseball_documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_documents_delete ON public.baseball_documents FOR DELETE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_documents baseball_documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_documents_insert ON public.baseball_documents FOR INSERT TO authenticated WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_documents baseball_documents_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_documents_select_coach ON public.baseball_documents FOR SELECT TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_documents baseball_documents_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_documents_select_player ON public.baseball_documents FOR SELECT TO authenticated USING (((is_player_visible = true) AND public.is_baseball_team_player(team_id)));


--
-- Name: baseball_documents baseball_documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_documents_update ON public.baseball_documents FOR UPDATE TO authenticated USING (public.is_baseball_team_coach(team_id)) WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_player_engagement_events baseball_engagement_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_engagement_insert ON public.baseball_player_engagement_events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_engagement_events.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_player_engagement_events baseball_engagement_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_engagement_select ON public.baseball_player_engagement_events FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_engagement_events.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_engagement_events.coach_id) AND (baseball_coaches.user_id = auth.uid()))))));


--
-- Name: baseball_event_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_event_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_event_attendance baseball_event_attendance_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_event_attendance_delete_coach ON public.baseball_event_attendance FOR DELETE TO authenticated USING ((event_id IN ( SELECT baseball_events.id
   FROM public.baseball_events
  WHERE public.is_baseball_team_coach(baseball_events.team_id))));


--
-- Name: baseball_event_attendance baseball_event_attendance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_event_attendance_insert ON public.baseball_event_attendance FOR INSERT TO authenticated WITH CHECK (((event_id IN ( SELECT be.id
   FROM public.baseball_events be
  WHERE public.is_baseball_team_coach(be.team_id))) OR (player_id = public.get_my_player_id())));


--
-- Name: baseball_event_attendance baseball_event_attendance_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_event_attendance_select_coach ON public.baseball_event_attendance FOR SELECT TO authenticated USING ((event_id IN ( SELECT baseball_events.id
   FROM public.baseball_events
  WHERE public.is_baseball_team_coach(baseball_events.team_id))));


--
-- Name: baseball_event_attendance baseball_event_attendance_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_event_attendance_select_player ON public.baseball_event_attendance FOR SELECT TO authenticated USING ((player_id IN ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));


--
-- Name: baseball_event_attendance baseball_event_attendance_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_event_attendance_update_coach ON public.baseball_event_attendance FOR UPDATE TO authenticated USING ((event_id IN ( SELECT baseball_events.id
   FROM public.baseball_events
  WHERE public.is_baseball_team_coach(baseball_events.team_id))));


--
-- Name: baseball_event_attendance baseball_event_attendance_update_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_event_attendance_update_player ON public.baseball_event_attendance FOR UPDATE TO authenticated USING ((player_id IN ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));


--
-- Name: baseball_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_events ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_events baseball_events_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_events_delete_coach ON public.baseball_events FOR DELETE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_events baseball_events_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_events_insert_coach ON public.baseball_events FOR INSERT TO authenticated WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_events baseball_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_events_select ON public.baseball_events FOR SELECT TO authenticated USING ((public.is_baseball_team_coach(team_id) OR public.is_baseball_team_player(team_id)));


--
-- Name: baseball_events baseball_events_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_events_update_coach ON public.baseball_events FOR UPDATE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_games; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_games ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_coach_insights baseball_insights_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_insights_insert ON public.baseball_coach_insights FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_insights.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_coach_insights baseball_insights_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_insights_select ON public.baseball_coach_insights FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_insights.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_coach_insights baseball_insights_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_insights_update ON public.baseball_coach_insights FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_insights.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_lineup_positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_lineup_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_messages baseball_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_messages_insert ON public.baseball_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_messages.conversation_id) AND (baseball_conversation_participants.user_id = auth.uid()))))));


--
-- Name: baseball_messages baseball_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_messages_select ON public.baseball_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_messages.conversation_id) AND (baseball_conversation_participants.user_id = auth.uid())))));


--
-- Name: baseball_messages baseball_messages_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_messages_update ON public.baseball_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_messages.conversation_id) AND (baseball_conversation_participants.user_id = auth.uid())))));


--
-- Name: baseball_messages baseball_messages_update_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_messages_update_read ON public.baseball_messages FOR UPDATE TO authenticated USING ((conversation_id IN ( SELECT baseball_conversation_participants.conversation_id
   FROM public.baseball_conversation_participants
  WHERE (baseball_conversation_participants.user_id = auth.uid())))) WITH CHECK ((conversation_id IN ( SELECT baseball_conversation_participants.conversation_id
   FROM public.baseball_conversation_participants
  WHERE (baseball_conversation_participants.user_id = auth.uid()))));


--
-- Name: baseball_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_notifications baseball_notifications_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_notifications_insert ON public.baseball_notifications FOR INSERT WITH CHECK (true);


--
-- Name: baseball_notifications baseball_notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_notifications_select ON public.baseball_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: baseball_notifications baseball_notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_notifications_update ON public.baseball_notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: baseball_conversation_participants baseball_participants_insert_by_creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_participants_insert_by_creator ON public.baseball_conversation_participants FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.baseball_conversations
  WHERE ((baseball_conversations.id = baseball_conversation_participants.conversation_id) AND (baseball_conversations.created_by = auth.uid()))))));


--
-- Name: baseball_conversation_participants baseball_participants_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_participants_update_own ON public.baseball_conversation_participants FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: baseball_player_aggregates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_aggregates ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_classes baseball_player_classes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_classes_delete ON public.baseball_player_classes FOR DELETE TO authenticated USING ((player_id IN ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));


--
-- Name: baseball_player_classes baseball_player_classes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_classes_insert ON public.baseball_player_classes FOR INSERT TO authenticated WITH CHECK (((player_id = public.get_my_player_id()) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM public.baseball_team_members btm
  WHERE ((btm.player_id = baseball_player_classes.player_id) AND public.is_baseball_team_coach(btm.team_id))))));


--
-- Name: baseball_player_classes baseball_player_classes_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_classes_select_coach ON public.baseball_player_classes FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_team_members btm
  WHERE ((btm.player_id = baseball_player_classes.player_id) AND public.is_baseball_team_coach(btm.team_id)))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id))));


--
-- Name: baseball_player_classes baseball_player_classes_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_classes_select_player ON public.baseball_player_classes FOR SELECT TO authenticated USING ((player_id IN ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));


--
-- Name: baseball_player_classes baseball_player_classes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_classes_update ON public.baseball_player_classes FOR UPDATE TO authenticated USING ((player_id IN ( SELECT baseball_players.id
   FROM public.baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));


--
-- Name: baseball_player_comparisons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_comparisons ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_engagement_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_engagement_events ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_percentiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_percentiles ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_season_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_season_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_player_settings baseball_player_settings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_settings_insert ON public.baseball_player_settings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_player_settings baseball_player_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_settings_select ON public.baseball_player_settings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_player_settings baseball_player_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_player_settings_update ON public.baseball_player_settings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_player_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_player_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_players ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_players baseball_players_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_players_insert_own ON public.baseball_players FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: baseball_players baseball_players_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_players_select ON public.baseball_players FOR SELECT TO authenticated USING (true);


--
-- Name: baseball_players baseball_players_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_players_update_own ON public.baseball_players FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: baseball_recruiting_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_recruiting_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_recruiting_interests_delete_own ON public.baseball_recruiting_interests FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_recruiting_interests_insert_own ON public.baseball_recruiting_interests FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_recruiting_interests_select_own ON public.baseball_recruiting_interests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_recruiting_interests baseball_recruiting_interests_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_recruiting_interests_update_own ON public.baseball_recruiting_interests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_stat_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_stat_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_stat_uploads baseball_stat_uploads_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_stat_uploads_insert ON public.baseball_stat_uploads FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_stat_uploads.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_stat_uploads baseball_stat_uploads_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_stat_uploads_select ON public.baseball_stat_uploads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_stat_uploads.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_task_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_task_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_task_assignments baseball_task_assignments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_assignments_delete ON public.baseball_task_assignments FOR DELETE TO authenticated USING ((task_id IN ( SELECT baseball_tasks.id
   FROM public.baseball_tasks
  WHERE public.is_baseball_team_coach(baseball_tasks.team_id))));


--
-- Name: baseball_task_assignments baseball_task_assignments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_assignments_insert ON public.baseball_task_assignments FOR INSERT TO authenticated WITH CHECK ((task_id IN ( SELECT baseball_tasks.id
   FROM public.baseball_tasks
  WHERE public.is_baseball_team_coach(baseball_tasks.team_id))));


--
-- Name: baseball_task_assignments baseball_task_assignments_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_assignments_select_coach ON public.baseball_task_assignments FOR SELECT TO authenticated USING ((task_id IN ( SELECT baseball_tasks.id
   FROM public.baseball_tasks
  WHERE public.is_baseball_team_coach(baseball_tasks.team_id))));


--
-- Name: baseball_task_assignments baseball_task_assignments_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_assignments_select_player ON public.baseball_task_assignments FOR SELECT TO authenticated USING ((player_id = public.get_my_player_id()));


--
-- Name: baseball_task_assignments baseball_task_assignments_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_assignments_update_coach ON public.baseball_task_assignments FOR UPDATE TO authenticated USING ((task_id IN ( SELECT baseball_tasks.id
   FROM public.baseball_tasks
  WHERE public.is_baseball_team_coach(baseball_tasks.team_id))));


--
-- Name: baseball_task_assignments baseball_task_assignments_update_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_assignments_update_player ON public.baseball_task_assignments FOR UPDATE TO authenticated USING ((player_id = public.get_my_player_id())) WITH CHECK ((player_id = public.get_my_player_id()));


--
-- Name: baseball_task_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_task_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_task_templates baseball_task_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_templates_delete ON public.baseball_task_templates FOR DELETE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_task_templates baseball_task_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_templates_insert ON public.baseball_task_templates FOR INSERT TO authenticated WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_task_templates baseball_task_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_templates_select ON public.baseball_task_templates FOR SELECT TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_task_templates baseball_task_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_task_templates_update ON public.baseball_task_templates FOR UPDATE TO authenticated USING (public.is_baseball_team_coach(team_id)) WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_tasks baseball_tasks_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_tasks_delete ON public.baseball_tasks FOR DELETE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_tasks baseball_tasks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_tasks_insert ON public.baseball_tasks FOR INSERT TO authenticated WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_tasks baseball_tasks_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_tasks_select_coach ON public.baseball_tasks FOR SELECT TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_tasks baseball_tasks_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_tasks_select_player ON public.baseball_tasks FOR SELECT TO authenticated USING (public.is_baseball_team_player(team_id));


--
-- Name: baseball_tasks baseball_tasks_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_tasks_update ON public.baseball_tasks FOR UPDATE TO authenticated USING (public.is_baseball_team_coach(team_id)) WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_team_coach_staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_team_coach_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_coach_staff_delete ON public.baseball_team_coach_staff FOR DELETE TO authenticated USING (public.is_baseball_primary_coach(team_id));


--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_coach_staff_insert ON public.baseball_team_coach_staff FOR INSERT TO authenticated WITH CHECK (public.is_baseball_primary_coach(team_id));


--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_coach_staff_select ON public.baseball_team_coach_staff FOR SELECT TO authenticated USING (true);


--
-- Name: baseball_team_coach_staff baseball_team_coach_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_coach_staff_update ON public.baseball_team_coach_staff FOR UPDATE TO authenticated USING (public.is_baseball_primary_coach(team_id));


--
-- Name: baseball_team_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_team_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_team_lineups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_team_lineups ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_team_members baseball_team_members_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_members_delete_coach ON public.baseball_team_members FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))));


--
-- Name: baseball_team_members baseball_team_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_members_insert ON public.baseball_team_members FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_team_members.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_team_members baseball_team_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_members_select ON public.baseball_team_members FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.baseball_players bp
     JOIN public.baseball_team_members btm ON ((btm.player_id = bp.id)))
  WHERE ((btm.team_id = baseball_team_members.team_id) AND (bp.user_id = auth.uid()))))));


--
-- Name: baseball_team_members baseball_team_members_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_team_members_update_coach ON public.baseball_team_members FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))));


--
-- Name: baseball_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_teams baseball_teams_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_teams_delete ON public.baseball_teams FOR DELETE TO authenticated USING (public.is_baseball_primary_coach(id));


--
-- Name: baseball_teams baseball_teams_insert_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_teams_insert_coaches ON public.baseball_teams FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE (baseball_coaches.user_id = auth.uid()))));


--
-- Name: baseball_teams baseball_teams_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_teams_select ON public.baseball_teams FOR SELECT TO authenticated USING (true);


--
-- Name: baseball_teams baseball_teams_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_teams_update ON public.baseball_teams FOR UPDATE TO authenticated USING (public.is_baseball_primary_coach(id)) WITH CHECK (public.is_baseball_primary_coach(id));


--
-- Name: baseball_teams baseball_teams_update_own_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_teams_update_own_coach ON public.baseball_teams FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_teams.id) AND (bc.user_id = auth.uid())))));


--
-- Name: baseball_travel_expenses baseball_travel_exp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_exp_delete ON public.baseball_travel_expenses FOR DELETE TO authenticated USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM public.baseball_travel_itineraries
  WHERE public.is_baseball_team_coach(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id))));


--
-- Name: baseball_travel_expenses baseball_travel_exp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_exp_insert ON public.baseball_travel_expenses FOR INSERT TO authenticated WITH CHECK ((((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)) OR (itinerary_id IN ( SELECT bti.id
   FROM public.baseball_travel_itineraries bti
  WHERE public.is_baseball_team_coach(bti.team_id)))));


--
-- Name: baseball_travel_expenses baseball_travel_exp_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_exp_select_coach ON public.baseball_travel_expenses FOR SELECT TO authenticated USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM public.baseball_travel_itineraries
  WHERE public.is_baseball_team_coach(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id))));


--
-- Name: baseball_travel_expenses baseball_travel_exp_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_exp_select_player ON public.baseball_travel_expenses FOR SELECT TO authenticated USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM public.baseball_travel_itineraries
  WHERE public.is_baseball_team_player(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_player(team_id))));


--
-- Name: baseball_travel_expenses baseball_travel_exp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_exp_update ON public.baseball_travel_expenses FOR UPDATE TO authenticated USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM public.baseball_travel_itineraries
  WHERE public.is_baseball_team_coach(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id))));


--
-- Name: baseball_travel_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_travel_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_travel_itineraries baseball_travel_itin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_itin_delete ON public.baseball_travel_itineraries FOR DELETE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_travel_itineraries baseball_travel_itin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_itin_insert ON public.baseball_travel_itineraries FOR INSERT TO authenticated WITH CHECK (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_travel_itineraries baseball_travel_itin_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_itin_select_coach ON public.baseball_travel_itineraries FOR SELECT TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_travel_itineraries baseball_travel_itin_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_itin_select_player ON public.baseball_travel_itineraries FOR SELECT TO authenticated USING (public.is_baseball_team_player(team_id));


--
-- Name: baseball_travel_itineraries baseball_travel_itin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_travel_itin_update ON public.baseball_travel_itineraries FOR UPDATE TO authenticated USING (public.is_baseball_team_coach(team_id));


--
-- Name: baseball_travel_itineraries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_travel_itineraries ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_videos baseball_videos_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_videos_delete_own ON public.baseball_videos FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_videos baseball_videos_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_videos_insert_own ON public.baseball_videos FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_videos baseball_videos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_videos_select ON public.baseball_videos FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)) OR ((team_id IS NOT NULL) AND public.is_baseball_team_player(team_id)) OR (EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.recruiting_activated = true) AND (baseball_players.player_type = ANY (ARRAY['high_school'::public.baseball_player_type, 'showcase'::public.baseball_player_type, 'juco'::public.baseball_player_type])))))));


--
-- Name: baseball_videos baseball_videos_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_videos_update_own ON public.baseball_videos FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));


--
-- Name: baseball_watchlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.baseball_watchlists ENABLE ROW LEVEL SECURITY;

--
-- Name: baseball_watchlists baseball_watchlists_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_watchlists_delete_own ON public.baseball_watchlists FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_watchlists baseball_watchlists_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_watchlists_insert_own ON public.baseball_watchlists FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_watchlists baseball_watchlists_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_watchlists_select_own ON public.baseball_watchlists FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: baseball_watchlists baseball_watchlists_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baseball_watchlists_update_own ON public.baseball_watchlists FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));


--
-- Name: golf_player_baselines baselines_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baselines_select_coach ON public.golf_player_baselines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_baselines.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_player_baselines baselines_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baselines_select_player ON public.golf_player_baselines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_player_baselines.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_player_baselines baselines_write_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY baselines_write_service ON public.golf_player_baselines TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_coachhelm_chat_conversations chat_conversations_coach_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_conversations_coach_only ON public.golf_coachhelm_chat_conversations TO authenticated USING ((coach_id = public.current_coach_id())) WITH CHECK ((coach_id = public.current_coach_id()));


--
-- Name: golf_coachhelm_chat_messages chat_messages_coach_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_messages_coach_only ON public.golf_coachhelm_chat_messages TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coachhelm_chat_conversations c
  WHERE ((c.id = golf_coachhelm_chat_messages.conversation_id) AND (c.coach_id = public.current_coach_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_coachhelm_chat_conversations c
  WHERE ((c.id = golf_coachhelm_chat_messages.conversation_id) AND (c.coach_id = public.current_coach_id())))));


--
-- Name: golf_coach_behavior_log coach_behavior_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coach_behavior_admin_read ON public.golf_coach_behavior_log FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_coach_behavior_log coach_behavior_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coach_behavior_insert_service ON public.golf_coach_behavior_log FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_coach_behavior_log coach_behavior_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coach_behavior_select_own ON public.golf_coach_behavior_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches c
  WHERE ((c.id = golf_coach_behavior_log.coach_id) AND (c.user_id = auth.uid())))));


--
-- Name: golf_coach_insights coach_insights_select_player_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coach_insights_select_player_own ON public.golf_coach_insights FOR SELECT TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: golf_coach_insights coach_insights_select_via_player_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coach_insights_select_via_player_team ON public.golf_coach_insights FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.golf_team_members tm
     JOIN public.golf_team_coach_staff tcs ON ((tcs.team_id = tm.team_id)))
     JOIN public.golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((tm.player_id = golf_coach_insights.player_id) AND (tm.status = 'active'::public.team_member_status) AND (c.user_id = auth.uid())))));


--
-- Name: golf_coach_insights coach_insights_update_player_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coach_insights_update_player_own ON public.golf_coach_insights FOR UPDATE TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid())))) WITH CHECK ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: POLICY coach_insights_update_player_own ON golf_coach_insights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY coach_insights_update_player_own ON public.golf_coach_insights IS 'Players can UPDATE their own insight rows, but column-level GRANTs restrict the writable surface to acknowledged_at + dismissed_at. Closes S-CRIT-2.';


--
-- Name: golf_coachhelm_coach_weights coach_weights_coach_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coach_weights_coach_only ON public.golf_coachhelm_coach_weights FOR SELECT TO authenticated USING ((coach_id = public.current_coach_id()));


--
-- Name: crm_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_automations ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_coaches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_coaches ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contact_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_contact_log ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_email_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_email_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_google_calendar_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_google_calendar_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sequence_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sequence_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_sequence_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: device_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_insight_drill_attachments drill_attachments_read_via_insight; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drill_attachments_read_via_insight ON public.golf_insight_drill_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coach_insights gci
  WHERE (gci.id = golf_insight_drill_attachments.insight_id))));


--
-- Name: golf_drills drills_read_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drills_read_all_authenticated ON public.golf_drills FOR SELECT TO authenticated USING (true);


--
-- Name: golf_insight_effectiveness effectiveness_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY effectiveness_insert_service ON public.golf_insight_effectiveness FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_insight_effectiveness effectiveness_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY effectiveness_select_admin ON public.golf_insight_effectiveness FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_insight_effectiveness effectiveness_select_team_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY effectiveness_select_team_coach ON public.golf_insight_effectiveness FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));


--
-- Name: email_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs error_logs_insert_authenticated_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY error_logs_insert_authenticated_self ON public.error_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: error_rate_hourly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_rate_hourly ENABLE ROW LEVEL SECURITY;

--
-- Name: error_rate_hourly error_rate_hourly_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY error_rate_hourly_admin_read ON public.error_rate_hourly FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: error_rate_hourly error_rate_hourly_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY error_rate_hourly_service_write ON public.error_rate_hourly TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_player_focus_areas focus_areas_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY focus_areas_select_coach ON public.golf_player_focus_areas FOR SELECT TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE ((gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_player_genome genome_coach_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY genome_coach_read ON public.golf_player_genome FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members tm
  WHERE ((tm.player_id = golf_player_genome.player_id) AND (tm.status = 'active'::public.team_member_status) AND public.is_team_coach(tm.team_id)))));


--
-- Name: golf_player_genome genome_player_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY genome_player_read ON public.golf_player_genome FOR SELECT TO authenticated USING ((player_id = public.current_player_id()));


--
-- Name: golf_global_patterns global_patterns_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_patterns_select_authed ON public.golf_global_patterns FOR SELECT TO authenticated USING (true);


--
-- Name: golf_global_patterns global_patterns_write_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_patterns_write_service ON public.golf_global_patterns TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_goal_suggestions goal_suggestions_player_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_suggestions_player_own ON public.golf_goal_suggestions TO authenticated USING ((player_id = public.current_player_id()));


--
-- Name: golf_goals goals_coach_create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goals_coach_create ON public.golf_goals FOR INSERT TO authenticated WITH CHECK ((public.is_team_coach(team_id) AND (creator_role = 'coach'::text) AND (coach_id_if_assigned = public.current_coach_id())));


--
-- Name: golf_goals goals_coach_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goals_coach_view ON public.golf_goals FOR SELECT TO authenticated USING ((public.is_team_coach(team_id) AND ((creator_role = 'coach'::text) OR (shared_with_coach = true))));


--
-- Name: golf_goals goals_player_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goals_player_own ON public.golf_goals TO authenticated USING ((player_id = public.current_player_id()));


--
-- Name: golf_academic_exclusions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_academic_exclusions ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_announcement_acknowledgements golf_acks_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_acks_insert_own ON public.golf_announcement_acknowledgements FOR INSERT TO authenticated WITH CHECK ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: golf_announcement_acknowledgements golf_acks_select_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_acks_select_coaches ON public.golf_announcement_acknowledgements FOR SELECT TO authenticated USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_acknowledgements golf_acks_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_acks_select_own ON public.golf_announcement_acknowledgements FOR SELECT TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: golf_announcement_documents golf_ann_documents_delete_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_documents_delete_coaches ON public.golf_announcement_documents FOR DELETE TO authenticated USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_documents golf_ann_documents_insert_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_documents_insert_coaches ON public.golf_announcement_documents FOR INSERT TO authenticated WITH CHECK ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_recipients golf_ann_recipients_delete_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_recipients_delete_coaches ON public.golf_announcement_recipients FOR DELETE TO authenticated USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_recipients golf_ann_recipients_insert_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_recipients_insert_coaches ON public.golf_announcement_recipients FOR INSERT TO authenticated WITH CHECK ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_recipients golf_ann_recipients_select_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_recipients_select_coaches ON public.golf_announcement_recipients FOR SELECT TO authenticated USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_recipients golf_ann_recipients_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_recipients_select_own ON public.golf_announcement_recipients FOR SELECT TO authenticated USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));


--
-- Name: golf_announcement_tasks golf_ann_tasks_delete_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_tasks_delete_coaches ON public.golf_announcement_tasks FOR DELETE TO authenticated USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_tasks golf_ann_tasks_insert_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_ann_tasks_insert_coaches ON public.golf_announcement_tasks FOR INSERT TO authenticated WITH CHECK ((announcement_id IN ( SELECT golf_announcements.id
   FROM public.golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM public.golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));


--
-- Name: golf_announcement_acknowledgements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_announcement_acknowledgements ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_announcement_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_announcement_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_announcement_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_announcement_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_announcement_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_announcement_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_attendance_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_attendance_summary ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_calendar_feeds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_calendar_feeds ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_calendar_feeds golf_calendar_feeds_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_calendar_feeds_delete_own ON public.golf_calendar_feeds FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: golf_calendar_feeds golf_calendar_feeds_insert_own_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_calendar_feeds_insert_own_team ON public.golf_calendar_feeds FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND ((team_id IS NULL) OR public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id))));


--
-- Name: golf_calendar_feeds golf_calendar_feeds_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_calendar_feeds_select_own ON public.golf_calendar_feeds FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: golf_calendar_feeds golf_calendar_feeds_update_own_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_calendar_feeds_update_own_team ON public.golf_calendar_feeds FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND ((team_id IS NULL) OR public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id))));


--
-- Name: golf_calendar_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_calendar_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_calendar_notifications golf_calendar_notifications_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_calendar_notifications_insert_own ON public.golf_calendar_notifications FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (user_id IN ( SELECT gp.user_id
   FROM (((public.golf_players gp
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::public.team_member_status))))));


--
-- Name: golf_calendar_notifications golf_calendar_notifications_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_calendar_notifications_insert_policy ON public.golf_calendar_notifications FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (((public.golf_coaches gc
     JOIN public.golf_teams gt ON ((gt.organization_id = gc.organization_id)))
     JOIN public.golf_team_members gtm ON ((gtm.team_id = gt.id)))
     JOIN public.golf_players gp ON ((gp.id = gtm.player_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gp.user_id = golf_calendar_notifications.user_id) AND (gtm.status = 'active'::public.team_member_status))))));


--
-- Name: golf_causal_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_causal_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_causal_relationships golf_causal_relationships_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_causal_relationships_select_coach ON public.golf_causal_relationships FOR SELECT TO authenticated USING ((player_id IN ( SELECT gp.id
   FROM (((public.golf_players gp
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: golf_causal_relationships golf_causal_relationships_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_causal_relationships_select_player ON public.golf_causal_relationships FOR SELECT TO authenticated USING ((player_id IN ( SELECT gp.id
   FROM public.golf_players gp
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: golf_causal_relationships golf_causal_relationships_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_causal_relationships_service_role_all ON public.golf_causal_relationships TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_player_classes golf_classes_select_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_classes_select_coaches ON public.golf_player_classes FOR SELECT TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE ((gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_coach_behavior_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coach_behavior_log ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coach_blocked_time; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coach_blocked_time ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coach_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coach_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coach_philosophy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coach_philosophy ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coach_philosophy golf_coach_philosophy_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coach_philosophy_delete_coach ON public.golf_coach_philosophy FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_coach_philosophy golf_coach_philosophy_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coach_philosophy_insert_coach ON public.golf_coach_philosophy FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_coach_philosophy golf_coach_philosophy_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coach_philosophy_select_coach ON public.golf_coach_philosophy FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_coach_philosophy golf_coach_philosophy_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coach_philosophy_update_coach ON public.golf_coach_philosophy FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_coach_player_intent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coach_player_intent ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coaches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coaches ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coaches golf_coaches_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coaches_delete_own ON public.golf_coaches FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: golf_coaches golf_coaches_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coaches_insert_own ON public.golf_coaches FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: golf_coaches golf_coaches_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coaches_select_all ON public.golf_coaches FOR SELECT TO authenticated USING (true);


--
-- Name: golf_coaches golf_coaches_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coaches_update_own ON public.golf_coaches FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: golf_coachhelm_chat_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coachhelm_chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coachhelm_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coachhelm_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coachhelm_coach_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coachhelm_coach_weights ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coachhelm_llm_budget; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coachhelm_llm_budget ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coachhelm_llm_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coachhelm_llm_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coachhelm_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_coachhelm_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coachhelm_settings_delete_coach ON public.golf_coachhelm_settings FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coachhelm_settings_insert_coach ON public.golf_coachhelm_settings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coachhelm_settings_select_coach ON public.golf_coachhelm_settings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_coachhelm_settings golf_coachhelm_settings_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_coachhelm_settings_update_coach ON public.golf_coachhelm_settings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));


--
-- Name: golf_confidence_calibration; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_confidence_calibration ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_confidence_calibration golf_confidence_calibration_admin_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_confidence_calibration_admin_read_all ON public.golf_confidence_calibration FOR SELECT USING (public.is_admin());


--
-- Name: golf_confidence_calibration golf_confidence_calibration_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_confidence_calibration_service_role_all ON public.golf_confidence_calibration USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_conversations golf_conversations_insert_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_conversations_insert_v2 ON public.golf_conversations FOR INSERT WITH CHECK (((team_id IS NULL) OR public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id)));


--
-- Name: golf_conversations golf_conversations_select_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_conversations_select_v2 ON public.golf_conversations FOR SELECT USING (((id IN ( SELECT public.user_conversation_ids(auth.uid()) AS user_conversation_ids)) OR (((is_team_chat = true) OR (is_team_channel = true)) AND public.is_golf_team_coach(team_id)) OR (((is_team_chat = true) OR (is_team_channel = true)) AND public.is_golf_team_player(team_id))));


--
-- Name: golf_conversations golf_conversations_update_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_conversations_update_v2 ON public.golf_conversations FOR UPDATE USING ((id IN ( SELECT public.user_conversation_ids(auth.uid()) AS user_conversation_ids))) WITH CHECK ((id IN ( SELECT public.user_conversation_ids(auth.uid()) AS user_conversation_ids)));


--
-- Name: golf_course_holes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_course_holes ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_courses golf_courses_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_courses_insert_authenticated ON public.golf_courses FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: golf_courses golf_courses_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_courses_select_all ON public.golf_courses FOR SELECT TO authenticated USING (true);


--
-- Name: golf_document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_documents golf_documents_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_documents_delete_coach ON public.golf_documents FOR DELETE USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_documents golf_documents_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_documents_insert_coach ON public.golf_documents FOR INSERT WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_documents golf_documents_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_documents_select_team ON public.golf_documents FOR SELECT USING ((public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id)));


--
-- Name: golf_documents golf_documents_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_documents_update_coach ON public.golf_documents FOR UPDATE USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_drills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_drills ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_event_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_event_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_event_attendance golf_event_attendance_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_event_attendance_delete_coach ON public.golf_event_attendance FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND public.is_golf_team_coach(e.team_id)))));


--
-- Name: golf_event_attendance golf_event_attendance_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_event_attendance_insert_coach ON public.golf_event_attendance FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND public.is_golf_team_coach(e.team_id)))));


--
-- Name: golf_event_attendance golf_event_attendance_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_event_attendance_select_team ON public.golf_event_attendance FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND (public.is_golf_team_coach(e.team_id) OR public.is_golf_team_player(e.team_id))))));


--
-- Name: golf_event_attendance golf_event_attendance_update_coach_or_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_event_attendance_update_coach_or_player ON public.golf_event_attendance FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND (public.is_golf_team_coach(e.team_id) OR (public.is_golf_team_player(e.team_id) AND (golf_event_attendance.player_id IN ( SELECT gp.id
           FROM public.golf_players gp
          WHERE (gp.user_id = auth.uid())))))))));


--
-- Name: golf_event_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_event_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_event_documents golf_event_documents_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_event_documents_delete_coach ON public.golf_event_documents FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.golf_events e
  WHERE ((e.id = golf_event_documents.event_id) AND public.is_golf_team_coach(e.team_id)))));


--
-- Name: golf_event_documents golf_event_documents_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_event_documents_insert_coach ON public.golf_event_documents FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_events e
  WHERE ((e.id = golf_event_documents.event_id) AND public.is_golf_team_coach(e.team_id)))));


--
-- Name: golf_event_documents golf_event_documents_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_event_documents_select_team ON public.golf_event_documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.golf_events e
  WHERE ((e.id = golf_event_documents.event_id) AND (public.is_golf_team_coach(e.team_id) OR public.is_golf_team_player(e.team_id))))));


--
-- Name: golf_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_events ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_events golf_events_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_events_delete_coach ON public.golf_events FOR DELETE USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_events golf_events_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_events_insert_coach ON public.golf_events FOR INSERT WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_events golf_events_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_events_select_team ON public.golf_events FOR SELECT USING ((public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id)));


--
-- Name: golf_events golf_events_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_events_update_coach ON public.golf_events FOR UPDATE USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_global_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_global_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_goal_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_goal_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_holes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_holes ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_holes golf_holes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_delete ON public.golf_holes FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_holes.round_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_holes golf_holes_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_delete_coach ON public.golf_holes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND (gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))));


--
-- Name: golf_holes golf_holes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_insert ON public.golf_holes FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_holes.round_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_holes golf_holes_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_insert_coach ON public.golf_holes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND (gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))));


--
-- Name: golf_holes golf_holes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_select ON public.golf_holes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND ((EXISTS ( SELECT 1
           FROM public.golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = auth.uid())))) OR ((gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND public.is_golf_team_player(gr.team_id)))))));


--
-- Name: golf_holes golf_holes_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_select_team ON public.golf_holes FOR SELECT TO authenticated USING ((round_id IN ( SELECT gr.id
   FROM public.golf_rounds gr
  WHERE ((gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))));


--
-- Name: golf_holes golf_holes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_update ON public.golf_holes FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_holes.round_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_holes golf_holes_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_update_coach ON public.golf_holes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND (gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))));


--
-- Name: golf_holes golf_holes_update_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_holes_update_team ON public.golf_holes FOR UPDATE TO authenticated USING ((round_id IN ( SELECT gr.id
   FROM (((public.golf_rounds gr
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::public.team_member_status))))) WITH CHECK ((round_id IN ( SELECT gr.id
   FROM (((public.golf_rounds gr
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::public.team_member_status)))));


--
-- Name: golf_ingest_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_ingest_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_ingest_sync_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_ingest_sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_insight_drill_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_insight_drill_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_insight_effectiveness; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_insight_effectiveness ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_insight_generation_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_insight_generation_log ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_insight_outcome_attribution; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_insight_outcome_attribution ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_insight_player_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_insight_player_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_learned_behavior; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_learned_behavior ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_message_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_message_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_messages golf_messages_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_messages_delete ON public.golf_messages FOR DELETE TO authenticated USING ((sender_id = auth.uid()));


--
-- Name: golf_messages golf_messages_insert_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_messages_insert_v2 ON public.golf_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (conversation_id IN ( SELECT public.user_conversation_ids(auth.uid()) AS user_conversation_ids))));


--
-- Name: golf_messages golf_messages_select_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_messages_select_v2 ON public.golf_messages FOR SELECT USING ((conversation_id IN ( SELECT public.user_conversation_ids(auth.uid()) AS user_conversation_ids)));


--
-- Name: golf_messages golf_messages_update_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_messages_update_v2 ON public.golf_messages FOR UPDATE USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));


--
-- Name: golf_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_metrics golf_metrics_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_metrics_authenticated_read ON public.golf_metrics FOR SELECT TO authenticated USING (true);


--
-- Name: golf_conversation_participants golf_participants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_participants_delete ON public.golf_conversation_participants FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: golf_conversation_participants golf_participants_insert_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_participants_insert_v2 ON public.golf_conversation_participants FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.golf_conversations gc
  WHERE ((gc.id = golf_conversation_participants.conversation_id) AND (gc.created_by = auth.uid()))))));


--
-- Name: golf_conversation_participants golf_participants_select_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_participants_select_v2 ON public.golf_conversation_participants FOR SELECT USING (((user_id = auth.uid()) OR (conversation_id IN ( SELECT public.user_conversation_ids(auth.uid()) AS user_conversation_ids))));


--
-- Name: golf_conversation_participants golf_participants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_participants_update ON public.golf_conversation_participants FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: golf_patterns_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_patterns_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_percentile_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_percentile_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_pga_standards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_pga_standards ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_pga_standards golf_pga_standards_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_pga_standards_authenticated_read ON public.golf_pga_standards FOR SELECT TO authenticated USING (true);


--
-- Name: golf_platform_metrics_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_platform_metrics_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_platform_metrics_daily golf_platform_metrics_daily_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_platform_metrics_daily_admin_read ON public.golf_platform_metrics_daily FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_platform_metrics_daily golf_platform_metrics_daily_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_platform_metrics_daily_service_write ON public.golf_platform_metrics_daily TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_player_attendance_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_attendance_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_baselines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_baselines ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_classes golf_player_classes_delete_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_classes_delete_player ON public.golf_player_classes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_player_classes golf_player_classes_insert_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_classes_insert_player ON public.golf_player_classes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_player_classes golf_player_classes_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_classes_select_team ON public.golf_player_classes FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_classes.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id))))));


--
-- Name: golf_player_classes golf_player_classes_update_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_classes_update_player ON public.golf_player_classes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_player_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_focus_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_focus_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_focus_areas golf_player_focus_areas_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_focus_areas_delete_coach ON public.golf_player_focus_areas FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_player_focus_areas golf_player_focus_areas_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_focus_areas_insert_coach ON public.golf_player_focus_areas FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_player_focus_areas golf_player_focus_areas_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_focus_areas_select_team ON public.golf_player_focus_areas FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_player_focus_areas.player_id) AND (gp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id))))));


--
-- Name: golf_player_focus_areas golf_player_focus_areas_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_focus_areas_update_coach ON public.golf_player_focus_areas FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_player_genome; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_genome ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_notification_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_notification_state ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_standing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_standing ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_player_standing golf_player_standing_coach_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_standing_coach_read ON public.golf_player_standing FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members m
  WHERE ((m.player_id = golf_player_standing.player_id) AND public.is_team_coach(m.team_id)))));


--
-- Name: golf_player_standing golf_player_standing_player_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_player_standing_player_read ON public.golf_player_standing FOR SELECT TO authenticated USING ((player_id = public.current_player_id()));


--
-- Name: golf_player_stats_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_player_stats_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_players ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_players golf_players_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_players_insert_own ON public.golf_players FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: golf_players golf_players_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_players_select ON public.golf_players FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.user_is_coach_of_golf_player(id) OR public.user_has_pending_join_request_to_coach_team(id) OR public.user_is_teammate_of_golf_player(id)));


--
-- Name: golf_players golf_players_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_players_update_own ON public.golf_players FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: golf_practice_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_practice_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_prediction_model_performance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_prediction_model_performance ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_prediction_model_performance golf_prediction_model_performance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_prediction_model_performance_select ON public.golf_prediction_model_performance FOR SELECT TO authenticated USING (true);


--
-- Name: golf_prediction_validations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_prediction_validations ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_predictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_predictions ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_qualifier_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_qualifier_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_qualifier_entries golf_qualifier_entries_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifier_entries_delete_coach ON public.golf_qualifier_entries FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND public.is_golf_team_coach(q.team_id)))));


--
-- Name: golf_qualifier_entries golf_qualifier_entries_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifier_entries_insert_coach ON public.golf_qualifier_entries FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND public.is_golf_team_coach(q.team_id)))));


--
-- Name: golf_qualifier_entries golf_qualifier_entries_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifier_entries_select_team ON public.golf_qualifier_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND (public.is_golf_team_coach(q.team_id) OR public.is_golf_team_player(q.team_id))))));


--
-- Name: golf_qualifier_entries golf_qualifier_entries_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifier_entries_update_coach ON public.golf_qualifier_entries FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND public.is_golf_team_coach(q.team_id)))));


--
-- Name: golf_qualifier_selections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_qualifier_selections ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_qualifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_qualifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_qualifiers golf_qualifiers_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifiers_delete_coach ON public.golf_qualifiers FOR DELETE USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_qualifiers golf_qualifiers_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifiers_insert_coach ON public.golf_qualifiers FOR INSERT WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_qualifiers golf_qualifiers_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifiers_select_team ON public.golf_qualifiers FOR SELECT USING ((public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id)));


--
-- Name: golf_qualifiers golf_qualifiers_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_qualifiers_update_coach ON public.golf_qualifiers FOR UPDATE USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_recruits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_recruits ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_recruits golf_recruits_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_recruits_delete_coach ON public.golf_recruits FOR DELETE USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_recruits golf_recruits_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_recruits_insert_coach ON public.golf_recruits FOR INSERT WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_recruits golf_recruits_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_recruits_select_coach ON public.golf_recruits FOR SELECT USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_recruits golf_recruits_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_recruits_update_coach ON public.golf_recruits FOR UPDATE USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_review_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_review_events ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_round_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_round_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_round_stats_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_round_stats_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_rounds golf_rounds_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_delete ON public.golf_rounds FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))));


--
-- Name: golf_rounds golf_rounds_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_delete_coach ON public.golf_rounds FOR DELETE USING (((team_id IS NOT NULL) AND public.is_golf_team_coach(team_id)));


--
-- Name: golf_rounds golf_rounds_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_insert ON public.golf_rounds FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))));


--
-- Name: golf_rounds golf_rounds_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_insert_coach ON public.golf_rounds FOR INSERT WITH CHECK (((team_id IS NOT NULL) AND public.is_golf_team_coach(team_id)));


--
-- Name: golf_rounds golf_rounds_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_select ON public.golf_rounds FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND public.is_golf_team_coach(team_id)) OR ((team_id IS NOT NULL) AND public.is_golf_team_player(team_id))));


--
-- Name: golf_rounds golf_rounds_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_select_team ON public.golf_rounds FOR SELECT TO authenticated USING (((team_id IS NOT NULL) AND public.is_golf_team_coach(team_id)));


--
-- Name: golf_rounds golf_rounds_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_update ON public.golf_rounds FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))));


--
-- Name: golf_rounds golf_rounds_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_update_coach ON public.golf_rounds FOR UPDATE USING (((team_id IS NOT NULL) AND public.is_golf_team_coach(team_id)));


--
-- Name: golf_rounds golf_rounds_update_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_rounds_update_team ON public.golf_rounds FOR UPDATE TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM ((public.golf_team_members gtm
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::public.team_member_status))))) WITH CHECK ((player_id IN ( SELECT gtm.player_id
   FROM ((public.golf_team_members gtm
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::public.team_member_status)))));


--
-- Name: golf_shots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_shots ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_shots golf_shots_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_delete ON public.golf_shots FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_shots.round_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_shots golf_shots_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_delete_coach ON public.golf_shots FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND (gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))));


--
-- Name: golf_shots golf_shots_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_delete_own ON public.golf_shots FOR DELETE TO authenticated USING (((hole_id IN ( SELECT gh.id
   FROM ((public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));


--
-- Name: golf_shots golf_shots_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_insert ON public.golf_shots FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_shots.round_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_shots golf_shots_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_insert_coach ON public.golf_shots FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND (gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))));


--
-- Name: golf_shots golf_shots_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_insert_own ON public.golf_shots FOR INSERT TO authenticated WITH CHECK (((hole_id IN ( SELECT gh.id
   FROM ((public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));


--
-- Name: golf_shots golf_shots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_select ON public.golf_shots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND ((EXISTS ( SELECT 1
           FROM public.golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = auth.uid())))) OR ((gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND public.is_golf_team_player(gr.team_id)))))));


--
-- Name: golf_shots golf_shots_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_select_own ON public.golf_shots FOR SELECT TO authenticated USING (((hole_id IN ( SELECT gh.id
   FROM ((public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));


--
-- Name: golf_shots golf_shots_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_select_team ON public.golf_shots FOR SELECT TO authenticated USING (((hole_id IN ( SELECT gh.id
   FROM (public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
  WHERE ((gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))) OR (round_id IN ( SELECT gr.id
   FROM public.golf_rounds gr
  WHERE ((gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id))))));


--
-- Name: golf_shots golf_shots_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_update ON public.golf_shots FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_shots.round_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_shots golf_shots_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_update_coach ON public.golf_shots FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND (gr.team_id IS NOT NULL) AND public.is_golf_team_coach(gr.team_id)))));


--
-- Name: golf_shots golf_shots_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_update_own ON public.golf_shots FOR UPDATE TO authenticated USING (((hole_id IN ( SELECT gh.id
   FROM ((public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))))) WITH CHECK (((hole_id IN ( SELECT gh.id
   FROM ((public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (public.golf_rounds gr
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));


--
-- Name: golf_shots golf_shots_update_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_shots_update_team ON public.golf_shots FOR UPDATE TO authenticated USING ((hole_id IN ( SELECT gh.id
   FROM ((((public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::public.team_member_status))))) WITH CHECK ((hole_id IN ( SELECT gh.id
   FROM ((((public.golf_holes gh
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::public.team_member_status)))));


--
-- Name: golf_task_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_task_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_task_assignments golf_task_assignments_coach_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_assignments_coach_all ON public.golf_task_assignments USING ((EXISTS ( SELECT 1
   FROM public.golf_tasks t
  WHERE ((t.id = golf_task_assignments.task_id) AND public.is_golf_team_coach(t.team_id)))));


--
-- Name: golf_task_assignments golf_task_assignments_player_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_assignments_player_insert ON public.golf_task_assignments FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_task_assignments.player_id) AND (gp.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM (public.golf_tasks t
     JOIN public.golf_team_members tm ON ((tm.team_id = t.team_id)))
  WHERE ((t.id = golf_task_assignments.task_id) AND (tm.player_id = golf_task_assignments.player_id) AND (tm.status = 'active'::public.team_member_status))))));


--
-- Name: golf_task_assignments golf_task_assignments_player_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_assignments_player_select ON public.golf_task_assignments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_task_assignments.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_task_assignments golf_task_assignments_player_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_assignments_player_update ON public.golf_task_assignments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_task_assignments.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_task_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_task_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_task_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_task_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_task_templates golf_task_templates_delete_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_templates_delete_coaches ON public.golf_task_templates FOR DELETE TO authenticated USING ((team_id IN ( SELECT gt.id
   FROM (public.golf_teams gt
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: golf_task_templates golf_task_templates_insert_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_templates_insert_coaches ON public.golf_task_templates FOR INSERT TO authenticated WITH CHECK ((team_id IN ( SELECT gt.id
   FROM (public.golf_teams gt
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: golf_task_templates golf_task_templates_select_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_templates_select_coaches ON public.golf_task_templates FOR SELECT TO authenticated USING ((team_id IN ( SELECT gt.id
   FROM (public.golf_teams gt
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: golf_task_templates golf_task_templates_select_players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_templates_select_players ON public.golf_task_templates FOR SELECT TO authenticated USING ((team_id IN ( SELECT gtm.team_id
   FROM (public.golf_team_members gtm
     JOIN public.golf_players gp ON ((gp.id = gtm.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: golf_task_templates golf_task_templates_update_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_task_templates_update_coaches ON public.golf_task_templates FOR UPDATE TO authenticated USING ((team_id IN ( SELECT gt.id
   FROM (public.golf_teams gt
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid())))) WITH CHECK ((team_id IN ( SELECT gt.id
   FROM (public.golf_teams gt
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: golf_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_tasks golf_tasks_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_tasks_delete_coach ON public.golf_tasks FOR DELETE USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_tasks golf_tasks_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_tasks_insert_coach ON public.golf_tasks FOR INSERT WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_tasks golf_tasks_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_tasks_select_team ON public.golf_tasks FOR SELECT USING ((public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id)));


--
-- Name: golf_tasks golf_tasks_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_tasks_update_coach ON public.golf_tasks FOR UPDATE USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_team_coach_staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_team_coach_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_team_coach_staff golf_team_coach_staff_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_team_coach_staff_delete ON public.golf_team_coach_staff FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches
  WHERE ((golf_coaches.id = golf_team_coach_staff.coach_id) AND (golf_coaches.user_id = auth.uid())))));


--
-- Name: golf_team_coach_staff golf_team_coach_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_team_coach_staff_insert ON public.golf_team_coach_staff FOR INSERT TO authenticated WITH CHECK ((public.is_golf_team_primary_coach(team_id) AND (EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_team_coach_staff.coach_id) AND (gc.user_id = auth.uid()))))));


--
-- Name: golf_team_coach_staff golf_team_coach_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_team_coach_staff_select ON public.golf_team_coach_staff FOR SELECT TO authenticated USING ((public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id)));


--
-- Name: golf_team_coachhelm_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_team_coachhelm_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_team_join_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_team_join_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_team_members golf_team_members_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_team_members_delete_coach ON public.golf_team_members FOR DELETE TO authenticated USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_team_members golf_team_members_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_team_members_insert_coach ON public.golf_team_members FOR INSERT TO authenticated WITH CHECK (public.is_golf_team_coach(team_id));


--
-- Name: golf_team_members golf_team_members_select_v5; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_team_members_select_v5 ON public.golf_team_members FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.golf_team_coach_staff gtcs
     JOIN public.golf_coaches gc ON ((gc.id = gtcs.coach_id)))
  WHERE ((gtcs.team_id = golf_team_members.team_id) AND (gc.user_id = auth.uid())))) OR (team_id IN ( SELECT public.get_current_player_team_ids() AS get_current_player_team_ids))));


--
-- Name: golf_team_members golf_team_members_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_team_members_update_coach ON public.golf_team_members FOR UPDATE TO authenticated USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_team_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_team_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_teams golf_teams_delete_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_teams_delete_coach ON public.golf_teams FOR DELETE USING (public.is_golf_team_coach(id));


--
-- Name: golf_teams golf_teams_delete_creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_teams_delete_creator ON public.golf_teams FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches
  WHERE ((golf_coaches.id = golf_teams.created_by) AND (golf_coaches.user_id = auth.uid())))));


--
-- Name: golf_teams golf_teams_insert_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_teams_insert_coaches ON public.golf_teams FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_coaches
  WHERE (golf_coaches.user_id = auth.uid()))));


--
-- Name: golf_teams golf_teams_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_teams_select ON public.golf_teams FOR SELECT TO authenticated USING ((public.is_golf_team_coach(id) OR public.is_golf_team_player(id)));


--
-- Name: golf_teams golf_teams_select_by_join_code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_teams_select_by_join_code ON public.golf_teams FOR SELECT TO authenticated USING ((join_code IS NOT NULL));


--
-- Name: golf_teams golf_teams_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_teams_update_coach ON public.golf_teams FOR UPDATE TO authenticated USING (public.is_golf_team_coach(id));


--
-- Name: golf_tracer_health_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_tracer_health_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_tracer_health_snapshot golf_tracer_health_snapshot_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_tracer_health_snapshot_admin_read ON public.golf_tracer_health_snapshot FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: golf_tracer_health_snapshot golf_tracer_health_snapshot_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_tracer_health_snapshot_service_write ON public.golf_tracer_health_snapshot TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_travel_budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_travel_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_travel_budgets golf_travel_budgets_coach_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_travel_budgets_coach_all ON public.golf_travel_budgets USING ((EXISTS ( SELECT 1
   FROM (public.golf_travel_itineraries gti
     JOIN public.golf_coaches gc ON ((EXISTS ( SELECT 1
           FROM public.golf_teams gt
          WHERE ((gt.organization_id = gc.organization_id) AND (gt.id = gti.team_id))))))
  WHERE ((gc.user_id = auth.uid()) AND (gti.id = golf_travel_budgets.itinerary_id)))));


--
-- Name: golf_travel_budgets golf_travel_budgets_player_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_travel_budgets_player_select ON public.golf_travel_budgets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.golf_travel_itineraries gti
     JOIN public.golf_team_members gtm ON ((gtm.team_id = gti.team_id)))
     JOIN public.golf_players gp ON ((gp.id = gtm.player_id)))
  WHERE ((gp.user_id = auth.uid()) AND (gti.id = golf_travel_budgets.itinerary_id)))));


--
-- Name: golf_travel_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_travel_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_travel_expenses golf_travel_expenses_coach_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_travel_expenses_coach_all ON public.golf_travel_expenses USING ((EXISTS ( SELECT 1
   FROM (public.golf_coaches gc
     JOIN public.golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_travel_expenses.team_id)))));


--
-- Name: golf_travel_expenses golf_travel_expenses_player_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golf_travel_expenses_player_select ON public.golf_travel_expenses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.golf_players gp
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gp.id)))
  WHERE ((gp.user_id = auth.uid()) AND (gtm.team_id = golf_travel_expenses.team_id)))));


--
-- Name: golf_travel_itineraries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_travel_itineraries ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_validations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_validations ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_ingest_connections ingest_connections_player_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingest_connections_player_only ON public.golf_ingest_connections TO authenticated USING ((player_id = public.current_player_id())) WITH CHECK ((player_id = public.current_player_id()));


--
-- Name: golf_ingest_sync_log ingest_sync_log_player_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingest_sync_log_player_read ON public.golf_ingest_sync_log FOR SELECT TO authenticated USING ((player_id = public.current_player_id()));


--
-- Name: golf_coach_player_intent intent_coach_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY intent_coach_only ON public.golf_coach_player_intent TO authenticated USING ((coach_id = public.current_coach_id())) WITH CHECK ((coach_id = public.current_coach_id()));


--
-- Name: golf_insight_player_feedback ipf_coach_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipf_coach_select_team ON public.golf_insight_player_feedback FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_insight_player_feedback.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_insight_player_feedback ipf_player_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipf_player_insert_own ON public.golf_insight_player_feedback FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_insight_player_feedback ipf_player_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipf_player_select_own ON public.golf_insight_player_feedback FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_insight_player_feedback ipf_player_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipf_player_update_own ON public.golf_insight_player_feedback FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_coachhelm_llm_budget llm_budget_coach_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY llm_budget_coach_read ON public.golf_coachhelm_llm_budget FOR SELECT TO authenticated USING ((coach_id = public.current_coach_id()));


--
-- Name: golf_coachhelm_llm_calls llm_calls_coach_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY llm_calls_coach_read ON public.golf_coachhelm_llm_calls FOR SELECT TO authenticated USING ((coach_id = public.current_coach_id()));


--
-- Name: login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_delete_own_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_delete_own_coach ON public.organizations FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.golf_coaches
  WHERE ((golf_coaches.user_id = auth.uid()) AND (golf_coaches.organization_id = organizations.id)))) OR ((NOT (EXISTS ( SELECT 1
   FROM public.golf_coaches
  WHERE (golf_coaches.organization_id = organizations.id)))) AND (NOT (EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE (baseball_coaches.organization_id = organizations.id)))) AND (created_at > (now() - '00:05:00'::interval)))));


--
-- Name: organizations organizations_insert_coaches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_insert_coaches ON public.organizations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'coach'::public.user_role)))));


--
-- Name: organizations organizations_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_select_all ON public.organizations FOR SELECT TO authenticated USING (true);


--
-- Name: organizations organizations_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_update_own ON public.organizations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.user_id = auth.uid()) AND (baseball_coaches.organization_id = organizations.id))
UNION
 SELECT 1
   FROM public.golf_coaches
  WHERE ((golf_coaches.user_id = auth.uid()) AND (golf_coaches.organization_id = organizations.id)))));


--
-- Name: golf_patterns_v2 patterns_v2_insert_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patterns_v2_insert_coach ON public.golf_patterns_v2 FOR INSERT TO authenticated WITH CHECK ((player_id IN ( SELECT gp.id
   FROM (((public.golf_players gp
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: golf_patterns_v2 patterns_v2_update_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patterns_v2_update_coach ON public.golf_patterns_v2 FOR UPDATE TO authenticated USING ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE public.is_golf_team_coach(gtm.team_id)))) WITH CHECK ((player_id IN ( SELECT gtm.player_id
   FROM public.golf_team_members gtm
  WHERE public.is_golf_team_coach(gtm.team_id))));


--
-- Name: golf_percentile_cache percentile_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY percentile_select_coach ON public.golf_percentile_cache FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_percentile_cache.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_percentile_cache percentile_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY percentile_select_player ON public.golf_percentile_cache FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_percentile_cache.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_percentile_cache percentile_write_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY percentile_write_service ON public.golf_percentile_cache TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: golf_practice_sessions practice_sessions_coach_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_sessions_coach_read ON public.golf_practice_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members tm
  WHERE ((tm.player_id = golf_practice_sessions.player_id) AND (tm.status = 'active'::public.team_member_status) AND public.is_team_coach(tm.team_id)))));


--
-- Name: golf_practice_sessions practice_sessions_player_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_sessions_player_only ON public.golf_practice_sessions TO authenticated USING ((player_id = public.current_player_id())) WITH CHECK ((player_id = public.current_player_id()));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: putt_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.putt_details ENABLE ROW LEVEL SECURITY;

--
-- Name: putt_details putt_details_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY putt_details_delete_own ON public.putt_details FOR DELETE TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: putt_details putt_details_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY putt_details_insert_own ON public.putt_details FOR INSERT TO authenticated WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: putt_details putt_details_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY putt_details_select_own ON public.putt_details FOR SELECT TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: putt_details putt_details_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY putt_details_select_team ON public.putt_details FOR SELECT TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM ((((((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
     JOIN public.golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN public.golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN public.golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));


--
-- Name: putt_details putt_details_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY putt_details_update_own ON public.putt_details FOR UPDATE TO authenticated USING ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))) WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((public.golf_shots gs
     JOIN public.golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN public.golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN public.golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));


--
-- Name: golf_qualifier_selections qualifier_selections_coach_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qualifier_selections_coach_write ON public.golf_qualifier_selections TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_qualifiers q
  WHERE ((q.id = golf_qualifier_selections.qualifier_id) AND public.is_team_coach(q.team_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_qualifiers q
  WHERE ((q.id = golf_qualifier_selections.qualifier_id) AND public.is_team_coach(q.team_id)))));


--
-- Name: golf_qualifier_selections qualifier_selections_player_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qualifier_selections_player_read ON public.golf_qualifier_selections FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_qualifiers q
  WHERE ((q.id = golf_qualifier_selections.qualifier_id) AND (q.selection_state = 'selected'::text) AND public.is_team_player(q.team_id)))));


--
-- Name: golf_round_reviews round_reviews_select_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY round_reviews_select_coach ON public.golf_round_reviews FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_round_reviews.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_round_reviews round_reviews_select_player; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY round_reviews_select_player ON public.golf_round_reviews FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_players gp
  WHERE ((gp.id = golf_round_reviews.player_id) AND (gp.user_id = auth.uid())))));


--
-- Name: golf_round_reviews round_reviews_write_coach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY round_reviews_write_coach ON public.golf_round_reviews FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_round_reviews.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.golf_team_members gtm
  WHERE ((gtm.player_id = golf_round_reviews.player_id) AND (gtm.status = 'active'::public.team_member_status) AND public.is_golf_team_coach(gtm.team_id)))));


--
-- Name: golf_team_coachhelm_settings team_chs_settings_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_chs_settings_select_team ON public.golf_team_coachhelm_settings FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));


--
-- Name: golf_team_coachhelm_settings team_chs_settings_write_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_chs_settings_write_team ON public.golf_team_coachhelm_settings TO authenticated USING (public.is_golf_team_primary_coach(team_id)) WITH CHECK (public.is_golf_team_primary_coach(team_id));


--
-- Name: POLICY team_chs_settings_write_team ON golf_team_coachhelm_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY team_chs_settings_write_team ON public.golf_team_coachhelm_settings IS 'Only the team primary coach can write team-level CoachHelm settings. Closes the "any assistant coach can disable CoachHelm team-wide" gap from the 2026-05-23 audit.';


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own ON public.users FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: users users_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own ON public.users FOR SELECT USING ((auth.uid() = id));


--
-- Name: users users_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own ON public.users FOR UPDATE USING ((auth.uid() = id));


--
-- PostgreSQL database dump complete
--

\unrestrict JwXCyuD4D0Aq6C5QYkGFyWcZzayr5GOAY1C1OOfFgA5RJXSjzEBKS5vKJci30jf

