-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-17; the owner applies it after
-- review (supabase/migrations/HELD.md row).
-- Apply: npm run db:apply -- <this file>
-- Risk: LOW. Two function bodies change (CREATE OR REPLACE keeps each one's
-- owner and ACL). No table, policy, grant or stored row changes here.
--
-- WHY (Fairway Home audit, 2026-10-17): deleteGolfEvent soft-cancels an event
-- (status 'cancelled', cancelled_at set;
-- src/app/golf/actions/calendar-events.ts) and the row stays in golf_events.
-- Two SECURITY DEFINER functions that feed Home list every team event in
-- their window, cancelled or not. Live bodies
-- (read 2026-10-17 with pg_get_functiondef; same as
-- 20260806020100_coach_today_schedule_excludes_classes.sql and the baseline):
--   * get_coach_today_schedule: the coach's Today list on Fairway Home
--     (src/app/golf/actions/dashboard-data.ts, getCoachDashboardData).
--   * get_player_hub_events: the player hub events on Fairway Home and Team Hub
--     (src/app/golf/actions/player-hub-data.ts, getPlayerHubSummaryData) and
--     Clubhouse Hub (src/clubhouse/data/hub.ts). A cancelled event was offered
--     for an RSVP.
-- The table reads beside them in dashboard-data.ts already drop cancelled
-- events with .is('cancelled_at', null) (same change).
--
-- WHAT CHANGES: each function's events CTE adds AND cancelled_at IS NULL.
-- cancelled_at is the cancellation marker: status is nullable, and every
-- cancelled row in production has cancelled_at set (2 of 2, read 2026-10-17);
-- restoring an event clears it (updateGolfEvent, status 'confirmed'). The
-- filter sits before each LIMIT, so a cancelled event no longer takes a slot.
-- Everything else (auth checks, SECURITY DEFINER, SET search_path TO 'public',
-- the class filter, counts and output shape) is kept as live.
--
-- IMPACT (read-only SELECT on production, 2026-10-17): 2 cancelled events,
-- neither in the current window, so no list changes today.
--
-- ROLLBACK: re-create both live bodies, i.e. this file with the two
-- "AND cancelled_at IS NULL" lines (and their comments) removed; the bodies
-- are otherwise copied verbatim from pg_get_functiondef. Cancelled events then
-- show on Home again.
--
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname =
-- VERIFY: 'get_coach_today_schedule' and p.prosecdef and p.proconfig =
-- VERIFY: array['search_path=public'] and p.prosrc like
-- VERIFY: '%cancelled_at IS NULL%' and p.prosrc like
-- VERIFY: '%event_type <> ''class''%') = 1;
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname =
-- VERIFY: 'get_player_hub_events' and p.prosecdef and p.proconfig =
-- VERIFY: array['search_path=public'] and p.prosrc like
-- VERIFY: '%cancelled_at IS NULL%') = 1;

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_coach_today_schedule(
    p_team_id uuid,
    p_today_start timestamp with time zone,
    p_today_end timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        -- A synced class meeting is one player's personal schedule, not the
        -- team's day. event_type is NOT NULL, so this cannot drop untyped rows.
        AND event_type <> 'class'
        -- A cancelled event stays in the table (soft cancel); it is not on today's schedule.
        AND cancelled_at IS NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.get_player_hub_events(
    p_team_id uuid,
    p_player_id uuid,
    p_since timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        -- A cancelled event stays in the table (soft cancel); it is not one to show or answer.
        AND cancelled_at IS NULL
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
$function$;
