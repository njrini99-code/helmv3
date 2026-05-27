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
--   * ownership assertion on get_coach_today_schedule
--   * ownership assertion on get_player_hub_announcements / _events
--
-- Ownership join pattern (canonical — see 20260328000000_fix_calendar_notifications_rls.sql):
--   Coach ↔ team:   golf_coaches.organization_id == golf_teams.organization_id
--                   (no team_id column on golf_coaches — DO NOT use it)
--   Player ↔ team:  golf_team_members(player_id, team_id, status='active')
--                   (no team_id column on golf_players — DO NOT use it)
--
-- IMPORTANT: the function bodies below PRESERVE the semantics of 00001 and
-- 00003 verbatim (same signatures, same CTEs, same return shapes). Only a
-- guard prolog is added.
-- ============================================================================

-- Drop a stale 2-arg signature accidentally introduced in an earlier iteration
-- of this migration. Safe no-op when it doesn't exist. 00003's 3-arg version
-- is the real one; we redefine it below.
DROP FUNCTION IF EXISTS public.get_coach_today_schedule(uuid, date);

-- ---------------------------------------------------------------------------
-- 1. Admin dashboard rollup: admin-role gate (preserves 00001 body verbatim)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_rollup()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- ---------------------------------------------------------------------------
-- 2. Coach today schedule: caller must coach the team
--    (preserves 00003 body; only adds the auth guard)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_today_schedule(
  p_team_id     uuid,
  p_today_start timestamptz,
  p_today_end   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- ---------------------------------------------------------------------------
-- 3. Player hub announcements: player must own the row OR coach the team
--    (preserves 00003 body; only adds the auth guard)
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

-- ---------------------------------------------------------------------------
-- 4. Player hub events: player must own the row OR coach the team
--    (preserves 00003 body; only adds the auth guard)
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

-- Grants unchanged (already authenticated-only from the original migrations).
-- The auth.uid()-based checks inside each function provide the actual gate.
