-- ============================================================================
-- get_coach_today_schedule: today's TEAM schedule, not a player's class day
-- ----------------------------------------------------------------------------
-- The coach dashboard's "today" card reads this RPC, which took the first 10
-- golf_events rows of the day for the team. A player's class meetings live in
-- that same table (see 20260806020000), so on a team where a player uploaded a
-- class schedule the LIMIT 10 filled with their classes and pushed the actual
-- practice off the card.
--
-- Only change vs. the previous definition: the `event_type <> 'class'` filter in
-- today_events. Authorization check, SECURITY DEFINER, search_path, the returned
-- jsonb shape and the RSVP counts are all preserved verbatim.
--
-- Grants: CREATE OR REPLACE preserves existing privileges (service_role,
-- authenticated, postgres — PUBLIC/anon already absent). The REVOKE/GRANT below
-- re-asserts that state explicitly rather than changing it.
-- ============================================================================

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

REVOKE EXECUTE ON FUNCTION public.get_coach_today_schedule(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_coach_today_schedule(uuid, timestamp with time zone, timestamp with time zone) TO authenticated, service_role;

-- CREATE OR REPLACE preserves the old COMMENT, which would leave the DB
-- describing a function that no longer behaves as documented.
COMMENT ON FUNCTION public.get_coach_today_schedule(uuid, timestamp with time zone, timestamp with time zone) IS
  'Coach dashboard: today''s TEAM events for a team the caller coaches, with RSVP counts. Excludes synced class meetings (event_type = ''class''), which are a player''s personal schedule rather than the team''s day.';
