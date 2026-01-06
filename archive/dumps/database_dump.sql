


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."coach_type" AS ENUM (
    'college',
    'high_school',
    'juco',
    'showcase'
);


ALTER TYPE "public"."coach_type" OWNER TO "postgres";


CREATE TYPE "public"."golf_attendance_status" AS ENUM (
    'attending',
    'not_attending',
    'maybe',
    'pending'
);


ALTER TYPE "public"."golf_attendance_status" OWNER TO "postgres";


CREATE TYPE "public"."golf_event_type" AS ENUM (
    'practice',
    'tournament',
    'qualifier',
    'meeting',
    'travel',
    'other'
);


ALTER TYPE "public"."golf_event_type" OWNER TO "postgres";


CREATE TYPE "public"."golf_player_status" AS ENUM (
    'active',
    'injured',
    'redshirt',
    'inactive'
);


ALTER TYPE "public"."golf_player_status" OWNER TO "postgres";


CREATE TYPE "public"."golf_player_year" AS ENUM (
    'freshman',
    'sophomore',
    'junior',
    'senior',
    'fifth_year',
    'graduate'
);


ALTER TYPE "public"."golf_player_year" OWNER TO "postgres";


CREATE TYPE "public"."golf_qualifier_status" AS ENUM (
    'upcoming',
    'in_progress',
    'completed'
);


ALTER TYPE "public"."golf_qualifier_status" OWNER TO "postgres";


CREATE TYPE "public"."golf_round_type" AS ENUM (
    'tournament',
    'qualifier',
    'practice',
    'casual'
);


ALTER TYPE "public"."golf_round_type" OWNER TO "postgres";


CREATE TYPE "public"."golf_task_status" AS ENUM (
    'pending',
    'completed',
    'overdue'
);


ALTER TYPE "public"."golf_task_status" OWNER TO "postgres";


CREATE TYPE "public"."golf_transportation_type" AS ENUM (
    'bus',
    'van',
    'fly',
    'carpool'
);


ALTER TYPE "public"."golf_transportation_type" OWNER TO "postgres";


CREATE TYPE "public"."golf_urgency_level" AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


ALTER TYPE "public"."golf_urgency_level" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'message',
    'watchlist_add',
    'profile_view',
    'interest',
    'offer',
    'system'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."organization_type" AS ENUM (
    'college',
    'high_school',
    'juco',
    'showcase_org',
    'travel_ball'
);


ALTER TYPE "public"."organization_type" OWNER TO "postgres";


CREATE TYPE "public"."pipeline_stage" AS ENUM (
    'watchlist',
    'high_priority',
    'contacted',
    'campus_visit',
    'offer_extended',
    'committed',
    'uninterested'
);


ALTER TYPE "public"."pipeline_stage" OWNER TO "postgres";


COMMENT ON TYPE "public"."pipeline_stage" IS 'Pipeline stage enum: watchlist, high_priority, contacted, campus_visit, offer_extended, committed, uninterested';



CREATE TYPE "public"."player_type" AS ENUM (
    'high_school',
    'showcase',
    'juco',
    'college'
);


ALTER TYPE "public"."player_type" OWNER TO "postgres";


CREATE TYPE "public"."team_type" AS ENUM (
    'high_school',
    'showcase',
    'juco',
    'college',
    'travel_ball'
);


ALTER TYPE "public"."team_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'player',
    'coach',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."video_type" AS ENUM (
    'highlight',
    'game',
    'practice',
    'skills',
    'pitching',
    'hitting',
    'fielding',
    'other'
);


ALTER TYPE "public"."video_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_coach_completion"("p_coach_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  completion_score integer := 0;
BEGIN
  SELECT 
    CASE 
      WHEN name IS NOT NULL THEN completion_score + 20 ELSE completion_score 
    END +
    CASE 
      WHEN organization_id IS NOT NULL THEN completion_score + 20 ELSE completion_score 
    END +
    CASE 
      WHEN coach_type IS NOT NULL THEN completion_score + 20 ELSE completion_score 
    END +
    CASE 
      WHEN avatar_url IS NOT NULL THEN completion_score + 20 ELSE completion_score 
    END +
    CASE 
      WHEN bio IS NOT NULL THEN completion_score + 20 ELSE completion_score 
    END
  INTO completion_score
  FROM public.coaches
  WHERE id = p_coach_id;
  
  RETURN LEAST(completion_score, 100);
END;
$$;


ALTER FUNCTION "public"."calculate_coach_completion"("p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_player_stats"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_rounds_played integer;
  v_holes_played integer;
BEGIN
  -- Count rounds and holes
  SELECT COUNT(*), COALESCE(SUM(18), 0)
  INTO v_rounds_played, v_holes_played
  FROM golf_rounds WHERE player_id = p_player_id;
  
  -- Insert or update player stats
  INSERT INTO golf_player_stats (player_id, rounds_played, holes_played, last_calculated_at)
  VALUES (p_player_id, v_rounds_played, v_holes_played, now())
  ON CONFLICT (player_id) DO UPDATE SET
    rounds_played = v_rounds_played,
    holes_played = v_holes_played,
    last_calculated_at = now(),
    updated_at = now();
    
  -- Note: Full stat calculations will be done in application code
  -- This function just ensures the stats row exists
END;
$$;


ALTER FUNCTION "public"."calculate_player_stats"("p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_profile_completion"("player_id_param" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  completion_score integer := 0;
  player_record RECORD;
BEGIN
  SELECT * INTO player_record FROM public.players WHERE id = player_id_param;
  
  IF player_record IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Basic info (30 points)
  IF player_record.first_name IS NOT NULL AND player_record.first_name != '' THEN completion_score := completion_score + 5; END IF;
  IF player_record.last_name IS NOT NULL AND player_record.last_name != '' THEN completion_score := completion_score + 5; END IF;
  IF player_record.position IS NOT NULL THEN completion_score := completion_score + 5; END IF;
  IF player_record.grad_year IS NOT NULL THEN completion_score := completion_score + 5; END IF;
  IF player_record.height IS NOT NULL THEN completion_score := completion_score + 5; END IF;
  IF player_record.weight IS NOT NULL THEN completion_score := completion_score + 5; END IF;
  
  -- Contact info (20 points)
  IF player_record.email IS NOT NULL AND player_record.email != '' THEN completion_score := completion_score + 10; END IF;
  IF player_record.phone IS NOT NULL AND player_record.phone != '' THEN completion_score := completion_score + 10; END IF;
  
  -- Bio (10 points)
  IF player_record.bio IS NOT NULL AND player_record.bio != '' THEN completion_score := completion_score + 10; END IF;
  
  -- Profile photo (10 points)
  IF player_record.avatar_url IS NOT NULL AND player_record.avatar_url != '' THEN completion_score := completion_score + 10; END IF;
  
  -- Videos (15 points)
  IF EXISTS (SELECT 1 FROM public.videos WHERE player_id = player_id_param) THEN completion_score := completion_score + 15; END IF;
  
  -- Metrics (10 points)
  IF EXISTS (SELECT 1 FROM public.player_metrics WHERE player_id = player_id_param) THEN completion_score := completion_score + 10; END IF;
  
  -- Achievements (5 points)
  IF EXISTS (SELECT 1 FROM public.player_achievements WHERE player_id = player_id_param) THEN completion_score := completion_score + 5; END IF;
  
  RETURN completion_score;
END;
$$;


ALTER FUNCTION "public"."calculate_profile_completion"("player_id_param" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "player_type" "public"."player_type" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "city" "text",
    "state" "text",
    "primary_position" "text",
    "secondary_position" "text",
    "grad_year" integer,
    "bats" "text",
    "throws" "text",
    "height_feet" integer,
    "height_inches" integer,
    "weight_lbs" integer,
    "high_school_name" "text",
    "high_school_id" "uuid",
    "club_team" "text",
    "pitch_velo" numeric(4,1),
    "exit_velo" numeric(4,1),
    "sixty_time" numeric(4,2),
    "pop_time" numeric(4,2),
    "gpa" numeric(3,2),
    "sat_score" integer,
    "act_score" integer,
    "instagram" "text",
    "twitter" "text",
    "about_me" "text",
    "has_video" boolean DEFAULT false,
    "recruiting_activated" boolean DEFAULT false,
    "committed_to" "uuid",
    "commitment_date" "date",
    "onboarding_completed" boolean DEFAULT false,
    "profile_completion_percent" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "search_vector" "tsvector" GENERATED ALWAYS AS ((((("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("first_name", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("last_name", ''::"text")), 'A'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("high_school_name", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("city", ''::"text")), 'C'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("state", ''::"text")), 'C'::"char"))) STORED,
    "recruiting_activated_at" timestamp with time zone,
    "high_school_org_id" "uuid",
    "showcase_org_id" "uuid",
    "college_org_id" "uuid",
    "showcase_team_name" character varying(255),
    "primary_goal" character varying(50),
    "top_schools" "text"[],
    "committed_to_org_id" "uuid",
    "full_name" "text" GENERATED ALWAYS AS (
CASE
    WHEN (("first_name" IS NOT NULL) AND ("last_name" IS NOT NULL)) THEN (("first_name" || ' '::"text") || "last_name")
    ELSE COALESCE("first_name", "last_name", ''::"text")
END) STORED,
    "verified_metrics" boolean DEFAULT false,
    "onboarding_step" integer DEFAULT 0
);


ALTER TABLE "public"."players" OWNER TO "postgres";


COMMENT ON TABLE "public"."players" IS 'RLS policies allow users to create and manage their own player profiles. Users can only INSERT their own profile (user_id = auth.uid()).';



COMMENT ON COLUMN "public"."players"."player_type" IS 'Player type: high_school, showcase, juco, college';



COMMENT ON COLUMN "public"."players"."recruiting_activated" IS 'TRUE when player activates recruiting to get discovered by coaches';



COMMENT ON COLUMN "public"."players"."high_school_org_id" IS 'Link to high school organization (if exists in orgs table)';



COMMENT ON COLUMN "public"."players"."showcase_org_id" IS 'Link to showcase organization (if exists in orgs table)';



COMMENT ON COLUMN "public"."players"."college_org_id" IS 'Link to college organization (for college players)';



COMMENT ON COLUMN "public"."players"."top_schools" IS 'Array of school names player is interested in';



COMMENT ON COLUMN "public"."players"."full_name" IS 'Computed field: first_name + last_name for search';



CREATE OR REPLACE FUNCTION "public"."calculate_profile_completion"("p" "public"."players") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  total INTEGER := 0;
  filled INTEGER := 0;
BEGIN
  total := 15;
  IF p.first_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.last_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.primary_position IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.grad_year IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.height_feet IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.weight_lbs IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.high_school_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.city IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.state IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.gpa IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.bats IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.throws IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.about_me IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.pitch_velo IS NOT NULL OR p.exit_velo IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.has_video THEN filled := filled + 1; END IF;
  RETURN (filled * 100 / total);
END;
$$;


ALTER FUNCTION "public"."calculate_profile_completion"("p" "public"."players") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_login_attempts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM login_attempts
  WHERE last_attempt < NOW() - INTERVAL '7 days'
  AND (locked_until IS NULL OR locked_until < NOW());
END;
$$;


ALTER FUNCTION "public"."cleanup_old_login_attempts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_player_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.player_settings (player_id)
  VALUES (NEW.id)
  ON CONFLICT (player_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_default_player_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_dev_plans"("p_player_id" "uuid") RETURNS TABLE("id" "uuid", "coach_id" "uuid", "player_id" "uuid", "title" "text", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dp.id,
    dp.coach_id,
    dp.player_id,
    dp.title,
    dp.status,
    dp.created_at,
    dp.updated_at
  FROM public.developmental_plans dp
  WHERE dp.player_id = p_player_id
    AND dp.status IN ('draft', 'sent', 'in_progress')
  ORDER BY dp.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_active_dev_plans"("p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coach_profile"("p_coach_id" "uuid") RETURNS TABLE("id" "uuid", "user_id" "uuid", "name" "text", "email" "text", "organization_id" "uuid", "organization_name" "text", "coach_type" "text", "division" "text", "conference" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    c.name,
    u.email,
    c.organization_id,
    c.organization_name,
    c.coach_type,
    c.division,
    c.conference
  FROM public.coaches c
  JOIN public.users u ON u.id = c.user_id
  WHERE c.id = p_coach_id;
END;
$$;


ALTER FUNCTION "public"."get_coach_profile"("p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coach_teams"("p_coach_id" "uuid") RETURNS TABLE("team_id" "uuid", "team_name" "text", "team_type" "text", "season" "text", "is_head_coach" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as team_id,
    t.name as team_name,
    t.team_type,
    t.season,
    tcs.is_primary as is_head_coach
  FROM public.teams t
  JOIN public.team_coach_staff tcs ON tcs.team_id = t.id
  WHERE tcs.coach_id = p_coach_id
    AND tcs.active = true;
END;
$$;


ALTER FUNCTION "public"."get_coach_teams"("p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_engagement_trends"("player_id_param" "uuid", "days_param" integer DEFAULT 30) RETURNS TABLE("date" "date", "total_events" bigint, "video_views" bigint, "profile_views" bigint, "messages" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.date,
    COALESCE(SUM(CASE WHEN e.type IS NOT NULL THEN 1 ELSE 0 END), 0)::bigint AS total_events,
    COALESCE(SUM(CASE WHEN e.type = 'video_view' THEN 1 ELSE 0 END), 0)::bigint AS video_views,
    COALESCE(SUM(CASE WHEN e.type = 'profile_view' THEN 1 ELSE 0 END), 0)::bigint AS profile_views,
    COALESCE(SUM(CASE WHEN e.type = 'message' THEN 1 ELSE 0 END), 0)::bigint AS messages
  FROM
    generate_series(
      CURRENT_DATE - (days_param || ' days')::interval,
      CURRENT_DATE,
      '1 day'::interval
    ) AS d(date)
  LEFT JOIN public.player_engagement_events e
    ON DATE(e.created_at) = d.date
    AND e.player_id = player_id_param
  GROUP BY d.date
  ORDER BY d.date;
END;
$$;


ALTER FUNCTION "public"."get_engagement_trends"("player_id_param" "uuid", "days_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_engagement_trends"("p_player_id" "uuid", "p_days" integer DEFAULT 30, "p_interval" "text" DEFAULT 'day'::"text") RETURNS TABLE("period" timestamp with time zone, "profile_views" integer, "video_views" integer, "watchlist_adds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc(p_interval, engagement_date) as period,
    COUNT(*) FILTER (WHERE engagement_type = 'profile_view')::INTEGER as profile_views,
    COUNT(*) FILTER (WHERE engagement_type = 'video_view')::INTEGER as video_views,
    COUNT(*) FILTER (WHERE engagement_type = 'watchlist_add')::INTEGER as watchlist_adds
  FROM public.player_engagement_events
  WHERE player_id = p_player_id
    AND engagement_date >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY date_trunc(p_interval, engagement_date)
  ORDER BY period ASC;
END;
$$;


ALTER FUNCTION "public"."get_engagement_trends"("p_player_id" "uuid", "p_days" integer, "p_interval" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_golf_coach_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT id FROM public.golf_coaches WHERE user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_golf_coach_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_golf_player_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT id FROM public.golf_players WHERE user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_golf_player_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_engagement_summary"("p_player_id" "uuid", "p_days" integer DEFAULT 30) RETURNS TABLE("total_views" integer, "total_video_views" integer, "total_profile_views" integer, "unique_viewers" integer, "recent_engagement_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN pve.event_type IN ('video_view', 'profile_view') THEN 1 ELSE 0 END), 0)::integer as total_views,
    COALESCE(SUM(CASE WHEN pve.event_type = 'video_view' THEN 1 ELSE 0 END), 0)::integer as total_video_views,
    COALESCE(SUM(CASE WHEN pve.event_type = 'profile_view' THEN 1 ELSE 0 END), 0)::integer as total_profile_views,
    COUNT(DISTINCT pve.viewer_user_id)::integer as unique_viewers,
    COUNT(*)::integer as recent_engagement_count
  FROM public.player_engagement_events pve
  WHERE pve.player_id = p_player_id
    AND pve.created_at >= NOW() - (p_days || ' days')::interval;
END;
$$;


ALTER FUNCTION "public"."get_player_engagement_summary"("p_player_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_notes"("p_coach_id" "uuid", "p_player_id" "uuid") RETURNS TABLE("id" "uuid", "coach_id" "uuid", "player_id" "uuid", "note" "text", "tags" "text"[], "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cn.id,
    cn.coach_id,
    cn.player_id,
    cn.note,
    cn.tags,
    cn.created_at,
    cn.updated_at
  FROM public.coach_notes cn
  WHERE cn.coach_id = p_coach_id
    AND cn.player_id = p_player_id
  ORDER BY cn.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_player_notes"("p_coach_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_teams"("p_player_id" "uuid") RETURNS TABLE("team_id" "uuid", "team_name" "text", "team_type" "text", "season" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tm.team_id,
    t.name as team_name,
    t.team_type,
    t.season
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.player_id = p_player_id
    AND tm.active = true;
END;
$$;


ALTER FUNCTION "public"."get_player_teams"("p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_engagement"("p_player_id" "uuid", "p_limit" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "event_type" "text", "viewer_user_id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pve.id,
    pve.event_type,
    pve.viewer_user_id,
    pve.created_at
  FROM public.player_engagement_events pve
  WHERE pve.player_id = p_player_id
  ORDER BY pve.created_at DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_recent_engagement"("p_player_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_upcoming_events"("p_coach_id" "uuid", "p_days" integer DEFAULT 30) RETURNS TABLE("id" "uuid", "title" "text", "start_time" timestamp with time zone, "end_time" timestamp with time zone, "event_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.start_time,
    e.end_time,
    e.event_type
  FROM public.events e
  WHERE e.created_by = p_coach_id
    AND e.start_time >= NOW()
    AND e.start_time <= NOW() + (p_days || ' days')::interval
  ORDER BY e.start_time ASC;
END;
$$;


ALTER FUNCTION "public"."get_upcoming_events"("p_coach_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  user_role text;
  user_sport text;
  user_first_name text;
  user_last_name text;
BEGIN
  -- Extract metadata with EXPLICIT defaults
  user_role := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'player');
  user_sport := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'sport'), ''), 'baseball');
  user_first_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''), '');
  user_last_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), ''), '');

  -- Log for debugging (visible in Supabase logs)
  RAISE LOG 'handle_new_user: user_id=%, email=%, role=%, sport=%, first_name=%, last_name=%',
    NEW.id, NEW.email, user_role, user_sport, user_first_name, user_last_name;

  -- Create base user record with sport
  INSERT INTO public.users (id, email, role, sport, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role::user_role,
    user_sport,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    sport = EXCLUDED.sport,
    updated_at = NOW();

  -- ONLY create sport-specific profile based on metadata
  -- IMPORTANT: Only ONE branch should execute
  IF user_sport = 'golf' THEN
    -- Golf users ONLY get golf records
    IF user_role = 'player' THEN
      INSERT INTO public.golf_players (
        user_id,
        first_name,
        last_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        user_first_name,
        user_last_name,
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created golf_players record for user %', NEW.id;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.golf_coaches (
        user_id,
        full_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NULLIF(TRIM(CONCAT(user_first_name, ' ', user_last_name)), ''),
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created golf_coaches record for user %', NEW.id;
    END IF;

  ELSIF user_sport = 'baseball' OR user_sport IS NULL THEN
    -- Baseball users ONLY get baseball records
    IF user_role = 'player' THEN
      INSERT INTO public.players (
        user_id,
        player_type,
        first_name,
        last_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        'high_school',
        user_first_name,
        user_last_name,
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created players record for user %', NEW.id;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.coaches (
        user_id,
        coach_type,
        full_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        'college',
        NULLIF(TRIM(CONCAT(user_first_name, ' ', user_last_name)), ''),
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created coaches record for user %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the auth signup
    RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Creates user and sport-specific profile records when auth.users record is created.
   SECURITY DEFINER bypasses RLS. Creates ONLY one sport profile based on metadata.
   Fixed: No longer creates duplicate records across sports.
   v2.0 - Comprehensive fix 2025-01-01';



CREATE OR REPLACE FUNCTION "public"."increment_video_view"("vid_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.videos SET view_count = view_count + 1 WHERE id = vid_id;
  INSERT INTO public.video_views (video_id, viewer_id)
  VALUES (vid_id, auth.uid());
END;
$$;


ALTER FUNCTION "public"."increment_video_view"("vid_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_golf_coach_of_team"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.golf_coaches
    WHERE user_id = auth.uid()
    AND team_id = team_uuid
  );
END;
$$;


ALTER FUNCTION "public"."is_golf_coach_of_team"("team_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_golf_player_of_team"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.golf_players
    WHERE user_id = auth.uid()
    AND team_id = team_uuid
  );
END;
$$;


ALTER FUNCTION "public"."is_golf_player_of_team"("team_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_golf_team_member"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.is_golf_coach_of_team(team_uuid) OR public.is_golf_player_of_team(team_uuid);
END;
$$;


ALTER FUNCTION "public"."is_golf_team_member"("team_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_on_team_staff"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM team_coach_staff tcs
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = team_uuid
    AND c.user_id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."is_user_on_team_staff"("team_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_on_team_staff"("team_uuid" "uuid") IS 'Helper function with SECURITY DEFINER to check team staff membership without RLS recursion';



CREATE OR REPLACE FUNCTION "public"."record_profile_view"("viewed_player_id" "uuid", "viewer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profile_views (player_id, viewer_id, created_at)
  VALUES (viewed_player_id, viewer_id, NOW())
  ON CONFLICT (player_id, viewer_id, DATE(created_at)) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."record_profile_view"("viewed_player_id" "uuid", "viewer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_profile_view"("p_player_id" "uuid", "p_coach_id" "uuid" DEFAULT NULL::"uuid", "p_is_anonymous" boolean DEFAULT false, "p_duration_seconds" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.player_engagement_events (
    player_id,
    coach_id,
    viewer_user_id,
    engagement_type,
    view_duration_seconds,
    is_anonymous
  )
  VALUES (
    p_player_id,
    p_coach_id,
    (SELECT auth.uid()),
    'profile_view',
    p_duration_seconds,
    p_is_anonymous
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;


ALTER FUNCTION "public"."record_profile_view"("p_player_id" "uuid", "p_coach_id" "uuid", "p_is_anonymous" boolean, "p_duration_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_dev_plan_sent_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
    NEW.sent_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_dev_plan_sent_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_recruiting_activated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.recruiting_activated = true AND (OLD.recruiting_activated IS NULL OR OLD.recruiting_activated = false) THEN
    NEW.recruiting_activated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_recruiting_activated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_coach_organization_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id != COALESCE(OLD.organization_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    UPDATE public.coaches
    SET organization_name = (
      SELECT name FROM public.organizations WHERE id = NEW.organization_id
    )
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_coach_organization_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_camp_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.camps
    SET registered_count = registered_count + 1
    WHERE id = NEW.camp_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.camps
    SET registered_count = GREATEST(0, registered_count - 1)
    WHERE id = OLD.camp_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_camp_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_camp_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.capacity IS NOT NULL AND NEW.registered_count >= NEW.capacity THEN
    NEW.status = 'full';
  ELSIF NEW.registered_count < NEW.capacity THEN
    NEW.status = 'open';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_camp_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_golf_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_golf_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_player_comparisons_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_player_comparisons_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."camp_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "camp_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'interested'::character varying,
    "registered_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "attended_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "camp_registrations_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['interested'::character varying, 'registered'::character varying, 'confirmed'::character varying, 'attended'::character varying, 'no_show'::character varying, 'cancelled'::character varying])::"text"[])))
);


ALTER TABLE "public"."camp_registrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."camp_registrations" IS 'Player registrations and attendance for camps';



CREATE TABLE IF NOT EXISTS "public"."camps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "name" character varying(255) NOT NULL,
    "description" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "location" character varying(255),
    "location_city" character varying(100),
    "location_state" character varying(2),
    "location_address" "text",
    "capacity" integer,
    "registration_count" integer DEFAULT 0,
    "interested_count" integer DEFAULT 0,
    "price" numeric(8,2),
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "registration_deadline" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "camps_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'open'::character varying, 'limited'::character varying, 'full'::character varying, 'cancelled'::character varying, 'completed'::character varying])::"text"[])))
);


ALTER TABLE "public"."camps" OWNER TO "postgres";


COMMENT ON TABLE "public"."camps" IS 'Camps hosted by coaches for recruiting and skill development';



CREATE TABLE IF NOT EXISTS "public"."coach_calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "event_type" character varying(50),
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "timezone" character varying(50) DEFAULT 'America/Chicago'::character varying,
    "is_all_day" boolean DEFAULT false,
    "location" character varying(255),
    "location_city" character varying(100),
    "location_state" character varying(2),
    "recurrence_rule" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_calendar_events_event_type_check" CHECK ((("event_type")::"text" = ANY ((ARRAY['camp'::character varying, 'evaluation'::character varying, 'visit'::character varying, 'game'::character varying, 'practice'::character varying, 'meeting'::character varying, 'other'::character varying])::"text"[])))
);


ALTER TABLE "public"."coach_calendar_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_calendar_events" IS 'Coach calendar for games, practices, evaluations, visits, etc.';



COMMENT ON COLUMN "public"."coach_calendar_events"."recurrence_rule" IS 'iCal RRULE format for repeating events';



CREATE TABLE IF NOT EXISTS "public"."coach_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "note_content" "text" NOT NULL,
    "is_private" boolean DEFAULT true,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_notes" IS 'Private notes coaches make about players - never visible to players';



CREATE TABLE IF NOT EXISTS "public"."coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "coach_type" "public"."coach_type" NOT NULL,
    "full_name" "text",
    "email_contact" "text",
    "phone" "text",
    "avatar_url" "text",
    "coach_title" "text",
    "college_id" "uuid",
    "school_name" "text",
    "school_city" "text",
    "school_state" "text",
    "program_division" "text",
    "about" "text",
    "primary_color" "text" DEFAULT '#16A34A'::"text",
    "recruiting_class_needs" "text"[],
    "onboarding_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "conference" "text",
    "organization_id" "uuid",
    "program_philosophy" "text",
    "program_values" "text",
    "what_we_look_for" "text",
    "logo_url" "text",
    "secondary_color" character varying(7),
    "organization_name" "text",
    "athletic_conference" "text",
    "onboarding_step" integer DEFAULT 0
);


ALTER TABLE "public"."coaches" OWNER TO "postgres";


COMMENT ON TABLE "public"."coaches" IS 'RLS policies allow users to create and manage their own coach profiles. Users can only INSERT their own profile (user_id = auth.uid()).';



COMMENT ON COLUMN "public"."coaches"."organization_id" IS 'Link to unified organizations table';



COMMENT ON COLUMN "public"."coaches"."program_philosophy" IS 'Coach/program philosophy and approach';



COMMENT ON COLUMN "public"."coaches"."program_values" IS 'Program values and culture';



COMMENT ON COLUMN "public"."coaches"."what_we_look_for" IS 'What the program looks for in recruits';



COMMENT ON COLUMN "public"."coaches"."organization_name" IS 'Denormalized org name for performance';



COMMENT ON COLUMN "public"."coaches"."athletic_conference" IS 'Athletic conference (may differ from academic)';



CREATE TABLE IF NOT EXISTS "public"."colleges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "division" "text",
    "conference" "text",
    "city" "text",
    "state" "text",
    "logo_url" "text",
    "website" "text",
    "baseball_url" "text",
    "head_coach" "text",
    "assistant_coaches" "text"[],
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."colleges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demo_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "organization" "text",
    "product" "text" DEFAULT 'both'::"text",
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "demo_requests_product_check" CHECK (("product" = ANY (ARRAY['baseball'::"text", 'golf'::"text", 'both'::"text"]))),
    CONSTRAINT "demo_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'contacted'::"text", 'scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."demo_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."demo_requests" IS 'Demo booking requests from the landing page';



CREATE TABLE IF NOT EXISTS "public"."developmental_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "title" character varying(255) NOT NULL,
    "description" "text",
    "start_date" "date",
    "end_date" "date",
    "goals" "jsonb" DEFAULT '[]'::"jsonb",
    "drills" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "developmental_plans_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'sent'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'archived'::character varying])::"text"[])))
);


ALTER TABLE "public"."developmental_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."developmental_plans" IS 'Development plans created by coaches for players with goals and drills';



COMMENT ON COLUMN "public"."developmental_plans"."goals" IS 'JSONB array: [{"id": "uuid", "title": "text", "description": "text", "target_date": "date", "completed": false, "completed_at": "timestamp"}]';



COMMENT ON COLUMN "public"."developmental_plans"."drills" IS 'JSONB array: [{"id": "uuid", "name": "text", "description": "text", "video_url": "url", "frequency": "text"}]';



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "team_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "event_type" character varying(50) NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "timezone" character varying(50) DEFAULT 'America/Chicago'::character varying,
    "is_all_day" boolean DEFAULT false,
    "location_venue" character varying(255),
    "location_city" character varying(100),
    "location_state" character varying(2),
    "location_address" "text",
    "opponent" character varying(255),
    "home_away" character varying(10),
    "result" character varying(1),
    "score_us" integer,
    "score_them" integer,
    "level" character varying(50),
    "is_public" boolean DEFAULT true,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "events_event_type_check" CHECK ((("event_type")::"text" = ANY ((ARRAY['game'::character varying, 'showcase'::character varying, 'tournament'::character varying, 'camp'::character varying, 'combine'::character varying, 'tryout'::character varying, 'practice'::character varying, 'other'::character varying])::"text"[]))),
    CONSTRAINT "events_home_away_check" CHECK ((("home_away")::"text" = ANY ((ARRAY['home'::character varying, 'away'::character varying, 'neutral'::character varying])::"text"[]))),
    CONSTRAINT "events_result_check" CHECK ((("result")::"text" = ANY ((ARRAY['W'::character varying, 'L'::character varying, 'T'::character varying])::"text"[])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON TABLE "public"."events" IS 'Games, showcases, tournaments, practices, and other events';



CREATE TABLE IF NOT EXISTS "public"."golf_announcement_acknowledgements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_announcement_acknowledgements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "urgency" "public"."golf_urgency_level" DEFAULT 'normal'::"public"."golf_urgency_level",
    "requires_acknowledgement" boolean DEFAULT false,
    "send_push" boolean DEFAULT false,
    "send_email" boolean DEFAULT false,
    "publish_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_coach_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "title" "text",
    "content" "text" NOT NULL,
    "meeting_date" "date",
    "meeting_type" "text",
    "shared_with_player" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_coach_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "organization_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "title" "text",
    "avatar_url" "text",
    "onboarding_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_coaches" OWNER TO "postgres";


COMMENT ON TABLE "public"."golf_coaches" IS 'RLS policies allow users to create and manage their own golf coach profiles. Users can only INSERT their own profile (user_id = auth.uid()).';



CREATE TABLE IF NOT EXISTS "public"."golf_course_holes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "par" integer NOT NULL,
    "yardage" integer NOT NULL,
    "handicap_index" integer,
    CONSTRAINT "golf_course_holes_handicap_index_check" CHECK ((("handicap_index" >= 1) AND ("handicap_index" <= 18))),
    CONSTRAINT "golf_course_holes_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "golf_course_holes_par_check" CHECK ((("par" >= 3) AND ("par" <= 6))),
    CONSTRAINT "golf_course_holes_yardage_check" CHECK (("yardage" > 0))
);


ALTER TABLE "public"."golf_course_holes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_course_tees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "tee_name" "text" NOT NULL,
    "tee_color" "text",
    "course_rating" numeric(4,1),
    "slope_rating" integer,
    "total_yardage" integer,
    "hole_yardages" "jsonb"
);


ALTER TABLE "public"."golf_course_tees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "country" "text" DEFAULT 'USA'::"text",
    "course_rating" numeric(4,1),
    "slope_rating" integer,
    "default_tee_name" "text",
    "default_tee_color" "text",
    "total_yardage" integer,
    "total_par" integer,
    "created_by" "uuid",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "category" "text",
    "player_visible" boolean DEFAULT true,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_event_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "public"."golf_attendance_status" DEFAULT 'pending'::"public"."golf_attendance_status",
    "responded_at" timestamp with time zone
);


ALTER TABLE "public"."golf_event_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "title" "text" NOT NULL,
    "event_type" "public"."golf_event_type" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "all_day" boolean DEFAULT false,
    "location" "text",
    "course_name" "text",
    "description" "text",
    "is_mandatory" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_hole_shots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "shots_data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_hole_shots_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18)))
);


ALTER TABLE "public"."golf_hole_shots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_holes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "par" integer NOT NULL,
    "yardage" integer,
    "score" integer DEFAULT 0,
    "score_to_par" integer,
    "putts" integer,
    "fairway_hit" boolean,
    "green_in_regulation" boolean,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_holes_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "golf_holes_par_check" CHECK ((("par" >= 3) AND ("par" <= 6)))
);


ALTER TABLE "public"."golf_holes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "division" "text",
    "conference" "text",
    "city" "text",
    "state" "text",
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_player_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "course_code" "text",
    "course_name" "text" NOT NULL,
    "instructor" "text",
    "location" "text",
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "semester" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "days" "text"[] DEFAULT '{}'::"text"[],
    "building" "text",
    "room" "text",
    "credits" numeric,
    "notes" "text",
    "color" "text" DEFAULT '#16A34A'::"text",
    CONSTRAINT "golf_player_classes_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."golf_player_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_player_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "rounds_played" integer DEFAULT 0,
    "holes_played" integer DEFAULT 0,
    "scoring_average" numeric,
    "best_round" integer,
    "worst_round" integer,
    "total_birdies" integer DEFAULT 0,
    "total_eagles" integer DEFAULT 0,
    "total_pars" integer DEFAULT 0,
    "total_bogeys" integer DEFAULT 0,
    "total_double_plus" integer DEFAULT 0,
    "birdies_per_round" numeric,
    "eagles_per_round" numeric,
    "pars_per_round" numeric,
    "bogeys_per_round" numeric,
    "double_plus_per_round" numeric,
    "practice_scoring_avg" numeric,
    "practice_rounds" integer DEFAULT 0,
    "qualifying_scoring_avg" numeric,
    "qualifying_rounds" integer DEFAULT 0,
    "tournament_scoring_avg" numeric,
    "tournament_rounds" integer DEFAULT 0,
    "most_birdies_round" integer DEFAULT 0,
    "most_birdies_row" integer DEFAULT 0,
    "most_pars_row" integer DEFAULT 0,
    "current_no_3putt_streak" integer DEFAULT 0,
    "longest_no_3putt_streak" integer DEFAULT 0,
    "longest_hole_out" integer DEFAULT 0,
    "driving_distance_avg" numeric,
    "driving_distance_driver_only" numeric,
    "fairways_hit" integer DEFAULT 0,
    "fairway_opportunities" integer DEFAULT 0,
    "fairway_percentage" numeric,
    "fairway_pct_par4" numeric,
    "fairway_pct_par5" numeric,
    "fairway_pct_driver" numeric,
    "fairway_pct_non_driver" numeric,
    "miss_left_count" integer DEFAULT 0,
    "miss_right_count" integer DEFAULT 0,
    "miss_left_pct" numeric,
    "miss_right_pct" numeric,
    "gir_total" integer DEFAULT 0,
    "gir_opportunities" integer DEFAULT 0,
    "gir_percentage" numeric,
    "gir_per_round" numeric,
    "gir_pct_par3" numeric,
    "gir_pct_par4" numeric,
    "gir_pct_par5" numeric,
    "total_putts" integer DEFAULT 0,
    "putts_per_round" numeric,
    "putts_per_hole" numeric,
    "putts_per_gir" numeric,
    "three_putts_total" integer DEFAULT 0,
    "three_putts_per_round" numeric,
    "one_putts_total" integer DEFAULT 0,
    "putt_make_pct_0_3" numeric,
    "putt_make_pct_3_5" numeric,
    "putt_make_pct_5_10" numeric,
    "putt_make_pct_10_15" numeric,
    "putt_make_pct_15_20" numeric,
    "putt_make_pct_20_25" numeric,
    "putt_make_pct_25_30" numeric,
    "putt_make_pct_30_35" numeric,
    "putt_make_pct_35_plus" numeric,
    "putt_proximity_avg" numeric,
    "putt_proximity_5_10" numeric,
    "putt_proximity_10_15" numeric,
    "putt_proximity_15_20" numeric,
    "putt_proximity_20_plus" numeric,
    "putt_efficiency_0_3" numeric,
    "putt_efficiency_3_5" numeric,
    "putt_efficiency_5_10" numeric,
    "putt_efficiency_10_15" numeric,
    "putt_efficiency_15_20" numeric,
    "putt_efficiency_20_25" numeric,
    "putt_efficiency_25_30" numeric,
    "putt_efficiency_30_plus" numeric,
    "putt_miss_left_pct" numeric,
    "putt_miss_right_pct" numeric,
    "putt_miss_short_pct" numeric,
    "putt_miss_long_pct" numeric,
    "approach_proximity_avg" numeric,
    "approach_proximity_par3" numeric,
    "approach_proximity_par4" numeric,
    "approach_proximity_par5" numeric,
    "approach_proximity_fairway" numeric,
    "approach_proximity_rough" numeric,
    "approach_proximity_sand" numeric,
    "approach_prox_30_75" numeric,
    "approach_prox_75_100" numeric,
    "approach_prox_100_125" numeric,
    "approach_prox_125_150" numeric,
    "approach_prox_150_175" numeric,
    "approach_prox_175_200" numeric,
    "approach_prox_200_225" numeric,
    "approach_prox_225_plus" numeric,
    "approach_eff_30_75" numeric,
    "approach_eff_75_100" numeric,
    "approach_eff_100_125" numeric,
    "approach_eff_125_150" numeric,
    "approach_eff_150_175" numeric,
    "approach_eff_175_200" numeric,
    "approach_eff_200_225" numeric,
    "approach_eff_225_plus" numeric,
    "scramble_attempts" integer DEFAULT 0,
    "scrambles_made" integer DEFAULT 0,
    "scrambling_percentage" numeric,
    "scrambling_pct_fairway" numeric,
    "scrambling_pct_rough" numeric,
    "scrambling_pct_sand" numeric,
    "scrambling_pct_0_10" numeric,
    "scrambling_pct_10_20" numeric,
    "scrambling_pct_20_30" numeric,
    "atg_efficiency_avg" numeric,
    "atg_efficiency_0_10" numeric,
    "atg_efficiency_10_20" numeric,
    "atg_efficiency_20_30" numeric,
    "atg_eff_fairway" numeric,
    "atg_eff_rough" numeric,
    "atg_eff_sand" numeric,
    "sand_save_attempts" integer DEFAULT 0,
    "sand_saves_made" integer DEFAULT 0,
    "sand_save_percentage" numeric,
    "total_penalties" integer DEFAULT 0,
    "penalties_per_round" numeric,
    "last_calculated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_player_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "handicap_index" numeric(4,1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "phone" "text",
    "avatar_url" "text",
    "year" "public"."golf_player_year",
    "graduation_year" integer,
    "major" "text",
    "hometown" "text",
    "state" "text",
    "handicap" numeric(4,1),
    "scholarship_percentage" numeric(5,2),
    "gpa" numeric(3,2),
    "status" "public"."golf_player_status" DEFAULT 'active'::"public"."golf_player_status",
    "onboarding_completed" boolean DEFAULT false,
    "player_year" "text"
);


ALTER TABLE "public"."golf_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_qualifier_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "qualifier_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "position" integer,
    "is_tied" boolean DEFAULT false,
    "total_score" integer,
    "total_to_par" integer,
    "rounds_completed" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_qualifier_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_qualifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "course_name" "text",
    "location" "text",
    "num_rounds" integer DEFAULT 1 NOT NULL,
    "holes_per_round" integer DEFAULT 18 NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "status" "public"."golf_qualifier_status" DEFAULT 'upcoming'::"public"."golf_qualifier_status",
    "show_live_leaderboard" boolean DEFAULT true,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_qualifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "course_name" "text" NOT NULL,
    "course_city" "text",
    "course_state" "text",
    "tees_played" "text",
    "course_rating" numeric(4,1),
    "course_slope" integer,
    "round_type" "text",
    "round_date" "date" NOT NULL,
    "starting_hole" integer,
    "total_score" integer,
    "total_to_par" integer,
    "total_putts" integer,
    "fairways_hit" integer,
    "fairways_total" integer DEFAULT 14,
    "greens_in_regulation" integer,
    "greens_total" integer DEFAULT 18,
    "is_verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "golf_rounds_round_type_check" CHECK (("round_type" = ANY (ARRAY['practice'::"text", 'qualifying'::"text", 'tournament'::"text"])))
);


ALTER TABLE "public"."golf_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_shots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "hole_id" "uuid",
    "hole_number" integer NOT NULL,
    "shot_number" integer NOT NULL,
    "shot_type" "text" NOT NULL,
    "club_type" "text" NOT NULL,
    "lie_before" "text",
    "distance_to_hole_before" integer,
    "distance_unit_before" "text" DEFAULT 'yards'::"text",
    "result" "text" NOT NULL,
    "distance_to_hole_after" integer,
    "distance_unit_after" "text" DEFAULT 'yards'::"text",
    "shot_distance" integer,
    "miss_direction" "text",
    "putt_break" "text",
    "putt_slope" "text",
    "is_penalty" boolean DEFAULT false,
    "penalty_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_shots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_task_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"(),
    "upload_url" "text"
);


ALTER TABLE "public"."golf_task_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assigned_to" "uuid",
    "due_date" "date",
    "requires_upload" boolean DEFAULT false,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "season" "text",
    "invite_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."golf_travel_itineraries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "event_name" "text" NOT NULL,
    "destination" "text" NOT NULL,
    "transportation_type" "public"."golf_transportation_type" NOT NULL,
    "departure_date" "date" NOT NULL,
    "departure_time" time without time zone,
    "departure_location" "text",
    "return_date" "date",
    "return_time" time without time zone,
    "flight_info" "text",
    "hotel_name" "text",
    "hotel_address" "text",
    "hotel_phone" "text",
    "hotel_confirmation" "text",
    "check_in_date" "date",
    "check_out_date" "date",
    "room_assignments" "text",
    "uniform_requirements" "text",
    "gear_list" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."golf_travel_itineraries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."high_schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."high_schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "failed_attempts" integer DEFAULT 0 NOT NULL,
    "last_attempt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_ip" "text",
    "last_user_agent" "text",
    "locked_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."login_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."login_attempts" IS 'Tracks failed login attempts for account lockout protection';



COMMENT ON COLUMN "public"."login_attempts"."email" IS 'Normalized email address (lowercase, trimmed)';



COMMENT ON COLUMN "public"."login_attempts"."failed_attempts" IS 'Number of consecutive failed attempts';



COMMENT ON COLUMN "public"."login_attempts"."last_attempt" IS 'Timestamp of most recent failed attempt';



COMMENT ON COLUMN "public"."login_attempts"."last_ip" IS 'IP address of last failed attempt (for security logging)';



COMMENT ON COLUMN "public"."login_attempts"."last_user_agent" IS 'User agent of last failed attempt (for security logging)';



COMMENT ON COLUMN "public"."login_attempts"."locked_until" IS 'Account locked until this timestamp (NULL if not locked)';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "action_url" "text",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "division" "text",
    "conference" "text",
    "location_city" "text",
    "location_state" character varying(2),
    "logo_url" "text",
    "banner_url" "text",
    "website_url" "text",
    "description" "text",
    "primary_color" character varying(7) DEFAULT '#16A34A'::character varying,
    "secondary_color" character varying(7),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organizations_type_check" CHECK (("type" = ANY (ARRAY['college'::"text", 'high_school'::"text", 'juco'::"text", 'showcase_org'::"text", 'travel_ball'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organizations" IS 'Unified table for all organization types: colleges, high schools, JUCOs, showcase orgs';



COMMENT ON COLUMN "public"."organizations"."type" IS 'Organization type: college, high_school, juco, showcase_org, travel_ball';



CREATE TABLE IF NOT EXISTS "public"."player_achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "achievement_text" "text" NOT NULL,
    "achievement_type" character varying(50),
    "achievement_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_achievements" OWNER TO "postgres";


COMMENT ON TABLE "public"."player_achievements" IS 'Awards, honors, and achievements earned by players';



CREATE TABLE IF NOT EXISTS "public"."player_comparisons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "player_ids" "uuid"[] NOT NULL,
    "comparison_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_comparisons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_engagement_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "viewer_user_id" "uuid",
    "engagement_type" character varying(50) NOT NULL,
    "engagement_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "view_duration_seconds" integer,
    "video_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_anonymous" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "player_engagement_events_engagement_type_check" CHECK ((("engagement_type")::"text" = ANY ((ARRAY['profile_view'::character varying, 'video_view'::character varying, 'stats_view'::character varying, 'watchlist_add'::character varying, 'watchlist_remove'::character varying, 'message_sent'::character varying, 'camp_interest'::character varying, 'top5_add'::character varying])::"text"[])))
);


ALTER TABLE "public"."player_engagement_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."player_engagement_events" IS 'Comprehensive tracking of all player engagement (views, watchlist adds, video views, messages, etc.)';



COMMENT ON COLUMN "public"."player_engagement_events"."engagement_type" IS 'Type of engagement: profile_view, video_view, stats_view, watchlist_add, watchlist_remove, message_sent, camp_interest, top5_add';



COMMENT ON COLUMN "public"."player_engagement_events"."metadata" IS 'Flexible JSONB field for additional context (e.g., {"source": "discover_page", "filter_used": "grad_year:2025"})';



COMMENT ON COLUMN "public"."player_engagement_events"."is_anonymous" IS 'TRUE if player has not activated recruiting (shows "A coach from Texas" instead of name)';



CREATE TABLE IF NOT EXISTS "public"."player_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "metric_label" character varying(100) NOT NULL,
    "metric_value" character varying(50) NOT NULL,
    "metric_type" character varying(50),
    "verified" boolean DEFAULT false,
    "verified_by" "uuid",
    "verified_date" timestamp with time zone,
    "recorded_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."player_metrics" IS 'Additional measurables beyond core player stats (verified by coaches)';



CREATE TABLE IF NOT EXISTS "public"."player_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "is_discoverable" boolean DEFAULT true,
    "show_gpa" boolean DEFAULT false,
    "show_test_scores" boolean DEFAULT false,
    "show_contact_info" boolean DEFAULT false,
    "show_location" boolean DEFAULT true,
    "notify_on_eval" boolean DEFAULT true,
    "notify_on_interest" boolean DEFAULT true,
    "notify_on_message" boolean DEFAULT true,
    "notify_on_watchlist_add" boolean DEFAULT true,
    "notify_on_profile_view" boolean DEFAULT true,
    "email_notifications" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."player_settings" IS 'Player privacy and notification preferences';



CREATE TABLE IF NOT EXISTS "public"."profile_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "viewer_id" "uuid",
    "viewer_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profile_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recruiting_interests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "school_name" "text" NOT NULL,
    "conference" "text",
    "division" "text",
    "status" character varying(30) DEFAULT 'interested'::character varying NOT NULL,
    "interest_level" character varying(10),
    "coach_name" "text",
    "notes" "text",
    "last_contact_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recruiting_interests_interest_level_check" CHECK ((("interest_level")::"text" = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::"text"[]))),
    CONSTRAINT "recruiting_interests_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['interested'::character varying, 'contacted'::character varying, 'questionnaire'::character varying, 'unofficial_visit'::character varying, 'official_visit'::character varying, 'offer'::character varying, 'verbal'::character varying, 'signed'::character varying, 'declined'::character varying])::"text"[])))
);


ALTER TABLE "public"."recruiting_interests" OWNER TO "postgres";


COMMENT ON TABLE "public"."recruiting_interests" IS 'Player''s college interest list and recruiting journey tracking';



CREATE TABLE IF NOT EXISTS "public"."round_holes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "par" integer NOT NULL,
    "yardage" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "round_holes_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "round_holes_par_check" CHECK ((("par" >= 3) AND ("par" <= 6)))
);


ALTER TABLE "public"."round_holes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_coach_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "role" character varying(100),
    "is_primary" boolean DEFAULT false,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_coach_staff" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_coach_staff" IS 'Multiple coaches can be on staff for a single team';



CREATE TABLE IF NOT EXISTS "public"."team_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "invite_code" character varying(20) NOT NULL,
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone,
    "max_uses" integer,
    "current_uses" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_invitations" IS 'Join link system for coaches to invite players to teams';



CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "jersey_number" integer,
    "position" character varying(10),
    "role" character varying(50),
    "status" character varying(20) DEFAULT 'active'::character varying,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "left_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_members_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'injured'::character varying, 'alumni'::character varying])::"text"[])))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_members" IS 'Players membership in teams - supports multi-team for HS+Showcase players';



CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" character varying(255) NOT NULL,
    "team_type" character varying(20) NOT NULL,
    "season_year" integer,
    "age_group" character varying(20),
    "city" character varying(100),
    "state" character varying(2),
    "logo_url" "text",
    "primary_color" character varying(7) DEFAULT '#16A34A'::character varying,
    "secondary_color" character varying(7),
    "head_coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teams_team_type_check" CHECK ((("team_type")::"text" = ANY ((ARRAY['high_school'::character varying, 'showcase'::character varying, 'juco'::character varying, 'college'::character varying, 'travel_ball'::character varying])::"text"[])))
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."teams" IS 'Teams represent groups of players (HS, Showcase, JUCO, College, Travel Ball)';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'player'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sport" "text" DEFAULT 'baseball'::"text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."sport" IS 'Sport type: baseball or golf';



CREATE TABLE IF NOT EXISTS "public"."video_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "viewer_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."video_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "video_type" "text",
    "url" "text",
    "thumbnail_url" "text",
    "duration" integer,
    "view_count" integer DEFAULT 0,
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."videos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watchlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "notes" "text",
    "priority" integer DEFAULT 0,
    "tags" "text"[],
    "added_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pipeline_stage" "public"."pipeline_stage" DEFAULT 'watchlist'::"public"."pipeline_stage" NOT NULL,
    "last_contact" timestamp with time zone
);


ALTER TABLE "public"."watchlists" OWNER TO "postgres";


COMMENT ON COLUMN "public"."watchlists"."added_at" IS 'DEPRECATED: Use created_at instead. Will be removed in future migration.';



COMMENT ON COLUMN "public"."watchlists"."last_contact" IS 'Timestamp of last contact with the player';



ALTER TABLE ONLY "public"."camp_registrations"
    ADD CONSTRAINT "camp_registrations_camp_id_player_id_key" UNIQUE ("camp_id", "player_id");



ALTER TABLE ONLY "public"."camp_registrations"
    ADD CONSTRAINT "camp_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."camps"
    ADD CONSTRAINT "camps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_calendar_events"
    ADD CONSTRAINT "coach_calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."colleges"
    ADD CONSTRAINT "colleges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_requests"
    ADD CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."developmental_plans"
    ADD CONSTRAINT "developmental_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_announcement_acknowledgements"
    ADD CONSTRAINT "golf_announcement_acknowledgement_announcement_id_player_id_key" UNIQUE ("announcement_id", "player_id");



ALTER TABLE ONLY "public"."golf_announcement_acknowledgements"
    ADD CONSTRAINT "golf_announcement_acknowledgements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_announcements"
    ADD CONSTRAINT "golf_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_coach_notes"
    ADD CONSTRAINT "golf_coach_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."golf_course_holes"
    ADD CONSTRAINT "golf_course_holes_course_id_hole_number_key" UNIQUE ("course_id", "hole_number");



ALTER TABLE ONLY "public"."golf_course_holes"
    ADD CONSTRAINT "golf_course_holes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_course_id_tee_name_key" UNIQUE ("course_id", "tee_name");



ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_name_city_state_created_by_key" UNIQUE ("name", "city", "state", "created_by");



ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_documents"
    ADD CONSTRAINT "golf_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_event_attendance"
    ADD CONSTRAINT "golf_event_attendance_event_id_player_id_key" UNIQUE ("event_id", "player_id");



ALTER TABLE ONLY "public"."golf_event_attendance"
    ADD CONSTRAINT "golf_event_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_hole_shots"
    ADD CONSTRAINT "golf_hole_shots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_hole_shots"
    ADD CONSTRAINT "golf_hole_shots_round_id_hole_number_key" UNIQUE ("round_id", "hole_number");



ALTER TABLE ONLY "public"."golf_holes"
    ADD CONSTRAINT "golf_holes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_holes"
    ADD CONSTRAINT "golf_holes_round_id_hole_number_key" UNIQUE ("round_id", "hole_number");



ALTER TABLE ONLY "public"."golf_organizations"
    ADD CONSTRAINT "golf_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_player_classes"
    ADD CONSTRAINT "golf_player_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_player_stats"
    ADD CONSTRAINT "golf_player_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_player_stats"
    ADD CONSTRAINT "golf_player_stats_player_id_key" UNIQUE ("player_id");



ALTER TABLE ONLY "public"."golf_players"
    ADD CONSTRAINT "golf_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_qualifier_id_player_id_key" UNIQUE ("qualifier_id", "player_id");



ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_shots"
    ADD CONSTRAINT "golf_shots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_shots"
    ADD CONSTRAINT "golf_shots_round_id_hole_number_shot_number_key" UNIQUE ("round_id", "hole_number", "shot_number");



ALTER TABLE ONLY "public"."golf_task_completions"
    ADD CONSTRAINT "golf_task_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_task_completions"
    ADD CONSTRAINT "golf_task_completions_task_id_player_id_key" UNIQUE ("task_id", "player_id");



ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_teams"
    ADD CONSTRAINT "golf_teams_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."golf_teams"
    ADD CONSTRAINT "golf_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."high_schools"
    ADD CONSTRAINT "high_schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_attempts"
    ADD CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_achievements"
    ADD CONSTRAINT "player_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_comparisons"
    ADD CONSTRAINT "player_comparisons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_engagement_events"
    ADD CONSTRAINT "player_engagement_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_metrics"
    ADD CONSTRAINT "player_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_settings"
    ADD CONSTRAINT "player_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_settings"
    ADD CONSTRAINT "player_settings_player_id_key" UNIQUE ("player_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profile_views"
    ADD CONSTRAINT "profile_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruiting_interests"
    ADD CONSTRAINT "recruiting_interests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruiting_interests"
    ADD CONSTRAINT "recruiting_interests_player_id_organization_id_key" UNIQUE ("player_id", "organization_id");



ALTER TABLE ONLY "public"."round_holes"
    ADD CONSTRAINT "round_holes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."round_holes"
    ADD CONSTRAINT "round_holes_round_id_hole_number_key" UNIQUE ("round_id", "hole_number");



ALTER TABLE ONLY "public"."team_coach_staff"
    ADD CONSTRAINT "team_coach_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_coach_staff"
    ADD CONSTRAINT "team_coach_staff_team_id_coach_id_key" UNIQUE ("team_id", "coach_id");



ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_player_id_key" UNIQUE ("team_id", "player_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_views"
    ADD CONSTRAINT "video_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watchlists"
    ADD CONSTRAINT "watchlists_coach_id_player_id_key" UNIQUE ("coach_id", "player_id");



ALTER TABLE ONLY "public"."watchlists"
    ADD CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_calendar_all_day" ON "public"."coach_calendar_events" USING "btree" ("coach_id", "start_time") WHERE ("is_all_day" = true);



CREATE INDEX "idx_calendar_coach" ON "public"."coach_calendar_events" USING "btree" ("coach_id");



CREATE INDEX "idx_calendar_coach_range" ON "public"."coach_calendar_events" USING "btree" ("coach_id", "start_time", "end_time");



CREATE INDEX "idx_calendar_start" ON "public"."coach_calendar_events" USING "btree" ("start_time");



CREATE INDEX "idx_calendar_type" ON "public"."coach_calendar_events" USING "btree" ("event_type") WHERE ("event_type" IS NOT NULL);



CREATE INDEX "idx_camp_reg_camp" ON "public"."camp_registrations" USING "btree" ("camp_id");



CREATE INDEX "idx_camp_reg_camp_status" ON "public"."camp_registrations" USING "btree" ("camp_id", "status");



CREATE INDEX "idx_camp_reg_player" ON "public"."camp_registrations" USING "btree" ("player_id");



CREATE INDEX "idx_camp_reg_player_status" ON "public"."camp_registrations" USING "btree" ("player_id", "status");



CREATE INDEX "idx_camp_reg_status" ON "public"."camp_registrations" USING "btree" ("status");



CREATE INDEX "idx_camps_coach" ON "public"."camps" USING "btree" ("coach_id");



CREATE INDEX "idx_camps_date" ON "public"."camps" USING "btree" ("start_date");



CREATE INDEX "idx_camps_org" ON "public"."camps" USING "btree" ("organization_id");



CREATE INDEX "idx_camps_published" ON "public"."camps" USING "btree" ("start_date") WHERE (("status")::"text" = ANY ((ARRAY['published'::character varying, 'open'::character varying, 'limited'::character varying])::"text"[]));



CREATE INDEX "idx_camps_state" ON "public"."camps" USING "btree" ("location_state") WHERE ("location_state" IS NOT NULL);



CREATE INDEX "idx_camps_status" ON "public"."camps" USING "btree" ("status");



CREATE INDEX "idx_coach_notes_coach" ON "public"."coach_notes" USING "btree" ("coach_id");



CREATE INDEX "idx_coach_notes_coach_player" ON "public"."coach_notes" USING "btree" ("coach_id", "player_id");



CREATE INDEX "idx_coach_notes_created" ON "public"."coach_notes" USING "btree" ("coach_id", "created_at" DESC);



CREATE INDEX "idx_coach_notes_player" ON "public"."coach_notes" USING "btree" ("player_id");



CREATE INDEX "idx_coach_notes_tags" ON "public"."coach_notes" USING "gin" ("tags") WHERE ("array_length"("tags", 1) > 0);



CREATE INDEX "idx_coaches_college_id" ON "public"."coaches" USING "btree" ("college_id") WHERE ("college_id" IS NOT NULL);



CREATE INDEX "idx_coaches_conference" ON "public"."coaches" USING "btree" ("athletic_conference") WHERE ("athletic_conference" IS NOT NULL);



CREATE INDEX "idx_coaches_division" ON "public"."coaches" USING "btree" ("program_division") WHERE ("program_division" IS NOT NULL);



CREATE INDEX "idx_coaches_name_trgm" ON "public"."coaches" USING "gin" ("full_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_coaches_org" ON "public"."coaches" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_coaches_recruiting" ON "public"."coaches" USING "btree" ("coach_type", "program_division") WHERE ("coach_type" = 'college'::"public"."coach_type");



CREATE INDEX "idx_coaches_school_trgm" ON "public"."coaches" USING "gin" ("school_name" "public"."gin_trgm_ops") WHERE ("school_name" IS NOT NULL);



CREATE INDEX "idx_coaches_type" ON "public"."coaches" USING "btree" ("coach_type");



CREATE INDEX "idx_coaches_user" ON "public"."coaches" USING "btree" ("user_id");



CREATE INDEX "idx_comparisons_coach" ON "public"."player_comparisons" USING "btree" ("coach_id");



CREATE INDEX "idx_comparisons_created_at" ON "public"."player_comparisons" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_conversation_participants_user_id" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_demo_requests_created_at" ON "public"."demo_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_demo_requests_email" ON "public"."demo_requests" USING "btree" ("email");



CREATE UNIQUE INDEX "idx_demo_requests_email_unique" ON "public"."demo_requests" USING "btree" ("email") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_demo_requests_status" ON "public"."demo_requests" USING "btree" ("status");



CREATE INDEX "idx_dev_plans_coach" ON "public"."developmental_plans" USING "btree" ("coach_id");



CREATE INDEX "idx_dev_plans_dates" ON "public"."developmental_plans" USING "btree" ("start_date", "end_date") WHERE ("start_date" IS NOT NULL);



CREATE INDEX "idx_dev_plans_player" ON "public"."developmental_plans" USING "btree" ("player_id");



CREATE INDEX "idx_dev_plans_player_status" ON "public"."developmental_plans" USING "btree" ("player_id", "status");



CREATE INDEX "idx_dev_plans_status" ON "public"."developmental_plans" USING "btree" ("status");



CREATE INDEX "idx_dev_plans_team" ON "public"."developmental_plans" USING "btree" ("team_id");



CREATE INDEX "idx_engagement_coach" ON "public"."player_engagement_events" USING "btree" ("coach_id") WHERE ("coach_id" IS NOT NULL);



CREATE INDEX "idx_engagement_coach_type" ON "public"."player_engagement_events" USING "btree" ("coach_id", "engagement_type") WHERE ("coach_id" IS NOT NULL);



CREATE INDEX "idx_engagement_date" ON "public"."player_engagement_events" USING "btree" ("engagement_date");



CREATE INDEX "idx_engagement_player" ON "public"."player_engagement_events" USING "btree" ("player_id");



CREATE INDEX "idx_engagement_player_date" ON "public"."player_engagement_events" USING "btree" ("player_id", "engagement_date" DESC);



CREATE INDEX "idx_engagement_player_type" ON "public"."player_engagement_events" USING "btree" ("player_id", "engagement_type");



CREATE INDEX "idx_engagement_type" ON "public"."player_engagement_events" USING "btree" ("engagement_type");



CREATE INDEX "idx_engagement_video" ON "public"."player_engagement_events" USING "btree" ("video_id") WHERE ("video_id" IS NOT NULL);



CREATE INDEX "idx_events_created_by" ON "public"."events" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_events_org" ON "public"."events" USING "btree" ("organization_id");



CREATE INDEX "idx_events_public" ON "public"."events" USING "btree" ("start_time") WHERE ("is_public" = true);



CREATE INDEX "idx_events_start" ON "public"."events" USING "btree" ("start_time");



CREATE INDEX "idx_events_team" ON "public"."events" USING "btree" ("team_id");



CREATE INDEX "idx_events_team_start" ON "public"."events" USING "btree" ("team_id", "start_time") WHERE ("team_id" IS NOT NULL);



CREATE INDEX "idx_events_type" ON "public"."events" USING "btree" ("event_type");



CREATE INDEX "idx_golf_announcements_created_by" ON "public"."golf_announcements" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_golf_announcements_published" ON "public"."golf_announcements" USING "btree" ("published_at" DESC);



CREATE INDEX "idx_golf_announcements_team" ON "public"."golf_announcements" USING "btree" ("team_id");



CREATE INDEX "idx_golf_coach_notes_coach" ON "public"."golf_coach_notes" USING "btree" ("coach_id");



CREATE INDEX "idx_golf_coach_notes_player" ON "public"."golf_coach_notes" USING "btree" ("player_id");



CREATE INDEX "idx_golf_coaches_organization_id" ON "public"."golf_coaches" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_golf_coaches_team_id" ON "public"."golf_coaches" USING "btree" ("team_id") WHERE ("team_id" IS NOT NULL);



CREATE INDEX "idx_golf_course_holes_course_id" ON "public"."golf_course_holes" USING "btree" ("course_id");



CREATE INDEX "idx_golf_courses_created_by" ON "public"."golf_courses" USING "btree" ("created_by");



CREATE INDEX "idx_golf_courses_name" ON "public"."golf_courses" USING "btree" ("name");



CREATE INDEX "idx_golf_documents_team" ON "public"."golf_documents" USING "btree" ("team_id");



CREATE INDEX "idx_golf_documents_uploaded_by" ON "public"."golf_documents" USING "btree" ("uploaded_by") WHERE ("uploaded_by" IS NOT NULL);



CREATE INDEX "idx_golf_events_created_by" ON "public"."golf_events" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_golf_events_date" ON "public"."golf_events" USING "btree" ("start_date");



CREATE INDEX "idx_golf_events_team" ON "public"."golf_events" USING "btree" ("team_id");



CREATE INDEX "idx_golf_hole_shots_round_id" ON "public"."golf_hole_shots" USING "btree" ("round_id");



CREATE INDEX "idx_golf_holes_round_id" ON "public"."golf_holes" USING "btree" ("round_id");



CREATE INDEX "idx_golf_player_classes_days" ON "public"."golf_player_classes" USING "gin" ("days");



CREATE INDEX "idx_golf_player_classes_player" ON "public"."golf_player_classes" USING "btree" ("player_id");



CREATE INDEX "idx_golf_player_classes_semester" ON "public"."golf_player_classes" USING "btree" ("semester");



CREATE INDEX "idx_golf_player_stats_player" ON "public"."golf_player_stats" USING "btree" ("player_id");



CREATE INDEX "idx_golf_players_email" ON "public"."golf_players" USING "btree" ("email");



CREATE INDEX "idx_golf_players_team_id" ON "public"."golf_players" USING "btree" ("team_id");



CREATE INDEX "idx_golf_players_user_id" ON "public"."golf_players" USING "btree" ("user_id");



CREATE INDEX "idx_golf_qualifiers_created_by" ON "public"."golf_qualifiers" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_golf_qualifiers_status" ON "public"."golf_qualifiers" USING "btree" ("status");



CREATE INDEX "idx_golf_qualifiers_team" ON "public"."golf_qualifiers" USING "btree" ("team_id");



CREATE INDEX "idx_golf_rounds_date" ON "public"."golf_rounds" USING "btree" ("round_date" DESC);



CREATE INDEX "idx_golf_rounds_player_id" ON "public"."golf_rounds" USING "btree" ("player_id");



CREATE INDEX "idx_golf_shots_hole" ON "public"."golf_shots" USING "btree" ("hole_id");



CREATE INDEX "idx_golf_shots_round" ON "public"."golf_shots" USING "btree" ("round_id");



CREATE INDEX "idx_golf_shots_round_hole" ON "public"."golf_shots" USING "btree" ("round_id", "hole_number");



CREATE INDEX "idx_golf_shots_type" ON "public"."golf_shots" USING "btree" ("shot_type");



CREATE INDEX "idx_golf_tasks_created_by" ON "public"."golf_tasks" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_golf_tasks_due" ON "public"."golf_tasks" USING "btree" ("due_date");



CREATE INDEX "idx_golf_tasks_team" ON "public"."golf_tasks" USING "btree" ("team_id");



CREATE INDEX "idx_golf_teams_invite_code" ON "public"."golf_teams" USING "btree" ("invite_code") WHERE ("invite_code" IS NOT NULL);



CREATE INDEX "idx_golf_teams_organization_id" ON "public"."golf_teams" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_golf_travel_created_by" ON "public"."golf_travel_itineraries" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_golf_travel_date" ON "public"."golf_travel_itineraries" USING "btree" ("departure_date");



CREATE INDEX "idx_golf_travel_event_id" ON "public"."golf_travel_itineraries" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "idx_golf_travel_team" ON "public"."golf_travel_itineraries" USING "btree" ("team_id");



CREATE INDEX "idx_login_attempts_email" ON "public"."login_attempts" USING "btree" ("email");



CREATE INDEX "idx_login_attempts_last_attempt" ON "public"."login_attempts" USING "btree" ("last_attempt");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id", "sent_at" DESC);



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_messages_sent_at" ON "public"."messages" USING "btree" ("sent_at" DESC);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "read");



CREATE INDEX "idx_organizations_division" ON "public"."organizations" USING "btree" ("division") WHERE ("division" IS NOT NULL);



CREATE INDEX "idx_organizations_name_trgm" ON "public"."organizations" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_organizations_state" ON "public"."organizations" USING "btree" ("location_state");



CREATE INDEX "idx_organizations_type" ON "public"."organizations" USING "btree" ("type");



CREATE INDEX "idx_player_achievements_date" ON "public"."player_achievements" USING "btree" ("player_id", "achievement_date" DESC NULLS LAST);



CREATE INDEX "idx_player_achievements_player" ON "public"."player_achievements" USING "btree" ("player_id");



CREATE INDEX "idx_player_achievements_type" ON "public"."player_achievements" USING "btree" ("achievement_type") WHERE ("achievement_type" IS NOT NULL);



CREATE INDEX "idx_player_engagement_viewer_id" ON "public"."player_engagement_events" USING "btree" ("viewer_user_id") WHERE ("viewer_user_id" IS NOT NULL);



CREATE INDEX "idx_player_metrics_player" ON "public"."player_metrics" USING "btree" ("player_id");



CREATE INDEX "idx_player_metrics_recorded" ON "public"."player_metrics" USING "btree" ("player_id", "recorded_at" DESC);



CREATE INDEX "idx_player_metrics_type" ON "public"."player_metrics" USING "btree" ("metric_type");



CREATE INDEX "idx_player_metrics_verified" ON "public"."player_metrics" USING "btree" ("player_id", "verified") WHERE ("verified" = true);



CREATE INDEX "idx_player_metrics_verified_by" ON "public"."player_metrics" USING "btree" ("verified_by") WHERE ("verified_by" IS NOT NULL);



CREATE INDEX "idx_player_settings_discoverable" ON "public"."player_settings" USING "btree" ("player_id") WHERE ("is_discoverable" = true);



CREATE INDEX "idx_player_settings_player" ON "public"."player_settings" USING "btree" ("player_id");



CREATE INDEX "idx_players_college_org" ON "public"."players" USING "btree" ("college_org_id") WHERE ("college_org_id" IS NOT NULL);



CREATE INDEX "idx_players_committed" ON "public"."players" USING "btree" ("committed_to_org_id") WHERE ("committed_to_org_id" IS NOT NULL);



CREATE INDEX "idx_players_committed_to" ON "public"."players" USING "btree" ("committed_to") WHERE ("committed_to" IS NOT NULL);



CREATE INDEX "idx_players_full_name_trgm" ON "public"."players" USING "gin" ("full_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_players_grad_year" ON "public"."players" USING "btree" ("grad_year");



CREATE INDEX "idx_players_high_school_id" ON "public"."players" USING "btree" ("high_school_id") WHERE ("high_school_id" IS NOT NULL);



CREATE INDEX "idx_players_hs_org" ON "public"."players" USING "btree" ("high_school_org_id") WHERE ("high_school_org_id" IS NOT NULL);



CREATE INDEX "idx_players_position" ON "public"."players" USING "btree" ("primary_position");



CREATE INDEX "idx_players_recruiting" ON "public"."players" USING "btree" ("recruiting_activated") WHERE ("recruiting_activated" = true);



CREATE INDEX "idx_players_recruiting_grad_pos" ON "public"."players" USING "btree" ("recruiting_activated", "grad_year", "primary_position") WHERE ("recruiting_activated" = true);



CREATE INDEX "idx_players_search" ON "public"."players" USING "gin" ("search_vector");



CREATE INDEX "idx_players_showcase_org" ON "public"."players" USING "btree" ("showcase_org_id") WHERE ("showcase_org_id" IS NOT NULL);



CREATE INDEX "idx_players_state" ON "public"."players" USING "btree" ("state");



CREATE INDEX "idx_players_type" ON "public"."players" USING "btree" ("player_type");



CREATE INDEX "idx_profile_views_player" ON "public"."profile_views" USING "btree" ("player_id", "created_at" DESC);



CREATE INDEX "idx_profile_views_viewer_id" ON "public"."profile_views" USING "btree" ("viewer_id") WHERE ("viewer_id" IS NOT NULL);



CREATE INDEX "idx_recruiting_last_contact" ON "public"."recruiting_interests" USING "btree" ("player_id", "last_contact_at" DESC NULLS LAST);



CREATE INDEX "idx_recruiting_org" ON "public"."recruiting_interests" USING "btree" ("organization_id");



CREATE INDEX "idx_recruiting_player" ON "public"."recruiting_interests" USING "btree" ("player_id");



CREATE INDEX "idx_recruiting_player_status" ON "public"."recruiting_interests" USING "btree" ("player_id", "status");



CREATE INDEX "idx_recruiting_status" ON "public"."recruiting_interests" USING "btree" ("status");



CREATE INDEX "idx_round_holes_round_id" ON "public"."round_holes" USING "btree" ("round_id");



CREATE INDEX "idx_team_invitations_active" ON "public"."team_invitations" USING "btree" ("invite_code") WHERE ("is_active" = true);



CREATE INDEX "idx_team_invitations_code" ON "public"."team_invitations" USING "btree" ("invite_code");



CREATE INDEX "idx_team_invitations_created_by" ON "public"."team_invitations" USING "btree" ("created_by");



CREATE INDEX "idx_team_invitations_expires" ON "public"."team_invitations" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "idx_team_invitations_team" ON "public"."team_invitations" USING "btree" ("team_id");



CREATE INDEX "idx_team_members_active" ON "public"."team_members" USING "btree" ("team_id", "status") WHERE (("status")::"text" = 'active'::"text");



CREATE INDEX "idx_team_members_player" ON "public"."team_members" USING "btree" ("player_id");



CREATE INDEX "idx_team_members_player_active" ON "public"."team_members" USING "btree" ("player_id", "status") WHERE (("status")::"text" = 'active'::"text");



CREATE INDEX "idx_team_members_team" ON "public"."team_members" USING "btree" ("team_id");



CREATE INDEX "idx_team_staff_coach" ON "public"."team_coach_staff" USING "btree" ("coach_id");



CREATE UNIQUE INDEX "idx_team_staff_one_primary_per_team" ON "public"."team_coach_staff" USING "btree" ("team_id") WHERE ("is_primary" = true);



CREATE INDEX "idx_team_staff_primary" ON "public"."team_coach_staff" USING "btree" ("team_id", "is_primary") WHERE ("is_primary" = true);



CREATE INDEX "idx_team_staff_team" ON "public"."team_coach_staff" USING "btree" ("team_id");



CREATE INDEX "idx_teams_coach" ON "public"."teams" USING "btree" ("head_coach_id");



CREATE INDEX "idx_teams_org" ON "public"."teams" USING "btree" ("organization_id");



CREATE INDEX "idx_teams_season" ON "public"."teams" USING "btree" ("season_year") WHERE ("season_year" IS NOT NULL);



CREATE INDEX "idx_teams_type" ON "public"."teams" USING "btree" ("team_type");



CREATE INDEX "idx_video_views_video_id" ON "public"."video_views" USING "btree" ("video_id");



CREATE INDEX "idx_video_views_viewer_id" ON "public"."video_views" USING "btree" ("viewer_id") WHERE ("viewer_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_videos_one_primary_per_player" ON "public"."videos" USING "btree" ("player_id") WHERE ("is_primary" = true);



CREATE INDEX "idx_videos_player_id" ON "public"."videos" USING "btree" ("player_id");



CREATE INDEX "idx_watchlists_coach" ON "public"."watchlists" USING "btree" ("coach_id");



CREATE INDEX "idx_watchlists_last_contact" ON "public"."watchlists" USING "btree" ("last_contact");



CREATE INDEX "idx_watchlists_player" ON "public"."watchlists" USING "btree" ("player_id");



CREATE INDEX "idx_watchlists_stage" ON "public"."watchlists" USING "btree" ("pipeline_stage");



CREATE OR REPLACE TRIGGER "auto_update_camp_status" BEFORE UPDATE ON "public"."camps" FOR EACH ROW WHEN (("new"."registration_count" IS DISTINCT FROM "old"."registration_count")) EXECUTE FUNCTION "public"."update_camp_status"();



CREATE OR REPLACE TRIGGER "camp_registration_counts" AFTER INSERT OR DELETE OR UPDATE ON "public"."camp_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_camp_counts"();



CREATE OR REPLACE TRIGGER "create_player_settings_on_insert" AFTER INSERT ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_player_settings"();



CREATE OR REPLACE TRIGGER "player_comparisons_updated_at" BEFORE UPDATE ON "public"."player_comparisons" FOR EACH ROW EXECUTE FUNCTION "public"."update_player_comparisons_updated_at"();



CREATE OR REPLACE TRIGGER "set_dev_plan_sent_timestamp" BEFORE UPDATE ON "public"."developmental_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_dev_plan_sent_at"();



CREATE OR REPLACE TRIGGER "set_recruiting_activated_timestamp" BEFORE UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."set_recruiting_activated_at"();



CREATE OR REPLACE TRIGGER "sync_coach_org_name" BEFORE UPDATE ON "public"."coaches" FOR EACH ROW WHEN (("new"."organization_id" IS DISTINCT FROM "old"."organization_id")) EXECUTE FUNCTION "public"."sync_coach_organization_name"();



CREATE OR REPLACE TRIGGER "update_camp_registrations_updated_at" BEFORE UPDATE ON "public"."camp_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_camps_updated_at" BEFORE UPDATE ON "public"."camps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_coach_calendar_events_updated_at" BEFORE UPDATE ON "public"."coach_calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_coach_notes_updated_at" BEFORE UPDATE ON "public"."coach_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_coaches_updated_at" BEFORE UPDATE ON "public"."coaches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_developmental_plans_updated_at" BEFORE UPDATE ON "public"."developmental_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_golf_announcements_updated_at" BEFORE UPDATE ON "public"."golf_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_coach_notes_updated_at" BEFORE UPDATE ON "public"."golf_coach_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_coaches_updated_at" BEFORE UPDATE ON "public"."golf_coaches" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_documents_updated_at" BEFORE UPDATE ON "public"."golf_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_events_updated_at" BEFORE UPDATE ON "public"."golf_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_organizations_updated_at" BEFORE UPDATE ON "public"."golf_organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_player_classes_updated_at" BEFORE UPDATE ON "public"."golf_player_classes" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_qualifiers_updated_at" BEFORE UPDATE ON "public"."golf_qualifiers" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_tasks_updated_at" BEFORE UPDATE ON "public"."golf_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_teams_updated_at" BEFORE UPDATE ON "public"."golf_teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_golf_travel_itineraries_updated_at" BEFORE UPDATE ON "public"."golf_travel_itineraries" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_player_achievements_updated_at" BEFORE UPDATE ON "public"."player_achievements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_player_metrics_updated_at" BEFORE UPDATE ON "public"."player_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_player_settings_updated_at" BEFORE UPDATE ON "public"."player_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_players_updated_at" BEFORE UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_recruiting_interests_updated_at" BEFORE UPDATE ON "public"."recruiting_interests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_team_coach_staff_updated_at" BEFORE UPDATE ON "public"."team_coach_staff" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_team_members_updated_at" BEFORE UPDATE ON "public"."team_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_videos_updated_at" BEFORE UPDATE ON "public"."videos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_watchlists_updated_at" BEFORE UPDATE ON "public"."watchlists" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."camp_registrations"
    ADD CONSTRAINT "camp_registrations_camp_id_fkey" FOREIGN KEY ("camp_id") REFERENCES "public"."camps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."camp_registrations"
    ADD CONSTRAINT "camp_registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."camps"
    ADD CONSTRAINT "camps_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."camps"
    ADD CONSTRAINT "camps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_calendar_events"
    ADD CONSTRAINT "coach_calendar_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."developmental_plans"
    ADD CONSTRAINT "developmental_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."developmental_plans"
    ADD CONSTRAINT "developmental_plans_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."developmental_plans"
    ADD CONSTRAINT "developmental_plans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."golf_announcement_acknowledgements"
    ADD CONSTRAINT "golf_announcement_acknowledgements_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."golf_announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_announcements"
    ADD CONSTRAINT "golf_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id");



ALTER TABLE ONLY "public"."golf_announcements"
    ADD CONSTRAINT "golf_announcements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_coach_notes"
    ADD CONSTRAINT "golf_coach_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."golf_organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_course_holes"
    ADD CONSTRAINT "golf_course_holes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."golf_documents"
    ADD CONSTRAINT "golf_documents_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_documents"
    ADD CONSTRAINT "golf_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."golf_coaches"("id");



ALTER TABLE ONLY "public"."golf_event_attendance"
    ADD CONSTRAINT "golf_event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."golf_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id");



ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_hole_shots"
    ADD CONSTRAINT "golf_hole_shots_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_holes"
    ADD CONSTRAINT "golf_holes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_players"
    ADD CONSTRAINT "golf_players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."golf_players"
    ADD CONSTRAINT "golf_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_qualifier_id_fkey" FOREIGN KEY ("qualifier_id") REFERENCES "public"."golf_qualifiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id");



ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_task_completions"
    ADD CONSTRAINT "golf_task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."golf_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id");



ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_teams"
    ADD CONSTRAINT "golf_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."golf_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id");



ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."golf_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_achievements"
    ADD CONSTRAINT "player_achievements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_comparisons"
    ADD CONSTRAINT "player_comparisons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_engagement_events"
    ADD CONSTRAINT "player_engagement_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_engagement_events"
    ADD CONSTRAINT "player_engagement_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_engagement_events"
    ADD CONSTRAINT "player_engagement_events_viewer_user_id_fkey" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_metrics"
    ADD CONSTRAINT "player_metrics_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_metrics"
    ADD CONSTRAINT "player_metrics_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_settings"
    ADD CONSTRAINT "player_settings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_college_org_id_fkey" FOREIGN KEY ("college_org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_committed_to_fkey" FOREIGN KEY ("committed_to") REFERENCES "public"."colleges"("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_committed_to_org_id_fkey" FOREIGN KEY ("committed_to_org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_high_school_id_fkey" FOREIGN KEY ("high_school_id") REFERENCES "public"."high_schools"("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_high_school_org_id_fkey" FOREIGN KEY ("high_school_org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_showcase_org_id_fkey" FOREIGN KEY ("showcase_org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_views"
    ADD CONSTRAINT "profile_views_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_views"
    ADD CONSTRAINT "profile_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."recruiting_interests"
    ADD CONSTRAINT "recruiting_interests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recruiting_interests"
    ADD CONSTRAINT "recruiting_interests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_coach_staff"
    ADD CONSTRAINT "team_coach_staff_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_coach_staff"
    ADD CONSTRAINT "team_coach_staff_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_head_coach_id_fkey" FOREIGN KEY ("head_coach_id") REFERENCES "public"."coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_views"
    ADD CONSTRAINT "video_views_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_views"
    ADD CONSTRAINT "video_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlists"
    ADD CONSTRAINT "watchlists_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlists"
    ADD CONSTRAINT "watchlists_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



CREATE POLICY "Achievements viewable for recruiting players" ON "public"."player_achievements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."players" "p"
     JOIN "public"."player_settings" "ps" ON (("ps"."player_id" = "p"."id")))
  WHERE (("p"."id" = "player_achievements"."player_id") AND ("p"."recruiting_activated" = true) AND ("ps"."is_discoverable" = true)))));



CREATE POLICY "Activated players are public" ON "public"."players" FOR SELECT USING (("recruiting_activated" = true));



CREATE POLICY "Active invitations viewable by code" ON "public"."team_invitations" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Admins can manage organizations" ON "public"."organizations" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Admins can view demo requests" ON "public"."demo_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Allow authenticated users to insert own profile" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Allow service role to insert users" ON "public"."users" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Anonymous engagement can be recorded" ON "public"."player_engagement_events" FOR INSERT TO "authenticated" WITH CHECK (("is_anonymous" = true));



CREATE POLICY "Anyone can create views" ON "public"."profile_views" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can record video views" ON "public"."video_views" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can submit demo requests" ON "public"."demo_requests" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can view coach profiles" ON "public"."coaches" FOR SELECT USING (true);



COMMENT ON POLICY "Anyone can view coach profiles" ON "public"."coaches" IS 'Public visibility for coach discovery features';



CREATE POLICY "Anyone can view coaches" ON "public"."coaches" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can access golf_shots" ON "public"."golf_shots" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can create golf organizations" ON "public"."golf_organizations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create golf teams" ON "public"."golf_teams" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create organizations" ON "public"."golf_organizations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create teams" ON "public"."golf_teams" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read golf organizations" ON "public"."golf_organizations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read organizations" ON "public"."organizations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can view coaches" ON "public"."golf_coaches" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view teams" ON "public"."golf_teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Coach manages own profile" ON "public"."golf_coaches" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Coach notes are private" ON "public"."coach_notes" FOR SELECT USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'coach'::"public"."user_role")))));



CREATE POLICY "Coaches can delete own comparisons" ON "public"."player_comparisons" FOR DELETE USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can delete their team" ON "public"."golf_teams" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."team_id" = "golf_teams"."id")))));



CREATE POLICY "Coaches can insert own comparisons" ON "public"."player_comparisons" FOR INSERT WITH CHECK (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can manage announcements" ON "public"."golf_announcements" TO "authenticated" USING ("public"."is_golf_coach_of_team"("team_id"));



CREATE POLICY "Coaches can manage documents" ON "public"."golf_documents" TO "authenticated" USING ("public"."is_golf_coach_of_team"("team_id"));



CREATE POLICY "Coaches can manage own calendar" ON "public"."coach_calendar_events" USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can manage own camps" ON "public"."camps" USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can manage own dev plans" ON "public"."developmental_plans" USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can manage own events" ON "public"."events" USING (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Coaches can manage own notes" ON "public"."coach_notes" USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can manage own notes" ON "public"."golf_coach_notes" TO "authenticated" USING (("coach_id" = "public"."get_golf_coach_id"()));



CREATE POLICY "Coaches can manage own profile" ON "public"."coaches" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Coaches can manage qualifier entries" ON "public"."golf_qualifier_entries" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_entries"."qualifier_id") AND "public"."is_golf_coach_of_team"("q"."team_id")))));



CREATE POLICY "Coaches can manage qualifiers" ON "public"."golf_qualifiers" TO "authenticated" USING ("public"."is_golf_coach_of_team"("team_id"));



CREATE POLICY "Coaches can manage tasks" ON "public"."golf_tasks" TO "authenticated" USING ("public"."is_golf_coach_of_team"("team_id"));



CREATE POLICY "Coaches can manage team events" ON "public"."golf_events" TO "authenticated" USING ("public"."is_golf_coach_of_team"("team_id"));



CREATE POLICY "Coaches can manage team invitations" ON "public"."team_invitations" USING (("team_id" IN ( SELECT "t"."id"
   FROM (("public"."teams" "t"
     JOIN "public"."team_coach_staff" "tcs" ON (("tcs"."team_id" = "t"."id")))
     JOIN "public"."coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can manage team members" ON "public"."team_members" USING (("team_id" IN ( SELECT "t"."id"
   FROM (("public"."teams" "t"
     JOIN "public"."team_coach_staff" "tcs" ON (("tcs"."team_id" = "t"."id")))
     JOIN "public"."coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can manage travel itineraries" ON "public"."golf_travel_itineraries" TO "authenticated" USING ("public"."is_golf_coach_of_team"("team_id"));



CREATE POLICY "Coaches can record engagement" ON "public"."player_engagement_events" FOR INSERT WITH CHECK (("viewer_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Coaches can update own comparisons" ON "public"."player_comparisons" FOR UPDATE USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can update own organization" ON "public"."organizations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."coaches"
  WHERE (("coaches"."user_id" = "auth"."uid"()) AND ("coaches"."organization_id" = "organizations"."id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."coaches"
  WHERE (("coaches"."user_id" = "auth"."uid"()) AND ("coaches"."organization_id" = "organizations"."id")))));



CREATE POLICY "Coaches can update registrations for their camps" ON "public"."camp_registrations" FOR UPDATE USING (("camp_id" IN ( SELECT "camps"."id"
   FROM "public"."camps"
  WHERE ("camps"."coach_id" IN ( SELECT "coaches"."id"
           FROM "public"."coaches"
          WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Coaches can update their team" ON "public"."golf_teams" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."team_id" = "golf_teams"."id")))));



CREATE POLICY "Coaches can verify metrics" ON "public"."player_metrics" FOR UPDATE USING (true);



CREATE POLICY "Coaches can view acknowledgements" ON "public"."golf_announcement_acknowledgements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_announcements" "a"
  WHERE (("a"."id" = "golf_announcement_acknowledgements"."announcement_id") AND "public"."is_golf_coach_of_team"("a"."team_id")))));



CREATE POLICY "Coaches can view all players" ON "public"."players" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'coach'::"public"."user_role")))));



COMMENT ON POLICY "Coaches can view all players" ON "public"."players" IS 'Allows coaches to discover and recruit players';



CREATE POLICY "Coaches can view own comparisons" ON "public"."player_comparisons" FOR SELECT USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Coaches can view own engagement" ON "public"."player_engagement_events" FOR SELECT USING (("viewer_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Coaches can view player metrics" ON "public"."player_metrics" FOR SELECT USING (true);



CREATE POLICY "Coaches can view player videos" ON "public"."videos" FOR SELECT USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."recruiting_activated" = true))));



CREATE POLICY "Coaches can view registrations for their camps" ON "public"."camp_registrations" FOR SELECT USING (("camp_id" IN ( SELECT "camps"."id"
   FROM "public"."camps"
  WHERE ("camps"."coach_id" IN ( SELECT "coaches"."id"
           FROM "public"."coaches"
          WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Coaches can view task completions" ON "public"."golf_task_completions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_tasks" "t"
  WHERE (("t"."id" = "golf_task_completions"."task_id") AND "public"."is_golf_coach_of_team"("t"."team_id")))));



CREATE POLICY "Coaches can view team event attendance" ON "public"."golf_event_attendance" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_attendance"."event_id") AND "public"."is_golf_coach_of_team"("e"."team_id")))));



CREATE POLICY "Coaches can view team holes" ON "public"."golf_holes" FOR SELECT TO "authenticated" USING (("round_id" IN ( SELECT "gr"."id"
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."team_id" IN ( SELECT "golf_coaches"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Coaches can view team rounds" ON "public"."golf_rounds" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gp"."id"
   FROM "public"."golf_players" "gp"
  WHERE ("gp"."team_id" IN ( SELECT "golf_coaches"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Coaches can view team shots" ON "public"."golf_hole_shots" FOR SELECT TO "authenticated" USING (("round_id" IN ( SELECT "gr"."id"
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."team_id" IN ( SELECT "golf_coaches"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Coaches manage own watchlist" ON "public"."watchlists" USING (("coach_id" IN ( SELECT "coaches"."id"
   FROM "public"."coaches"
  WHERE ("coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Colleges viewable by authenticated users" ON "public"."colleges" FOR SELECT USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "Create organizations" ON "public"."golf_organizations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users" ON "public"."golf_events" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable select for authenticated users" ON "public"."golf_events" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Golf coaches can create organizations" ON "public"."golf_organizations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'coach'::"public"."user_role")))));



CREATE POLICY "Golf coaches can insert teams" ON "public"."golf_teams" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'coach'::"public"."user_role")))));



CREATE POLICY "Golf coaches can update own organization" ON "public"."golf_organizations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."organization_id" = "golf_organizations"."id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."organization_id" = "golf_organizations"."id")))));



CREATE POLICY "Golf coaches can update their team" ON "public"."golf_teams" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."team_id" = "golf_teams"."id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."team_id" = "golf_teams"."id")))));



CREATE POLICY "Head coaches can manage team events" ON "public"."events" USING (("team_id" IN ( SELECT "t"."id"
   FROM (("public"."teams" "t"
     JOIN "public"."team_coach_staff" "tcs" ON (("tcs"."team_id" = "t"."id")))
     JOIN "public"."coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."is_primary" = true)))));



CREATE POLICY "Head coaches can manage team staff" ON "public"."team_coach_staff" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_coach_staff"."team_id") AND ("t"."head_coach_id" IN ( SELECT "coaches"."id"
           FROM "public"."coaches"
          WHERE ("coaches"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Head coaches can manage their teams" ON "public"."teams" USING (("id" IN ( SELECT "t"."id"
   FROM (("public"."teams" "t"
     JOIN "public"."team_coach_staff" "tcs" ON (("tcs"."team_id" = "t"."id")))
     JOIN "public"."coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."is_primary" = true)))));



CREATE POLICY "High schools viewable by authenticated users" ON "public"."high_schools" FOR SELECT USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "Organizations are viewable by all authenticated users" ON "public"."organizations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Players can always view own interests" ON "public"."recruiting_interests" FOR SELECT USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can manage own achievements" ON "public"."player_achievements" USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can manage own acknowledgements" ON "public"."golf_announcement_acknowledgements" TO "authenticated" USING (("player_id" = "public"."get_golf_player_id"()));



CREATE POLICY "Players can manage own attendance" ON "public"."golf_event_attendance" TO "authenticated" USING (("player_id" = "public"."get_golf_player_id"()));



CREATE POLICY "Players can manage own classes" ON "public"."golf_player_classes" TO "authenticated" USING (("player_id" = "public"."get_golf_player_id"()));



CREATE POLICY "Players can manage own holes" ON "public"."golf_holes" TO "authenticated" USING (("round_id" IN ( SELECT "golf_rounds"."id"
   FROM "public"."golf_rounds"
  WHERE ("golf_rounds"."player_id" IN ( SELECT "golf_players"."id"
           FROM "public"."golf_players"
          WHERE ("golf_players"."user_id" = "auth"."uid"())))))) WITH CHECK (("round_id" IN ( SELECT "golf_rounds"."id"
   FROM "public"."golf_rounds"
  WHERE ("golf_rounds"."player_id" IN ( SELECT "golf_players"."id"
           FROM "public"."golf_players"
          WHERE ("golf_players"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Players can manage own metrics" ON "public"."player_metrics" USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can manage own profile" ON "public"."players" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Players can manage own recruiting interests" ON "public"."recruiting_interests" USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can manage own registrations" ON "public"."camp_registrations" USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can manage own rounds" ON "public"."golf_rounds" TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = "auth"."uid"())))) WITH CHECK (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = "auth"."uid"()))));



CREATE POLICY "Players can manage own settings" ON "public"."player_settings" USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can manage own shots" ON "public"."golf_hole_shots" TO "authenticated" USING (("round_id" IN ( SELECT "golf_rounds"."id"
   FROM "public"."golf_rounds"
  WHERE ("golf_rounds"."player_id" IN ( SELECT "golf_players"."id"
           FROM "public"."golf_players"
          WHERE ("golf_players"."user_id" = "auth"."uid"())))))) WITH CHECK (("round_id" IN ( SELECT "golf_rounds"."id"
   FROM "public"."golf_rounds"
  WHERE ("golf_rounds"."player_id" IN ( SELECT "golf_players"."id"
           FROM "public"."golf_players"
          WHERE ("golf_players"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Players can manage own task completions" ON "public"."golf_task_completions" TO "authenticated" USING (("player_id" = "public"."get_golf_player_id"()));



CREATE POLICY "Players can manage own videos" ON "public"."videos" USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = "auth"."uid"()))));



CREATE POLICY "Players can update own dev plans progress" ON "public"."developmental_plans" FOR UPDATE USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can view own dev plans" ON "public"."developmental_plans" FOR SELECT USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can view own engagement" ON "public"."player_engagement_events" FOR SELECT USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players can view own holes" ON "public"."golf_holes" FOR SELECT TO "authenticated" USING (("round_id" IN ( SELECT "golf_rounds"."id"
   FROM "public"."golf_rounds"
  WHERE ("golf_rounds"."player_id" IN ( SELECT "golf_players"."id"
           FROM "public"."golf_players"
          WHERE ("golf_players"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Players can view own rounds" ON "public"."golf_rounds" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = "auth"."uid"()))));



CREATE POLICY "Players can view own shots" ON "public"."golf_hole_shots" FOR SELECT TO "authenticated" USING (("round_id" IN ( SELECT "golf_rounds"."id"
   FROM "public"."golf_rounds"
  WHERE ("golf_rounds"."player_id" IN ( SELECT "golf_players"."id"
           FROM "public"."golf_players"
          WHERE ("golf_players"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Players can view shared notes about themselves" ON "public"."golf_coach_notes" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_golf_player_id"()) AND ("shared_with_player" = true)));



CREATE POLICY "Players manage own videos" ON "public"."videos" USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Players see own views" ON "public"."profile_views" FOR SELECT USING (("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Public events viewable by all" ON "public"."events" FOR SELECT TO "authenticated" USING (("is_public" = true));



CREATE POLICY "Published camps viewable by all" ON "public"."camps" FOR SELECT TO "authenticated" USING ((("status")::"text" = ANY ((ARRAY['published'::character varying, 'open'::character varying, 'limited'::character varying, 'full'::character varying])::"text"[])));



CREATE POLICY "Service role only" ON "public"."login_attempts" USING (false);



CREATE POLICY "System can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Team events viewable by team" ON "public"."events" FOR SELECT USING (("team_id" IN ( SELECT "tm"."team_id"
   FROM ("public"."team_members" "tm"
     JOIN "public"."players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ((("tm"."status")::"text" = 'active'::"text") OR ("tm"."status" IS NULL))))));



CREATE POLICY "Team members can view announcements" ON "public"."golf_announcements" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_member"("team_id"));



CREATE POLICY "Team members can view events" ON "public"."golf_events" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_member"("team_id"));



CREATE POLICY "Team members can view qualifier entries" ON "public"."golf_qualifier_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_entries"."qualifier_id") AND "public"."is_golf_team_member"("q"."team_id")))));



CREATE POLICY "Team members can view qualifiers" ON "public"."golf_qualifiers" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_member"("team_id"));



CREATE POLICY "Team members can view tasks" ON "public"."golf_tasks" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_member"("team_id"));



CREATE POLICY "Team members can view team" ON "public"."teams" FOR SELECT USING (("id" IN ( SELECT "tm"."team_id"
   FROM ("public"."team_members" "tm"
     JOIN "public"."players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ((("tm"."status")::"text" = 'active'::"text") OR ("tm"."status" IS NULL))))));



CREATE POLICY "Team members can view team documents" ON "public"."golf_documents" FOR SELECT TO "authenticated" USING (("public"."is_golf_team_member"("team_id") AND (("player_visible" = true) OR "public"."is_golf_coach_of_team"("team_id"))));



CREATE POLICY "Team members can view travel itineraries" ON "public"."golf_travel_itineraries" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_member"("team_id"));



CREATE POLICY "Team members viewable by team" ON "public"."team_members" FOR SELECT USING (("team_id" IN ( SELECT "tm"."team_id"
   FROM ("public"."team_members" "tm"
     JOIN "public"."players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ((("tm"."status")::"text" = 'active'::"text") OR ("tm"."status" IS NULL))))));



CREATE POLICY "Team staff viewable by team" ON "public"."team_coach_staff" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_coach_staff"."team_id") AND (("t"."head_coach_id" IN ( SELECT "coaches"."id"
           FROM "public"."coaches"
          WHERE ("coaches"."user_id" = "auth"."uid"()))) OR "public"."is_user_on_team_staff"("t"."id") OR (EXISTS ( SELECT 1
           FROM ("public"."team_members" "tm"
             JOIN "public"."players" "p" ON (("p"."id" = "tm"."player_id")))
          WHERE (("tm"."team_id" = "t"."id") AND ("p"."user_id" = "auth"."uid"()) AND (("tm"."status")::"text" = 'active'::"text")))))))));



CREATE POLICY "Update own organization" ON "public"."golf_organizations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."organization_id" = "golf_organizations"."id")))));



CREATE POLICY "Users can create conversations" ON "public"."conversations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can create courses" ON "public"."golf_courses" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can create own coach profile" ON "public"."coaches" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can create own golf coach profile" ON "public"."golf_coaches" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can create own golf player profile" ON "public"."golf_players" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can create own player profile" ON "public"."players" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can delete own courses" ON "public"."golf_courses" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own coach profile" ON "public"."coaches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own coaches record" ON "public"."coaches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own golf coach profile" ON "public"."golf_coaches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own golf player profile" ON "public"."golf_players" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own golf_coaches record" ON "public"."golf_coaches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own golf_players record" ON "public"."golf_players" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own player profile" ON "public"."players" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own players record" ON "public"."players" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "id")));



CREATE POLICY "Users can insert own record" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert video views" ON "public"."video_views" FOR INSERT WITH CHECK ((("viewer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("viewer_id" IS NULL)));



CREATE POLICY "Users can join conversations" ON "public"."conversation_participants" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can manage course holes" ON "public"."golf_course_holes" USING (("course_id" IN ( SELECT "golf_courses"."id"
   FROM "public"."golf_courses"
  WHERE ("golf_courses"."created_by" = "auth"."uid"()))));



CREATE POLICY "Users can read own coach profile" ON "public"."coaches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own coaches record" ON "public"."coaches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own data" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



COMMENT ON POLICY "Users can read own data" ON "public"."users" IS 'Allows users to read their own user record';



CREATE POLICY "Users can read own golf coach profile" ON "public"."golf_coaches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own golf player profile" ON "public"."golf_players" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own golf_coaches record" ON "public"."golf_coaches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own golf_players record" ON "public"."golf_players" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own player profile" ON "public"."players" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own players record" ON "public"."players" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can read own record" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can see own video views" ON "public"."video_views" FOR SELECT USING (("viewer_id" = "auth"."uid"()));



CREATE POLICY "Users can send messages" ON "public"."messages" FOR INSERT WITH CHECK (("sender_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update messages in own conversations" ON "public"."messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "messages"."conversation_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own coach profile" ON "public"."coaches" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own coaches record" ON "public"."coaches" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own courses" ON "public"."golf_courses" FOR UPDATE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update own data" ON "public"."users" FOR UPDATE USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own golf coach profile" ON "public"."golf_coaches" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own golf player profile" ON "public"."golf_players" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own golf_coaches record" ON "public"."golf_coaches" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own golf_players record" ON "public"."golf_players" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own participation" ON "public"."conversation_participants" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own player profile" ON "public"."players" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own players record" ON "public"."players" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own record" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view course holes" ON "public"."golf_course_holes" FOR SELECT USING (("course_id" IN ( SELECT "golf_courses"."id"
   FROM "public"."golf_courses"
  WHERE (("golf_courses"."created_by" = "auth"."uid"()) OR ("golf_courses"."is_public" = true)))));



CREATE POLICY "Users can view own and public courses" ON "public"."golf_courses" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR ("is_public" = true)));



CREATE POLICY "Users can view own data" ON "public"."users" FOR SELECT USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own video views" ON "public"."video_views" FOR SELECT USING ((("viewer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("video_id" IN ( SELECT "videos"."id"
   FROM "public"."videos"
  WHERE ("videos"."player_id" IN ( SELECT "players"."id"
           FROM "public"."players"
          WHERE ("players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Users can view their golf teams" ON "public"."golf_teams" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = "auth"."uid"()) AND ("golf_coaches"."team_id" = "golf_teams"."id")))) OR (EXISTS ( SELECT 1
   FROM "public"."golf_players"
  WHERE (("golf_players"."user_id" = "auth"."uid"()) AND ("golf_players"."team_id" = "golf_teams"."id"))))));



CREATE POLICY "Users can view their own teams" ON "public"."teams" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."player_id" IN ( SELECT "players"."id"
           FROM "public"."players"
          WHERE ("players"."user_id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
   FROM "public"."coaches"
  WHERE (("coaches"."user_id" = "auth"."uid"()) AND ("coaches"."organization_id" = "teams"."organization_id"))))));



CREATE POLICY "Users see messages in their conversations" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "messages"."conversation_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users see own conversations" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "conversations"."id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users see own notifications" ON "public"."notifications" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users see own participations" ON "public"."conversation_participants" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Videos are public" ON "public"."videos" FOR SELECT USING (true);



CREATE POLICY "View organizations" ON "public"."golf_organizations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."camp_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."camps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."colleges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demo_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."developmental_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_announcement_acknowledgements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_coach_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_coaches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_course_holes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_course_tees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_event_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_hole_shots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_holes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_player_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_player_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_qualifier_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_qualifiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_rounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_shots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_task_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."golf_travel_itineraries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."high_schools" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_comparisons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_engagement_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recruiting_interests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."round_holes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_coach_staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."watchlists" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."calculate_coach_completion"("p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_coach_completion"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_coach_completion"("p_coach_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_player_stats"("p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_player_stats"("p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_player_stats"("p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_profile_completion"("player_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_profile_completion"("player_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_profile_completion"("player_id_param" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_profile_completion"("p" "public"."players") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_profile_completion"("p" "public"."players") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_profile_completion"("p" "public"."players") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_login_attempts"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_login_attempts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_login_attempts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_player_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_player_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_player_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_dev_plans"("p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_dev_plans"("p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_dev_plans"("p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_coach_profile"("p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coach_profile"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coach_profile"("p_coach_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_coach_teams"("p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coach_teams"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coach_teams"("p_coach_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_engagement_trends"("player_id_param" "uuid", "days_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_engagement_trends"("player_id_param" "uuid", "days_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_engagement_trends"("player_id_param" "uuid", "days_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_engagement_trends"("p_player_id" "uuid", "p_days" integer, "p_interval" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_engagement_trends"("p_player_id" "uuid", "p_days" integer, "p_interval" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_engagement_trends"("p_player_id" "uuid", "p_days" integer, "p_interval" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_golf_coach_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_golf_coach_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_golf_coach_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_golf_player_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_golf_player_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_golf_player_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_engagement_summary"("p_player_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_engagement_summary"("p_player_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_engagement_summary"("p_player_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_notes"("p_coach_id" "uuid", "p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_notes"("p_coach_id" "uuid", "p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_notes"("p_coach_id" "uuid", "p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_teams"("p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_teams"("p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_teams"("p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_engagement"("p_player_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_engagement"("p_player_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_engagement"("p_player_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_upcoming_events"("p_coach_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_upcoming_events"("p_coach_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_upcoming_events"("p_coach_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_video_view"("vid_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_video_view"("vid_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_video_view"("vid_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_golf_coach_of_team"("team_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_golf_coach_of_team"("team_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_golf_coach_of_team"("team_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_golf_player_of_team"("team_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_golf_player_of_team"("team_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_golf_player_of_team"("team_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_golf_team_member"("team_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_golf_team_member"("team_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_golf_team_member"("team_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_on_team_staff"("team_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_on_team_staff"("team_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_on_team_staff"("team_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_profile_view"("viewed_player_id" "uuid", "viewer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_profile_view"("viewed_player_id" "uuid", "viewer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_profile_view"("viewed_player_id" "uuid", "viewer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_profile_view"("p_player_id" "uuid", "p_coach_id" "uuid", "p_is_anonymous" boolean, "p_duration_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_profile_view"("p_player_id" "uuid", "p_coach_id" "uuid", "p_is_anonymous" boolean, "p_duration_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_profile_view"("p_player_id" "uuid", "p_coach_id" "uuid", "p_is_anonymous" boolean, "p_duration_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_dev_plan_sent_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_dev_plan_sent_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_dev_plan_sent_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_recruiting_activated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_recruiting_activated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_recruiting_activated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_coach_organization_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_coach_organization_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_coach_organization_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_camp_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_camp_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_camp_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_camp_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_camp_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_camp_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_golf_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_golf_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_golf_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_player_comparisons_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_player_comparisons_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_player_comparisons_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."camp_registrations" TO "anon";
GRANT ALL ON TABLE "public"."camp_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."camp_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."camps" TO "anon";
GRANT ALL ON TABLE "public"."camps" TO "authenticated";
GRANT ALL ON TABLE "public"."camps" TO "service_role";



GRANT ALL ON TABLE "public"."coach_calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."coach_calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."coach_notes" TO "anon";
GRANT ALL ON TABLE "public"."coach_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_notes" TO "service_role";



GRANT ALL ON TABLE "public"."coaches" TO "anon";
GRANT ALL ON TABLE "public"."coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."coaches" TO "service_role";



GRANT ALL ON TABLE "public"."colleges" TO "anon";
GRANT ALL ON TABLE "public"."colleges" TO "authenticated";
GRANT ALL ON TABLE "public"."colleges" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."demo_requests" TO "anon";
GRANT ALL ON TABLE "public"."demo_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_requests" TO "service_role";



GRANT ALL ON TABLE "public"."developmental_plans" TO "anon";
GRANT ALL ON TABLE "public"."developmental_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."developmental_plans" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."golf_announcement_acknowledgements" TO "anon";
GRANT ALL ON TABLE "public"."golf_announcement_acknowledgements" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_announcement_acknowledgements" TO "service_role";



GRANT ALL ON TABLE "public"."golf_announcements" TO "anon";
GRANT ALL ON TABLE "public"."golf_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."golf_coach_notes" TO "anon";
GRANT ALL ON TABLE "public"."golf_coach_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_coach_notes" TO "service_role";



GRANT ALL ON TABLE "public"."golf_coaches" TO "anon";
GRANT ALL ON TABLE "public"."golf_coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_coaches" TO "service_role";



GRANT ALL ON TABLE "public"."golf_course_holes" TO "anon";
GRANT ALL ON TABLE "public"."golf_course_holes" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_course_holes" TO "service_role";



GRANT ALL ON TABLE "public"."golf_course_tees" TO "anon";
GRANT ALL ON TABLE "public"."golf_course_tees" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_course_tees" TO "service_role";



GRANT ALL ON TABLE "public"."golf_courses" TO "anon";
GRANT ALL ON TABLE "public"."golf_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_courses" TO "service_role";



GRANT ALL ON TABLE "public"."golf_documents" TO "anon";
GRANT ALL ON TABLE "public"."golf_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_documents" TO "service_role";



GRANT ALL ON TABLE "public"."golf_event_attendance" TO "anon";
GRANT ALL ON TABLE "public"."golf_event_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_event_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."golf_events" TO "anon";
GRANT ALL ON TABLE "public"."golf_events" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_events" TO "service_role";



GRANT ALL ON TABLE "public"."golf_hole_shots" TO "anon";
GRANT ALL ON TABLE "public"."golf_hole_shots" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_hole_shots" TO "service_role";



GRANT ALL ON TABLE "public"."golf_holes" TO "anon";
GRANT ALL ON TABLE "public"."golf_holes" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_holes" TO "service_role";



GRANT ALL ON TABLE "public"."golf_organizations" TO "anon";
GRANT ALL ON TABLE "public"."golf_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_organizations" TO "service_role";



GRANT ALL ON TABLE "public"."golf_player_classes" TO "anon";
GRANT ALL ON TABLE "public"."golf_player_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_player_classes" TO "service_role";



GRANT ALL ON TABLE "public"."golf_player_stats" TO "anon";
GRANT ALL ON TABLE "public"."golf_player_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_player_stats" TO "service_role";



GRANT ALL ON TABLE "public"."golf_players" TO "anon";
GRANT ALL ON TABLE "public"."golf_players" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_players" TO "service_role";



GRANT ALL ON TABLE "public"."golf_qualifier_entries" TO "anon";
GRANT ALL ON TABLE "public"."golf_qualifier_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_qualifier_entries" TO "service_role";



GRANT ALL ON TABLE "public"."golf_qualifiers" TO "anon";
GRANT ALL ON TABLE "public"."golf_qualifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_qualifiers" TO "service_role";



GRANT ALL ON TABLE "public"."golf_rounds" TO "anon";
GRANT ALL ON TABLE "public"."golf_rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_rounds" TO "service_role";



GRANT ALL ON TABLE "public"."golf_shots" TO "anon";
GRANT ALL ON TABLE "public"."golf_shots" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_shots" TO "service_role";



GRANT ALL ON TABLE "public"."golf_task_completions" TO "anon";
GRANT ALL ON TABLE "public"."golf_task_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_task_completions" TO "service_role";



GRANT ALL ON TABLE "public"."golf_tasks" TO "anon";
GRANT ALL ON TABLE "public"."golf_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."golf_teams" TO "anon";
GRANT ALL ON TABLE "public"."golf_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_teams" TO "service_role";



GRANT ALL ON TABLE "public"."golf_travel_itineraries" TO "anon";
GRANT ALL ON TABLE "public"."golf_travel_itineraries" TO "authenticated";
GRANT ALL ON TABLE "public"."golf_travel_itineraries" TO "service_role";



GRANT ALL ON TABLE "public"."high_schools" TO "anon";
GRANT ALL ON TABLE "public"."high_schools" TO "authenticated";
GRANT ALL ON TABLE "public"."high_schools" TO "service_role";



GRANT ALL ON TABLE "public"."login_attempts" TO "anon";
GRANT ALL ON TABLE "public"."login_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."login_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."player_achievements" TO "anon";
GRANT ALL ON TABLE "public"."player_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."player_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."player_comparisons" TO "anon";
GRANT ALL ON TABLE "public"."player_comparisons" TO "authenticated";
GRANT ALL ON TABLE "public"."player_comparisons" TO "service_role";



GRANT ALL ON TABLE "public"."player_engagement_events" TO "anon";
GRANT ALL ON TABLE "public"."player_engagement_events" TO "authenticated";
GRANT ALL ON TABLE "public"."player_engagement_events" TO "service_role";



GRANT ALL ON TABLE "public"."player_metrics" TO "anon";
GRANT ALL ON TABLE "public"."player_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."player_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."player_settings" TO "anon";
GRANT ALL ON TABLE "public"."player_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."player_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profile_views" TO "anon";
GRANT ALL ON TABLE "public"."profile_views" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_views" TO "service_role";



GRANT ALL ON TABLE "public"."recruiting_interests" TO "anon";
GRANT ALL ON TABLE "public"."recruiting_interests" TO "authenticated";
GRANT ALL ON TABLE "public"."recruiting_interests" TO "service_role";



GRANT ALL ON TABLE "public"."round_holes" TO "anon";
GRANT ALL ON TABLE "public"."round_holes" TO "authenticated";
GRANT ALL ON TABLE "public"."round_holes" TO "service_role";



GRANT ALL ON TABLE "public"."team_coach_staff" TO "anon";
GRANT ALL ON TABLE "public"."team_coach_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."team_coach_staff" TO "service_role";



GRANT ALL ON TABLE "public"."team_invitations" TO "anon";
GRANT ALL ON TABLE "public"."team_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."team_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."video_views" TO "anon";
GRANT ALL ON TABLE "public"."video_views" TO "authenticated";
GRANT ALL ON TABLE "public"."video_views" TO "service_role";



GRANT ALL ON TABLE "public"."videos" TO "anon";
GRANT ALL ON TABLE "public"."videos" TO "authenticated";
GRANT ALL ON TABLE "public"."videos" TO "service_role";



GRANT ALL ON TABLE "public"."watchlists" TO "anon";
GRANT ALL ON TABLE "public"."watchlists" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlists" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































