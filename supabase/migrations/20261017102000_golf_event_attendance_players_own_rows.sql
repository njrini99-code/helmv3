-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-17; the owner applies it after
-- review (supabase/migrations/HELD.md row).
-- Apply: npm run db:apply -- <this file>
-- Risk: MEDIUM (RLS narrowing on golf_event_attendance, which Fairway also
-- reads live). `npm run test:rls`
-- (supabase/tests/rls/golf_event_attendance_players_own_rows.sql) before apply,
-- and ship the app change that calls golf_event_attendance_counts first or
-- together (it falls back to today's direct read while this is unapplied).
--
-- WHY (owner-flagged, docs/clubhouse/STATUS.md):
-- golf_event_attendance_select_team
-- lets any active player of a team read EVERY teammate's RSVP row for the
-- team's events (who was invited, who said yes or no, their notes and
-- check-in). Read live 2026-10-17:
--   USING (EXISTS (SELECT 1 FROM golf_events e
--          WHERE e.id = golf_event_attendance.event_id
--            AND (is_golf_team_coach(e.team_id) OR
--            is_golf_team_player(e.team_id))))
-- Players only need teammates' rows for COUNTS ("5 of 6 confirmed", "6
-- players", and the D2-8 rule that a meeting with no invitees is the coach's
-- own). Those counts now come from a narrow function instead of the rows.
--
-- WHAT CHANGES:
--   (a) NEW public.golf_event_attendance_counts(p_event_ids uuid[]) RETURNS
--       TABLE (event_id uuid, invited int, accepted int, declined int,
--       pending int, coach_invited int). SECURITY DEFINER,
--       SET search_path = '', fully-qualified
--       names. Returns one row per requested event the caller coaches or plays
--       on (is_golf_team_coach / is_golf_team_player of the event's team),
--       including events with no invitees (all zeros); any other id is left
--       out. Counts mirror rsvpOf() in src/clubhouse/data/calendar.ts:
--         invited  = every attendance row
--         accepted = status accepted | attending
--         declined = status declined | not_attending | excused | unexcused
--         pending  = status NULL or anything else not listed here
--       tentative | maybe count in invited only (no column, as rsvpOf's
--       'maybe'). No player id, name or status leaves the function.
--       EXECUTE: authenticated only (revoked from PUBLIC and anon).
--   (b) golf_event_attendance_select_team is re-created so a player sees only
--       their OWN row, and only while an active player of the event's team
--       (the same player branch golf_event_attendance_update_coach_or_player
--       already uses). The coach branch is unchanged. Roles narrow from public
--       to authenticated (anon has no auth.uid(), so it matched nothing
--       anyway).
--       This is strictly narrower than before: no caller gains a row.
--
-- WHAT STILL PASSES (checked 2026-10-17):
--   * Player RSVP upsert of their own row (src/lib/calendar/rsvp.ts
--   updateRSVP):
--     INSERT ... ON CONFLICT DO UPDATE checks the existing row against SELECT
--     and UPDATE USING; both pass for the player's own row.
--   * Coach upserts and reads (attendance.ts markAttendance / bulkCheckIn,
--     rsvp.ts sendEventInvitations / notifyEventUpdate, recurring-events.ts,
--     calendar-events.ts, conflict-inbox coach scope, CoachHelm chat read tools
--     read-tools.ts / program-pulse.ts, whose context resolveCoachChatContext
--     refuses a caller with no golf_coaches row): coach branch unchanged.
--   * Player own-row reads: conflict-inbox player scope, availability.ts,
--     getPlayerEventRSVP, getPlayerPendingInvitations, dashboard-data my RSVPs,
--     Clubhouse hub invitedTo and Calendar's own place and reply.
--   * get_player_hub_events and get_coach_today_schedule are SECURITY DEFINER
--     and unaffected. No view reads this table.
--   * Clubhouse player counts (shell next-event card, player Home week, player
--     Calendar meeting rule) switch to (a) in the same change.
-- KNOWN EFFECT ON OTHER CODE: getEventRSVP / getEventRSVPStats
-- (calendar-events.ts, lib/calendar/rsvp.ts) has no role gate; a player who
-- called it would now get a summary of their own row only. CORRECTED
-- 2026-10-17: Fairway's live event drawer (FairwayEventDetailDrawer.tsx,
-- EventPeopleSection -> getEventRSVP) shows the People list to EVERY viewer,
-- players included, so after this migration a Fairway player's People list
-- shows only themselves instead of teammates' names and replies. That is the
-- intended privacy change, but it is a visible change on live Fairway: the
-- owner decides it with the apply. Its header count still counts
-- everyone: getEventRSVP takes the totals from golf_event_attendance_counts.
-- (The legacy EventDetailModal is mounted
-- only by the baseball PremiumCalendarClient.)
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS golf_event_attendance_select_team ON
--   public.golf_event_attendance;
--   CREATE POLICY golf_event_attendance_select_team ON
--   public.golf_event_attendance
--     FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.golf_events e
--       WHERE e.id = golf_event_attendance.event_id
--         AND (public.is_golf_team_coach(e.team_id) OR
--         public.is_golf_team_player(e.team_id))));
--   DROP FUNCTION IF EXISTS public.golf_event_attendance_counts(uuid[]);
-- Dropping the function is optional: the app falls back to the direct read on
-- PGRST202 / 42883, which with the old policy returns the same counts.
--
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname =
-- VERIFY: 'golf_event_attendance_counts'
-- VERIFY: and p.prosecdef and p.proconfig = array['search_path=""']) = 1;
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.golf_event_attendance_counts(uuid[])', 'EXECUTE') and
-- VERIFY: has_function_privilege('authenticated',
-- VERIFY: 'public.golf_event_attendance_counts(uuid[])', 'EXECUTE');
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'public' and tablename = 'golf_event_attendance' and cmd = 'SELECT')
-- VERIFY: = 1 and (select qual from pg_policies where schemaname = 'public' and
-- VERIFY: tablename = 'golf_event_attendance' and policyname =
-- VERIFY: 'golf_event_attendance_select_team') like '%golf_players%';

SET LOCAL lock_timeout = '3s';

-- (a) Counts for players ------------------------------------------------------

-- Dropped first so a database holding an earlier draft (five columns) takes the
-- new return type; production has never had the function.
DROP FUNCTION IF EXISTS public.golf_event_attendance_counts(uuid[]);

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
    count(a.id)::integer AS invited,
    (count(a.id) FILTER (WHERE a.status IN ('accepted', 'attending')))::integer AS accepted,
    (count(a.id) FILTER (WHERE a.status IN ('declined', 'not_attending', 'excused', 'unexcused')))::integer AS declined,
    (count(a.id) FILTER (
      WHERE a.status IS NULL
         OR a.status NOT IN ('accepted', 'attending', 'tentative', 'maybe',
                             'declined', 'not_attending', 'excused', 'unexcused')
    ))::integer AS pending,
    -- Rows the coach's invitation wrote (sendEventInvitations stamps
    -- notified_at); a player's own reply to an event
    -- open to the whole team has none, so it doesn't turn the event into an
    -- invite list (P006 CONTRACT 60807).
    (count(a.id) FILTER (WHERE a.notified_at IS NOT NULL))::integer AS coach_invited
  FROM public.golf_events e
  LEFT JOIN public.golf_event_attendance a ON a.event_id = e.id
  WHERE e.id = ANY (p_event_ids)
    AND (public.is_golf_team_coach(e.team_id) OR public.is_golf_team_player(e.team_id))
  GROUP BY e.id;
$function$;

COMMENT ON FUNCTION public.golf_event_attendance_counts(uuid[]) IS
'RSVP counts (invited, accepted, declined, pending, and coach_invited: rows '
'the coach''s invitation wrote) per event for the events of teams the caller '
'coaches or plays on; other ids are omitted. Mirrors rsvpOf() in '
'src/clubhouse/data/calendar.ts. Lets players see counts without reading '
'teammates'' golf_event_attendance rows (20261017102000).';

-- Supabase's default privileges grant EXECUTE on new public functions to anon,
-- so revoke it explicitly.
REVOKE ALL ON FUNCTION public.golf_event_attendance_counts(uuid[]) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_event_attendance_counts(
    uuid[]
) TO authenticated;

-- (b) Players read only their own rows ---------------------------------------

DROP POLICY IF EXISTS golf_event_attendance_select_team
ON public.golf_event_attendance;
CREATE POLICY golf_event_attendance_select_team ON public.golf_event_attendance
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_events e
        WHERE
            e.id = golf_event_attendance.event_id
            AND (
                public.is_golf_team_coach(e.team_id)
                OR (
                    public.is_golf_team_player(e.team_id)
                    AND golf_event_attendance.player_id IN (
                        SELECT gp.id
                        FROM public.golf_players gp
                        WHERE gp.user_id = (SELECT auth.uid())
                    )
                )
            )
    )
);

-- ACL assertion: the migration fails loudly on grant drift.
DO $assert$
BEGIN
  IF has_function_privilege('anon', 'public.golf_event_attendance_counts(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'golf_event_attendance_counts must not be executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.golf_event_attendance_counts(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'golf_event_attendance_counts must be executable by authenticated';
  END IF;
END
$assert$;
