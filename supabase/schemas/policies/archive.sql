CREATE POLICY "Admins can insert activity log" ON "graveyard"."crm_activity_log" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view activity log" ON "graveyard"."crm_activity_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Coaches can view golf attendance stats" ON "graveyard"."golf_player_attendance_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_coaches" "gc"
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "golf_player_attendance_stats"."team_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gc"."organization_id" = "gt"."organization_id")))));

CREATE POLICY "Coaches can view validations for their team players" ON "graveyard"."golf_validations" FOR SELECT USING (("player_id" IN ( SELECT "gp"."id"
   FROM ((("public"."golf_players" "gp"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gp"."id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "Players can view their own attendance stats" ON "graveyard"."golf_player_attendance_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gp"."id" = "golf_player_attendance_stats"."player_id")))));

CREATE POLICY "Service role can manage validations" ON "graveyard"."golf_validations" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "bas_delete" ON "graveyard"."baseball_availability_statuses" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "bas_insert" ON "graveyard"."baseball_availability_statuses" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "bas_select" ON "graveyard"."baseball_availability_statuses" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR ("public"."has_baseball_staff_capability"("team_id", 'can_view_readiness'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id"))));

CREATE POLICY "bas_update" ON "graveyard"."baseball_availability_statuses" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "baseball_import_field_mappings_delete" ON "graveyard"."baseball_import_field_mappings" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_import_field_mappings_insert" ON "graveyard"."baseball_import_field_mappings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_import_field_mappings_select" ON "graveyard"."baseball_import_field_mappings" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_import_field_mappings_update" ON "graveyard"."baseball_import_field_mappings" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_lift_assignments_delete" ON "graveyard"."baseball_lift_assignments" FOR DELETE TO "authenticated" USING ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "baseball_lift_assignments_insert" ON "graveyard"."baseball_lift_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "baseball_lift_assignments_select" ON "graveyard"."baseball_lift_assignments" FOR SELECT TO "authenticated" USING (((("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"())) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "baseball_lift_assignments_update" ON "graveyard"."baseball_lift_assignments" FOR UPDATE TO "authenticated" USING ("public"."can_manage_baseball_lift_group"("team_id", "player_id")) WITH CHECK ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "baseball_lift_results_delete" ON "graveyard"."baseball_lift_results" FOR DELETE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "baseball_lift_results_insert" ON "graveyard"."baseball_lift_results" FOR INSERT TO "authenticated" WITH CHECK (((("player_id" = "public"."get_my_baseball_player_id"()) AND "public"."is_baseball_team_member"("team_id")) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "baseball_lift_results_select" ON "graveyard"."baseball_lift_results" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "baseball_lift_results_update" ON "graveyard"."baseball_lift_results" FOR UPDATE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id"))) WITH CHECK ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "baseball_readiness_checkins_delete" ON "graveyard"."baseball_readiness_checkins" FOR DELETE TO "authenticated" USING (("player_id" = "public"."get_my_baseball_player_id"()));

CREATE POLICY "baseball_readiness_checkins_insert" ON "graveyard"."baseball_readiness_checkins" FOR INSERT TO "authenticated" WITH CHECK ((("player_id" = "public"."get_my_baseball_player_id"()) AND "public"."is_baseball_team_member"("team_id")));

CREATE POLICY "baseball_readiness_checkins_select" ON "graveyard"."baseball_readiness_checkins" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR ("public"."has_baseball_staff_capability"("team_id", 'can_view_readiness'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id"))));

CREATE POLICY "baseball_readiness_checkins_update" ON "graveyard"."baseball_readiness_checkins" FOR UPDATE TO "authenticated" USING (("player_id" = "public"."get_my_baseball_player_id"())) WITH CHECK (("player_id" = "public"."get_my_baseball_player_id"()));

CREATE POLICY "baseball_stat_facts_delete" ON "graveyard"."baseball_stat_facts" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_facts_insert" ON "graveyard"."baseball_stat_facts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_facts_select" ON "graveyard"."baseball_stat_facts" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_facts_update" ON "graveyard"."baseball_stat_facts" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_strength_group_audit_insert" ON "graveyard"."baseball_strength_group_audit" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_strength_group_audit_select" ON "graveyard"."baseball_strength_group_audit" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baselines_select_coach" ON "graveyard"."golf_player_baselines" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_player_baselines"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "baselines_select_player" ON "graveyard"."golf_player_baselines" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_baselines"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baselines_write_service" ON "graveyard"."golf_player_baselines" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "bbw_delete" ON "graveyard"."baseball_bodyweight_entries" FOR DELETE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "bbw_insert" ON "graveyard"."baseball_bodyweight_entries" FOR INSERT TO "authenticated" WITH CHECK (((("player_id" = "public"."get_my_baseball_player_id"()) AND "public"."is_baseball_team_member"("team_id")) OR "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "bbw_select" ON "graveyard"."baseball_bodyweight_entries" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR ("public"."has_baseball_staff_capability"("team_id", 'can_view_readiness'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id"))));

CREATE POLICY "bbw_update" ON "graveyard"."baseball_bodyweight_entries" FOR UPDATE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"))) WITH CHECK ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "bld_all" ON "graveyard"."baseball_lift_days" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("graveyard"."baseball_lift_weeks" "w"
     JOIN "graveyard"."baseball_lift_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("w"."id" = "baseball_lift_days"."week_id") AND "public"."is_baseball_team_staff"("p"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("graveyard"."baseball_lift_weeks" "w"
     JOIN "graveyard"."baseball_lift_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("w"."id" = "baseball_lift_days"."week_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_lifting'::"text")))));

CREATE POLICY "ble_delete" ON "graveyard"."baseball_lift_exercises" FOR DELETE TO "authenticated" USING ((("team_id" IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "ble_insert" ON "graveyard"."baseball_lift_exercises" FOR INSERT TO "authenticated" WITH CHECK ((("team_id" IS NOT NULL) AND ("is_global" = false) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "ble_select" ON "graveyard"."baseball_lift_exercises" FOR SELECT TO "authenticated" USING (((("is_global" = true) AND (EXISTS ( SELECT 1
   FROM "public"."baseball_team_coach_staff" "tcs"
  WHERE ("tcs"."coach_id" = "public"."get_my_coach_id"())))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_staff"("team_id")) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_member"("team_id"))));

CREATE POLICY "ble_update" ON "graveyard"."baseball_lift_exercises" FOR UPDATE TO "authenticated" USING ((("team_id" IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"))) WITH CHECK ((("team_id" IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "bles_delete" ON "graveyard"."baseball_lift_exercise_substitutions" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "bles_insert" ON "graveyard"."baseball_lift_exercise_substitutions" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "bles_select" ON "graveyard"."baseball_lift_exercise_substitutions" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "bles_update" ON "graveyard"."baseball_lift_exercise_substitutions" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blir_delete" ON "graveyard"."baseball_lift_import_runs" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blir_insert" ON "graveyard"."baseball_lift_import_runs" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blir_select" ON "graveyard"."baseball_lift_import_runs" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "blir_update" ON "graveyard"."baseball_lift_import_runs" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blirw_all" ON "graveyard"."baseball_lift_import_rows" TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blp_delete" ON "graveyard"."baseball_lift_programs" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blp_insert" ON "graveyard"."baseball_lift_programs" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blp_select" ON "graveyard"."baseball_lift_programs" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "blp_update" ON "graveyard"."baseball_lift_programs" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blpa_delete" ON "graveyard"."baseball_lift_program_assignments" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blpa_insert" ON "graveyard"."baseball_lift_program_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blpa_select" ON "graveyard"."baseball_lift_program_assignments" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "blpa_update" ON "graveyard"."baseball_lift_program_assignments" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "blpr_all" ON "graveyard"."baseball_lift_prescriptions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("graveyard"."baseball_lift_sections" "s"
     JOIN "graveyard"."baseball_lift_days" "d" ON (("d"."id" = "s"."lift_day_id")))
     JOIN "graveyard"."baseball_lift_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "graveyard"."baseball_lift_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("s"."id" = "baseball_lift_prescriptions"."section_id") AND "public"."is_baseball_team_staff"("p"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("graveyard"."baseball_lift_sections" "s"
     JOIN "graveyard"."baseball_lift_days" "d" ON (("d"."id" = "s"."lift_day_id")))
     JOIN "graveyard"."baseball_lift_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "graveyard"."baseball_lift_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("s"."id" = "baseball_lift_prescriptions"."section_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_lifting'::"text")))));

CREATE POLICY "blse_delete" ON "graveyard"."baseball_lift_session_exercises" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_lift_sessions" "s"
  WHERE (("s"."id" = "baseball_lift_session_exercises"."session_id") AND "public"."can_manage_baseball_lift_group"("s"."team_id", "s"."player_id")))));

CREATE POLICY "blse_insert" ON "graveyard"."baseball_lift_session_exercises" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_lift_sessions" "s"
  WHERE (("s"."id" = "baseball_lift_session_exercises"."session_id") AND "public"."can_manage_baseball_lift_group"("s"."team_id", "s"."player_id")))));

CREATE POLICY "blse_select" ON "graveyard"."baseball_lift_session_exercises" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_lift_sessions" "s"
  WHERE (("s"."id" = "baseball_lift_session_exercises"."session_id") AND (("s"."player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("s"."team_id", "s"."player_id"))))));

CREATE POLICY "blse_update" ON "graveyard"."baseball_lift_session_exercises" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_lift_sessions" "s"
  WHERE (("s"."id" = "baseball_lift_session_exercises"."session_id") AND (("s"."player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("s"."team_id", "s"."player_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_lift_sessions" "s"
  WHERE (("s"."id" = "baseball_lift_session_exercises"."session_id") AND (("s"."player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("s"."team_id", "s"."player_id"))))));

CREATE POLICY "blsec_all" ON "graveyard"."baseball_lift_sections" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("graveyard"."baseball_lift_days" "d"
     JOIN "graveyard"."baseball_lift_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "graveyard"."baseball_lift_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("d"."id" = "baseball_lift_sections"."lift_day_id") AND "public"."is_baseball_team_staff"("p"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("graveyard"."baseball_lift_days" "d"
     JOIN "graveyard"."baseball_lift_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "graveyard"."baseball_lift_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("d"."id" = "baseball_lift_sections"."lift_day_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_lifting'::"text")))));

CREATE POLICY "blsess_delete" ON "graveyard"."baseball_lift_sessions" FOR DELETE TO "authenticated" USING ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "blsess_insert" ON "graveyard"."baseball_lift_sessions" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "blsess_select" ON "graveyard"."baseball_lift_sessions" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "blsess_update" ON "graveyard"."baseball_lift_sessions" FOR UPDATE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id"))) WITH CHECK ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "blsr_delete" ON "graveyard"."baseball_lift_set_results" FOR DELETE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "blsr_insert" ON "graveyard"."baseball_lift_set_results" FOR INSERT TO "authenticated" WITH CHECK (((("player_id" = "public"."get_my_baseball_player_id"()) AND "public"."is_baseball_team_member"("team_id")) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "blsr_select" ON "graveyard"."baseball_lift_set_results" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "blsr_update" ON "graveyard"."baseball_lift_set_results" FOR UPDATE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id"))) WITH CHECK ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "blw_all" ON "graveyard"."baseball_lift_weeks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_lift_programs" "p"
  WHERE (("p"."id" = "baseball_lift_weeks"."program_id") AND "public"."is_baseball_team_staff"("p"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_lift_programs" "p"
  WHERE (("p"."id" = "baseball_lift_weeks"."program_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_lifting'::"text")))));

CREATE POLICY "bmax_delete" ON "graveyard"."baseball_strength_maxes" FOR DELETE TO "authenticated" USING ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "bmax_insert" ON "graveyard"."baseball_strength_maxes" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "bmax_select" ON "graveyard"."baseball_strength_maxes" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "bmax_update" ON "graveyard"."baseball_strength_maxes" FOR UPDATE TO "authenticated" USING ("public"."can_manage_baseball_lift_group"("team_id", "player_id")) WITH CHECK ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "bpr_delete" ON "graveyard"."baseball_strength_prs" FOR DELETE TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "bpr_insert" ON "graveyard"."baseball_strength_prs" FOR INSERT TO "authenticated" WITH CHECK (((("player_id" = "public"."get_my_baseball_player_id"()) AND "public"."is_baseball_team_member"("team_id")) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "bpr_select" ON "graveyard"."baseball_strength_prs" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR "public"."can_manage_baseball_lift_group"("team_id", "player_id")));

CREATE POLICY "bpr_update" ON "graveyard"."baseball_strength_prs" FOR UPDATE TO "authenticated" USING ("public"."can_manage_baseball_lift_group"("team_id", "player_id")) WITH CHECK ("public"."can_manage_baseball_lift_group"("team_id", "player_id"));

CREATE POLICY "bsg_delete" ON "graveyard"."baseball_strength_groups" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "bsg_insert" ON "graveyard"."baseball_strength_groups" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "bsg_select" ON "graveyard"."baseball_strength_groups" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "bsg_update" ON "graveyard"."baseball_strength_groups" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"));

CREATE POLICY "bsgm_delete" ON "graveyard"."baseball_strength_group_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_strength_groups" "g"
  WHERE (("g"."id" = "baseball_strength_group_members"."group_id") AND "public"."has_baseball_staff_capability"("g"."team_id", 'can_manage_lifting'::"text")))));

CREATE POLICY "bsgm_insert" ON "graveyard"."baseball_strength_group_members" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_strength_groups" "g"
  WHERE (("g"."id" = "baseball_strength_group_members"."group_id") AND "public"."has_baseball_staff_capability"("g"."team_id", 'can_manage_lifting'::"text")))));

CREATE POLICY "bsgm_select" ON "graveyard"."baseball_strength_group_members" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR (EXISTS ( SELECT 1
   FROM "graveyard"."baseball_strength_groups" "g"
  WHERE (("g"."id" = "baseball_strength_group_members"."group_id") AND "public"."is_baseball_team_staff"("g"."team_id"))))));

CREATE POLICY "bsgm_update" ON "graveyard"."baseball_strength_group_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_strength_groups" "g"
  WHERE (("g"."id" = "baseball_strength_group_members"."group_id") AND "public"."has_baseball_staff_capability"("g"."team_id", 'can_manage_lifting'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "graveyard"."baseball_strength_groups" "g"
  WHERE (("g"."id" = "baseball_strength_group_members"."group_id") AND "public"."has_baseball_staff_capability"("g"."team_id", 'can_manage_lifting'::"text")))));

CREATE POLICY "bsm_delete" ON "graveyard"."baseball_soreness_maps" FOR DELETE TO "authenticated" USING (("player_id" = "public"."get_my_baseball_player_id"()));

CREATE POLICY "bsm_insert" ON "graveyard"."baseball_soreness_maps" FOR INSERT TO "authenticated" WITH CHECK ((("player_id" = "public"."get_my_baseball_player_id"()) AND "public"."is_baseball_team_member"("team_id")));

CREATE POLICY "bsm_select" ON "graveyard"."baseball_soreness_maps" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR ("public"."has_baseball_staff_capability"("team_id", 'can_view_readiness'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id"))));

CREATE POLICY "bsm_update" ON "graveyard"."baseball_soreness_maps" FOR UPDATE TO "authenticated" USING (("player_id" = "public"."get_my_baseball_player_id"())) WITH CHECK (("player_id" = "public"."get_my_baseball_player_id"()));

CREATE POLICY "golf_tracer_health_snapshot_admin_read" ON "graveyard"."golf_tracer_health_snapshot" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "golf_tracer_health_snapshot_service_write" ON "graveyard"."golf_tracer_health_snapshot" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "percentile_select_coach" ON "graveyard"."golf_percentile_cache" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_percentile_cache"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "percentile_select_player" ON "graveyard"."golf_percentile_cache" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_percentile_cache"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "percentile_write_service" ON "graveyard"."golf_percentile_cache" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));
