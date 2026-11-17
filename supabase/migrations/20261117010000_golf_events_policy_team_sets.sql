-- Calendar reads check team membership once per query, not once per row.
-- STATUS: APPLIED to production 2026-11-17 01:22Z (owner go).
--   Record: supabase/migrations/HELD.md.
--
-- WHY. golf_events_select_team and golf_event_attendance_select_team call
--   is_golf_team_coach(team_id) and is_golf_team_player(team_id) on every row
--   the query reads. Both are plpgsql (never inlined) and each runs its own
--   join on golf_team_coach_staff / golf_team_members per call. Their answer
--   for a given team cannot change within a statement: it depends only on the
--   team and on auth.uid(). The set of teams the caller coaches or plays on is
--   tiny (one or two), so asked once as a set it becomes a hashed subplan.
--
-- MEASURED on production, read-only, 2026-11-17 (EXPLAIN ANALYZE as postgres,
--   evaluating the policy expression over the busiest team's 70-day calendar
--   window, 822 rows): 53.8ms with the per-row calls, 4.1ms with the sets
--   (13x). The row read itself is 1.5ms. pg_stat_statements since 7 Nov:
--   the coach/player team calendar read averages 137ms (240 calls, max 1.7s);
--   the player's Home RSVP read averages 70ms (234 calls); Supabase API logs
--   show golf_event_attendance requests averaging 546ms over the last day.
--
-- WHAT. One new function, public.golf_current_coach_team_ids(): the teams the
--   signed-in user is on the coaching staff of, by the exact join
--   is_golf_team_coach() uses. The player side reuses
--   public.get_current_player_team_ids(), already used by golf_team_members'
--   policy, which is the exact join is_golf_team_player() uses (active
--   members only). Two SELECT policies change, each by swapping
--     is_golf_team_coach(t)  for  t IN (SELECT golf_current_coach_team_ids())
--     is_golf_team_player(t) for  t IN (SELECT get_current_player_team_ids())
--   and nothing else (ALTER POLICY ... USING only: roles, command and
--   permissiveness stay as they are). The class-row and meeting-invitee rules
--   (20261031142000, 20261018120000) are kept word for word. INSERT, UPDATE
--   and DELETE policies are untouched. Who can read what is the same: for a
--   non-null team the two forms are true for exactly the same rows, and for a
--   null team both hide the row.
--
-- RISK: low. No data change. App change: none.
-- LOCKS: ALTER POLICY takes ACCESS EXCLUSIVE on golf_events and
--   golf_event_attendance until the commit. Catalog-only, milliseconds;
--   lock_timeout gives up after 3s with nothing changed. Apply off-peak.
-- ORDER: independent of every other held file.
--
-- VERIFY: select 1 from pg_catalog.pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'golf_events'
-- VERIFY: and policyname = 'golf_events_select_team'
-- VERIFY: and qual like '%golf_current_coach_team_ids%'
-- VERIFY: and qual like '%golf_player_owns_class_event%'
-- VERIFY: and qual not like '%is_golf_team_coach%';
-- VERIFY: select 1 from pg_catalog.pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'golf_event_attendance'
-- VERIFY: and policyname = 'golf_event_attendance_select_team'
-- VERIFY: and qual like '%get_current_player_team_ids%'
-- VERIFY: and qual not like '%is_golf_team_player%';
--
-- ROLLBACK: supabase/rollbacks/
--   20261117010000_golf_events_policy_team_sets.rollback.sql

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_current_coach_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT gtcs.team_id
  FROM public.golf_team_coach_staff gtcs
  JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
  WHERE gc.user_id = (SELECT auth.uid());
$function$;
REVOKE ALL ON FUNCTION public.golf_current_coach_team_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_current_coach_team_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.golf_current_coach_team_ids() TO service_role;

ALTER POLICY golf_events_select_team ON public.golf_events
USING (
    team_id IN (SELECT public.golf_current_coach_team_ids())
    OR (
        team_id IN (SELECT public.get_current_player_team_ids())
        AND CASE
            WHEN
                event_type = 'class'
                THEN public.golf_player_owns_class_event(description)
            WHEN
                event_type = 'meeting'
                THEN public.golf_player_invited_to_event(id)
            ELSE true
        END
    )
);

ALTER POLICY golf_event_attendance_select_team
ON public.golf_event_attendance
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_events AS e
        WHERE
            e.id = golf_event_attendance.event_id
            AND (
                e.team_id IN (SELECT public.golf_current_coach_team_ids())
                OR (
                    e.team_id IN (
                        SELECT public.get_current_player_team_ids()
                    )
                    AND golf_event_attendance.player_id IN (
                        SELECT gp.id
                        FROM public.golf_players AS gp
                        WHERE gp.user_id = (SELECT auth.uid())
                    )
                )
            )
    )
);
