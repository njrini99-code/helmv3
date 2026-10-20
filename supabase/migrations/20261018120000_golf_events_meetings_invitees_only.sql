-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-18; the owner applies it after
-- review (supabase/migrations/HELD.md row).
-- Apply: npm run db:apply -- <this file>
-- Risk: MEDIUM (RLS narrowing on golf_events, the table every calendar reads).
-- `npm run test:rls`
-- (supabase/tests/rls/golf_events_meetings_invitees_only.sql) before apply.
--
-- ORDER: apply AFTER 20261017111000_golf_home_event_rpcs_skip_cancelled.sql
-- (branch agent/fairway-fixes-polish), never before it. Both re-create
-- get_player_hub_events; this body carries that file's cancelled_at filter, so
-- applied after it nothing is lost, but 20261017111000 applied after this file
-- silently drops the meeting rule from the player hub. If that happens, apply
-- this file again. No ordering dependency on 20261017102000 (either order
-- works; see WHAT STILL PASSES).
-- ALSO: 20261017001000_golf_player_hub_rpcs_staff_gate.sql (security S3,
-- untracked in another session's worktree on 2026-10-18) re-creates
-- get_player_hub_events with a staffed-coach gate and the player taken from
-- auth.uid(). Its body lacks the cancelled filter and this meeting rule; this
-- body keeps the org-coach gate it removes. Before either is applied, rebuild
-- the one that lands second on the other's body (HELD.md row).
--
-- WHY (owner-approved, 2026-10-18): live Fairway shows a player the title,
-- time and room of every team meeting, including 1:1s and captains' meetings
-- they are not invited to. golf_events_select_team (baseline 20260527000000)
-- lets any active player of a team SELECT every row of it:
--   USING (is_golf_team_coach(team_id) OR is_golf_team_player(team_id))
-- and get_player_hub_events (SECURITY DEFINER, Fairway Home / Team Hub and
-- Clubhouse Hub) lists every team event. Realtime postgres_changes on
-- golf_events delivers each changed row, title included, to every subscriber
-- the SELECT policy admits. Clubhouse already hides these meetings in its app
-- code (playerSeesMeeting, Decision B); the Fairway app fix ships in the same
-- change (src/lib/calendar/meeting-visibility.ts). This makes the database say
-- the same thing, for every reader.
--
-- THE RULE (same as Clubhouse and the Fairway app code): a player sees a
-- meeting (event_type = 'meeting') only when they have their own
-- golf_event_attendance row on it. A meeting nobody is invited to is the
-- coach's own. Every other event type stays visible to the whole team, with or
-- without an invite list (class rows included: their per-player scoping stays
-- in app code, unchanged here). Coaches of the team see everything, as before.
--
-- WHAT CHANGES:
--   (a) NEW public.golf_player_invited_to_event(p_event_id uuid) RETURNS
--       boolean: does the caller have a player row with an attendance row on
--       this event? SECURITY DEFINER, SET search_path = '', fully-qualified
--       names. It has to be a definer: every golf_event_attendance policy
--       reads golf_events, so a policy on golf_events that read
--       golf_event_attendance directly would recurse (42P17). Returns a
--       boolean about the caller only. EXECUTE: authenticated only.
--   (b) golf_events_select_team is re-created: coach branch unchanged; the
--       player branch adds (event_type <> 'meeting' OR invited). Roles narrow
--       from public to authenticated (anon has no auth.uid(), so both
--       branches were already false for it). admin_read_all is untouched.
--       Strictly narrower: no caller gains a row.
--   (c) get_player_hub_events is re-created from its live body (as
--       20261017111000 documents it from pg_get_functiondef, 2026-10-17:
--       the baseline body plus AND cancelled_at IS NULL) with one more filter
--       in the events CTE, before the LIMIT: a meeting is listed only when
--       p_player_id has an attendance row on it, or when the caller passed the
--       coach branch of the gate (coach output unchanged). The gate, SECURITY
--       DEFINER, SET search_path TO 'public', counts and output shape are
--       kept. CREATE OR REPLACE keeps owner and ACL.
--
-- WHAT STILL PASSES (pgTAP, checked 2026-10-18 on the local stack):
--   * Coach reads and writes of golf_events: coach branch unchanged; INSERT,
--     UPDATE and DELETE policies untouched.
--   * A player's own RSVP upsert on an invited meeting
--     (src/lib/calendar/rsvp.ts updateRSVP): golf_event_attendance_insert_self
--     and the update policy read golf_events, which the invited player still
--     sees.
--   * A player's self-RSVP to a meeting they are not invited to is now
--     REFUSED (insert_self's EXISTS on golf_events finds no row). The app
--     refuses it first (respondToEvent). Self-RSVP to a team-wide event with
--     no invite list still works.
--   * golf_event_attendance reads: unchanged for coaches; a player reads their
--     own rows (20261017102000) or, before that file, team rows of events they
--     can see. Meetings they are not on have no row of theirs.
--   * golf_event_documents for a hidden meeting are hidden from the player
--     too (its SELECT policy reads golf_events). Intended.
--   * Server code that reads with the admin client (calendar-sync, cron
--     reminders, the iCal feed route) bypasses RLS: the feed route scopes
--     meetings in app code (same change).
--   * get_coach_today_schedule, golf_event_attendance_counts: untouched.
--   * Baseball and Lift Lab: no object of theirs is touched.
--
-- VISIBLE CHANGE ON LIVE FAIRWAY after apply: none beyond the app fix in the
-- same change (players stop seeing meetings they are not invited to on
-- Calendar, Home, Team Hub, Travel's "Linked to" and their iCal feed). What
-- this adds: the same holds for Realtime payloads, direct PostgREST reads,
-- Clubhouse, and any reader the app fix missed; a player can no longer
-- self-RSVP onto a meeting; documents attached to such a meeting stop showing.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS golf_events_select_team ON public.golf_events;
--   CREATE POLICY golf_events_select_team ON public.golf_events
--     FOR SELECT TO public USING (public.is_golf_team_coach(team_id)
--       OR public.is_golf_team_player(team_id));
--   Re-run get_player_hub_events from
--   20261017111000_golf_home_event_rpcs_skip_cancelled.sql (or, if that was
--   never applied, from 20260527000000_prod_public_baseline.sql).
--   DROP FUNCTION IF EXISTS public.golf_player_invited_to_event(uuid);
--   (drop the function after the policy that calls it).
--
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname =
-- VERIFY: 'golf_player_invited_to_event' and p.prosecdef and p.proconfig =
-- VERIFY: array['search_path=""']) = 1;
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.golf_player_invited_to_event(uuid)', 'EXECUTE') and
-- VERIFY: has_function_privilege('authenticated',
-- VERIFY: 'public.golf_player_invited_to_event(uuid)', 'EXECUTE');
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename
-- VERIFY: = 'golf_events' and policyname = 'golf_events_select_team' and roles
-- VERIFY: = '{authenticated}' and qual like '%golf_player_invited_to_event%';
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname = 'get_player_hub_events' and
-- VERIFY: p.prosecdef and p.proconfig = array['search_path=public'] and
-- VERIFY: p.prosrc like '%cancelled_at IS NULL%' and p.prosrc like
-- VERIFY: '%event_type <> ''meeting''%') = 1;

SET LOCAL lock_timeout = '3s';

-- (a) Is the caller invited? --------------------------------------------------

CREATE OR REPLACE FUNCTION public.golf_player_invited_to_event(
    p_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_event_attendance a
    JOIN public.golf_players gp ON gp.id = a.player_id
    WHERE a.event_id = p_event_id
      AND gp.user_id = (SELECT auth.uid())
  );
$function$;

COMMENT ON FUNCTION public.golf_player_invited_to_event(uuid) IS
'True when the caller has a golf_players row with a golf_event_attendance row '
'on this event (they are on its invite list). Used by golf_events_select_team '
'so a player sees a meeting only when invited (20261018120000). SECURITY '
'DEFINER so the policy does not recurse through golf_event_attendance RLS.';

-- Supabase's default privileges grant EXECUTE on new public functions to anon,
-- so revoke it explicitly.
REVOKE ALL ON FUNCTION public.golf_player_invited_to_event(uuid) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_player_invited_to_event(
    uuid
) TO authenticated;

-- (b) Players see meetings they are invited to --------------------------------

DROP POLICY IF EXISTS golf_events_select_team ON public.golf_events;
CREATE POLICY golf_events_select_team ON public.golf_events
FOR SELECT TO authenticated
USING (
    public.is_golf_team_coach(team_id)
    OR (
        public.is_golf_team_player(team_id)
        AND (
            event_type <> 'meeting'
            OR public.golf_player_invited_to_event(id)
        )
    )
);

-- (c) The player hub lists the same meetings ----------------------------------

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
DECLARE
  -- The coach branch of the gate, kept as live; a coach's list is unchanged.
  v_coach boolean := EXISTS (
    SELECT 1
    FROM golf_coaches gc
    JOIN golf_teams   gt ON gt.organization_id = gc.organization_id
    WHERE gc.user_id = auth.uid()
      AND gt.id = p_team_id
  );
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
    OR v_coach
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH events AS (
      -- is_mandatory is exposed to the client; not a real column on golf_events.
      SELECT id, title, event_type, start_time, end_time, location
      FROM golf_events ge
      WHERE team_id = p_team_id
        AND start_time >= p_since
        -- A cancelled event stays in the table (soft cancel); it is not one to show or answer.
        AND cancelled_at IS NULL
        -- A meeting is listed only for the players invited to it (their own
        -- attendance row), as golf_events_select_team decides it.
        AND (
          event_type <> 'meeting'
          OR v_coach
          OR EXISTS (
            SELECT 1
            FROM golf_event_attendance mine
            WHERE mine.event_id = ge.id
              AND mine.player_id = p_player_id
          )
        )
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

-- ACL assertion: the migration fails loudly on grant drift.
DO $assert$
BEGIN
  IF has_function_privilege('anon', 'public.golf_player_invited_to_event(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'golf_player_invited_to_event must not be executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.golf_player_invited_to_event(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'golf_player_invited_to_event must be executable by authenticated';
  END IF;
END
$assert$;
