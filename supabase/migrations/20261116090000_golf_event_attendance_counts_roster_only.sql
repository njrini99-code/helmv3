-- DF-C-06 (launch readiness 2026-11-15): "N of M going" counts players who
-- have left the team. A departed player's golf_event_attendance rows stay, so
-- golf_event_attendance_counts counted them as invited, going or unanswered
-- on a player's Home, Calendar and Team Hub. Staging (refreshed from
-- production) on 2026-11-16: 66 events on one team and 41 on another carry a
-- departed player's row.
--
-- Same signature, return shape, grants and owner as 20261017102000. Invited,
-- accepted, declined and pending now count only players who are active
-- members of the event's team today; coach_invited still counts every row the
-- coach's invitation wrote, because it decides whether the event is an invite
-- list at all, not who is on it. golf_team_members is unique on
-- (team_id, player_id), so the join adds at most one row per attendance row.
--
-- Rollback: re-run the CREATE OR REPLACE in
-- 20261017102000_golf_event_attendance_players_own_rows.sql.

CREATE OR REPLACE FUNCTION public.golf_event_attendance_counts(
    p_event_ids uuid[]
)
RETURNS TABLE (
    event_id uuid,
    invited integer,
    accepted integer,
    declined integer,
    pending integer,
    coach_invited integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    e.id AS event_id,
    (count(a.id) FILTER (WHERE m.player_id IS NOT NULL))::integer AS invited,
    (count(a.id) FILTER (
      WHERE m.player_id IS NOT NULL AND a.status IN ('accepted', 'attending')
    ))::integer AS accepted,
    (count(a.id) FILTER (
      WHERE m.player_id IS NOT NULL
        AND a.status IN ('declined', 'not_attending', 'excused', 'unexcused')
    ))::integer AS declined,
    (count(a.id) FILTER (
      WHERE m.player_id IS NOT NULL
        AND (a.status IS NULL
          OR a.status NOT IN ('accepted', 'attending', 'tentative', 'maybe',
                              'declined', 'not_attending', 'excused', 'unexcused'))
    ))::integer AS pending,
    (count(a.id) FILTER (WHERE a.notified_at IS NOT NULL))::integer AS coach_invited
  FROM public.golf_events e
  LEFT JOIN public.golf_event_attendance a ON a.event_id = e.id
  LEFT JOIN public.golf_team_members m
    ON m.team_id = e.team_id
   AND m.player_id = a.player_id
   AND m.status = 'active'
  WHERE e.id = ANY (p_event_ids)
    AND (public.is_golf_team_coach(e.team_id) OR public.is_golf_team_player(e.team_id))
  GROUP BY e.id;
$function$;

COMMENT ON FUNCTION public.golf_event_attendance_counts(uuid[]) IS
'RSVP counts (invited, accepted, declined, pending: active members of the '
'event''s team only; coach_invited: every row the coach''s invitation wrote) '
'per event for the events of teams the caller coaches or plays on; other ids '
'are omitted. Mirrors rsvpOf() in src/clubhouse/data/calendar.ts. Lets players '
'see counts without reading teammates'' golf_event_attendance rows '
'(20261017102000; roster-only since 20261116090000, DF-C-06).';

REVOKE ALL ON FUNCTION public.golf_event_attendance_counts(uuid[]) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_event_attendance_counts(
    uuid[]
) TO authenticated;
