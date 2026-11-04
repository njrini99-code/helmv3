-- ROLLBACK for supabase/migrations/20261031142000_golf_events_class_rows_private.sql
-- Restores golf_events_select_team exactly as production had it on 2026-10-31 (pg_policies, read-only), then drops
-- the helper the forward file added.

DROP POLICY IF EXISTS golf_events_select_team ON public.golf_events;
CREATE POLICY golf_events_select_team ON public.golf_events
  FOR SELECT TO authenticated
  USING (
    (is_golf_team_coach(team_id) OR (is_golf_team_player(team_id) AND ((event_type <> 'meeting'::text) OR golf_player_invited_to_event(id))))
  );

DROP FUNCTION IF EXISTS public.golf_player_owns_class_event(text);
