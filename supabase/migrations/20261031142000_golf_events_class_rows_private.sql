-- A player reads only their own synced class meetings; coaches read every rostered player's, as before.
--
-- Owner approved 2026-10-31 ("class-row privacy"). Class meetings synced from a player's schedule live in
-- golf_events (event_type 'class', the owning class named by the `[class:<id>]` tag in the description,
-- lib/calendar/class-events.ts). golf_events_select_team let any active player read every non-meeting team row,
-- so a direct API read returned every teammate's class titles, times and rooms. The app already shows a player only
-- their own ("A player sees only their own classes", clubhouse/data/calendar.ts); this makes the database agree.
-- golf_player_classes itself is already owner-or-coach.
--
-- Changes golf_events_select_team only: class rows need golf_player_owns_class_event(description) for a player;
-- meetings keep the invitee rule; every other row type is unchanged. Coaches and admin_read_all are unchanged.
-- A class row with no resolvable tag is hidden from players (the app never showed it to them either).
-- No row, column or grant on golf_events changes.
--
-- ROLLBACK: recreate the policy with the prior USING clause, captured from production 2026-10-31:
--   (is_golf_team_coach(team_id) OR (is_golf_team_player(team_id) AND ((event_type <> 'meeting'::text)
--    OR golf_player_invited_to_event(id))))
--   then drop function public.golf_player_owns_class_event(text). Full text in
--   supabase/rollbacks/20261031142000_golf_events_class_rows_private.rollback.sql.
--
-- VERIFY: select 1 from pg_policies where tablename = 'golf_events' and policyname = 'golf_events_select_team' and qual like '%golf_player_owns_class_event%';

CREATE OR REPLACE FUNCTION public.golf_player_owns_class_event(p_description text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_player_classes c
    JOIN public.golf_players gp ON gp.id = c.player_id
    WHERE c.id::text = substring(p_description FROM '\[class:([^\]\s]+)\]')
      AND gp.user_id = (SELECT auth.uid())
  );
$function$;
REVOKE ALL ON FUNCTION public.golf_player_owns_class_event(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_player_owns_class_event(text) TO authenticated;

DROP POLICY IF EXISTS golf_events_select_team ON public.golf_events;
CREATE POLICY golf_events_select_team ON public.golf_events
  FOR SELECT TO authenticated
  USING (
    is_golf_team_coach(team_id)
    OR (
      is_golf_team_player(team_id)
      AND CASE
        WHEN event_type = 'class' THEN golf_player_owns_class_event(description)
        WHEN event_type = 'meeting' THEN golf_player_invited_to_event(id)
        ELSE true
      END
    )
  );
