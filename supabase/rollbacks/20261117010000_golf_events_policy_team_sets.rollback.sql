-- Rollback for 20261117010000_golf_events_policy_team_sets.sql.
--
-- Puts the two SELECT policies back to their per-row form, captured from
-- production 2026-11-17 before the forward file was written, then drops the
-- new function. Access is the same before and after; only speed changes.
--
-- Run as postgres, in one transaction.
--
-- VERIFY (after): select 1 from pg_catalog.pg_policies
-- VERIFY (after): where tablename = 'golf_events'
-- VERIFY (after): and policyname = 'golf_events_select_team'
-- VERIFY (after): and qual like '%is_golf_team_coach%';

SET LOCAL lock_timeout = '3s';

ALTER POLICY golf_events_select_team ON public.golf_events
USING (
    is_golf_team_coach(team_id)
    OR (
        is_golf_team_player(team_id)
        AND CASE
            WHEN
                event_type = 'class'
                THEN golf_player_owns_class_event(description)
            WHEN event_type = 'meeting' THEN golf_player_invited_to_event(id)
            ELSE true
        END
    )
);

ALTER POLICY golf_event_attendance_select_team
ON public.golf_event_attendance
USING (
    EXISTS (
        SELECT 1
        FROM golf_events AS e
        WHERE
            e.id = golf_event_attendance.event_id
            AND (
                is_golf_team_coach(e.team_id)
                OR (
                    is_golf_team_player(e.team_id)
                    AND golf_event_attendance.player_id IN (
                        SELECT gp.id
                        FROM golf_players AS gp
                        WHERE gp.user_id = (SELECT auth.uid())
                    )
                )
            )
    )
);

DROP FUNCTION IF EXISTS public.golf_current_coach_team_ids();
