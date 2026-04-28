-- ============================================================================
-- Canonical RLS Snapshot — generated 2026-04-27
--
-- Captures every live policy on the public schema in production
-- (Helm-Production / qmnssrrolpinvwjjnufo) so a fresh environment can
-- reproduce the policy graph from the tracked migrations alone. Pre-this-
-- snapshot, ~80 tables had migration-time `ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY` directives but their `CREATE POLICY` statements never made it
-- into the migrations folder — they were applied ad-hoc against production.
--
-- This file is fully idempotent: each policy is dropped if-exists before
-- being re-created, so re-running on top of an already-policied env is a
-- no-op shape-wise.
-- ============================================================================

BEGIN;

-- ----- _deprecated_baseball_academics -----
DROP POLICY IF EXISTS baseball_academics_insert ON public._deprecated_baseball_academics;
CREATE POLICY baseball_academics_insert ON public._deprecated_baseball_academics AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_academics.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_academics_select ON public._deprecated_baseball_academics;
CREATE POLICY baseball_academics_select ON public._deprecated_baseball_academics AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_academics.player_id) AND (baseball_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id))));
DROP POLICY IF EXISTS baseball_academics_update ON public._deprecated_baseball_academics;
CREATE POLICY baseball_academics_update ON public._deprecated_baseball_academics AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_academics.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ----- _deprecated_baseball_announcement_documents -----
DROP POLICY IF EXISTS baseball_ann_docs_delete ON public._deprecated_baseball_announcement_documents;
CREATE POLICY baseball_ann_docs_delete ON public._deprecated_baseball_announcement_documents AS PERMISSIVE FOR DELETE TO authenticated
  USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_docs_insert ON public._deprecated_baseball_announcement_documents;
CREATE POLICY baseball_ann_docs_insert ON public._deprecated_baseball_announcement_documents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_docs_select ON public._deprecated_baseball_announcement_documents;
CREATE POLICY baseball_ann_docs_select ON public._deprecated_baseball_announcement_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE (is_baseball_team_coach(baseball_announcements.team_id) OR is_baseball_team_member(baseball_announcements.team_id)))));

-- ----- _deprecated_baseball_announcement_tasks -----
DROP POLICY IF EXISTS baseball_ann_tasks_delete ON public._deprecated_baseball_announcement_tasks;
CREATE POLICY baseball_ann_tasks_delete ON public._deprecated_baseball_announcement_tasks AS PERMISSIVE FOR DELETE TO authenticated
  USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_tasks_insert ON public._deprecated_baseball_announcement_tasks;
CREATE POLICY baseball_ann_tasks_insert ON public._deprecated_baseball_announcement_tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_tasks_select ON public._deprecated_baseball_announcement_tasks;
CREATE POLICY baseball_ann_tasks_select ON public._deprecated_baseball_announcement_tasks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE (is_baseball_team_coach(baseball_announcements.team_id) OR is_baseball_team_member(baseball_announcements.team_id)))));

-- ----- _deprecated_baseball_coach_settings -----
DROP POLICY IF EXISTS baseball_coach_settings_insert ON public._deprecated_baseball_coach_settings;
CREATE POLICY baseball_coach_settings_insert ON public._deprecated_baseball_coach_settings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = _deprecated_baseball_coach_settings.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_coach_settings_select ON public._deprecated_baseball_coach_settings;
CREATE POLICY baseball_coach_settings_select ON public._deprecated_baseball_coach_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = _deprecated_baseball_coach_settings.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_coach_settings_update ON public._deprecated_baseball_coach_settings;
CREATE POLICY baseball_coach_settings_update ON public._deprecated_baseball_coach_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = _deprecated_baseball_coach_settings.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- _deprecated_baseball_dream_schools -----
DROP POLICY IF EXISTS baseball_dream_schools_delete_own ON public._deprecated_baseball_dream_schools;
CREATE POLICY baseball_dream_schools_delete_own ON public._deprecated_baseball_dream_schools AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_dream_schools.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_dream_schools_insert_own ON public._deprecated_baseball_dream_schools;
CREATE POLICY baseball_dream_schools_insert_own ON public._deprecated_baseball_dream_schools AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_dream_schools.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_dream_schools_select ON public._deprecated_baseball_dream_schools;
CREATE POLICY baseball_dream_schools_select ON public._deprecated_baseball_dream_schools AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_dream_schools.player_id) AND (baseball_players.user_id = auth.uid())))) OR ((display_on_profile = true) AND (EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_dream_schools.player_id) AND (baseball_players.recruiting_activated = true)))))));
DROP POLICY IF EXISTS baseball_dream_schools_update_own ON public._deprecated_baseball_dream_schools;
CREATE POLICY baseball_dream_schools_update_own ON public._deprecated_baseball_dream_schools AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = _deprecated_baseball_dream_schools.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ----- _deprecated_feature_flags -----
DROP POLICY IF EXISTS "Service role can manage feature flags" ON public._deprecated_feature_flags;
CREATE POLICY "Service role can manage feature flags" ON public._deprecated_feature_flags AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Anyone can read feature flags" ON public._deprecated_feature_flags;
CREATE POLICY "Anyone can read feature flags" ON public._deprecated_feature_flags AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);

-- ----- _deprecated_golf_availability_polls -----
DROP POLICY IF EXISTS "Coaches can manage polls" ON public._deprecated_golf_availability_polls;
CREATE POLICY "Coaches can manage polls" ON public._deprecated_golf_availability_polls AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = _deprecated_golf_availability_polls.team_id)))));
DROP POLICY IF EXISTS "Team members can view polls" ON public._deprecated_golf_availability_polls;
CREATE POLICY "Team members can view polls" ON public._deprecated_golf_availability_polls AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = _deprecated_golf_availability_polls.team_id)))) OR (EXISTS ( SELECT 1
   FROM (golf_team_members tm
     JOIN golf_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = _deprecated_golf_availability_polls.team_id))))));

-- ----- _deprecated_golf_calendar_sync_log -----
DROP POLICY IF EXISTS "System can create golf sync logs" ON public._deprecated_golf_calendar_sync_log;
CREATE POLICY "System can create golf sync logs" ON public._deprecated_golf_calendar_sync_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their golf sync logs" ON public._deprecated_golf_calendar_sync_log;
CREATE POLICY "Users can view their golf sync logs" ON public._deprecated_golf_calendar_sync_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

-- ----- _deprecated_golf_calendar_sync_state -----
DROP POLICY IF EXISTS "Users can manage their golf calendar sync state" ON public._deprecated_golf_calendar_sync_state;
CREATE POLICY "Users can manage their golf calendar sync state" ON public._deprecated_golf_calendar_sync_state AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()));

-- ----- _deprecated_golf_coach_settings -----
DROP POLICY IF EXISTS golf_coach_settings_delete_coach ON public._deprecated_golf_coach_settings;
CREATE POLICY golf_coach_settings_delete_coach ON public._deprecated_golf_coach_settings AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = _deprecated_golf_coach_settings.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coach_settings_insert_coach ON public._deprecated_golf_coach_settings;
CREATE POLICY golf_coach_settings_insert_coach ON public._deprecated_golf_coach_settings AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = _deprecated_golf_coach_settings.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coach_settings_select_coach ON public._deprecated_golf_coach_settings;
CREATE POLICY golf_coach_settings_select_coach ON public._deprecated_golf_coach_settings AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = _deprecated_golf_coach_settings.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coach_settings_update_coach ON public._deprecated_golf_coach_settings;
CREATE POLICY golf_coach_settings_update_coach ON public._deprecated_golf_coach_settings AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = _deprecated_golf_coach_settings.coach_id) AND (gc.user_id = auth.uid())))));

-- ----- _deprecated_golf_event_exclusions -----
DROP POLICY IF EXISTS "Coaches can manage event exclusions" ON public._deprecated_golf_event_exclusions;
CREATE POLICY "Coaches can manage event exclusions" ON public._deprecated_golf_event_exclusions AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((golf_events e
     JOIN golf_team_coach_staff tcs ON ((tcs.team_id = e.team_id)))
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((e.id = _deprecated_golf_event_exclusions.event_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Players can view their own event exclusions" ON public._deprecated_golf_event_exclusions;
CREATE POLICY "Players can view their own event exclusions" ON public._deprecated_golf_event_exclusions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = _deprecated_golf_event_exclusions.player_id)))));

-- ----- _deprecated_golf_event_status_log -----
DROP POLICY IF EXISTS "Team members can view event logs" ON public._deprecated_golf_event_status_log;
CREATE POLICY "Team members can view event logs" ON public._deprecated_golf_event_status_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM ((golf_events e
     JOIN golf_team_coach_staff tcs ON ((tcs.team_id = e.team_id)))
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((e.id = _deprecated_golf_event_status_log.event_id) AND (c.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM ((golf_events e
     JOIN golf_team_members tm ON ((tm.team_id = e.team_id)))
     JOIN golf_players p ON ((p.id = tm.player_id)))
  WHERE ((e.id = _deprecated_golf_event_status_log.event_id) AND (p.user_id = auth.uid()))))));

-- ----- _deprecated_golf_external_calendars -----
DROP POLICY IF EXISTS "Players can manage their own calendars" ON public._deprecated_golf_external_calendars;
CREATE POLICY "Players can manage their own calendars" ON public._deprecated_golf_external_calendars AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = _deprecated_golf_external_calendars.player_id)))));

-- ----- _deprecated_golf_insight_feedback -----
DROP POLICY IF EXISTS "Coaches can manage their own insight feedback" ON public._deprecated_golf_insight_feedback;
CREATE POLICY "Coaches can manage their own insight feedback" ON public._deprecated_golf_insight_feedback AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.user_id = auth.uid()) AND (gc.id = _deprecated_golf_insight_feedback.coach_id)))));

-- ----- _deprecated_golf_insight_weights -----
DROP POLICY IF EXISTS golf_insight_weights_select ON public._deprecated_golf_insight_weights;
CREATE POLICY golf_insight_weights_select ON public._deprecated_golf_insight_weights AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- _deprecated_golf_player_availability_blocks -----
DROP POLICY IF EXISTS "Players can manage their own availability" ON public._deprecated_golf_player_availability_blocks;
CREATE POLICY "Players can manage their own availability" ON public._deprecated_golf_player_availability_blocks AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = _deprecated_golf_player_availability_blocks.player_id)))));
DROP POLICY IF EXISTS "Coaches can view team availability" ON public._deprecated_golf_player_availability_blocks;
CREATE POLICY "Coaches can view team availability" ON public._deprecated_golf_player_availability_blocks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((golf_team_members tm
     JOIN golf_team_coach_staff tcs ON ((tcs.team_id = tm.team_id)))
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((tm.player_id = _deprecated_golf_player_availability_blocks.player_id) AND (c.user_id = auth.uid())))));

-- ----- _deprecated_golf_player_insight_preferences -----
DROP POLICY IF EXISTS golf_player_insight_preferences_all ON public._deprecated_golf_player_insight_preferences;
CREATE POLICY golf_player_insight_preferences_all ON public._deprecated_golf_player_insight_preferences AS PERMISSIVE FOR ALL TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))))
  WITH CHECK ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ----- _deprecated_golf_player_settings -----
DROP POLICY IF EXISTS golf_player_settings_delete_own ON public._deprecated_golf_player_settings;
CREATE POLICY golf_player_settings_delete_own ON public._deprecated_golf_player_settings AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = _deprecated_golf_player_settings.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_player_settings_insert_own ON public._deprecated_golf_player_settings;
CREATE POLICY golf_player_settings_insert_own ON public._deprecated_golf_player_settings AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = _deprecated_golf_player_settings.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_player_settings_select_own ON public._deprecated_golf_player_settings;
CREATE POLICY golf_player_settings_select_own ON public._deprecated_golf_player_settings AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = _deprecated_golf_player_settings.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_player_settings_update_own ON public._deprecated_golf_player_settings;
CREATE POLICY golf_player_settings_update_own ON public._deprecated_golf_player_settings AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = _deprecated_golf_player_settings.player_id) AND (gp.user_id = auth.uid())))));

-- ----- _deprecated_golf_poll_responses -----
DROP POLICY IF EXISTS "Players can manage their own responses" ON public._deprecated_golf_poll_responses;
CREATE POLICY "Players can manage their own responses" ON public._deprecated_golf_poll_responses AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = _deprecated_golf_poll_responses.player_id)))));
DROP POLICY IF EXISTS "Coaches can view all responses" ON public._deprecated_golf_poll_responses;
CREATE POLICY "Coaches can view all responses" ON public._deprecated_golf_poll_responses AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((_deprecated_golf_availability_polls poll
     JOIN golf_team_coach_staff tcs ON ((tcs.team_id = poll.team_id)))
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((poll.id = _deprecated_golf_poll_responses.poll_id) AND (c.user_id = auth.uid())))));

-- ----- _deprecated_golf_putting_tendencies -----
DROP POLICY IF EXISTS "Coaches can manage putting tendencies" ON public._deprecated_golf_putting_tendencies;
CREATE POLICY "Coaches can manage putting tendencies" ON public._deprecated_golf_putting_tendencies AS PERMISSIVE FOR ALL TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS "Coaches can view team putting tendencies" ON public._deprecated_golf_putting_tendencies;
CREATE POLICY "Coaches can view team putting tendencies" ON public._deprecated_golf_putting_tendencies AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS "Players can view own putting tendencies" ON public._deprecated_golf_putting_tendencies;
CREATE POLICY "Players can view own putting tendencies" ON public._deprecated_golf_putting_tendencies AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ----- _deprecated_golf_travel_expense_splits -----
DROP POLICY IF EXISTS golf_expense_splits_coach_all ON public._deprecated_golf_travel_expense_splits;
CREATE POLICY golf_expense_splits_coach_all ON public._deprecated_golf_travel_expense_splits AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (golf_travel_expenses gte
     JOIN golf_coaches gc ON ((EXISTS ( SELECT 1
           FROM golf_teams gt
          WHERE ((gt.organization_id = gc.organization_id) AND (gt.id = gte.team_id))))))
  WHERE ((gc.user_id = auth.uid()) AND (gte.id = _deprecated_golf_travel_expense_splits.expense_id)))));
DROP POLICY IF EXISTS golf_expense_splits_player_select ON public._deprecated_golf_travel_expense_splits;
CREATE POLICY golf_expense_splits_player_select ON public._deprecated_golf_travel_expense_splits AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = _deprecated_golf_travel_expense_splits.player_id)))));

-- ----- _deprecated_organization_settings -----
DROP POLICY IF EXISTS "Organization coaches can manage settings" ON public._deprecated_organization_settings;
CREATE POLICY "Organization coaches can manage settings" ON public._deprecated_organization_settings AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.organization_id = _deprecated_organization_settings.organization_id)))) OR (EXISTS ( SELECT 1
   FROM golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.organization_id = _deprecated_organization_settings.organization_id))))));
DROP POLICY IF EXISTS "Anyone can view organization settings" ON public._deprecated_organization_settings;
CREATE POLICY "Anyone can view organization settings" ON public._deprecated_organization_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- _deprecated_page_views -----
DROP POLICY IF EXISTS "Service role manages page views" ON public._deprecated_page_views;
CREATE POLICY "Service role manages page views" ON public._deprecated_page_views AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Users can insert own page views" ON public._deprecated_page_views;
CREATE POLICY "Users can insert own page views" ON public._deprecated_page_views AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins can read page views" ON public._deprecated_page_views;
CREATE POLICY "Admins can read page views" ON public._deprecated_page_views AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- _deprecated_player_dream_schools -----
DROP POLICY IF EXISTS "Players can manage their own dream schools" ON public._deprecated_player_dream_schools;
CREATE POLICY "Players can manage their own dream schools" ON public._deprecated_player_dream_schools AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = _deprecated_player_dream_schools.player_id)))));
DROP POLICY IF EXISTS "Coaches can view dream schools" ON public._deprecated_player_dream_schools;
CREATE POLICY "Coaches can view dream schools" ON public._deprecated_player_dream_schools AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches c
  WHERE (c.user_id = auth.uid()))));

-- ----- admin_analytics_events -----
DROP POLICY IF EXISTS "Users can insert own analytics events" ON public.admin_analytics_events;
CREATE POLICY "Users can insert own analytics events" ON public.admin_analytics_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can read all analytics events" ON public.admin_analytics_events;
CREATE POLICY "Admins can read all analytics events" ON public.admin_analytics_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- admin_api_perf_log -----
DROP POLICY IF EXISTS "Service role only for api perf log" ON public.admin_api_perf_log;
CREATE POLICY "Service role only for api perf log" ON public.admin_api_perf_log AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- admin_client_errors -----
DROP POLICY IF EXISTS "Users can insert own client errors" ON public.admin_client_errors;
CREATE POLICY "Users can insert own client errors" ON public.admin_client_errors AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can read all client errors" ON public.admin_client_errors;
CREATE POLICY "Admins can read all client errors" ON public.admin_client_errors AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- admin_events -----
DROP POLICY IF EXISTS "Service role can manage admin_events" ON public.admin_events;
CREATE POLICY "Service role can manage admin_events" ON public.admin_events AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Service role can insert admin_events" ON public.admin_events;
CREATE POLICY "Service role can insert admin_events" ON public.admin_events AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can read admin_events" ON public.admin_events;
CREATE POLICY "Admins can read admin_events" ON public.admin_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can update admin_events" ON public.admin_events;
CREATE POLICY "Admins can update admin_events" ON public.admin_events AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- api_call_logs -----
DROP POLICY IF EXISTS api_call_logs_service_write ON public.api_call_logs;
CREATE POLICY api_call_logs_service_write ON public.api_call_logs AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS api_call_logs_admin_read ON public.api_call_logs;
CREATE POLICY api_call_logs_admin_read ON public.api_call_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- approach_miss_details -----
DROP POLICY IF EXISTS approach_miss_details_delete_own ON public.approach_miss_details;
CREATE POLICY approach_miss_details_delete_own ON public.approach_miss_details AS PERMISSIVE FOR DELETE TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));
DROP POLICY IF EXISTS approach_miss_details_insert_own ON public.approach_miss_details;
CREATE POLICY approach_miss_details_insert_own ON public.approach_miss_details AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));
DROP POLICY IF EXISTS approach_miss_details_select_own ON public.approach_miss_details;
CREATE POLICY approach_miss_details_select_own ON public.approach_miss_details AS PERMISSIVE FOR SELECT TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));
DROP POLICY IF EXISTS approach_miss_details_select_team ON public.approach_miss_details;
CREATE POLICY approach_miss_details_select_team ON public.approach_miss_details AS PERMISSIVE FOR SELECT TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM ((((((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS approach_miss_details_update_own ON public.approach_miss_details;
CREATE POLICY approach_miss_details_update_own ON public.approach_miss_details AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))))
  WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));

-- ----- audit_log -----
DROP POLICY IF EXISTS "Service role can manage audit logs" ON public.audit_log;
CREATE POLICY "Service role can manage audit logs" ON public.audit_log AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_log;
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_log;
CREATE POLICY "Admins can read audit logs" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- auth_metrics_hourly -----
DROP POLICY IF EXISTS auth_metrics_hourly_service_write ON public.auth_metrics_hourly;
CREATE POLICY auth_metrics_hourly_service_write ON public.auth_metrics_hourly AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS auth_metrics_hourly_admin_read ON public.auth_metrics_hourly;
CREATE POLICY auth_metrics_hourly_admin_read ON public.auth_metrics_hourly AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- background_job_logs -----
DROP POLICY IF EXISTS background_job_logs_service_write ON public.background_job_logs;
CREATE POLICY background_job_logs_service_write ON public.background_job_logs AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS background_job_logs_admin_read ON public.background_job_logs;
CREATE POLICY background_job_logs_admin_read ON public.background_job_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- baseball_academic_eligibility -----
DROP POLICY IF EXISTS baseball_acad_elig_delete ON public.baseball_academic_eligibility;
CREATE POLICY baseball_acad_elig_delete ON public.baseball_academic_eligibility AS PERMISSIVE FOR DELETE TO authenticated
  USING ((((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND is_baseball_team_coach(btm.team_id))))));
DROP POLICY IF EXISTS baseball_acad_elig_insert ON public.baseball_academic_eligibility;
CREATE POLICY baseball_acad_elig_insert ON public.baseball_academic_eligibility AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND is_baseball_team_coach(btm.team_id))))));
DROP POLICY IF EXISTS baseball_acad_elig_select_coach ON public.baseball_academic_eligibility;
CREATE POLICY baseball_acad_elig_select_coach ON public.baseball_academic_eligibility AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND is_baseball_team_coach(btm.team_id)))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id))));
DROP POLICY IF EXISTS baseball_acad_elig_select_player ON public.baseball_academic_eligibility;
CREATE POLICY baseball_acad_elig_select_player ON public.baseball_academic_eligibility AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS baseball_acad_elig_update ON public.baseball_academic_eligibility;
CREATE POLICY baseball_acad_elig_update ON public.baseball_academic_eligibility AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM baseball_team_members btm
  WHERE ((btm.player_id = baseball_academic_eligibility.player_id) AND is_baseball_team_coach(btm.team_id))))));

-- ----- baseball_announcement_acknowledgements -----
DROP POLICY IF EXISTS baseball_ann_acks_insert ON public.baseball_announcement_acknowledgements;
CREATE POLICY baseball_ann_acks_insert ON public.baseball_announcement_acknowledgements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((player_id = get_my_player_id()));
DROP POLICY IF EXISTS baseball_ann_acks_select_coach ON public.baseball_announcement_acknowledgements;
CREATE POLICY baseball_ann_acks_select_coach ON public.baseball_announcement_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_acks_select_player ON public.baseball_announcement_acknowledgements;
CREATE POLICY baseball_ann_acks_select_player ON public.baseball_announcement_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id = get_my_player_id()));

-- ----- baseball_announcement_recipients -----
DROP POLICY IF EXISTS baseball_ann_recipients_delete ON public.baseball_announcement_recipients;
CREATE POLICY baseball_ann_recipients_delete ON public.baseball_announcement_recipients AS PERMISSIVE FOR DELETE TO authenticated
  USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_recipients_insert ON public.baseball_announcement_recipients;
CREATE POLICY baseball_ann_recipients_insert ON public.baseball_announcement_recipients AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_recipients_select_coach ON public.baseball_announcement_recipients;
CREATE POLICY baseball_ann_recipients_select_coach ON public.baseball_announcement_recipients AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT baseball_announcements.id
   FROM baseball_announcements
  WHERE is_baseball_team_coach(baseball_announcements.team_id))));
DROP POLICY IF EXISTS baseball_ann_recipients_select_player ON public.baseball_announcement_recipients;
CREATE POLICY baseball_ann_recipients_select_player ON public.baseball_announcement_recipients AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id = get_my_player_id()));

-- ----- baseball_announcements -----
DROP POLICY IF EXISTS baseball_announcements_delete ON public.baseball_announcements;
CREATE POLICY baseball_announcements_delete ON public.baseball_announcements AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_announcements_insert ON public.baseball_announcements;
CREATE POLICY baseball_announcements_insert ON public.baseball_announcements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_announcements_select_coach ON public.baseball_announcements;
CREATE POLICY baseball_announcements_select_coach ON public.baseball_announcements AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_announcements_select_player ON public.baseball_announcements;
CREATE POLICY baseball_announcements_select_player ON public.baseball_announcements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_baseball_team_member(team_id) AND ((NOT (EXISTS ( SELECT 1
   FROM baseball_announcement_recipients
  WHERE (baseball_announcement_recipients.announcement_id = baseball_announcements.id)))) OR (EXISTS ( SELECT 1
   FROM baseball_announcement_recipients
  WHERE ((baseball_announcement_recipients.announcement_id = baseball_announcements.id) AND (baseball_announcement_recipients.player_id = get_my_player_id())))))));
DROP POLICY IF EXISTS baseball_announcements_update ON public.baseball_announcements;
CREATE POLICY baseball_announcements_update ON public.baseball_announcements AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- ----- baseball_box_score_batting -----
DROP POLICY IF EXISTS "Coaches can delete batting stats" ON public.baseball_box_score_batting;
CREATE POLICY "Coaches can delete batting stats" ON public.baseball_box_score_batting AS PERMISSIVE FOR DELETE TO public
  USING (is_baseball_team_coach_v2(team_id));
DROP POLICY IF EXISTS "Coaches can insert batting stats" ON public.baseball_box_score_batting;
CREATE POLICY "Coaches can insert batting stats" ON public.baseball_box_score_batting AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_baseball_team_coach_v2(team_id));
DROP POLICY IF EXISTS "Players see own + coaches see team batting" ON public.baseball_box_score_batting;
CREATE POLICY "Players see own + coaches see team batting" ON public.baseball_box_score_batting AS PERMISSIVE FOR SELECT TO public
  USING (((player_id = ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid())
 LIMIT 1)) OR is_baseball_team_coach_v2(team_id)));
DROP POLICY IF EXISTS "Coaches can update batting stats" ON public.baseball_box_score_batting;
CREATE POLICY "Coaches can update batting stats" ON public.baseball_box_score_batting AS PERMISSIVE FOR UPDATE TO public
  USING (is_baseball_team_coach_v2(team_id));

-- ----- baseball_box_score_pitching -----
DROP POLICY IF EXISTS "Coaches can delete pitching stats" ON public.baseball_box_score_pitching;
CREATE POLICY "Coaches can delete pitching stats" ON public.baseball_box_score_pitching AS PERMISSIVE FOR DELETE TO public
  USING (is_baseball_team_coach_v2(team_id));
DROP POLICY IF EXISTS "Coaches can insert pitching stats" ON public.baseball_box_score_pitching;
CREATE POLICY "Coaches can insert pitching stats" ON public.baseball_box_score_pitching AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_baseball_team_coach_v2(team_id));
DROP POLICY IF EXISTS "Players see own + coaches see team pitching" ON public.baseball_box_score_pitching;
CREATE POLICY "Players see own + coaches see team pitching" ON public.baseball_box_score_pitching AS PERMISSIVE FOR SELECT TO public
  USING (((player_id = ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid())
 LIMIT 1)) OR is_baseball_team_coach_v2(team_id)));
DROP POLICY IF EXISTS "Coaches can update pitching stats" ON public.baseball_box_score_pitching;
CREATE POLICY "Coaches can update pitching stats" ON public.baseball_box_score_pitching AS PERMISSIVE FOR UPDATE TO public
  USING (is_baseball_team_coach_v2(team_id));

-- ----- baseball_box_score_uploads -----
DROP POLICY IF EXISTS "Coaches can manage their uploads" ON public.baseball_box_score_uploads;
CREATE POLICY "Coaches can manage their uploads" ON public.baseball_box_score_uploads AS PERMISSIVE FOR ALL TO public
  USING ((coach_id = ( SELECT baseball_coaches.id
   FROM baseball_coaches
  WHERE (baseball_coaches.user_id = auth.uid())
 LIMIT 1)))
  WITH CHECK ((coach_id = ( SELECT baseball_coaches.id
   FROM baseball_coaches
  WHERE (baseball_coaches.user_id = auth.uid())
 LIMIT 1)));

-- ----- baseball_camp_registrations -----
DROP POLICY IF EXISTS baseball_camp_regs_insert ON public.baseball_camp_registrations;
CREATE POLICY baseball_camp_regs_insert ON public.baseball_camp_registrations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_camp_regs_select ON public.baseball_camp_registrations;
CREATE POLICY baseball_camp_regs_select ON public.baseball_camp_registrations AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (baseball_camps bc
     JOIN baseball_coaches bco ON ((bco.id = bc.coach_id)))
  WHERE ((bc.id = baseball_camp_registrations.camp_id) AND (bco.user_id = auth.uid()))))));
DROP POLICY IF EXISTS baseball_camp_regs_update ON public.baseball_camp_registrations;
CREATE POLICY baseball_camp_regs_update ON public.baseball_camp_registrations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (baseball_camps bc
     JOIN baseball_coaches bco ON ((bco.id = bc.coach_id)))
  WHERE ((bc.id = baseball_camp_registrations.camp_id) AND (bco.user_id = auth.uid()))))));

-- ----- baseball_camps -----
DROP POLICY IF EXISTS baseball_camps_delete ON public.baseball_camps;
CREATE POLICY baseball_camps_delete ON public.baseball_camps AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_camps_insert ON public.baseball_camps;
CREATE POLICY baseball_camps_insert ON public.baseball_camps AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_camps_select ON public.baseball_camps;
CREATE POLICY baseball_camps_select ON public.baseball_camps AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))) OR (status = 'published'::text)));
DROP POLICY IF EXISTS baseball_camps_update ON public.baseball_camps;
CREATE POLICY baseball_camps_update ON public.baseball_camps AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- baseball_coach_insights -----
DROP POLICY IF EXISTS baseball_insights_insert ON public.baseball_coach_insights;
CREATE POLICY baseball_insights_insert ON public.baseball_coach_insights AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_insights.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_insights_select ON public.baseball_coach_insights;
CREATE POLICY baseball_insights_select ON public.baseball_coach_insights AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_insights.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_insights_update ON public.baseball_coach_insights;
CREATE POLICY baseball_insights_update ON public.baseball_coach_insights AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_insights.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- baseball_coach_philosophy -----
DROP POLICY IF EXISTS baseball_coach_philosophy_insert ON public.baseball_coach_philosophy;
CREATE POLICY baseball_coach_philosophy_insert ON public.baseball_coach_philosophy AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_philosophy.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_coach_philosophy_select ON public.baseball_coach_philosophy;
CREATE POLICY baseball_coach_philosophy_select ON public.baseball_coach_philosophy AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_philosophy.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_coach_philosophy_update ON public.baseball_coach_philosophy;
CREATE POLICY baseball_coach_philosophy_update ON public.baseball_coach_philosophy AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_coach_philosophy.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- baseball_coach_recruiting_philosophy -----
DROP POLICY IF EXISTS "Coaches can manage their own philosophy" ON public.baseball_coach_recruiting_philosophy;
CREATE POLICY "Coaches can manage their own philosophy" ON public.baseball_coach_recruiting_philosophy AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = baseball_coach_recruiting_philosophy.coach_id)))));

-- ----- baseball_coaches -----
DROP POLICY IF EXISTS baseball_coaches_insert_own ON public.baseball_coaches;
CREATE POLICY baseball_coaches_insert_own ON public.baseball_coaches AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS baseball_coaches_select ON public.baseball_coaches;
CREATE POLICY baseball_coaches_select ON public.baseball_coaches AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth.uid() = user_id) OR (get_my_coach_id() IS NOT NULL)));
DROP POLICY IF EXISTS baseball_coaches_select_all ON public.baseball_coaches;
CREATE POLICY baseball_coaches_select_all ON public.baseball_coaches AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS baseball_coaches_update_own ON public.baseball_coaches;
CREATE POLICY baseball_coaches_update_own ON public.baseball_coaches AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));

-- ----- baseball_conversation_participants -----
DROP POLICY IF EXISTS baseball_participants_insert_by_creator ON public.baseball_conversation_participants;
CREATE POLICY baseball_participants_insert_by_creator ON public.baseball_conversation_participants AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM baseball_conversations
  WHERE ((baseball_conversations.id = baseball_conversation_participants.conversation_id) AND (baseball_conversations.created_by = auth.uid()))))));
DROP POLICY IF EXISTS baseball_conversation_participants_select ON public.baseball_conversation_participants;
CREATE POLICY baseball_conversation_participants_select ON public.baseball_conversation_participants AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (conversation_id IN ( SELECT get_my_baseball_conversation_ids() AS get_my_baseball_conversation_ids))));
DROP POLICY IF EXISTS baseball_participants_update_own ON public.baseball_conversation_participants;
CREATE POLICY baseball_participants_update_own ON public.baseball_conversation_participants AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

-- ----- baseball_conversations -----
DROP POLICY IF EXISTS baseball_conversations_insert ON public.baseball_conversations;
CREATE POLICY baseball_conversations_insert ON public.baseball_conversations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()));
DROP POLICY IF EXISTS baseball_conversations_select ON public.baseball_conversations;
CREATE POLICY baseball_conversations_select ON public.baseball_conversations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_conversations.id) AND (baseball_conversation_participants.user_id = auth.uid())))));

-- ----- baseball_developmental_plans -----
DROP POLICY IF EXISTS baseball_dev_plans_delete_coach ON public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_delete_coach ON public.baseball_developmental_plans AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_dev_plans_insert_coach ON public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_insert_coach ON public.baseball_developmental_plans AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_dev_plans_select ON public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_select ON public.baseball_developmental_plans AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_developmental_plans.player_id) AND (baseball_players.user_id = auth.uid()))))));
DROP POLICY IF EXISTS baseball_dev_plans_update_coach ON public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_update_coach ON public.baseball_developmental_plans AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- baseball_document_versions -----
DROP POLICY IF EXISTS baseball_document_versions_insert ON public.baseball_document_versions;
CREATE POLICY baseball_document_versions_insert ON public.baseball_document_versions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((document_id IN ( SELECT baseball_documents.id
   FROM baseball_documents
  WHERE is_baseball_team_coach(baseball_documents.team_id))));
DROP POLICY IF EXISTS baseball_document_versions_select ON public.baseball_document_versions;
CREATE POLICY baseball_document_versions_select ON public.baseball_document_versions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((document_id IN ( SELECT baseball_documents.id
   FROM baseball_documents
  WHERE (is_baseball_team_coach(baseball_documents.team_id) OR ((baseball_documents.is_player_visible = true) AND is_baseball_team_player(baseball_documents.team_id))))));

-- ----- baseball_documents -----
DROP POLICY IF EXISTS baseball_documents_delete ON public.baseball_documents;
CREATE POLICY baseball_documents_delete ON public.baseball_documents AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_documents_insert ON public.baseball_documents;
CREATE POLICY baseball_documents_insert ON public.baseball_documents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_documents_select_coach ON public.baseball_documents;
CREATE POLICY baseball_documents_select_coach ON public.baseball_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_documents_select_player ON public.baseball_documents;
CREATE POLICY baseball_documents_select_player ON public.baseball_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING (((is_player_visible = true) AND is_baseball_team_player(team_id)));
DROP POLICY IF EXISTS baseball_documents_update ON public.baseball_documents;
CREATE POLICY baseball_documents_update ON public.baseball_documents AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- ----- baseball_event_attendance -----
DROP POLICY IF EXISTS baseball_event_attendance_delete_coach ON public.baseball_event_attendance;
CREATE POLICY baseball_event_attendance_delete_coach ON public.baseball_event_attendance AS PERMISSIVE FOR DELETE TO authenticated
  USING ((event_id IN ( SELECT baseball_events.id
   FROM baseball_events
  WHERE is_baseball_team_coach(baseball_events.team_id))));
DROP POLICY IF EXISTS baseball_event_attendance_insert ON public.baseball_event_attendance;
CREATE POLICY baseball_event_attendance_insert ON public.baseball_event_attendance AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((event_id IN ( SELECT be.id
   FROM baseball_events be
  WHERE is_baseball_team_coach(be.team_id))) OR (player_id = get_my_player_id())));
DROP POLICY IF EXISTS baseball_event_attendance_select_coach ON public.baseball_event_attendance;
CREATE POLICY baseball_event_attendance_select_coach ON public.baseball_event_attendance AS PERMISSIVE FOR SELECT TO authenticated
  USING ((event_id IN ( SELECT baseball_events.id
   FROM baseball_events
  WHERE is_baseball_team_coach(baseball_events.team_id))));
DROP POLICY IF EXISTS baseball_event_attendance_select_player ON public.baseball_event_attendance;
CREATE POLICY baseball_event_attendance_select_player ON public.baseball_event_attendance AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS baseball_event_attendance_update_coach ON public.baseball_event_attendance;
CREATE POLICY baseball_event_attendance_update_coach ON public.baseball_event_attendance AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((event_id IN ( SELECT baseball_events.id
   FROM baseball_events
  WHERE is_baseball_team_coach(baseball_events.team_id))));
DROP POLICY IF EXISTS baseball_event_attendance_update_player ON public.baseball_event_attendance;
CREATE POLICY baseball_event_attendance_update_player ON public.baseball_event_attendance AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((player_id IN ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));

-- ----- baseball_events -----
DROP POLICY IF EXISTS baseball_events_delete_coach ON public.baseball_events;
CREATE POLICY baseball_events_delete_coach ON public.baseball_events AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_events_insert_coach ON public.baseball_events;
CREATE POLICY baseball_events_insert_coach ON public.baseball_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_events_select ON public.baseball_events;
CREATE POLICY baseball_events_select ON public.baseball_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_baseball_team_coach(team_id) OR is_baseball_team_player(team_id)));
DROP POLICY IF EXISTS baseball_events_update_coach ON public.baseball_events;
CREATE POLICY baseball_events_update_coach ON public.baseball_events AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- ----- baseball_games -----
DROP POLICY IF EXISTS "Coaches can delete games" ON public.baseball_games;
CREATE POLICY "Coaches can delete games" ON public.baseball_games AS PERMISSIVE FOR DELETE TO public
  USING (is_baseball_team_coach_v2(team_id));
DROP POLICY IF EXISTS "Coaches can insert games" ON public.baseball_games;
CREATE POLICY "Coaches can insert games" ON public.baseball_games AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_baseball_team_coach_v2(team_id));
DROP POLICY IF EXISTS "Team members and coaches can view games" ON public.baseball_games;
CREATE POLICY "Team members and coaches can view games" ON public.baseball_games AS PERMISSIVE FOR SELECT TO public
  USING ((is_baseball_team_member_v2(team_id) OR is_baseball_team_coach_v2(team_id)));
DROP POLICY IF EXISTS "Coaches can update games" ON public.baseball_games;
CREATE POLICY "Coaches can update games" ON public.baseball_games AS PERMISSIVE FOR UPDATE TO public
  USING (is_baseball_team_coach_v2(team_id));

-- ----- baseball_lineup_positions -----
DROP POLICY IF EXISTS "Coaches can manage lineup positions" ON public.baseball_lineup_positions;
CREATE POLICY "Coaches can manage lineup positions" ON public.baseball_lineup_positions AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((baseball_team_lineups l
     JOIN baseball_team_coach_staff tcs ON ((tcs.team_id = l.team_id)))
     JOIN baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((l.id = baseball_lineup_positions.lineup_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Players can view lineup positions" ON public.baseball_lineup_positions;
CREATE POLICY "Players can view lineup positions" ON public.baseball_lineup_positions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((baseball_team_lineups l
     JOIN baseball_team_members tm ON ((tm.team_id = l.team_id)))
     JOIN baseball_players p ON ((p.id = tm.player_id)))
  WHERE ((l.id = baseball_lineup_positions.lineup_id) AND (p.user_id = auth.uid())))));

-- ----- baseball_messages -----
DROP POLICY IF EXISTS "Users can send baseball messages" ON public.baseball_messages;
CREATE POLICY "Users can send baseball messages" ON public.baseball_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM baseball_conversation_participants cp
  WHERE ((cp.conversation_id = cp.conversation_id) AND (cp.user_id = auth.uid()))))));
DROP POLICY IF EXISTS baseball_messages_insert ON public.baseball_messages;
CREATE POLICY baseball_messages_insert ON public.baseball_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_messages.conversation_id) AND (baseball_conversation_participants.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Users can view baseball messages" ON public.baseball_messages;
CREATE POLICY "Users can view baseball messages" ON public.baseball_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_conversation_participants cp
  WHERE ((cp.conversation_id = cp.conversation_id) AND (cp.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_messages_select ON public.baseball_messages;
CREATE POLICY baseball_messages_select ON public.baseball_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_messages.conversation_id) AND (baseball_conversation_participants.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can update baseball message read status" ON public.baseball_messages;
CREATE POLICY "Users can update baseball message read status" ON public.baseball_messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_conversation_participants cp
  WHERE ((cp.conversation_id = cp.conversation_id) AND (cp.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_messages_update ON public.baseball_messages;
CREATE POLICY baseball_messages_update ON public.baseball_messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_conversation_participants
  WHERE ((baseball_conversation_participants.conversation_id = baseball_messages.conversation_id) AND (baseball_conversation_participants.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_messages_update_read ON public.baseball_messages;
CREATE POLICY baseball_messages_update_read ON public.baseball_messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((conversation_id IN ( SELECT baseball_conversation_participants.conversation_id
   FROM baseball_conversation_participants
  WHERE (baseball_conversation_participants.user_id = auth.uid()))))
  WITH CHECK ((conversation_id IN ( SELECT baseball_conversation_participants.conversation_id
   FROM baseball_conversation_participants
  WHERE (baseball_conversation_participants.user_id = auth.uid()))));

-- ----- baseball_notifications -----
DROP POLICY IF EXISTS baseball_notifications_insert ON public.baseball_notifications;
CREATE POLICY baseball_notifications_insert ON public.baseball_notifications AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);
DROP POLICY IF EXISTS baseball_notifications_select ON public.baseball_notifications;
CREATE POLICY baseball_notifications_select ON public.baseball_notifications AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS baseball_notifications_update ON public.baseball_notifications;
CREATE POLICY baseball_notifications_update ON public.baseball_notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

-- ----- baseball_player_aggregates -----
DROP POLICY IF EXISTS baseball_aggregates_insert ON public.baseball_player_aggregates;
CREATE POLICY baseball_aggregates_insert ON public.baseball_player_aggregates AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)));
DROP POLICY IF EXISTS baseball_aggregates_select ON public.baseball_player_aggregates;
CREATE POLICY baseball_aggregates_select ON public.baseball_player_aggregates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_player_aggregates.player_id) AND (baseball_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id))));
DROP POLICY IF EXISTS baseball_aggregates_update ON public.baseball_player_aggregates;
CREATE POLICY baseball_aggregates_update ON public.baseball_player_aggregates AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)));

-- ----- baseball_player_classes -----
DROP POLICY IF EXISTS baseball_player_classes_delete ON public.baseball_player_classes;
CREATE POLICY baseball_player_classes_delete ON public.baseball_player_classes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((player_id IN ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS baseball_player_classes_insert ON public.baseball_player_classes;
CREATE POLICY baseball_player_classes_insert ON public.baseball_player_classes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((player_id = get_my_player_id()) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)) OR (EXISTS ( SELECT 1
   FROM baseball_team_members btm
  WHERE ((btm.player_id = baseball_player_classes.player_id) AND is_baseball_team_coach(btm.team_id))))));
DROP POLICY IF EXISTS baseball_player_classes_select_coach ON public.baseball_player_classes;
CREATE POLICY baseball_player_classes_select_coach ON public.baseball_player_classes AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_team_members btm
  WHERE ((btm.player_id = baseball_player_classes.player_id) AND is_baseball_team_coach(btm.team_id)))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id))));
DROP POLICY IF EXISTS baseball_player_classes_select_player ON public.baseball_player_classes;
CREATE POLICY baseball_player_classes_select_player ON public.baseball_player_classes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS baseball_player_classes_update ON public.baseball_player_classes;
CREATE POLICY baseball_player_classes_update ON public.baseball_player_classes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((player_id IN ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid()))));

-- ----- baseball_player_comparisons -----
DROP POLICY IF EXISTS baseball_comparisons_delete_own ON public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_delete_own ON public.baseball_player_comparisons AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_comparisons_insert_own ON public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_insert_own ON public.baseball_player_comparisons AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_comparisons_select_own ON public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_select_own ON public.baseball_player_comparisons AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_comparisons_update_own ON public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_update_own ON public.baseball_player_comparisons AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- baseball_player_engagement_events -----
DROP POLICY IF EXISTS baseball_engagement_insert ON public.baseball_player_engagement_events;
CREATE POLICY baseball_engagement_insert ON public.baseball_player_engagement_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_engagement_events.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_engagement_select ON public.baseball_player_engagement_events;
CREATE POLICY baseball_engagement_select ON public.baseball_player_engagement_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_player_engagement_events.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_engagement_events.coach_id) AND (baseball_coaches.user_id = auth.uid()))))));

-- ----- baseball_player_percentiles -----
DROP POLICY IF EXISTS "System can manage percentiles" ON public.baseball_player_percentiles;
CREATE POLICY "System can manage percentiles" ON public.baseball_player_percentiles AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Anyone can view percentiles" ON public.baseball_player_percentiles;
CREATE POLICY "Anyone can view percentiles" ON public.baseball_player_percentiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- baseball_player_season_stats -----
DROP POLICY IF EXISTS "Coaches can manage season stats" ON public.baseball_player_season_stats;
CREATE POLICY "Coaches can manage season stats" ON public.baseball_player_season_stats AS PERMISSIVE FOR ALL TO public
  USING (is_baseball_team_coach_v2(team_id))
  WITH CHECK (is_baseball_team_coach_v2(team_id));
DROP POLICY IF EXISTS "Players see own + coaches see team season stats" ON public.baseball_player_season_stats;
CREATE POLICY "Players see own + coaches see team season stats" ON public.baseball_player_season_stats AS PERMISSIVE FOR SELECT TO public
  USING (((player_id = ( SELECT baseball_players.id
   FROM baseball_players
  WHERE (baseball_players.user_id = auth.uid())
 LIMIT 1)) OR is_baseball_team_coach_v2(team_id)));

-- ----- baseball_player_settings -----
DROP POLICY IF EXISTS baseball_player_settings_insert ON public.baseball_player_settings;
CREATE POLICY baseball_player_settings_insert ON public.baseball_player_settings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_player_settings_select ON public.baseball_player_settings;
CREATE POLICY baseball_player_settings_select ON public.baseball_player_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_player_settings_update ON public.baseball_player_settings;
CREATE POLICY baseball_player_settings_update ON public.baseball_player_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ----- baseball_player_stats -----
DROP POLICY IF EXISTS "Coaches can manage player stats" ON public.baseball_player_stats;
CREATE POLICY "Coaches can manage player stats" ON public.baseball_player_stats AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (baseball_team_coach_staff tcs
     JOIN baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = baseball_player_stats.team_id)))));
DROP POLICY IF EXISTS "Players can view their own stats" ON public.baseball_player_stats;
CREATE POLICY "Players can view their own stats" ON public.baseball_player_stats AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = baseball_player_stats.player_id)))));

-- ----- baseball_players -----
DROP POLICY IF EXISTS baseball_players_insert_own ON public.baseball_players;
CREATE POLICY baseball_players_insert_own ON public.baseball_players AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS baseball_players_select ON public.baseball_players;
CREATE POLICY baseball_players_select ON public.baseball_players AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS baseball_players_update_own ON public.baseball_players;
CREATE POLICY baseball_players_update_own ON public.baseball_players AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));

-- ----- baseball_recruiting_interests -----
DROP POLICY IF EXISTS baseball_recruiting_interests_delete_own ON public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_delete_own ON public.baseball_recruiting_interests AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_recruiting_interests_insert_own ON public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_insert_own ON public.baseball_recruiting_interests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_recruiting_interests_select_own ON public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_select_own ON public.baseball_recruiting_interests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_recruiting_interests_update_own ON public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_update_own ON public.baseball_recruiting_interests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ----- baseball_stat_uploads -----
DROP POLICY IF EXISTS baseball_stat_uploads_insert ON public.baseball_stat_uploads;
CREATE POLICY baseball_stat_uploads_insert ON public.baseball_stat_uploads AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_stat_uploads.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_stat_uploads_select ON public.baseball_stat_uploads;
CREATE POLICY baseball_stat_uploads_select ON public.baseball_stat_uploads AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_stat_uploads.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- baseball_task_assignments -----
DROP POLICY IF EXISTS baseball_task_assignments_delete ON public.baseball_task_assignments;
CREATE POLICY baseball_task_assignments_delete ON public.baseball_task_assignments AS PERMISSIVE FOR DELETE TO authenticated
  USING ((task_id IN ( SELECT baseball_tasks.id
   FROM baseball_tasks
  WHERE is_baseball_team_coach(baseball_tasks.team_id))));
DROP POLICY IF EXISTS baseball_task_assignments_insert ON public.baseball_task_assignments;
CREATE POLICY baseball_task_assignments_insert ON public.baseball_task_assignments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((task_id IN ( SELECT baseball_tasks.id
   FROM baseball_tasks
  WHERE is_baseball_team_coach(baseball_tasks.team_id))));
DROP POLICY IF EXISTS baseball_task_assignments_select_coach ON public.baseball_task_assignments;
CREATE POLICY baseball_task_assignments_select_coach ON public.baseball_task_assignments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((task_id IN ( SELECT baseball_tasks.id
   FROM baseball_tasks
  WHERE is_baseball_team_coach(baseball_tasks.team_id))));
DROP POLICY IF EXISTS baseball_task_assignments_select_player ON public.baseball_task_assignments;
CREATE POLICY baseball_task_assignments_select_player ON public.baseball_task_assignments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id = get_my_player_id()));
DROP POLICY IF EXISTS baseball_task_assignments_update_coach ON public.baseball_task_assignments;
CREATE POLICY baseball_task_assignments_update_coach ON public.baseball_task_assignments AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((task_id IN ( SELECT baseball_tasks.id
   FROM baseball_tasks
  WHERE is_baseball_team_coach(baseball_tasks.team_id))));
DROP POLICY IF EXISTS baseball_task_assignments_update_player ON public.baseball_task_assignments;
CREATE POLICY baseball_task_assignments_update_player ON public.baseball_task_assignments AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((player_id = get_my_player_id()))
  WITH CHECK ((player_id = get_my_player_id()));

-- ----- baseball_task_templates -----
DROP POLICY IF EXISTS baseball_task_templates_delete ON public.baseball_task_templates;
CREATE POLICY baseball_task_templates_delete ON public.baseball_task_templates AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_task_templates_insert ON public.baseball_task_templates;
CREATE POLICY baseball_task_templates_insert ON public.baseball_task_templates AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_task_templates_select ON public.baseball_task_templates;
CREATE POLICY baseball_task_templates_select ON public.baseball_task_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_task_templates_update ON public.baseball_task_templates;
CREATE POLICY baseball_task_templates_update ON public.baseball_task_templates AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- ----- baseball_tasks -----
DROP POLICY IF EXISTS baseball_tasks_delete ON public.baseball_tasks;
CREATE POLICY baseball_tasks_delete ON public.baseball_tasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_tasks_insert ON public.baseball_tasks;
CREATE POLICY baseball_tasks_insert ON public.baseball_tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_tasks_select_coach ON public.baseball_tasks;
CREATE POLICY baseball_tasks_select_coach ON public.baseball_tasks AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_tasks_select_player ON public.baseball_tasks;
CREATE POLICY baseball_tasks_select_player ON public.baseball_tasks AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_baseball_team_player(team_id));
DROP POLICY IF EXISTS baseball_tasks_update ON public.baseball_tasks;
CREATE POLICY baseball_tasks_update ON public.baseball_tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- ----- baseball_team_coach_staff -----
DROP POLICY IF EXISTS baseball_team_coach_staff_delete ON public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_delete ON public.baseball_team_coach_staff AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_primary_coach(team_id));
DROP POLICY IF EXISTS baseball_team_coach_staff_insert ON public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_insert ON public.baseball_team_coach_staff AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_baseball_primary_coach(team_id));
DROP POLICY IF EXISTS baseball_team_coach_staff_select ON public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_select ON public.baseball_team_coach_staff AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS baseball_team_coach_staff_update ON public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_update ON public.baseball_team_coach_staff AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_primary_coach(team_id));

-- ----- baseball_team_invitations -----
DROP POLICY IF EXISTS "Coaches can manage their team invitations" ON public.baseball_team_invitations;
CREATE POLICY "Coaches can manage their team invitations" ON public.baseball_team_invitations AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (baseball_team_coach_staff tcs
     JOIN baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = baseball_team_invitations.team_id)))));
DROP POLICY IF EXISTS "Anyone can view active invitations by code" ON public.baseball_team_invitations;
CREATE POLICY "Anyone can view active invitations by code" ON public.baseball_team_invitations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_active = true));

-- ----- baseball_team_lineups -----
DROP POLICY IF EXISTS "Coaches can manage their team lineups" ON public.baseball_team_lineups;
CREATE POLICY "Coaches can manage their team lineups" ON public.baseball_team_lineups AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (baseball_team_coach_staff tcs
     JOIN baseball_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = baseball_team_lineups.team_id)))));
DROP POLICY IF EXISTS "Players can view their team lineups" ON public.baseball_team_lineups;
CREATE POLICY "Players can view their team lineups" ON public.baseball_team_lineups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (baseball_team_members tm
     JOIN baseball_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = baseball_team_lineups.team_id)))));

-- ----- baseball_team_members -----
DROP POLICY IF EXISTS baseball_team_members_delete_coach ON public.baseball_team_members;
CREATE POLICY baseball_team_members_delete_coach ON public.baseball_team_members AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (baseball_team_coach_staff btcs
     JOIN baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_team_members_insert ON public.baseball_team_members;
CREATE POLICY baseball_team_members_insert ON public.baseball_team_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_team_members.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_team_members_select ON public.baseball_team_members;
CREATE POLICY baseball_team_members_select ON public.baseball_team_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (baseball_team_coach_staff btcs
     JOIN baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (baseball_players bp
     JOIN baseball_team_members btm ON ((btm.player_id = bp.id)))
  WHERE ((btm.team_id = baseball_team_members.team_id) AND (bp.user_id = auth.uid()))))));
DROP POLICY IF EXISTS baseball_team_members_update_coach ON public.baseball_team_members;
CREATE POLICY baseball_team_members_update_coach ON public.baseball_team_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (baseball_team_coach_staff btcs
     JOIN baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))));

-- ----- baseball_teams -----
DROP POLICY IF EXISTS baseball_teams_delete ON public.baseball_teams;
CREATE POLICY baseball_teams_delete ON public.baseball_teams AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_primary_coach(id));
DROP POLICY IF EXISTS baseball_teams_insert_coaches ON public.baseball_teams;
CREATE POLICY baseball_teams_insert_coaches ON public.baseball_teams AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE (baseball_coaches.user_id = auth.uid()))));
DROP POLICY IF EXISTS baseball_teams_select ON public.baseball_teams;
CREATE POLICY baseball_teams_select ON public.baseball_teams AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS baseball_teams_update ON public.baseball_teams;
CREATE POLICY baseball_teams_update ON public.baseball_teams AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_primary_coach(id))
  WITH CHECK (is_baseball_primary_coach(id));
DROP POLICY IF EXISTS baseball_teams_update_own_coach ON public.baseball_teams;
CREATE POLICY baseball_teams_update_own_coach ON public.baseball_teams AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (baseball_team_coach_staff btcs
     JOIN baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_teams.id) AND (bc.user_id = auth.uid())))));

-- ----- baseball_travel_expenses -----
DROP POLICY IF EXISTS baseball_travel_exp_delete ON public.baseball_travel_expenses;
CREATE POLICY baseball_travel_exp_delete ON public.baseball_travel_expenses AS PERMISSIVE FOR DELETE TO authenticated
  USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM baseball_travel_itineraries
  WHERE is_baseball_team_coach(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id))));
DROP POLICY IF EXISTS baseball_travel_exp_insert ON public.baseball_travel_expenses;
CREATE POLICY baseball_travel_exp_insert ON public.baseball_travel_expenses AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)) OR (itinerary_id IN ( SELECT bti.id
   FROM baseball_travel_itineraries bti
  WHERE is_baseball_team_coach(bti.team_id)))));
DROP POLICY IF EXISTS baseball_travel_exp_select_coach ON public.baseball_travel_expenses;
CREATE POLICY baseball_travel_exp_select_coach ON public.baseball_travel_expenses AS PERMISSIVE FOR SELECT TO authenticated
  USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM baseball_travel_itineraries
  WHERE is_baseball_team_coach(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id))));
DROP POLICY IF EXISTS baseball_travel_exp_select_player ON public.baseball_travel_expenses;
CREATE POLICY baseball_travel_exp_select_player ON public.baseball_travel_expenses AS PERMISSIVE FOR SELECT TO authenticated
  USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM baseball_travel_itineraries
  WHERE is_baseball_team_player(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND is_baseball_team_player(team_id))));
DROP POLICY IF EXISTS baseball_travel_exp_update ON public.baseball_travel_expenses;
CREATE POLICY baseball_travel_exp_update ON public.baseball_travel_expenses AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((itinerary_id IN ( SELECT baseball_travel_itineraries.id
   FROM baseball_travel_itineraries
  WHERE is_baseball_team_coach(baseball_travel_itineraries.team_id))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id))));

-- ----- baseball_travel_itineraries -----
DROP POLICY IF EXISTS baseball_travel_itin_delete ON public.baseball_travel_itineraries;
CREATE POLICY baseball_travel_itin_delete ON public.baseball_travel_itineraries AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_travel_itin_insert ON public.baseball_travel_itineraries;
CREATE POLICY baseball_travel_itin_insert ON public.baseball_travel_itineraries AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_travel_itin_select_coach ON public.baseball_travel_itineraries;
CREATE POLICY baseball_travel_itin_select_coach ON public.baseball_travel_itineraries AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));
DROP POLICY IF EXISTS baseball_travel_itin_select_player ON public.baseball_travel_itineraries;
CREATE POLICY baseball_travel_itin_select_player ON public.baseball_travel_itineraries AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_baseball_team_player(team_id));
DROP POLICY IF EXISTS baseball_travel_itin_update ON public.baseball_travel_itineraries;
CREATE POLICY baseball_travel_itin_update ON public.baseball_travel_itineraries AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- ----- baseball_videos -----
DROP POLICY IF EXISTS baseball_videos_delete_own ON public.baseball_videos;
CREATE POLICY baseball_videos_delete_own ON public.baseball_videos AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_videos_insert_own ON public.baseball_videos;
CREATE POLICY baseball_videos_insert_own ON public.baseball_videos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_videos_select ON public.baseball_videos;
CREATE POLICY baseball_videos_select ON public.baseball_videos AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND is_baseball_team_coach(team_id)) OR ((team_id IS NOT NULL) AND is_baseball_team_player(team_id)) OR (EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.recruiting_activated = true) AND (baseball_players.player_type = ANY (ARRAY['high_school'::baseball_player_type, 'showcase'::baseball_player_type, 'juco'::baseball_player_type])))))));
DROP POLICY IF EXISTS baseball_videos_update_own ON public.baseball_videos;
CREATE POLICY baseball_videos_update_own ON public.baseball_videos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ----- baseball_watchlists -----
DROP POLICY IF EXISTS baseball_watchlists_delete_own ON public.baseball_watchlists;
CREATE POLICY baseball_watchlists_delete_own ON public.baseball_watchlists AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_watchlists_insert_own ON public.baseball_watchlists;
CREATE POLICY baseball_watchlists_insert_own ON public.baseball_watchlists AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_watchlists_select_own ON public.baseball_watchlists;
CREATE POLICY baseball_watchlists_select_own ON public.baseball_watchlists AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS baseball_watchlists_update_own ON public.baseball_watchlists;
CREATE POLICY baseball_watchlists_update_own ON public.baseball_watchlists AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ----- crm_activity_log -----
DROP POLICY IF EXISTS "Admins can insert activity log" ON public.crm_activity_log;
CREATE POLICY "Admins can insert activity log" ON public.crm_activity_log AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can view activity log" ON public.crm_activity_log;
CREATE POLICY "Admins can view activity log" ON public.crm_activity_log AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- crm_coaches -----
DROP POLICY IF EXISTS "Admins can delete coaches" ON public.crm_coaches;
CREATE POLICY "Admins can delete coaches" ON public.crm_coaches AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can insert coaches" ON public.crm_coaches;
CREATE POLICY "Admins can insert coaches" ON public.crm_coaches AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can view all coaches" ON public.crm_coaches;
CREATE POLICY "Admins can view all coaches" ON public.crm_coaches AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can update coaches" ON public.crm_coaches;
CREATE POLICY "Admins can update coaches" ON public.crm_coaches AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- crm_contact_log -----
DROP POLICY IF EXISTS "Admins can delete contact logs" ON public.crm_contact_log;
CREATE POLICY "Admins can delete contact logs" ON public.crm_contact_log AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can insert contact logs" ON public.crm_contact_log;
CREATE POLICY "Admins can insert contact logs" ON public.crm_contact_log AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can view all contact logs" ON public.crm_contact_log;
CREATE POLICY "Admins can view all contact logs" ON public.crm_contact_log AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can update contact logs" ON public.crm_contact_log;
CREATE POLICY "Admins can update contact logs" ON public.crm_contact_log AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- crm_email_templates -----
DROP POLICY IF EXISTS "Admins can manage templates" ON public.crm_email_templates;
CREATE POLICY "Admins can manage templates" ON public.crm_email_templates AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- crm_events -----
DROP POLICY IF EXISTS "Admins can delete CRM events" ON public.crm_events;
CREATE POLICY "Admins can delete CRM events" ON public.crm_events AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can insert CRM events" ON public.crm_events;
CREATE POLICY "Admins can insert CRM events" ON public.crm_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can view all CRM events" ON public.crm_events;
CREATE POLICY "Admins can view all CRM events" ON public.crm_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "Admins can update CRM events" ON public.crm_events;
CREATE POLICY "Admins can update CRM events" ON public.crm_events AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- crm_google_calendar_tokens -----
DROP POLICY IF EXISTS "Admins can delete own calendar tokens" ON public.crm_google_calendar_tokens;
CREATE POLICY "Admins can delete own calendar tokens" ON public.crm_google_calendar_tokens AS PERMISSIVE FOR DELETE TO public
  USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role))))));
DROP POLICY IF EXISTS "Admins can insert own calendar tokens" ON public.crm_google_calendar_tokens;
CREATE POLICY "Admins can insert own calendar tokens" ON public.crm_google_calendar_tokens AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role))))));
DROP POLICY IF EXISTS "Admins can view own calendar tokens" ON public.crm_google_calendar_tokens;
CREATE POLICY "Admins can view own calendar tokens" ON public.crm_google_calendar_tokens AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role))))));
DROP POLICY IF EXISTS "Admins can update own calendar tokens" ON public.crm_google_calendar_tokens;
CREATE POLICY "Admins can update own calendar tokens" ON public.crm_google_calendar_tokens AS PERMISSIVE FOR UPDATE TO public
  USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role))))));

-- ----- demo_requests -----
DROP POLICY IF EXISTS "Service role can manage demo requests" ON public.demo_requests;
CREATE POLICY "Service role can manage demo requests" ON public.demo_requests AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Anyone can create demo requests" ON public.demo_requests;
CREATE POLICY "Anyone can create demo requests" ON public.demo_requests AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ----- device_tokens -----
DROP POLICY IF EXISTS "Service role full access" ON public.device_tokens;
CREATE POLICY "Service role full access" ON public.device_tokens AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Users can delete own tokens" ON public.device_tokens;
CREATE POLICY "Users can delete own tokens" ON public.device_tokens AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own tokens" ON public.device_tokens;
CREATE POLICY "Users can insert own tokens" ON public.device_tokens AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own tokens" ON public.device_tokens;
CREATE POLICY "Users can view own tokens" ON public.device_tokens AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update own tokens" ON public.device_tokens;
CREATE POLICY "Users can update own tokens" ON public.device_tokens AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

-- ----- email_clicks -----
DROP POLICY IF EXISTS "No direct deletes by users" ON public.email_clicks;
CREATE POLICY "No direct deletes by users" ON public.email_clicks AS PERMISSIVE FOR DELETE TO public
  USING (false);
DROP POLICY IF EXISTS "No direct inserts by users" ON public.email_clicks;
CREATE POLICY "No direct inserts by users" ON public.email_clicks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (false);
DROP POLICY IF EXISTS "Admins can view email clicks" ON public.email_clicks;
CREATE POLICY "Admins can view email clicks" ON public.email_clicks AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "No direct updates by users" ON public.email_clicks;
CREATE POLICY "No direct updates by users" ON public.email_clicks AS PERMISSIVE FOR UPDATE TO public
  USING (false);

-- ----- email_events -----
DROP POLICY IF EXISTS "Admins can view email events" ON public.email_events;
CREATE POLICY "Admins can view email events" ON public.email_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));

-- ----- emails -----
DROP POLICY IF EXISTS "No direct deletes by users" ON public.emails;
CREATE POLICY "No direct deletes by users" ON public.emails AS PERMISSIVE FOR DELETE TO public
  USING (false);
DROP POLICY IF EXISTS "No direct inserts by users" ON public.emails;
CREATE POLICY "No direct inserts by users" ON public.emails AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (false);
DROP POLICY IF EXISTS "Admins can view emails" ON public.emails;
CREATE POLICY "Admins can view emails" ON public.emails AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))));
DROP POLICY IF EXISTS "No direct updates by users" ON public.emails;
CREATE POLICY "No direct updates by users" ON public.emails AS PERMISSIVE FOR UPDATE TO public
  USING (false);

-- ----- error_logs -----
DROP POLICY IF EXISTS "Service role can manage error logs" ON public.error_logs;
CREATE POLICY "Service role can manage error logs" ON public.error_logs AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Anyone can create error logs" ON public.error_logs;
CREATE POLICY "Anyone can create error logs" ON public.error_logs AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can read error logs" ON public.error_logs;
CREATE POLICY "Admins can read error logs" ON public.error_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- error_rate_hourly -----
DROP POLICY IF EXISTS error_rate_hourly_service_write ON public.error_rate_hourly;
CREATE POLICY error_rate_hourly_service_write ON public.error_rate_hourly AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS error_rate_hourly_admin_read ON public.error_rate_hourly;
CREATE POLICY error_rate_hourly_admin_read ON public.error_rate_hourly AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_academic_exclusions -----
DROP POLICY IF EXISTS "Coaches can manage exclusions" ON public.golf_academic_exclusions;
CREATE POLICY "Coaches can manage exclusions" ON public.golf_academic_exclusions AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((golf_team_members tm
     JOIN golf_team_coach_staff tcs ON ((tcs.team_id = tm.team_id)))
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((tm.player_id = golf_academic_exclusions.player_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Players can view their own exclusions" ON public.golf_academic_exclusions;
CREATE POLICY "Players can view their own exclusions" ON public.golf_academic_exclusions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_academic_exclusions.player_id)))));

-- ----- golf_announcement_acknowledgements -----
DROP POLICY IF EXISTS golf_acks_insert_own ON public.golf_announcement_acknowledgements;
CREATE POLICY golf_acks_insert_own ON public.golf_announcement_acknowledgements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS golf_acks_select_coaches ON public.golf_announcement_acknowledgements;
CREATE POLICY golf_acks_select_coaches ON public.golf_announcement_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS golf_acks_select_own ON public.golf_announcement_acknowledgements;
CREATE POLICY golf_acks_select_own ON public.golf_announcement_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ----- golf_announcement_documents -----
DROP POLICY IF EXISTS golf_ann_documents_delete_coaches ON public.golf_announcement_documents;
CREATE POLICY golf_ann_documents_delete_coaches ON public.golf_announcement_documents AS PERMISSIVE FOR DELETE TO authenticated
  USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS golf_ann_documents_insert_coaches ON public.golf_announcement_documents;
CREATE POLICY golf_ann_documents_insert_coaches ON public.golf_announcement_documents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS ann_documents_select_team ON public.golf_announcement_documents;
CREATE POLICY ann_documents_select_team ON public.golf_announcement_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT a.id
   FROM golf_announcements a
  WHERE (is_golf_team_coach(a.team_id) OR is_golf_team_player(a.team_id)))));

-- ----- golf_announcement_recipients -----
DROP POLICY IF EXISTS golf_ann_recipients_delete_coaches ON public.golf_announcement_recipients;
CREATE POLICY golf_ann_recipients_delete_coaches ON public.golf_announcement_recipients AS PERMISSIVE FOR DELETE TO authenticated
  USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS golf_ann_recipients_insert_coaches ON public.golf_announcement_recipients;
CREATE POLICY golf_ann_recipients_insert_coaches ON public.golf_announcement_recipients AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS golf_ann_recipients_select_coaches ON public.golf_announcement_recipients;
CREATE POLICY golf_ann_recipients_select_coaches ON public.golf_announcement_recipients AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS golf_ann_recipients_select_own ON public.golf_announcement_recipients;
CREATE POLICY golf_ann_recipients_select_own ON public.golf_announcement_recipients AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ----- golf_announcement_tasks -----
DROP POLICY IF EXISTS golf_ann_tasks_delete_coaches ON public.golf_announcement_tasks;
CREATE POLICY golf_ann_tasks_delete_coaches ON public.golf_announcement_tasks AS PERMISSIVE FOR DELETE TO authenticated
  USING ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS golf_ann_tasks_insert_coaches ON public.golf_announcement_tasks;
CREATE POLICY golf_ann_tasks_insert_coaches ON public.golf_announcement_tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((announcement_id IN ( SELECT golf_announcements.id
   FROM golf_announcements
  WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
           FROM golf_coaches
          WHERE (golf_coaches.user_id = auth.uid()))))));
DROP POLICY IF EXISTS ann_tasks_select_team ON public.golf_announcement_tasks;
CREATE POLICY ann_tasks_select_team ON public.golf_announcement_tasks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((announcement_id IN ( SELECT a.id
   FROM golf_announcements a
  WHERE (is_golf_team_coach(a.team_id) OR is_golf_team_player(a.team_id)))));

-- ----- golf_announcements -----
DROP POLICY IF EXISTS "Coaches can manage announcements" ON public.golf_announcements;
CREATE POLICY "Coaches can manage announcements" ON public.golf_announcements AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_announcements.team_id)))));
DROP POLICY IF EXISTS "Team members can view announcements" ON public.golf_announcements;
CREATE POLICY "Team members can view announcements" ON public.golf_announcements AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_announcements.team_id)))) OR (EXISTS ( SELECT 1
   FROM (golf_team_members tm
     JOIN golf_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = golf_announcements.team_id))))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_announcements;
CREATE POLICY admin_read_all ON public.golf_announcements AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_attendance_summary -----
DROP POLICY IF EXISTS "Coaches can view team attendance" ON public.golf_attendance_summary;
CREATE POLICY "Coaches can view team attendance" ON public.golf_attendance_summary AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_attendance_summary.team_id)))));
DROP POLICY IF EXISTS "Players can view their own attendance" ON public.golf_attendance_summary;
CREATE POLICY "Players can view their own attendance" ON public.golf_attendance_summary AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_attendance_summary.player_id)))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_attendance_summary;
CREATE POLICY admin_read_all ON public.golf_attendance_summary AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_calendar_feeds -----
DROP POLICY IF EXISTS "Users can manage their own feeds" ON public.golf_calendar_feeds;
CREATE POLICY "Users can manage their own feeds" ON public.golf_calendar_feeds AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()));

-- ----- golf_calendar_notifications -----
DROP POLICY IF EXISTS golf_calendar_notifications_insert_own ON public.golf_calendar_notifications;
CREATE POLICY golf_calendar_notifications_insert_own ON public.golf_calendar_notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (user_id IN ( SELECT gp.user_id
   FROM (((golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::team_member_status))))));
DROP POLICY IF EXISTS golf_calendar_notifications_insert_policy ON public.golf_calendar_notifications;
CREATE POLICY golf_calendar_notifications_insert_policy ON public.golf_calendar_notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (((golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
     JOIN golf_team_members gtm ON ((gtm.team_id = gt.id)))
     JOIN golf_players gp ON ((gp.id = gtm.player_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gp.user_id = golf_calendar_notifications.user_id) AND (gtm.status = 'active'::team_member_status))))));
DROP POLICY IF EXISTS "Users can view their golf calendar notifications" ON public.golf_calendar_notifications;
CREATE POLICY "Users can view their golf calendar notifications" ON public.golf_calendar_notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their golf notifications" ON public.golf_calendar_notifications;
CREATE POLICY "Users can update their golf notifications" ON public.golf_calendar_notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));

-- ----- golf_causal_relationships -----
DROP POLICY IF EXISTS golf_causal_relationships_service_role_all ON public.golf_causal_relationships;
CREATE POLICY golf_causal_relationships_service_role_all ON public.golf_causal_relationships AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS golf_causal_relationships_select_coach ON public.golf_causal_relationships;
CREATE POLICY golf_causal_relationships_select_coach ON public.golf_causal_relationships AS PERMISSIVE FOR SELECT TO public
  USING ((player_id IN ( SELECT gp.id
   FROM (((golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS golf_causal_relationships_select_player ON public.golf_causal_relationships;
CREATE POLICY golf_causal_relationships_select_player ON public.golf_causal_relationships AS PERMISSIVE FOR SELECT TO public
  USING ((player_id IN ( SELECT gp.id
   FROM golf_players gp
  WHERE (gp.user_id = auth.uid()))));

-- ----- golf_coach_behavior_log -----
DROP POLICY IF EXISTS coach_behavior_insert_service ON public.golf_coach_behavior_log;
CREATE POLICY coach_behavior_insert_service ON public.golf_coach_behavior_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS coach_behavior_admin_read ON public.golf_coach_behavior_log;
CREATE POLICY coach_behavior_admin_read ON public.golf_coach_behavior_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS coach_behavior_select_own ON public.golf_coach_behavior_log;
CREATE POLICY coach_behavior_select_own ON public.golf_coach_behavior_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches c
  WHERE ((c.id = golf_coach_behavior_log.coach_id) AND (c.user_id = auth.uid())))));

-- ----- golf_coach_blocked_time -----
DROP POLICY IF EXISTS "Coaches can manage their own blocked time" ON public.golf_coach_blocked_time;
CREATE POLICY "Coaches can manage their own blocked time" ON public.golf_coach_blocked_time AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = golf_coach_blocked_time.coach_id)))));

-- ----- golf_coach_insights -----
DROP POLICY IF EXISTS "Coaches can manage their insights" ON public.golf_coach_insights;
CREATE POLICY "Coaches can manage their insights" ON public.golf_coach_insights AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = golf_coach_insights.coach_id)))) OR (EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_coach_insights.team_id))))));
DROP POLICY IF EXISTS "Coaches can view their own insights" ON public.golf_coach_insights;
CREATE POLICY "Coaches can view their own insights" ON public.golf_coach_insights AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM golf_coaches c
  WHERE ((c.user_id = auth.uid()) AND (c.id = golf_coach_insights.coach_id)))) OR (EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_coach_insights.team_id))))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_coach_insights;
CREATE POLICY admin_read_all ON public.golf_coach_insights AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS coach_insights_select_player_own ON public.golf_coach_insights;
CREATE POLICY coach_insights_select_player_own ON public.golf_coach_insights AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS coach_insights_update_player_own ON public.golf_coach_insights;
CREATE POLICY coach_insights_update_player_own ON public.golf_coach_insights AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))))
  WITH CHECK ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ----- golf_coach_philosophy -----
DROP POLICY IF EXISTS golf_coach_philosophy_delete_coach ON public.golf_coach_philosophy;
CREATE POLICY golf_coach_philosophy_delete_coach ON public.golf_coach_philosophy AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coach_philosophy_insert_coach ON public.golf_coach_philosophy;
CREATE POLICY golf_coach_philosophy_insert_coach ON public.golf_coach_philosophy AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_coach_philosophy;
CREATE POLICY admin_read_all ON public.golf_coach_philosophy AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_coach_philosophy_select_coach ON public.golf_coach_philosophy;
CREATE POLICY golf_coach_philosophy_select_coach ON public.golf_coach_philosophy AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coach_philosophy_update_coach ON public.golf_coach_philosophy;
CREATE POLICY golf_coach_philosophy_update_coach ON public.golf_coach_philosophy AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coach_philosophy.coach_id) AND (gc.user_id = auth.uid())))));

-- ----- golf_coaches -----
DROP POLICY IF EXISTS golf_coaches_delete_own ON public.golf_coaches;
CREATE POLICY golf_coaches_delete_own ON public.golf_coaches AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS golf_coaches_insert_own ON public.golf_coaches;
CREATE POLICY golf_coaches_insert_own ON public.golf_coaches AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS golf_coaches_select_all ON public.golf_coaches;
CREATE POLICY golf_coaches_select_all ON public.golf_coaches AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS golf_coaches_update_own ON public.golf_coaches;
CREATE POLICY golf_coaches_update_own ON public.golf_coaches AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));

-- ----- golf_coachhelm_settings -----
DROP POLICY IF EXISTS golf_coachhelm_settings_delete_coach ON public.golf_coachhelm_settings;
CREATE POLICY golf_coachhelm_settings_delete_coach ON public.golf_coachhelm_settings AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coachhelm_settings_insert_coach ON public.golf_coachhelm_settings;
CREATE POLICY golf_coachhelm_settings_insert_coach ON public.golf_coachhelm_settings AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coachhelm_settings_select_coach ON public.golf_coachhelm_settings;
CREATE POLICY golf_coachhelm_settings_select_coach ON public.golf_coachhelm_settings AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_coachhelm_settings_update_coach ON public.golf_coachhelm_settings;
CREATE POLICY golf_coachhelm_settings_update_coach ON public.golf_coachhelm_settings AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches gc
  WHERE ((gc.id = golf_coachhelm_settings.coach_id) AND (gc.user_id = auth.uid())))));

-- ----- golf_confidence_calibration -----
DROP POLICY IF EXISTS golf_confidence_calibration_service_role_all ON public.golf_confidence_calibration;
CREATE POLICY golf_confidence_calibration_service_role_all ON public.golf_confidence_calibration AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS golf_confidence_calibration_admin_read_all ON public.golf_confidence_calibration;
CREATE POLICY golf_confidence_calibration_admin_read_all ON public.golf_confidence_calibration AS PERMISSIVE FOR SELECT TO public
  USING (is_admin());

-- ----- golf_conversation_participants -----
DROP POLICY IF EXISTS golf_participants_delete ON public.golf_conversation_participants;
CREATE POLICY golf_participants_delete ON public.golf_conversation_participants AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS golf_participants_insert_v2 ON public.golf_conversation_participants;
CREATE POLICY golf_participants_insert_v2 ON public.golf_conversation_participants AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM golf_conversations gc
  WHERE ((gc.id = golf_conversation_participants.conversation_id) AND (gc.created_by = auth.uid()))))));
DROP POLICY IF EXISTS golf_participants_select_v2 ON public.golf_conversation_participants;
CREATE POLICY golf_participants_select_v2 ON public.golf_conversation_participants AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR (conversation_id IN ( SELECT user_conversation_ids(auth.uid()) AS user_conversation_ids))));
DROP POLICY IF EXISTS golf_participants_update ON public.golf_conversation_participants;
CREATE POLICY golf_participants_update ON public.golf_conversation_participants AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

-- ----- golf_conversations -----
DROP POLICY IF EXISTS golf_conversations_insert_v2 ON public.golf_conversations;
CREATE POLICY golf_conversations_insert_v2 ON public.golf_conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((team_id IS NULL) OR is_golf_team_coach(team_id) OR is_golf_team_player(team_id)));
DROP POLICY IF EXISTS golf_conversations_select_v2 ON public.golf_conversations;
CREATE POLICY golf_conversations_select_v2 ON public.golf_conversations AS PERMISSIVE FOR SELECT TO public
  USING (((id IN ( SELECT user_conversation_ids(auth.uid()) AS user_conversation_ids)) OR (((is_team_chat = true) OR (is_team_channel = true)) AND is_golf_team_coach(team_id)) OR (((is_team_chat = true) OR (is_team_channel = true)) AND is_golf_team_player(team_id))));
DROP POLICY IF EXISTS golf_conversations_update_v2 ON public.golf_conversations;
CREATE POLICY golf_conversations_update_v2 ON public.golf_conversations AS PERMISSIVE FOR UPDATE TO public
  USING ((id IN ( SELECT user_conversation_ids(auth.uid()) AS user_conversation_ids)))
  WITH CHECK ((id IN ( SELECT user_conversation_ids(auth.uid()) AS user_conversation_ids)));

-- ----- golf_course_holes -----
DROP POLICY IF EXISTS "Coaches can manage course holes" ON public.golf_course_holes;
CREATE POLICY "Coaches can manage course holes" ON public.golf_course_holes AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches c
  WHERE (c.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Anyone can view course holes" ON public.golf_course_holes;
CREATE POLICY "Anyone can view course holes" ON public.golf_course_holes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- golf_courses -----
DROP POLICY IF EXISTS golf_courses_insert_authenticated ON public.golf_courses;
CREATE POLICY golf_courses_insert_authenticated ON public.golf_courses AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS golf_courses_select_all ON public.golf_courses;
CREATE POLICY golf_courses_select_all ON public.golf_courses AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- golf_document_versions -----
DROP POLICY IF EXISTS "Coaches can delete document versions" ON public.golf_document_versions;
CREATE POLICY "Coaches can delete document versions" ON public.golf_document_versions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((golf_documents d
     JOIN golf_teams t ON ((d.team_id = t.id)))
     JOIN golf_coaches c ON ((t.organization_id = c.organization_id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Coaches can insert document versions" ON public.golf_document_versions;
CREATE POLICY "Coaches can insert document versions" ON public.golf_document_versions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((golf_documents d
     JOIN golf_teams t ON ((d.team_id = t.id)))
     JOIN golf_coaches c ON ((t.organization_id = c.organization_id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Coaches can view document versions" ON public.golf_document_versions;
CREATE POLICY "Coaches can view document versions" ON public.golf_document_versions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((golf_documents d
     JOIN golf_teams t ON ((d.team_id = t.id)))
     JOIN golf_coaches c ON ((t.organization_id = c.organization_id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Players can view document versions for visible docs" ON public.golf_document_versions;
CREATE POLICY "Players can view document versions for visible docs" ON public.golf_document_versions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((golf_documents d
     JOIN golf_team_members tm ON ((d.team_id = tm.team_id)))
     JOIN golf_players p ON ((tm.player_id = p.id)))
  WHERE ((d.id = golf_document_versions.document_id) AND (d.is_public = true) AND (p.user_id = auth.uid())))));

-- ----- golf_documents -----
DROP POLICY IF EXISTS golf_documents_delete_coach ON public.golf_documents;
CREATE POLICY golf_documents_delete_coach ON public.golf_documents AS PERMISSIVE FOR DELETE TO public
  USING (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS golf_documents_insert_coach ON public.golf_documents;
CREATE POLICY golf_documents_insert_coach ON public.golf_documents AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS admin_read_all ON public.golf_documents;
CREATE POLICY admin_read_all ON public.golf_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_documents_select_team ON public.golf_documents;
CREATE POLICY golf_documents_select_team ON public.golf_documents AS PERMISSIVE FOR SELECT TO public
  USING ((is_golf_team_coach(team_id) OR is_golf_team_player(team_id)));
DROP POLICY IF EXISTS golf_documents_update_coach ON public.golf_documents;
CREATE POLICY golf_documents_update_coach ON public.golf_documents AS PERMISSIVE FOR UPDATE TO public
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));

-- ----- golf_drills -----
DROP POLICY IF EXISTS drills_read_all_authenticated ON public.golf_drills;
CREATE POLICY drills_read_all_authenticated ON public.golf_drills AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- golf_event_attendance -----
DROP POLICY IF EXISTS golf_event_attendance_delete_coach ON public.golf_event_attendance;
CREATE POLICY golf_event_attendance_delete_coach ON public.golf_event_attendance AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND is_golf_team_coach(e.team_id)))));
DROP POLICY IF EXISTS golf_event_attendance_insert_coach ON public.golf_event_attendance;
CREATE POLICY golf_event_attendance_insert_coach ON public.golf_event_attendance AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND is_golf_team_coach(e.team_id)))));
DROP POLICY IF EXISTS golf_event_attendance_select_team ON public.golf_event_attendance;
CREATE POLICY golf_event_attendance_select_team ON public.golf_event_attendance AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND (is_golf_team_coach(e.team_id) OR is_golf_team_player(e.team_id))))));
DROP POLICY IF EXISTS golf_event_attendance_update_coach_or_player ON public.golf_event_attendance;
CREATE POLICY golf_event_attendance_update_coach_or_player ON public.golf_event_attendance AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_events e
  WHERE ((e.id = golf_event_attendance.event_id) AND (is_golf_team_coach(e.team_id) OR (is_golf_team_player(e.team_id) AND (golf_event_attendance.player_id IN ( SELECT gp.id
           FROM golf_players gp
          WHERE (gp.user_id = auth.uid())))))))));

-- ----- golf_events -----
DROP POLICY IF EXISTS golf_events_delete_coach ON public.golf_events;
CREATE POLICY golf_events_delete_coach ON public.golf_events AS PERMISSIVE FOR DELETE TO public
  USING (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS golf_events_insert_coach ON public.golf_events;
CREATE POLICY golf_events_insert_coach ON public.golf_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS admin_read_all ON public.golf_events;
CREATE POLICY admin_read_all ON public.golf_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_events_select_team ON public.golf_events;
CREATE POLICY golf_events_select_team ON public.golf_events AS PERMISSIVE FOR SELECT TO public
  USING ((is_golf_team_coach(team_id) OR is_golf_team_player(team_id)));
DROP POLICY IF EXISTS golf_events_update_coach ON public.golf_events;
CREATE POLICY golf_events_update_coach ON public.golf_events AS PERMISSIVE FOR UPDATE TO public
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));

-- ----- golf_global_patterns -----
DROP POLICY IF EXISTS global_patterns_write_service ON public.golf_global_patterns;
CREATE POLICY global_patterns_write_service ON public.golf_global_patterns AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS global_patterns_select_authed ON public.golf_global_patterns;
CREATE POLICY global_patterns_select_authed ON public.golf_global_patterns AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- golf_holes -----
DROP POLICY IF EXISTS golf_holes_delete ON public.golf_holes;
CREATE POLICY golf_holes_delete ON public.golf_holes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_holes.round_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_holes_delete_coach ON public.golf_holes;
CREATE POLICY golf_holes_delete_coach ON public.golf_holes AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND (gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
DROP POLICY IF EXISTS golf_holes_insert ON public.golf_holes;
CREATE POLICY golf_holes_insert ON public.golf_holes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_holes.round_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_holes_insert_coach ON public.golf_holes;
CREATE POLICY golf_holes_insert_coach ON public.golf_holes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND (gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
DROP POLICY IF EXISTS golf_holes_select ON public.golf_holes;
CREATE POLICY golf_holes_select ON public.golf_holes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND ((EXISTS ( SELECT 1
           FROM golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = auth.uid())))) OR ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND is_golf_team_player(gr.team_id)))))));
DROP POLICY IF EXISTS golf_holes_select_team ON public.golf_holes;
CREATE POLICY golf_holes_select_team ON public.golf_holes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((round_id IN ( SELECT gr.id
   FROM golf_rounds gr
  WHERE ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
DROP POLICY IF EXISTS golf_holes_update ON public.golf_holes;
CREATE POLICY golf_holes_update ON public.golf_holes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_holes.round_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_holes_update_coach ON public.golf_holes;
CREATE POLICY golf_holes_update_coach ON public.golf_holes AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND (gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
DROP POLICY IF EXISTS golf_holes_update_team ON public.golf_holes;
CREATE POLICY golf_holes_update_team ON public.golf_holes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((round_id IN ( SELECT gr.id
   FROM (((golf_rounds gr
     JOIN golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::team_member_status)))))
  WITH CHECK ((round_id IN ( SELECT gr.id
   FROM (((golf_rounds gr
     JOIN golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::team_member_status)))));

-- ----- golf_insight_drill_attachments -----
DROP POLICY IF EXISTS drill_attachments_read_via_insight ON public.golf_insight_drill_attachments;
CREATE POLICY drill_attachments_read_via_insight ON public.golf_insight_drill_attachments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_coach_insights gci
  WHERE (gci.id = golf_insight_drill_attachments.insight_id))));

-- ----- golf_insight_effectiveness -----
DROP POLICY IF EXISTS effectiveness_insert_service ON public.golf_insight_effectiveness;
CREATE POLICY effectiveness_insert_service ON public.golf_insight_effectiveness AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS effectiveness_select_admin ON public.golf_insight_effectiveness;
CREATE POLICY effectiveness_select_admin ON public.golf_insight_effectiveness AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS effectiveness_select_team_coach ON public.golf_insight_effectiveness;
CREATE POLICY effectiveness_select_team_coach ON public.golf_insight_effectiveness AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_golf_team_coach(team_id));

-- ----- golf_insight_feedback_scores -----
DROP POLICY IF EXISTS "Coaches can view feedback scores" ON public.golf_insight_feedback_scores;
CREATE POLICY "Coaches can view feedback scores" ON public.golf_insight_feedback_scores AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))))));

-- ----- golf_insight_generation_log -----
DROP POLICY IF EXISTS "Coaches can insert generation logs" ON public.golf_insight_generation_log;
CREATE POLICY "Coaches can insert generation logs" ON public.golf_insight_generation_log AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_insight_generation_log.team_id)))));
DROP POLICY IF EXISTS "Coaches can view their team logs" ON public.golf_insight_generation_log;
CREATE POLICY "Coaches can view their team logs" ON public.golf_insight_generation_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_insight_generation_log.team_id)))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_insight_generation_log;
CREATE POLICY admin_read_all ON public.golf_insight_generation_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_insight_player_feedback -----
DROP POLICY IF EXISTS ipf_player_insert_own ON public.golf_insight_player_feedback;
CREATE POLICY ipf_player_insert_own ON public.golf_insight_player_feedback AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS ipf_coach_select_team ON public.golf_insight_player_feedback;
CREATE POLICY ipf_coach_select_team ON public.golf_insight_player_feedback AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_insight_player_feedback.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS ipf_player_select_own ON public.golf_insight_player_feedback;
CREATE POLICY ipf_player_select_own ON public.golf_insight_player_feedback AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS ipf_player_update_own ON public.golf_insight_player_feedback;
CREATE POLICY ipf_player_update_own ON public.golf_insight_player_feedback AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_insight_player_feedback.player_id) AND (gp.user_id = auth.uid())))));

-- ----- golf_learned_behavior -----
DROP POLICY IF EXISTS "Service role can manage learned behavior" ON public.golf_learned_behavior;
CREATE POLICY "Service role can manage learned behavior" ON public.golf_learned_behavior AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Coaches can view their own learned behavior" ON public.golf_learned_behavior;
CREATE POLICY "Coaches can view their own learned behavior" ON public.golf_learned_behavior AS PERMISSIVE FOR SELECT TO public
  USING (((entity_type = 'coach'::text) AND (entity_id IN ( SELECT golf_coaches.id
   FROM golf_coaches
  WHERE (golf_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Players can view their own learned behavior" ON public.golf_learned_behavior;
CREATE POLICY "Players can view their own learned behavior" ON public.golf_learned_behavior AS PERMISSIVE FOR SELECT TO public
  USING (((entity_type = 'player'::text) AND (entity_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid())))));

-- ----- golf_message_attachments -----
DROP POLICY IF EXISTS "Users can delete their own attachments" ON public.golf_message_attachments;
CREATE POLICY "Users can delete their own attachments" ON public.golf_message_attachments AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_messages m
  WHERE ((m.id = golf_message_attachments.message_id) AND (m.sender_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can add attachments to their own messages" ON public.golf_message_attachments;
CREATE POLICY "Users can add attachments to their own messages" ON public.golf_message_attachments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_messages m
  WHERE ((m.id = golf_message_attachments.message_id) AND (m.sender_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can view attachments in their conversations" ON public.golf_message_attachments;
CREATE POLICY "Users can view attachments in their conversations" ON public.golf_message_attachments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_messages m
     JOIN golf_conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = golf_message_attachments.message_id) AND (cp.user_id = auth.uid())))));

-- ----- golf_messages -----
DROP POLICY IF EXISTS golf_messages_delete ON public.golf_messages;
CREATE POLICY golf_messages_delete ON public.golf_messages AS PERMISSIVE FOR DELETE TO authenticated
  USING ((sender_id = auth.uid()));
DROP POLICY IF EXISTS golf_messages_insert_v2 ON public.golf_messages;
CREATE POLICY golf_messages_insert_v2 ON public.golf_messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((sender_id = auth.uid()) AND (conversation_id IN ( SELECT user_conversation_ids(auth.uid()) AS user_conversation_ids))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_messages;
CREATE POLICY admin_read_all ON public.golf_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_messages_select_v2 ON public.golf_messages;
CREATE POLICY golf_messages_select_v2 ON public.golf_messages AS PERMISSIVE FOR SELECT TO public
  USING ((conversation_id IN ( SELECT user_conversation_ids(auth.uid()) AS user_conversation_ids)));
DROP POLICY IF EXISTS golf_messages_update_v2 ON public.golf_messages;
CREATE POLICY golf_messages_update_v2 ON public.golf_messages AS PERMISSIVE FOR UPDATE TO public
  USING ((conversation_id IN ( SELECT user_conversation_ids(auth.uid()) AS user_conversation_ids)));

-- ----- golf_patterns_v2 -----
DROP POLICY IF EXISTS "Service role can insert patterns" ON public.golf_patterns_v2;
CREATE POLICY "Service role can insert patterns" ON public.golf_patterns_v2 AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS patterns_v2_insert_coach ON public.golf_patterns_v2;
CREATE POLICY patterns_v2_insert_coach ON public.golf_patterns_v2 AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((player_id IN ( SELECT gp.id
   FROM (((golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Coaches can view patterns for their team players" ON public.golf_patterns_v2;
CREATE POLICY "Coaches can view patterns for their team players" ON public.golf_patterns_v2 AS PERMISSIVE FOR SELECT TO public
  USING ((player_id IN ( SELECT gp.id
   FROM (((golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Players can view their own patterns" ON public.golf_patterns_v2;
CREATE POLICY "Players can view their own patterns" ON public.golf_patterns_v2 AS PERMISSIVE FOR SELECT TO public
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_patterns_v2;
CREATE POLICY admin_read_all ON public.golf_patterns_v2 AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS "Service role can update patterns" ON public.golf_patterns_v2;
CREATE POLICY "Service role can update patterns" ON public.golf_patterns_v2 AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS patterns_v2_update_coach ON public.golf_patterns_v2;
CREATE POLICY patterns_v2_update_coach ON public.golf_patterns_v2 AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((player_id IN ( SELECT gp.id
   FROM (((golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));

-- ----- golf_percentile_cache -----
DROP POLICY IF EXISTS percentile_write_service ON public.golf_percentile_cache;
CREATE POLICY percentile_write_service ON public.golf_percentile_cache AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS percentile_select_coach ON public.golf_percentile_cache;
CREATE POLICY percentile_select_coach ON public.golf_percentile_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_percentile_cache.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS percentile_select_player ON public.golf_percentile_cache;
CREATE POLICY percentile_select_player ON public.golf_percentile_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_percentile_cache.player_id) AND (gp.user_id = auth.uid())))));

-- ----- golf_platform_metrics_daily -----
DROP POLICY IF EXISTS golf_platform_metrics_daily_service_write ON public.golf_platform_metrics_daily;
CREATE POLICY golf_platform_metrics_daily_service_write ON public.golf_platform_metrics_daily AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS golf_platform_metrics_daily_admin_read ON public.golf_platform_metrics_daily;
CREATE POLICY golf_platform_metrics_daily_admin_read ON public.golf_platform_metrics_daily AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_player_attendance_stats -----
DROP POLICY IF EXISTS "Coaches can view golf attendance stats" ON public.golf_player_attendance_stats;
CREATE POLICY "Coaches can view golf attendance stats" ON public.golf_player_attendance_stats AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_coaches gc
     JOIN golf_teams gt ON ((gt.id = golf_player_attendance_stats.team_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gc.organization_id = gt.organization_id)))));
DROP POLICY IF EXISTS "Players can view their own attendance stats" ON public.golf_player_attendance_stats;
CREATE POLICY "Players can view their own attendance stats" ON public.golf_player_attendance_stats AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = golf_player_attendance_stats.player_id)))));

-- ----- golf_player_baselines -----
DROP POLICY IF EXISTS baselines_write_service ON public.golf_player_baselines;
CREATE POLICY baselines_write_service ON public.golf_player_baselines AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS baselines_select_coach ON public.golf_player_baselines;
CREATE POLICY baselines_select_coach ON public.golf_player_baselines AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_baselines.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS baselines_select_player ON public.golf_player_baselines;
CREATE POLICY baselines_select_player ON public.golf_player_baselines AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_player_baselines.player_id) AND (gp.user_id = auth.uid())))));

-- ----- golf_player_classes -----
DROP POLICY IF EXISTS golf_player_classes_delete_player ON public.golf_player_classes;
CREATE POLICY golf_player_classes_delete_player ON public.golf_player_classes AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_player_classes_insert_player ON public.golf_player_classes;
CREATE POLICY golf_player_classes_insert_player ON public.golf_player_classes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_classes_select_coaches ON public.golf_player_classes;
CREATE POLICY golf_classes_select_coaches ON public.golf_player_classes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS golf_player_classes_select_team ON public.golf_player_classes;
CREATE POLICY golf_player_classes_select_team ON public.golf_player_classes AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_classes.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id))))));
DROP POLICY IF EXISTS golf_player_classes_update_player ON public.golf_player_classes;
CREATE POLICY golf_player_classes_update_player ON public.golf_player_classes AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_player_classes.player_id) AND (gp.user_id = auth.uid())))));

-- ----- golf_player_courses -----
DROP POLICY IF EXISTS "Players can manage their golf courses" ON public.golf_player_courses;
CREATE POLICY "Players can manage their golf courses" ON public.golf_player_courses AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = golf_player_courses.player_id)))));
DROP POLICY IF EXISTS "Coaches can view team player courses" ON public.golf_player_courses;
CREATE POLICY "Coaches can view team player courses" ON public.golf_player_courses AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((golf_team_members gtm
     JOIN golf_team_coach_staff tcs ON ((tcs.team_id = gtm.team_id)))
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((gtm.player_id = golf_player_courses.player_id) AND (c.user_id = auth.uid())))));

-- ----- golf_player_focus_areas -----
DROP POLICY IF EXISTS golf_player_focus_areas_delete_coach ON public.golf_player_focus_areas;
CREATE POLICY golf_player_focus_areas_delete_coach ON public.golf_player_focus_areas AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS golf_player_focus_areas_insert_coach ON public.golf_player_focus_areas;
CREATE POLICY golf_player_focus_areas_insert_coach ON public.golf_player_focus_areas AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS focus_areas_select_coach ON public.golf_player_focus_areas;
CREATE POLICY focus_areas_select_coach ON public.golf_player_focus_areas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS golf_player_focus_areas_select_team ON public.golf_player_focus_areas;
CREATE POLICY golf_player_focus_areas_select_team ON public.golf_player_focus_areas AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_player_focus_areas.player_id) AND (gp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id))))));
DROP POLICY IF EXISTS golf_player_focus_areas_update_coach ON public.golf_player_focus_areas;
CREATE POLICY golf_player_focus_areas_update_coach ON public.golf_player_focus_areas AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_player_focus_areas.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));

-- ----- golf_player_notification_state -----
DROP POLICY IF EXISTS "Players manage own notification state" ON public.golf_player_notification_state;
CREATE POLICY "Players manage own notification state" ON public.golf_player_notification_state AS PERMISSIVE FOR ALL TO public
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ----- golf_player_stats_cache -----
DROP POLICY IF EXISTS "Coaches can manage team stats cache" ON public.golf_player_stats_cache;
CREATE POLICY "Coaches can manage team stats cache" ON public.golf_player_stats_cache AS PERMISSIVE FOR ALL TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS "Coaches can view team player stats" ON public.golf_player_stats_cache;
CREATE POLICY "Coaches can view team player stats" ON public.golf_player_stats_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS "Players can view own stats" ON public.golf_player_stats_cache;
CREATE POLICY "Players can view own stats" ON public.golf_player_stats_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_player_stats_cache;
CREATE POLICY admin_read_all ON public.golf_player_stats_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_players -----
DROP POLICY IF EXISTS golf_players_insert_own ON public.golf_players;
CREATE POLICY golf_players_insert_own ON public.golf_players AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS admin_read_all ON public.golf_players;
CREATE POLICY admin_read_all ON public.golf_players AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_players_select ON public.golf_players;
CREATE POLICY golf_players_select ON public.golf_players AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR user_is_coach_of_golf_player(id) OR user_has_pending_join_request_to_coach_team(id) OR user_is_teammate_of_golf_player(id)));
DROP POLICY IF EXISTS golf_players_update_own ON public.golf_players;
CREATE POLICY golf_players_update_own ON public.golf_players AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));

-- ----- golf_prediction_model_performance -----
DROP POLICY IF EXISTS golf_prediction_model_performance_select ON public.golf_prediction_model_performance;
CREATE POLICY golf_prediction_model_performance_select ON public.golf_prediction_model_performance AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ----- golf_prediction_validations -----
DROP POLICY IF EXISTS "Admins and coaches can view validations" ON public.golf_prediction_validations;
CREATE POLICY "Admins and coaches can view validations" ON public.golf_prediction_validations AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))))));

-- ----- golf_predictions -----
DROP POLICY IF EXISTS "Service role can manage predictions" ON public.golf_predictions;
CREATE POLICY "Service role can manage predictions" ON public.golf_predictions AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Coaches can view predictions for their team players" ON public.golf_predictions;
CREATE POLICY "Coaches can view predictions for their team players" ON public.golf_predictions AS PERMISSIVE FOR SELECT TO public
  USING ((player_id IN ( SELECT gp.id
   FROM (((golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Players can view their own predictions" ON public.golf_predictions;
CREATE POLICY "Players can view their own predictions" ON public.golf_predictions AS PERMISSIVE FOR SELECT TO public
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_predictions;
CREATE POLICY admin_read_all ON public.golf_predictions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_qualifier_entries -----
DROP POLICY IF EXISTS golf_qualifier_entries_delete_coach ON public.golf_qualifier_entries;
CREATE POLICY golf_qualifier_entries_delete_coach ON public.golf_qualifier_entries AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND is_golf_team_coach(q.team_id)))));
DROP POLICY IF EXISTS golf_qualifier_entries_insert_coach ON public.golf_qualifier_entries;
CREATE POLICY golf_qualifier_entries_insert_coach ON public.golf_qualifier_entries AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND is_golf_team_coach(q.team_id)))));
DROP POLICY IF EXISTS golf_qualifier_entries_select_team ON public.golf_qualifier_entries;
CREATE POLICY golf_qualifier_entries_select_team ON public.golf_qualifier_entries AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND (is_golf_team_coach(q.team_id) OR is_golf_team_player(q.team_id))))));
DROP POLICY IF EXISTS golf_qualifier_entries_update_coach ON public.golf_qualifier_entries;
CREATE POLICY golf_qualifier_entries_update_coach ON public.golf_qualifier_entries AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_qualifiers q
  WHERE ((q.id = golf_qualifier_entries.qualifier_id) AND is_golf_team_coach(q.team_id)))));

-- ----- golf_qualifiers -----
DROP POLICY IF EXISTS golf_qualifiers_delete_coach ON public.golf_qualifiers;
CREATE POLICY golf_qualifiers_delete_coach ON public.golf_qualifiers AS PERMISSIVE FOR DELETE TO public
  USING (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS golf_qualifiers_insert_coach ON public.golf_qualifiers;
CREATE POLICY golf_qualifiers_insert_coach ON public.golf_qualifiers AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS admin_read_all ON public.golf_qualifiers;
CREATE POLICY admin_read_all ON public.golf_qualifiers AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_qualifiers_select_team ON public.golf_qualifiers;
CREATE POLICY golf_qualifiers_select_team ON public.golf_qualifiers AS PERMISSIVE FOR SELECT TO public
  USING ((is_golf_team_coach(team_id) OR is_golf_team_player(team_id)));
DROP POLICY IF EXISTS golf_qualifiers_update_coach ON public.golf_qualifiers;
CREATE POLICY golf_qualifiers_update_coach ON public.golf_qualifiers AS PERMISSIVE FOR UPDATE TO public
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));

-- ----- golf_review_events -----
DROP POLICY IF EXISTS "Users can view relevant review events" ON public.golf_review_events;
CREATE POLICY "Users can view relevant review events" ON public.golf_review_events AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM ((golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
     JOIN golf_team_members gtm ON ((gtm.team_id = gt.id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.player_id = golf_review_events.player_id)))) OR (EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = golf_review_events.player_id))))));

-- ----- golf_review_insights -----
DROP POLICY IF EXISTS "Coaches can view review insights for their team players" ON public.golf_review_insights;
CREATE POLICY "Coaches can view review insights for their team players" ON public.golf_review_insights AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
     JOIN golf_team_members gtm ON ((gtm.team_id = gt.id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.player_id = golf_review_insights.player_id)))));
DROP POLICY IF EXISTS "Players can view their own published review insights" ON public.golf_review_insights;
CREATE POLICY "Players can view their own published review insights" ON public.golf_review_insights AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.user_id = auth.uid()) AND (gp.id = golf_review_insights.player_id)))) AND (is_hidden = false) AND (EXISTS ( SELECT 1
   FROM golf_round_reviews grr
  WHERE ((grr.id = golf_review_insights.review_id) AND (grr.status = 'published'::text))))));
DROP POLICY IF EXISTS "Coaches can update review insights for their team players" ON public.golf_review_insights;
CREATE POLICY "Coaches can update review insights for their team players" ON public.golf_review_insights AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM ((golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
     JOIN golf_team_members gtm ON ((gtm.team_id = gt.id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.player_id = golf_review_insights.player_id)))));

-- ----- golf_round_reviews -----
DROP POLICY IF EXISTS "Players can create their own reviews" ON public.golf_round_reviews;
CREATE POLICY "Players can create their own reviews" ON public.golf_round_reviews AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_round_reviews.player_id)))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_round_reviews;
CREATE POLICY admin_read_all ON public.golf_round_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS round_reviews_select_coach ON public.golf_round_reviews;
CREATE POLICY round_reviews_select_coach ON public.golf_round_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_round_reviews.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS round_reviews_select_player ON public.golf_round_reviews;
CREATE POLICY round_reviews_select_player ON public.golf_round_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_round_reviews.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Players can update their own reviews" ON public.golf_round_reviews;
CREATE POLICY "Players can update their own reviews" ON public.golf_round_reviews AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_round_reviews.player_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players p
  WHERE ((p.user_id = auth.uid()) AND (p.id = golf_round_reviews.player_id)))));
DROP POLICY IF EXISTS round_reviews_write_coach ON public.golf_round_reviews;
CREATE POLICY round_reviews_write_coach ON public.golf_round_reviews AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_round_reviews.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_team_members gtm
  WHERE ((gtm.player_id = golf_round_reviews.player_id) AND (gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));

-- ----- golf_round_stats_cache -----
DROP POLICY IF EXISTS "Coaches can manage round stats cache" ON public.golf_round_stats_cache;
CREATE POLICY "Coaches can manage round stats cache" ON public.golf_round_stats_cache AS PERMISSIVE FOR ALL TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS "Coaches can view team round stats" ON public.golf_round_stats_cache;
CREATE POLICY "Coaches can view team round stats" ON public.golf_round_stats_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM golf_team_members gtm
  WHERE ((gtm.status = 'active'::team_member_status) AND is_golf_team_coach(gtm.team_id)))));
DROP POLICY IF EXISTS "Players can view own round stats" ON public.golf_round_stats_cache;
CREATE POLICY "Players can view own round stats" ON public.golf_round_stats_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING ((player_id IN ( SELECT golf_players.id
   FROM golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ----- golf_rounds -----
DROP POLICY IF EXISTS golf_rounds_delete ON public.golf_rounds;
CREATE POLICY golf_rounds_delete ON public.golf_rounds AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_rounds_delete_coach ON public.golf_rounds;
CREATE POLICY golf_rounds_delete_coach ON public.golf_rounds AS PERMISSIVE FOR DELETE TO public
  USING (((team_id IS NOT NULL) AND is_golf_team_coach(team_id)));
DROP POLICY IF EXISTS golf_rounds_insert ON public.golf_rounds;
CREATE POLICY golf_rounds_insert ON public.golf_rounds AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_rounds_insert_coach ON public.golf_rounds;
CREATE POLICY golf_rounds_insert_coach ON public.golf_rounds AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((team_id IS NOT NULL) AND is_golf_team_coach(team_id)));
DROP POLICY IF EXISTS admin_read_all ON public.golf_rounds;
CREATE POLICY admin_read_all ON public.golf_rounds AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_rounds_select ON public.golf_rounds;
CREATE POLICY golf_rounds_select ON public.golf_rounds AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND is_golf_team_coach(team_id)) OR ((team_id IS NOT NULL) AND is_golf_team_player(team_id))));
DROP POLICY IF EXISTS golf_rounds_select_team ON public.golf_rounds;
CREATE POLICY golf_rounds_select_team ON public.golf_rounds AS PERMISSIVE FOR SELECT TO authenticated
  USING (((team_id IS NOT NULL) AND is_golf_team_coach(team_id)));
DROP POLICY IF EXISTS golf_rounds_update ON public.golf_rounds;
CREATE POLICY golf_rounds_update ON public.golf_rounds AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players
  WHERE ((golf_players.id = golf_rounds.player_id) AND (golf_players.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_rounds_update_coach ON public.golf_rounds;
CREATE POLICY golf_rounds_update_coach ON public.golf_rounds AS PERMISSIVE FOR UPDATE TO public
  USING (((team_id IS NOT NULL) AND is_golf_team_coach(team_id)));
DROP POLICY IF EXISTS golf_rounds_update_team ON public.golf_rounds;
CREATE POLICY golf_rounds_update_team ON public.golf_rounds AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((player_id IN ( SELECT gtm.player_id
   FROM ((golf_team_members gtm
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::team_member_status)))))
  WITH CHECK ((player_id IN ( SELECT gtm.player_id
   FROM ((golf_team_members gtm
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::team_member_status)))));

-- ----- golf_shots -----
DROP POLICY IF EXISTS golf_shots_delete ON public.golf_shots;
CREATE POLICY golf_shots_delete ON public.golf_shots AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_shots.round_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_shots_delete_coach ON public.golf_shots;
CREATE POLICY golf_shots_delete_coach ON public.golf_shots AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND (gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
DROP POLICY IF EXISTS golf_shots_delete_own ON public.golf_shots;
CREATE POLICY golf_shots_delete_own ON public.golf_shots AS PERMISSIVE FOR DELETE TO authenticated
  USING (((hole_id IN ( SELECT gh.id
   FROM ((golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_shots_insert ON public.golf_shots;
CREATE POLICY golf_shots_insert ON public.golf_shots AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_shots.round_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_shots_insert_coach ON public.golf_shots;
CREATE POLICY golf_shots_insert_coach ON public.golf_shots AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND (gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
DROP POLICY IF EXISTS golf_shots_insert_own ON public.golf_shots;
CREATE POLICY golf_shots_insert_own ON public.golf_shots AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((hole_id IN ( SELECT gh.id
   FROM ((golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_shots;
CREATE POLICY admin_read_all ON public.golf_shots AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_shots_select ON public.golf_shots;
CREATE POLICY golf_shots_select ON public.golf_shots AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND ((EXISTS ( SELECT 1
           FROM golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = auth.uid())))) OR ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND is_golf_team_player(gr.team_id)))))));
DROP POLICY IF EXISTS golf_shots_select_own ON public.golf_shots;
CREATE POLICY golf_shots_select_own ON public.golf_shots AS PERMISSIVE FOR SELECT TO authenticated
  USING (((hole_id IN ( SELECT gh.id
   FROM ((golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_shots_select_team ON public.golf_shots;
CREATE POLICY golf_shots_select_team ON public.golf_shots AS PERMISSIVE FOR SELECT TO authenticated
  USING (((hole_id IN ( SELECT gh.id
   FROM (golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
  WHERE ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))) OR (round_id IN ( SELECT gr.id
   FROM golf_rounds gr
  WHERE ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id))))));
DROP POLICY IF EXISTS golf_shots_update ON public.golf_shots;
CREATE POLICY golf_shots_update ON public.golf_shots AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE ((gr.id = golf_shots.round_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_shots_update_coach ON public.golf_shots;
CREATE POLICY golf_shots_update_coach ON public.golf_shots AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND (gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
DROP POLICY IF EXISTS golf_shots_update_own ON public.golf_shots;
CREATE POLICY golf_shots_update_own ON public.golf_shots AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((hole_id IN ( SELECT gh.id
   FROM ((golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))))
  WITH CHECK (((hole_id IN ( SELECT gh.id
   FROM ((golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))) OR (round_id IN ( SELECT gr.id
   FROM (golf_rounds gr
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_shots_update_team ON public.golf_shots;
CREATE POLICY golf_shots_update_team ON public.golf_shots AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((hole_id IN ( SELECT gh.id
   FROM ((((golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::team_member_status)))))
  WITH CHECK ((hole_id IN ( SELECT gh.id
   FROM ((((golf_holes gh
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_team_members gtm ON ((gtm.player_id = gr.player_id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gtm.status = 'active'::team_member_status)))));

-- ----- golf_task_assignments -----
DROP POLICY IF EXISTS golf_task_assignments_coach_all ON public.golf_task_assignments;
CREATE POLICY golf_task_assignments_coach_all ON public.golf_task_assignments AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_tasks t
  WHERE ((t.id = golf_task_assignments.task_id) AND is_golf_team_coach(t.team_id)))));
DROP POLICY IF EXISTS golf_task_assignments_player_insert ON public.golf_task_assignments;
CREATE POLICY golf_task_assignments_player_insert ON public.golf_task_assignments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_task_assignments.player_id) AND (gp.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM (golf_tasks t
     JOIN golf_team_members tm ON ((tm.team_id = t.team_id)))
  WHERE ((t.id = golf_task_assignments.task_id) AND (tm.player_id = golf_task_assignments.player_id) AND (tm.status = 'active'::team_member_status))))));
DROP POLICY IF EXISTS golf_task_assignments_player_select ON public.golf_task_assignments;
CREATE POLICY golf_task_assignments_player_select ON public.golf_task_assignments AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_task_assignments.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_task_assignments_player_update ON public.golf_task_assignments;
CREATE POLICY golf_task_assignments_player_update ON public.golf_task_assignments AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_task_assignments.player_id) AND (gp.user_id = auth.uid())))));

-- ----- golf_task_reminders -----
DROP POLICY IF EXISTS "Service role full access" ON public.golf_task_reminders;
CREATE POLICY "Service role full access" ON public.golf_task_reminders AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Coaches can delete team task reminders" ON public.golf_task_reminders;
CREATE POLICY "Coaches can delete team task reminders" ON public.golf_task_reminders AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM ((golf_tasks t
     JOIN golf_teams tm ON ((tm.id = t.team_id)))
     JOIN golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Coaches can create team task reminders" ON public.golf_task_reminders;
CREATE POLICY "Coaches can create team task reminders" ON public.golf_task_reminders AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((golf_tasks t
     JOIN golf_teams tm ON ((tm.id = t.team_id)))
     JOIN golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Coaches can view team task reminders" ON public.golf_task_reminders;
CREATE POLICY "Coaches can view team task reminders" ON public.golf_task_reminders AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((golf_tasks t
     JOIN golf_teams tm ON ((tm.id = t.team_id)))
     JOIN golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Coaches can update team task reminders" ON public.golf_task_reminders;
CREATE POLICY "Coaches can update team task reminders" ON public.golf_task_reminders AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM ((golf_tasks t
     JOIN golf_teams tm ON ((tm.id = t.team_id)))
     JOIN golf_coaches c ON ((c.organization_id = tm.organization_id)))
  WHERE ((t.id = golf_task_reminders.task_id) AND (c.user_id = auth.uid())))));

-- ----- golf_task_templates -----
DROP POLICY IF EXISTS golf_task_templates_delete_coaches ON public.golf_task_templates;
CREATE POLICY golf_task_templates_delete_coaches ON public.golf_task_templates AS PERMISSIVE FOR DELETE TO authenticated
  USING ((team_id IN ( SELECT gt.id
   FROM (golf_teams gt
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS golf_task_templates_insert_coaches ON public.golf_task_templates;
CREATE POLICY golf_task_templates_insert_coaches ON public.golf_task_templates AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((team_id IN ( SELECT gt.id
   FROM (golf_teams gt
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS golf_task_templates_select_coaches ON public.golf_task_templates;
CREATE POLICY golf_task_templates_select_coaches ON public.golf_task_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING ((team_id IN ( SELECT gt.id
   FROM (golf_teams gt
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS golf_task_templates_select_players ON public.golf_task_templates;
CREATE POLICY golf_task_templates_select_players ON public.golf_task_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING ((team_id IN ( SELECT gtm.team_id
   FROM (golf_team_members gtm
     JOIN golf_players gp ON ((gp.id = gtm.player_id)))
  WHERE (gp.user_id = auth.uid()))));
DROP POLICY IF EXISTS golf_task_templates_update_coaches ON public.golf_task_templates;
CREATE POLICY golf_task_templates_update_coaches ON public.golf_task_templates AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((team_id IN ( SELECT gt.id
   FROM (golf_teams gt
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))))
  WITH CHECK ((team_id IN ( SELECT gt.id
   FROM (golf_teams gt
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));

-- ----- golf_tasks -----
DROP POLICY IF EXISTS golf_tasks_delete_coach ON public.golf_tasks;
CREATE POLICY golf_tasks_delete_coach ON public.golf_tasks AS PERMISSIVE FOR DELETE TO public
  USING (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS golf_tasks_insert_coach ON public.golf_tasks;
CREATE POLICY golf_tasks_insert_coach ON public.golf_tasks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS admin_read_all ON public.golf_tasks;
CREATE POLICY admin_read_all ON public.golf_tasks AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_tasks_select_team ON public.golf_tasks;
CREATE POLICY golf_tasks_select_team ON public.golf_tasks AS PERMISSIVE FOR SELECT TO public
  USING ((is_golf_team_coach(team_id) OR is_golf_team_player(team_id)));
DROP POLICY IF EXISTS golf_tasks_update_coach ON public.golf_tasks;
CREATE POLICY golf_tasks_update_coach ON public.golf_tasks AS PERMISSIVE FOR UPDATE TO public
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));

-- ----- golf_team_coach_staff -----
DROP POLICY IF EXISTS golf_team_coach_staff_delete ON public.golf_team_coach_staff;
CREATE POLICY golf_team_coach_staff_delete ON public.golf_team_coach_staff AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches
  WHERE ((golf_coaches.id = golf_team_coach_staff.coach_id) AND (golf_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_team_coach_staff_insert ON public.golf_team_coach_staff;
CREATE POLICY golf_team_coach_staff_insert ON public.golf_team_coach_staff AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_coaches
  WHERE ((golf_coaches.id = golf_team_coach_staff.coach_id) AND (golf_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_team_coach_staff_select ON public.golf_team_coach_staff;
CREATE POLICY golf_team_coach_staff_select ON public.golf_team_coach_staff AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_golf_team_coach(team_id) OR is_golf_team_player(team_id)));

-- ----- golf_team_coachhelm_settings -----
DROP POLICY IF EXISTS team_chs_settings_write_team ON public.golf_team_coachhelm_settings;
CREATE POLICY team_chs_settings_write_team ON public.golf_team_coachhelm_settings AS PERMISSIVE FOR ALL TO authenticated
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS team_chs_settings_select_team ON public.golf_team_coachhelm_settings;
CREATE POLICY team_chs_settings_select_team ON public.golf_team_coachhelm_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_golf_team_coach(team_id));

-- ----- golf_team_join_requests -----
DROP POLICY IF EXISTS "Players can cancel their pending requests" ON public.golf_team_join_requests;
CREATE POLICY "Players can cancel their pending requests" ON public.golf_team_join_requests AS PERMISSIVE FOR DELETE TO authenticated
  USING (((status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_team_join_requests.player_id) AND (gp.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Players can create their own join requests" ON public.golf_team_join_requests;
CREATE POLICY "Players can create their own join requests" ON public.golf_team_join_requests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_team_join_requests.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Coaches can view team join requests" ON public.golf_team_join_requests;
CREATE POLICY "Coaches can view team join requests" ON public.golf_team_join_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_team_join_requests.team_id)))));
DROP POLICY IF EXISTS "Players can view their own join requests" ON public.golf_team_join_requests;
CREATE POLICY "Players can view their own join requests" ON public.golf_team_join_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_team_join_requests.player_id) AND (gp.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Coaches can review team join requests" ON public.golf_team_join_requests;
CREATE POLICY "Coaches can review team join requests" ON public.golf_team_join_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_team_join_requests.team_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_team_join_requests.team_id)))));

-- ----- golf_team_members -----
DROP POLICY IF EXISTS "Players can leave teams" ON public.golf_team_members;
CREATE POLICY "Players can leave teams" ON public.golf_team_members AS PERMISSIVE FOR DELETE TO authenticated
  USING ((player_id = get_current_golf_player_id()));
DROP POLICY IF EXISTS golf_team_members_delete_coach ON public.golf_team_members;
CREATE POLICY golf_team_members_delete_coach ON public.golf_team_members AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS "Players can join teams" ON public.golf_team_members;
CREATE POLICY "Players can join teams" ON public.golf_team_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM golf_players gp
  WHERE ((gp.id = golf_team_members.player_id) AND (gp.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM golf_teams gt
  WHERE ((gt.id = golf_team_members.team_id) AND (gt.join_code IS NOT NULL))))));
DROP POLICY IF EXISTS golf_team_members_insert_coach ON public.golf_team_members;
CREATE POLICY golf_team_members_insert_coach ON public.golf_team_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_golf_team_coach(team_id));
DROP POLICY IF EXISTS admin_read_all ON public.golf_team_members;
CREATE POLICY admin_read_all ON public.golf_team_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_team_members_select_v5 ON public.golf_team_members;
CREATE POLICY golf_team_members_select_v5 ON public.golf_team_members AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff gtcs
     JOIN golf_coaches gc ON ((gc.id = gtcs.coach_id)))
  WHERE ((gtcs.team_id = golf_team_members.team_id) AND (gc.user_id = auth.uid())))) OR (team_id IN ( SELECT get_current_player_team_ids() AS get_current_player_team_ids))));
DROP POLICY IF EXISTS golf_team_members_update_coach ON public.golf_team_members;
CREATE POLICY golf_team_members_update_coach ON public.golf_team_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_golf_team_coach(team_id));

-- ----- golf_team_settings -----
DROP POLICY IF EXISTS "Coaches can manage settings" ON public.golf_team_settings;
CREATE POLICY "Coaches can manage settings" ON public.golf_team_settings AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_team_settings.team_id)))));
DROP POLICY IF EXISTS "Team members can view settings" ON public.golf_team_settings;
CREATE POLICY "Team members can view settings" ON public.golf_team_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_team_settings.team_id)))) OR (EXISTS ( SELECT 1
   FROM (golf_team_members tm
     JOIN golf_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = golf_team_settings.team_id))))));

-- ----- golf_teams -----
DROP POLICY IF EXISTS golf_teams_delete_coach ON public.golf_teams;
CREATE POLICY golf_teams_delete_coach ON public.golf_teams AS PERMISSIVE FOR DELETE TO public
  USING (is_golf_team_coach(id));
DROP POLICY IF EXISTS golf_teams_delete_creator ON public.golf_teams;
CREATE POLICY golf_teams_delete_creator ON public.golf_teams AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM golf_coaches
  WHERE ((golf_coaches.id = golf_teams.created_by) AND (golf_coaches.user_id = auth.uid())))));
DROP POLICY IF EXISTS golf_teams_insert_coaches ON public.golf_teams;
CREATE POLICY golf_teams_insert_coaches ON public.golf_teams AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM golf_coaches
  WHERE (golf_coaches.user_id = auth.uid()))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_teams;
CREATE POLICY admin_read_all ON public.golf_teams AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS golf_teams_select ON public.golf_teams;
CREATE POLICY golf_teams_select ON public.golf_teams AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_golf_team_coach(id) OR is_golf_team_player(id)));
DROP POLICY IF EXISTS golf_teams_select_by_join_code ON public.golf_teams;
CREATE POLICY golf_teams_select_by_join_code ON public.golf_teams AS PERMISSIVE FOR SELECT TO authenticated
  USING ((join_code IS NOT NULL));
DROP POLICY IF EXISTS golf_teams_update_coach ON public.golf_teams;
CREATE POLICY golf_teams_update_coach ON public.golf_teams AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_golf_team_coach(id));

-- ----- golf_tracer_health_snapshot -----
DROP POLICY IF EXISTS golf_tracer_health_snapshot_service_write ON public.golf_tracer_health_snapshot;
CREATE POLICY golf_tracer_health_snapshot_service_write ON public.golf_tracer_health_snapshot AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS golf_tracer_health_snapshot_admin_read ON public.golf_tracer_health_snapshot;
CREATE POLICY golf_tracer_health_snapshot_admin_read ON public.golf_tracer_health_snapshot AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_travel_budgets -----
DROP POLICY IF EXISTS golf_travel_budgets_coach_all ON public.golf_travel_budgets;
CREATE POLICY golf_travel_budgets_coach_all ON public.golf_travel_budgets AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (golf_travel_itineraries gti
     JOIN golf_coaches gc ON ((EXISTS ( SELECT 1
           FROM golf_teams gt
          WHERE ((gt.organization_id = gc.organization_id) AND (gt.id = gti.team_id))))))
  WHERE ((gc.user_id = auth.uid()) AND (gti.id = golf_travel_budgets.itinerary_id)))));
DROP POLICY IF EXISTS golf_travel_budgets_player_select ON public.golf_travel_budgets;
CREATE POLICY golf_travel_budgets_player_select ON public.golf_travel_budgets AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((golf_travel_itineraries gti
     JOIN golf_team_members gtm ON ((gtm.team_id = gti.team_id)))
     JOIN golf_players gp ON ((gp.id = gtm.player_id)))
  WHERE ((gp.user_id = auth.uid()) AND (gti.id = golf_travel_budgets.itinerary_id)))));

-- ----- golf_travel_expenses -----
DROP POLICY IF EXISTS golf_travel_expenses_coach_all ON public.golf_travel_expenses;
CREATE POLICY golf_travel_expenses_coach_all ON public.golf_travel_expenses AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (golf_coaches gc
     JOIN golf_teams gt ON ((gt.organization_id = gc.organization_id)))
  WHERE ((gc.user_id = auth.uid()) AND (gt.id = golf_travel_expenses.team_id)))));
DROP POLICY IF EXISTS golf_travel_expenses_player_select ON public.golf_travel_expenses;
CREATE POLICY golf_travel_expenses_player_select ON public.golf_travel_expenses AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
  WHERE ((gp.user_id = auth.uid()) AND (gtm.team_id = golf_travel_expenses.team_id)))));

-- ----- golf_travel_itineraries -----
DROP POLICY IF EXISTS "Coaches can manage travel" ON public.golf_travel_itineraries;
CREATE POLICY "Coaches can manage travel" ON public.golf_travel_itineraries AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_travel_itineraries.team_id)))));
DROP POLICY IF EXISTS "Team members can view travel" ON public.golf_travel_itineraries;
CREATE POLICY "Team members can view travel" ON public.golf_travel_itineraries AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (golf_team_coach_staff tcs
     JOIN golf_coaches c ON ((c.id = tcs.coach_id)))
  WHERE ((c.user_id = auth.uid()) AND (tcs.team_id = golf_travel_itineraries.team_id)))) OR (EXISTS ( SELECT 1
   FROM (golf_team_members tm
     JOIN golf_players p ON ((p.id = tm.player_id)))
  WHERE ((p.user_id = auth.uid()) AND (tm.team_id = golf_travel_itineraries.team_id))))));
DROP POLICY IF EXISTS admin_read_all ON public.golf_travel_itineraries;
CREATE POLICY admin_read_all ON public.golf_travel_itineraries AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- golf_validations -----
DROP POLICY IF EXISTS "Service role can manage validations" ON public.golf_validations;
CREATE POLICY "Service role can manage validations" ON public.golf_validations AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Coaches can view validations for their team players" ON public.golf_validations;
CREATE POLICY "Coaches can view validations for their team players" ON public.golf_validations AS PERMISSIVE FOR SELECT TO public
  USING ((player_id IN ( SELECT gp.id
   FROM (((golf_players gp
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));

-- ----- login_attempts -----
DROP POLICY IF EXISTS "Service role can manage login attempts" ON public.login_attempts;
CREATE POLICY "Service role can manage login attempts" ON public.login_attempts AS PERMISSIVE FOR ALL TO service_role
  USING (true);
DROP POLICY IF EXISTS "Admins can read login attempts" ON public.login_attempts;
CREATE POLICY "Admins can read login attempts" ON public.login_attempts AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());

-- ----- notifications -----
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = auth.uid()));

-- ----- organizations -----
DROP POLICY IF EXISTS organizations_delete_own_coach ON public.organizations;
CREATE POLICY organizations_delete_own_coach ON public.organizations AS PERMISSIVE FOR DELETE TO public
  USING (((EXISTS ( SELECT 1
   FROM golf_coaches
  WHERE ((golf_coaches.user_id = auth.uid()) AND (golf_coaches.organization_id = organizations.id)))) OR ((NOT (EXISTS ( SELECT 1
   FROM golf_coaches
  WHERE (golf_coaches.organization_id = organizations.id)))) AND (NOT (EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE (baseball_coaches.organization_id = organizations.id)))) AND (created_at > (now() - '00:05:00'::interval)))));
DROP POLICY IF EXISTS organizations_insert_coaches ON public.organizations;
CREATE POLICY organizations_insert_coaches ON public.organizations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'coach'::user_role)))));
DROP POLICY IF EXISTS organizations_select_all ON public.organizations;
CREATE POLICY organizations_select_all ON public.organizations AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS organizations_update_own ON public.organizations;
CREATE POLICY organizations_update_own ON public.organizations AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM baseball_coaches
  WHERE ((baseball_coaches.user_id = auth.uid()) AND (baseball_coaches.organization_id = organizations.id))
UNION
 SELECT 1
   FROM golf_coaches
  WHERE ((golf_coaches.user_id = auth.uid()) AND (golf_coaches.organization_id = organizations.id)))));

-- ----- push_subscriptions -----
DROP POLICY IF EXISTS "Service role full access on push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role full access on push_subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can create own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can create own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

-- ----- putt_details -----
DROP POLICY IF EXISTS putt_details_delete_own ON public.putt_details;
CREATE POLICY putt_details_delete_own ON public.putt_details AS PERMISSIVE FOR DELETE TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));
DROP POLICY IF EXISTS putt_details_insert_own ON public.putt_details;
CREATE POLICY putt_details_insert_own ON public.putt_details AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));
DROP POLICY IF EXISTS putt_details_select_own ON public.putt_details;
CREATE POLICY putt_details_select_own ON public.putt_details AS PERMISSIVE FOR SELECT TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));
DROP POLICY IF EXISTS putt_details_select_team ON public.putt_details;
CREATE POLICY putt_details_select_team ON public.putt_details AS PERMISSIVE FOR SELECT TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM ((((((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
     JOIN golf_team_members gtm ON ((gtm.player_id = gp.id)))
     JOIN golf_teams gt ON ((gt.id = gtm.team_id)))
     JOIN golf_coaches gc ON ((gc.organization_id = gt.organization_id)))
  WHERE (gc.user_id = auth.uid()))));
DROP POLICY IF EXISTS putt_details_update_own ON public.putt_details;
CREATE POLICY putt_details_update_own ON public.putt_details AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))))
  WITH CHECK ((shot_id IN ( SELECT gs.id
   FROM (((golf_shots gs
     JOIN golf_holes gh ON ((gh.id = gs.hole_id)))
     JOIN golf_rounds gr ON ((gr.id = gh.round_id)))
     JOIN golf_players gp ON ((gp.id = gr.player_id)))
  WHERE (gp.user_id = auth.uid()))));

-- ----- users -----
DROP POLICY IF EXISTS users_insert_own ON public.users;
CREATE POLICY users_insert_own ON public.users AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = id));
DROP POLICY IF EXISTS admin_read_all ON public.users;
CREATE POLICY admin_read_all ON public.users AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

COMMIT;
