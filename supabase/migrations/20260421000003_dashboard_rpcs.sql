-- ============================================================================
-- Migration: Dashboard rollup RPCs
-- Purpose: Collapse announcement + RSVP waterfalls into single-round-trip RPCs.
-- Consumers:
--   - get_coach_today_schedule → src/app/golf/actions/dashboard-data.ts
--   - get_player_hub_announcements → src/app/golf/actions/player-notifications.ts
--   - get_player_hub_events → src/app/golf/(dashboard)/dashboard/hub/page.tsx
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC 1: Coach today schedule — today's events + RSVP yes/total counts in one call
-- ----------------------------------------------------------------------------
-- Collapses the sequential RSVP fetch at dashboard-data.ts:341-362 into one
-- round-trip. The "yes" bucket matches the existing coach semantic
-- (status IN ('attending','yes')); total is the row count.
-- Returns jsonb array of { event, yes_count, total_count }.
CREATE OR REPLACE FUNCTION public.get_coach_today_schedule(
  p_team_id uuid,
  p_today_start timestamptz,
  p_today_end   timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           count(*)::int AS total_count
    FROM golf_event_attendance a
    WHERE a.event_id IN (SELECT id FROM today_events)
    GROUP BY a.event_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',         e.id,
        'title',      e.title,
        'event_type', e.event_type,
        'start_time', e.start_time,
        'end_time',   e.end_time,
        'location',   e.location,
        'rsvp_yes',   coalesce(c.yes_count, 0),
        'rsvp_total', coalesce(c.total_count, 0)
      )
      ORDER BY e.start_time ASC
    ),
    '[]'::jsonb
  )
  FROM today_events e
  LEFT JOIN counts c ON c.event_id = e.id;
$$;

COMMENT ON FUNCTION public.get_coach_today_schedule(uuid, timestamptz, timestamptz)
  IS 'Returns today''s events for a team with RSVP yes/total counts joined. Replaces 2-round-trip waterfall in dashboard-data.ts.';


-- ----------------------------------------------------------------------------
-- RPC 2: Player hub announcements — visible announcements + ack/docs/tasks joined
-- ----------------------------------------------------------------------------
-- Collapses the 5-query block in getPlayerHubAnnouncements (player-notifications.ts:330-366)
-- into one round-trip. Visibility rule matches the TS filter at :397-401:
--   - No recipients rows for announcement → visible to all team members
--   - Has recipients rows → visible only if player_id is in them
-- Returns jsonb array shaped to match GolfAnnouncementMeta (announcement + metadata fields).
CREATE OR REPLACE FUNCTION public.get_player_hub_announcements(
  p_team_id   uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           count(*)::int AS recipient_count,
           bool_or(player_id = p_player_id) AS player_in_recipients
    FROM golf_announcement_recipients
    WHERE announcement_id IN (SELECT id FROM recent)
    GROUP BY announcement_id
  ),
  acks AS (
    SELECT announcement_id,
           count(*)::int AS ack_count,
           bool_or(player_id = p_player_id) AS player_acknowledged
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
           coalesce(rp.recipient_count, 0)       AS recipient_count,
           coalesce(rp.player_in_recipients, FALSE) AS player_in_recipients,
           coalesce(ak.ack_count, 0)             AS ack_count,
           coalesce(ak.player_acknowledged, FALSE) AS player_acknowledged,
           coalesce(d.doc_count, 0)              AS doc_count,
           coalesce(t.task_count, 0)             AS task_count
    FROM recent r
    LEFT JOIN recipients rp   ON rp.announcement_id = r.id
    LEFT JOIN acks       ak   ON ak.announcement_id = r.id
    LEFT JOIN docs       d    ON d.announcement_id  = r.id
    LEFT JOIN task_counts t   ON t.announcement_id  = r.id
    WHERE coalesce(rp.recipient_count, 0) = 0          -- all-team
       OR coalesce(rp.player_in_recipients, FALSE)     -- explicit recipient
    ORDER BY r.published_at DESC
    LIMIT 5
  )
  SELECT coalesce(
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
  FROM visible v;
$$;

COMMENT ON FUNCTION public.get_player_hub_announcements(uuid, uuid)
  IS 'Returns up to 5 player-visible announcements with ack/docs/tasks counts. Replaces 5-query waterfall in getPlayerHubAnnouncements.';


-- ----------------------------------------------------------------------------
-- RPC 3: Player hub events — upcoming events + my RSVP + team counts joined
-- ----------------------------------------------------------------------------
-- Collapses the 3-round-trip event fetch at hub/page.tsx:83-201 into one call.
-- "Going" bucket matches hub semantic: status IN ('accepted','checked_in');
-- "Maybe" bucket is status = 'tentative'. Returns jsonb array shaped to match
-- the EventInvite interface consumed by PlayerHub.
CREATE OR REPLACE FUNCTION public.get_player_hub_events(
  p_team_id   uuid,
  p_player_id uuid,
  p_since     timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH events AS (
    -- is_mandatory is exposed to the client as a boolean; not a real column
    -- on golf_events today (derived from metadata when needed).
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
  SELECT coalesce(
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
        'going_count',  coalesce(c.going_count, 0)::int,
        'maybe_count',  coalesce(c.maybe_count, 0)::int
      )
      ORDER BY e.start_time ASC
    ),
    '[]'::jsonb
  )
  FROM events e
  LEFT JOIN counts c ON c.event_id = e.id;
$$;

COMMENT ON FUNCTION public.get_player_hub_events(uuid, uuid, timestamptz)
  IS 'Returns upcoming events for a team with player RSVP + going/maybe counts joined. Replaces 3-round-trip waterfall in hub/page.tsx.';


-- Grants
GRANT EXECUTE ON FUNCTION public.get_coach_today_schedule(uuid, timestamptz, timestamptz)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_hub_announcements(uuid, uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_hub_events(uuid, uuid, timestamptz)             TO authenticated;
