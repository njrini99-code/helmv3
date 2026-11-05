-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- WHY: 20261031142000 stops a player reading a teammate's class rows from
--   golf_events, but get_player_hub_events is SECURITY DEFINER, so it skips
--   that policy and still lists them, titles included, to any player who calls
--   it. This gives the function the same rule.
--   Its LIMIT 20 also ran over class rows: production has a team with 255 in
--   the next 21 days (5 Nov, read only), so classes could use up the 20 and the
--   app, which drops them, showed an empty week. Team events now come first.
-- WHO: signed-in players and staffed coaches, through the same gate as before.
--   A player gets their own class rows and no one else's. A coach sees them
--   all. Every other event type is unchanged.
-- ORDER: after 20261031142000, which adds golf_player_owns_class_event. Applied
--   before it, this fails on the first call, not at creation.
-- ROLLBACK:
--   supabase/rollbacks/20261105090000_golf_player_hub_events_class_rows.rollback.sql -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   'public.get_player_hub_events(uuid, uuid,
-- VERIFY:   timestamp with time zone)'
-- VERIFY:   ::regprocedure and position('golf_player_owns_class_event' in
-- VERIFY:   prosrc) > 0;

create or replace function public.get_player_hub_events(
    p_team_id uuid, p_player_id uuid, p_since timestamp with time zone
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
DECLARE
  v_player_id uuid;
  v_coach boolean := false;
BEGIN
  -- A coach staffed on the team may read it for one of its active players.
  IF public.is_golf_team_coach(p_team_id)
     AND EXISTS (
       SELECT 1 FROM public.golf_team_members gtm
       WHERE gtm.team_id = p_team_id
         AND gtm.player_id = p_player_id
         AND gtm.status = 'active'
     ) THEN
    v_player_id := p_player_id;
    v_coach := true;
  ELSE
    -- Anyone else may ask only about themselves: p_player_id must be the
    -- caller's own active membership, as before this change.
    SELECT gp.id INTO v_player_id
    FROM public.golf_players gp
    JOIN public.golf_team_members gtm ON gtm.player_id = gp.id
    WHERE gp.id = p_player_id
      AND gp.user_id = (SELECT auth.uid())
      AND gtm.team_id = p_team_id
      AND gtm.status = 'active'
    LIMIT 1;
  END IF;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH events AS (
      -- is_mandatory is exposed to the client; not a real column on golf_events.
      SELECT id, title, event_type, start_time, end_time, location
      FROM golf_events ge
      WHERE team_id = p_team_id
        AND start_time >= p_since
        -- A cancelled event stays in the table (soft cancel); not one to show.
        AND cancelled_at IS NULL
        -- A meeting is listed only for the players invited to it (their own
        -- attendance row), as 20261018120000 decides it; a coach sees all.
        AND (
          event_type <> 'meeting'
          OR v_coach
          OR EXISTS (
            SELECT 1
            FROM golf_event_attendance mine
            WHERE mine.event_id = ge.id
              AND mine.player_id = v_player_id
          )
        )
        -- A class row is one player's own timetable (20261031142000 decides it
        -- for direct reads); a coach sees all.
        AND (
          event_type <> 'class'
          OR v_coach
          OR public.golf_player_owns_class_event(description)
        )
      -- Team events first, so classes never use up the 20. The list still comes back in
      -- time order (the jsonb_agg below).
      ORDER BY (event_type = 'class'), start_time ASC
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
      WHERE player_id = v_player_id
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
