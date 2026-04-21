-- ============================================================================
-- SECURITY HOTFIX: Add ownership / admin checks to the perf remediation RPCs
-- ============================================================================
--
-- The perf RPCs introduced in migrations 00001 and 00003 were SECURITY DEFINER
-- with EXECUTE granted to `authenticated` but performed NO ownership checks on
-- caller-supplied p_team_id / p_player_id. A full-review pass flagged this as
-- a cross-tenant data leak — any signed-in user could read any team's events,
-- announcements, or admin stats by calling the RPCs with arbitrary IDs.
--
-- This migration replaces the function bodies with:
--   * admin role check on get_admin_dashboard_rollup
--   * ownership assertion on get_coach_today_schedule (caller must be a coach
--     of p_team_id via golf_coaches.user_id)
--   * ownership assertion on get_player_hub_announcements / _events (caller
--     must be the player OR a coach of the player's team)
--
-- Per the codebase convention (see 20260311100000_rpc_resilient_detail_inserts.sql),
-- we use `auth.uid()` lookups against golf_coaches / golf_players / users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Admin dashboard rollup: admin-role gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_rollup()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_result   jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Delegate to the existing CTE body by invoking the original SQL function
  -- under a different name. Inline the CTE here to avoid a second round-trip.
  WITH user_stats AS (
    SELECT
      count(*)                                                                   AS total,
      count(*) FILTER (WHERE role = 'admin')                                     AS admins,
      count(*) FILTER (WHERE role = 'coach')                                     AS coaches,
      count(*) FILTER (WHERE role = 'player')                                    AS players,
      count(*) FILTER (WHERE created_at > now() - interval '7 days')             AS new_last_7d,
      count(*) FILTER (WHERE created_at > now() - interval '30 days')            AS new_last_30d,
      count(*) FILTER (WHERE last_seen_at > now() - interval '1 hour')           AS active_1h,
      count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours')         AS active_24h,
      count(*) FILTER (WHERE last_seen_at > now() - interval '7 days')           AS active_7d,
      count(*) FILTER (WHERE last_seen_at > now() - interval '30 days')          AS active_30d
    FROM users
  ),
  round_stats AS (
    SELECT
      count(*)                                                                    AS total_rounds,
      count(*) FILTER (WHERE created_at > now() - interval '7 days')              AS rounds_last_7d,
      count(*) FILTER (WHERE created_at > now() - interval '30 days')             AS rounds_last_30d,
      count(DISTINCT player_id)                                                   AS active_players,
      count(DISTINCT player_id) FILTER (WHERE created_at > now() - interval '30 days') AS players_active_30d,
      0                                                                            AS at_risk_players
    FROM golf_rounds
  ),
  rounds_today AS (
    SELECT count(*) AS total
    FROM golf_rounds
    WHERE round_date::date = current_date
  ),
  team_stats AS (
    SELECT
      (SELECT count(*) FROM golf_teams)                                               AS golf_teams,
      (SELECT count(*) FROM golf_teams WHERE created_at > now() - interval '30 days') AS golf_teams_new_30d,
      (SELECT count(*) FROM golf_teams)                                               AS golf_teams_active,
      CASE WHEN to_regclass('public.baseball_teams') IS NOT NULL
           THEN (SELECT count(*) FROM baseball_teams)
           ELSE 0
      END                                                                               AS baseball_teams
  ),
  onboarding_stats AS (
    SELECT
      (SELECT count(*) FROM golf_coaches WHERE onboarded_at IS NOT NULL) AS coaches_onboarded,
      (SELECT count(*) FROM golf_players WHERE onboarded_at IS NOT NULL) AS players_onboarded,
      (SELECT count(*) FROM golf_coaches)                                AS coaches_total,
      (SELECT count(*) FROM golf_players)                                AS players_total
  ),
  signup_trend AS (
    SELECT jsonb_agg(row_to_json(t)) AS data
    FROM (
      SELECT
        to_char(date_trunc('day', gs), 'YYYY-MM-DD')     AS date,
        (SELECT count(*) FROM users WHERE date_trunc('day', created_at) = date_trunc('day', gs)) AS count
      FROM generate_series(now() - interval '29 days', now(), interval '1 day') gs
    ) t
  )
  SELECT jsonb_build_object(
    'generated_at',     now(),
    'users',            (SELECT row_to_json(u) FROM user_stats u),
    'rounds',           (SELECT row_to_json(r) FROM round_stats r),
    'rounds_today',     (SELECT total FROM rounds_today),
    'teams',            (SELECT row_to_json(t) FROM team_stats t),
    'onboarding',       (SELECT row_to_json(o) FROM onboarding_stats o),
    'signup_trend_30d', COALESCE((SELECT data FROM signup_trend), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Coach today schedule: caller must coach the team
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_today_schedule(
  p_team_id uuid,
  p_date    date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_result  jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM golf_coaches
    WHERE user_id = auth.uid()
      AND team_id = p_team_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH events AS (
    SELECT *
    FROM golf_events
    WHERE team_id = p_team_id
      AND start_time::date = p_date
    ORDER BY start_time ASC
  ),
  attendance AS (
    SELECT event_id,
           count(*) FILTER (WHERE status = 'yes')   AS yes_count,
           count(*) FILTER (WHERE status = 'no')    AS no_count,
           count(*) FILTER (WHERE status = 'maybe') AS maybe_count
    FROM golf_event_attendance
    WHERE event_id IN (SELECT id FROM events)
    GROUP BY event_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'event', row_to_json(e.*),
    'yes',   COALESCE(a.yes_count, 0),
    'no',    COALESCE(a.no_count, 0),
    'maybe', COALESCE(a.maybe_count, 0)
  )), '[]'::jsonb)
  INTO v_result
  FROM events e
  LEFT JOIN attendance a ON a.event_id = e.id;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Player hub announcements: caller must be the player, or coach the team
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_player_hub_announcements(
  p_team_id   uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_result  jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM golf_players
    WHERE id = p_player_id
      AND team_id = p_team_id
      AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM golf_coaches
    WHERE user_id = auth.uid()
      AND team_id = p_team_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH visible AS (
    SELECT a.*
    FROM golf_announcements a
    WHERE a.team_id = p_team_id
    ORDER BY a.pinned DESC NULLS LAST, a.created_at DESC
    LIMIT 20
  ),
  acks AS (
    SELECT announcement_id, acknowledged_at
    FROM golf_announcement_acknowledgements
    WHERE announcement_id IN (SELECT id FROM visible)
      AND player_id = p_player_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'announcement',   row_to_json(v.*),
    'acknowledged_at', (SELECT acknowledged_at FROM acks WHERE announcement_id = v.id LIMIT 1)
  )), '[]'::jsonb)
  INTO v_result
  FROM visible v;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Player hub events: caller must be the player, or coach the team
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_player_hub_events(
  p_team_id   uuid,
  p_player_id uuid,
  p_since     timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_result  jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM golf_players
    WHERE id = p_player_id
      AND team_id = p_team_id
      AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM golf_coaches
    WHERE user_id = auth.uid()
      AND team_id = p_team_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH events AS (
    SELECT *
    FROM golf_events
    WHERE team_id = p_team_id
      AND start_time >= p_since
    ORDER BY start_time ASC
    LIMIT 50
  ),
  counts AS (
    SELECT event_id,
           count(*) FILTER (WHERE status = 'yes')   AS yes_count,
           count(*) FILTER (WHERE status = 'no')    AS no_count,
           count(*) FILTER (WHERE status = 'maybe') AS maybe_count
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
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'event',   row_to_json(e.*),
    'yes',     COALESCE(c.yes_count, 0),
    'no',      COALESCE(c.no_count, 0),
    'maybe',   COALESCE(c.maybe_count, 0),
    'my_rsvp', (SELECT status FROM my_rsvp WHERE event_id = e.id)
  )), '[]'::jsonb)
  INTO v_result
  FROM events e
  LEFT JOIN counts c ON c.event_id = e.id;

  RETURN v_result;
END;
$$;

-- Grants unchanged (already authenticated-only from the original migrations).
-- The auth.uid()-based checks inside each function provide the actual gate.
