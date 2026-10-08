-- ROLLBACK CAPTURE for supabase/migrations/20261008120000_golf_holes_shots_select_via_rounds.sql
--
-- Forward change: golf_holes and golf_shots each get one SELECT policy,
-- round_id IN (SELECT gr.id FROM public.golf_rounds gr), evaluated once per
-- statement under the caller's golf_rounds RLS. golf_holes_select_team and the
-- golf_shots admin_read_all policy are dropped.
--
-- Prior definitions below were captured VERBATIM from the live production
-- catalog (pg_policies.qual, 2026-10-08, read-only). All four were
-- PERMISSIVE, FOR SELECT, TO authenticated, with no WITH CHECK.
--
-- WHAT THIS ROLLBACK COSTS: golf_shots/golf_holes reads go back to the
-- per-row nested golf_rounds RLS check (about 0.5 s for a coach reading one
-- team's shots, measured 2026-10-08), and admins lose read access to
-- golf_holes again. No data is touched either way.
--
-- If 20261007101000_golf_holes_shots_policy_consolidation.sql was applied
-- before the forward file, this restores the pre-101000 SELECT policies, not
-- 101000's golf_readable_round_ids() variant. To return to 101000's state
-- instead, re-run its golf_holes_select / golf_shots_select statements and
-- the admin_read_all statement below.
--
-- Metadata (fill on apply):
--   forward commit:          (the commit carrying the forward migration on main)
--   forward applied to prod: ____________________ (timestamp, by owner)
--   rollback applied:        ____________________ (timestamp, by owner)
--   approval:                owner (Nick)

-- -- Revert SQL (exact prior production state) --------------------------------
SET LOCAL lock_timeout = '3s';

DROP POLICY IF EXISTS golf_holes_select ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_select_team ON public.golf_holes;
DROP POLICY IF EXISTS golf_shots_select ON public.golf_shots;
DROP POLICY IF EXISTS admin_read_all ON public.golf_shots;

CREATE POLICY golf_holes_select ON public.golf_holes
FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND ((EXISTS ( SELECT 1
           FROM golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = ( SELECT auth.uid() AS uid))))) OR ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND is_golf_team_player(gr.team_id)))))));

CREATE POLICY golf_holes_select_team ON public.golf_holes
FOR SELECT TO authenticated
USING ((round_id IN ( SELECT gr.id
   FROM golf_rounds gr
  WHERE ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));

CREATE POLICY golf_shots_select ON public.golf_shots
FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND ((EXISTS ( SELECT 1
           FROM golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = ( SELECT auth.uid() AS uid))))) OR ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND is_golf_team_player(gr.team_id)))))));

CREATE POLICY admin_read_all ON public.golf_shots
FOR SELECT TO authenticated
USING (is_admin());

-- -- Verify the revert landed --------------------------------------------------
-- select tablename, policyname from pg_policies
--  where schemaname = 'public' and tablename in ('golf_holes', 'golf_shots') and cmd = 'SELECT'
--  order by 1, 2;
-- expect: golf_holes/golf_holes_select, golf_holes/golf_holes_select_team,
--         golf_shots/admin_read_all, golf_shots/golf_shots_select
