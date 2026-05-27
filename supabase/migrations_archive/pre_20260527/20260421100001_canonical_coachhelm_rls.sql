-- 20260421100001_canonical_coachhelm_rls.sql
-- Replaces broken/permissive RLS on engine tables with canonical helper-based policies.
-- Team A — Database Foundation (CoachHelm fix plan, 2026-04-21)
-- Fixes LIVE-3, LIVE-4, LIVE-5, LIVE-6, LIVE-7, LIVE-13, LIVE-26

-- =================================================================
-- golf_insight_effectiveness — was USING (true), now coach-scoped
-- =================================================================
DROP POLICY IF EXISTS "golf_insight_effectiveness_select" ON public.golf_insight_effectiveness;
DROP POLICY IF EXISTS "Anyone can view insight effectiveness" ON public.golf_insight_effectiveness;
CREATE POLICY "effectiveness_select_team_coach" ON public.golf_insight_effectiveness
  FOR SELECT TO authenticated
  USING (is_golf_team_coach(team_id));
CREATE POLICY "effectiveness_select_admin" ON public.golf_insight_effectiveness
  FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "effectiveness_insert_service" ON public.golf_insight_effectiveness
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_coach_behavior_log — was WITH CHECK (true) + broken SELECT
-- =================================================================
DROP POLICY IF EXISTS "Coaches can view own behavior" ON public.golf_coach_behavior_log;
DROP POLICY IF EXISTS "System can insert behavior" ON public.golf_coach_behavior_log;
CREATE POLICY "coach_behavior_select_own" ON public.golf_coach_behavior_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_coaches c
            WHERE c.id = golf_coach_behavior_log.coach_id AND c.user_id = auth.uid())
  );
CREATE POLICY "coach_behavior_insert_service" ON public.golf_coach_behavior_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "coach_behavior_admin_read" ON public.golf_coach_behavior_log
  FOR SELECT TO authenticated USING (is_admin());

-- =================================================================
-- golf_player_baselines — fix player SELECT (auth.uid() != player_id)
-- =================================================================
DROP POLICY IF EXISTS "Coaches and players can view baselines" ON public.golf_player_baselines;
CREATE POLICY "baselines_select_player" ON public.golf_player_baselines
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_player_baselines.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "baselines_select_coach" ON public.golf_player_baselines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_player_baselines.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );
CREATE POLICY "baselines_write_service" ON public.golf_player_baselines
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_percentile_cache — same fix as baselines
-- =================================================================
DROP POLICY IF EXISTS "Coaches and players can view percentiles" ON public.golf_percentile_cache;
CREATE POLICY "percentile_select_player" ON public.golf_percentile_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_percentile_cache.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "percentile_select_coach" ON public.golf_percentile_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_percentile_cache.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );
CREATE POLICY "percentile_write_service" ON public.golf_percentile_cache
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_team_coachhelm_settings — was org-wide, now team-scoped
-- =================================================================
DROP POLICY IF EXISTS "Coaches can update team coachhelm settings" ON public.golf_team_coachhelm_settings;
DROP POLICY IF EXISTS "Coaches can view team coachhelm settings" ON public.golf_team_coachhelm_settings;
CREATE POLICY "team_chs_settings_select_team" ON public.golf_team_coachhelm_settings
  FOR SELECT TO authenticated
  USING (is_golf_team_coach(team_id));
CREATE POLICY "team_chs_settings_write_team" ON public.golf_team_coachhelm_settings
  FOR ALL TO authenticated
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));

-- =================================================================
-- golf_global_patterns — service role write, all auth read (no PII)
-- =================================================================
CREATE POLICY "global_patterns_select_authed" ON public.golf_global_patterns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "global_patterns_write_service" ON public.golf_global_patterns
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_insight_player_feedback (NEW)
-- =================================================================
CREATE POLICY "ipf_player_select_own" ON public.golf_insight_player_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_insight_player_feedback.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "ipf_player_insert_own" ON public.golf_insight_player_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_insight_player_feedback.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "ipf_coach_select_team" ON public.golf_insight_player_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_insight_player_feedback.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );

-- =================================================================
-- Add policies to LIVE-26 tables that have RLS but no policies
-- =================================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'api_call_logs','auth_metrics_hourly','background_job_logs',
    'error_rate_hourly','golf_platform_metrics_daily','golf_tracer_health_snapshot'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_admin())',
                   t || '_admin_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
                   t || '_service_write', t);
  END LOOP;
END$$;

-- =================================================================
-- Drop the malformed announcement policies (LIVE-13)
-- =================================================================
DROP POLICY IF EXISTS "golf_ann_documents_select_team" ON public.golf_announcement_documents;
DROP POLICY IF EXISTS "golf_ann_tasks_select_team" ON public.golf_announcement_tasks;
CREATE POLICY "ann_documents_select_team" ON public.golf_announcement_documents
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT a.id FROM public.golf_announcements a
      WHERE is_golf_team_coach(a.team_id) OR is_golf_team_player(a.team_id)
    )
  );
CREATE POLICY "ann_tasks_select_team" ON public.golf_announcement_tasks
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT a.id FROM public.golf_announcements a
      WHERE is_golf_team_coach(a.team_id) OR is_golf_team_player(a.team_id)
    )
  );
