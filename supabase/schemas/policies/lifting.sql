CREATE POLICY "hla_delete" ON "public"."helm_lifting_athletes" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hla_insert" ON "public"."helm_lifting_athletes" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hla_select" ON "public"."helm_lifting_athletes" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_can_view_org"("organization_id", "sport") OR "public"."helm_lifting_is_my_athlete"("id")));

CREATE POLICY "hla_update" ON "public"."helm_lifting_athletes" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlas_delete" ON "public"."helm_lifting_availability_statuses" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlas_insert" ON "public"."helm_lifting_availability_statuses" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlas_select" ON "public"."helm_lifting_availability_statuses" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlas_update" ON "public"."helm_lifting_availability_statuses" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlbw_delete" ON "public"."helm_lifting_bodyweight_entries" FOR DELETE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlbw_insert" ON "public"."helm_lifting_bodyweight_entries" FOR INSERT TO "authenticated" WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlbw_select" ON "public"."helm_lifting_bodyweight_entries" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlbw_update" ON "public"."helm_lifting_bodyweight_entries" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id"))) WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlc_delete" ON "public"."helm_lifting_coaches" FOR DELETE TO "authenticated" USING (false);

CREATE POLICY "hlc_insert" ON "public"."helm_lifting_coaches" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlc_select" ON "public"."helm_lifting_coaches" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."helm_lifting_can_view_org"("organization_id", 'baseball'::"text") OR "public"."helm_lifting_can_view_org"("organization_id", 'golf'::"text")));

CREATE POLICY "hlc_update" ON "public"."helm_lifting_coaches" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "hlca_delete" ON "public"."helm_lifting_coach_assignments" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlca_insert" ON "public"."helm_lifting_coach_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlca_select" ON "public"."helm_lifting_coach_assignments" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_view_org"("organization_id", "sport"));

CREATE POLICY "hlca_update" ON "public"."helm_lifting_coach_assignments" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlci_delete" ON "public"."helm_lifting_coach_invites" FOR DELETE TO "authenticated" USING (("invited_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "hlci_insert" ON "public"."helm_lifting_coach_invites" FOR INSERT TO "authenticated" WITH CHECK (("invited_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "hlci_select" ON "public"."helm_lifting_coach_invites" FOR SELECT TO "authenticated" USING ((("lower"("email") = "lower"(( SELECT "u"."email"
   FROM "public"."users" "u"
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "public"."helm_lifting_coach_for_org"("organization_id")));

CREATE POLICY "hlci_update" ON "public"."helm_lifting_coach_invites" FOR UPDATE TO "authenticated" USING (("invited_by_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("invited_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "hld_delete" ON "public"."helm_lifting_days" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."helm_lifting_weeks" "w"
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("w"."id" = "helm_lifting_days"."week_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hld_insert" ON "public"."helm_lifting_days" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."helm_lifting_weeks" "w"
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("w"."id" = "helm_lifting_days"."week_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hld_select" ON "public"."helm_lifting_days" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."helm_lifting_weeks" "w"
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("w"."id" = "helm_lifting_days"."week_id") AND "public"."helm_lifting_can_view_org"("p"."organization_id", "p"."sport")))));

CREATE POLICY "hld_update" ON "public"."helm_lifting_days" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."helm_lifting_weeks" "w"
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("w"."id" = "helm_lifting_days"."week_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."helm_lifting_weeks" "w"
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("w"."id" = "helm_lifting_days"."week_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hle_delete" ON "public"."helm_lifting_exercises" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hle_insert" ON "public"."helm_lifting_exercises" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hle_select" ON "public"."helm_lifting_exercises" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_can_view_org"("organization_id", "sport") OR "public"."helm_lifting_is_my_athlete"(( SELECT "a"."id"
   FROM "public"."helm_lifting_athletes" "a"
  WHERE (("a"."organization_id" = "helm_lifting_exercises"."organization_id") AND ("a"."sport" = "helm_lifting_exercises"."sport") AND ("a"."user_id" = ( SELECT "auth"."uid"() AS "uid")))
 LIMIT 1))));

CREATE POLICY "hle_update" ON "public"."helm_lifting_exercises" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hles_delete" ON "public"."helm_lifting_exercise_substitutions" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hles_insert" ON "public"."helm_lifting_exercise_substitutions" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hles_select" ON "public"."helm_lifting_exercise_substitutions" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_view_org"("organization_id", "sport"));

CREATE POLICY "hles_update" ON "public"."helm_lifting_exercise_substitutions" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlg_delete" ON "public"."helm_lifting_groups" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlg_insert" ON "public"."helm_lifting_groups" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlg_select" ON "public"."helm_lifting_groups" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_view_org"("organization_id", "sport"));

CREATE POLICY "hlg_update" ON "public"."helm_lifting_groups" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlga_insert" ON "public"."helm_lifting_group_audit" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlga_select" ON "public"."helm_lifting_group_audit" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlgm_delete" ON "public"."helm_lifting_group_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_groups" "g"
  WHERE (("g"."id" = "helm_lifting_group_members"."group_id") AND "public"."helm_lifting_can_edit_org"("g"."organization_id")))));

CREATE POLICY "hlgm_insert" ON "public"."helm_lifting_group_members" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_groups" "g"
  WHERE (("g"."id" = "helm_lifting_group_members"."group_id") AND "public"."helm_lifting_can_edit_org"("g"."organization_id")))));

CREATE POLICY "hlgm_select" ON "public"."helm_lifting_group_members" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."helm_lifting_groups" "g"
  WHERE (("g"."id" = "helm_lifting_group_members"."group_id") AND "public"."helm_lifting_can_view_org"("g"."organization_id", "g"."sport"))))));

CREATE POLICY "hlgm_update" ON "public"."helm_lifting_group_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_groups" "g"
  WHERE (("g"."id" = "helm_lifting_group_members"."group_id") AND "public"."helm_lifting_can_edit_org"("g"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_groups" "g"
  WHERE (("g"."id" = "helm_lifting_group_members"."group_id") AND "public"."helm_lifting_can_edit_org"("g"."organization_id")))));

CREATE POLICY "hlir_delete" ON "public"."helm_lifting_import_runs" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlir_insert" ON "public"."helm_lifting_import_runs" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlir_select" ON "public"."helm_lifting_import_runs" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_view_org"("organization_id", "sport"));

CREATE POLICY "hlir_update" ON "public"."helm_lifting_import_runs" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlirw_delete" ON "public"."helm_lifting_import_rows" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlirw_insert" ON "public"."helm_lifting_import_rows" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlirw_select" ON "public"."helm_lifting_import_rows" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_view_org"("organization_id", "sport"));

CREATE POLICY "hlirw_update" ON "public"."helm_lifting_import_rows" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlmax_delete" ON "public"."helm_lifting_maxes" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlmax_insert" ON "public"."helm_lifting_maxes" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlmax_select" ON "public"."helm_lifting_maxes" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlmax_update" ON "public"."helm_lifting_maxes" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlnp_delete" ON "public"."helm_lifting_nutrition_plans" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlnp_insert" ON "public"."helm_lifting_nutrition_plans" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlnp_select" ON "public"."helm_lifting_nutrition_plans" FOR SELECT TO "authenticated" USING ((("public"."helm_lifting_can_view_org"("organization_id", "sport") AND (("visibility" <> 'head_coach_only'::"text") OR "public"."helm_lifting_is_head_coach_viewer"("organization_id"))) OR (("status" = 'published'::"text") AND ("visibility" <> 'head_coach_only'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."helm_lifting_nutrition_plan_assignments" "a"
     JOIN "public"."helm_lifting_athletes" "ath" ON (("ath"."id" = "a"."athlete_id")))
  WHERE (("a"."plan_id" = "helm_lifting_nutrition_plans"."id") AND ("ath"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("a"."assignment_type" = 'athlete'::"text")))))));

CREATE POLICY "hlnp_update" ON "public"."helm_lifting_nutrition_plans" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlnpa_delete" ON "public"."helm_lifting_nutrition_plan_assignments" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlnpa_insert" ON "public"."helm_lifting_nutrition_plan_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlnpa_select" ON "public"."helm_lifting_nutrition_plan_assignments" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_can_view_org"("organization_id", "sport") OR (("assignment_type" = 'athlete'::"text") AND "public"."helm_lifting_is_my_athlete"("athlete_id"))));

CREATE POLICY "hlnpa_update" ON "public"."helm_lifting_nutrition_plan_assignments" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_can_edit_org"("organization_id") OR (("assignment_type" = 'athlete'::"text") AND "public"."helm_lifting_is_my_athlete"("athlete_id")))) WITH CHECK (("public"."helm_lifting_can_edit_org"("organization_id") OR (("assignment_type" = 'athlete'::"text") AND "public"."helm_lifting_is_my_athlete"("athlete_id"))));

CREATE POLICY "hlov_delete" ON "public"."helm_lifting_org_viewers" FOR DELETE TO "authenticated" USING (false);

CREATE POLICY "hlov_insert" ON "public"."helm_lifting_org_viewers" FOR INSERT TO "authenticated" WITH CHECK (false);

CREATE POLICY "hlov_select" ON "public"."helm_lifting_org_viewers" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."helm_lifting_coach_for_org"("organization_id")));

CREATE POLICY "hlov_update" ON "public"."helm_lifting_org_viewers" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);

CREATE POLICY "hlp_delete" ON "public"."helm_lifting_programs" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlp_insert" ON "public"."helm_lifting_programs" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlp_select" ON "public"."helm_lifting_programs" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_view_org"("organization_id", "sport"));

CREATE POLICY "hlp_update" ON "public"."helm_lifting_programs" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlpa_delete" ON "public"."helm_lifting_program_assignments" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlpa_insert" ON "public"."helm_lifting_program_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlpa_select" ON "public"."helm_lifting_program_assignments" FOR SELECT TO "authenticated" USING ("public"."helm_lifting_can_view_org"("organization_id", "sport"));

CREATE POLICY "hlpa_update" ON "public"."helm_lifting_program_assignments" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlpr_delete" ON "public"."helm_lifting_prescriptions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."helm_lifting_sections" "s"
     JOIN "public"."helm_lifting_days" "d" ON (("d"."id" = "s"."lift_day_id")))
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("s"."id" = "helm_lifting_prescriptions"."section_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlpr_delete" ON "public"."helm_lifting_prs" FOR DELETE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlpr_insert" ON "public"."helm_lifting_prescriptions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."helm_lifting_sections" "s"
     JOIN "public"."helm_lifting_days" "d" ON (("d"."id" = "s"."lift_day_id")))
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("s"."id" = "helm_lifting_prescriptions"."section_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlpr_insert" ON "public"."helm_lifting_prs" FOR INSERT TO "authenticated" WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlpr_select" ON "public"."helm_lifting_prescriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."helm_lifting_sections" "s"
     JOIN "public"."helm_lifting_days" "d" ON (("d"."id" = "s"."lift_day_id")))
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("s"."id" = "helm_lifting_prescriptions"."section_id") AND "public"."helm_lifting_can_view_org"("p"."organization_id", "p"."sport")))));

CREATE POLICY "hlpr_select" ON "public"."helm_lifting_prs" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlpr_update" ON "public"."helm_lifting_prescriptions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."helm_lifting_sections" "s"
     JOIN "public"."helm_lifting_days" "d" ON (("d"."id" = "s"."lift_day_id")))
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("s"."id" = "helm_lifting_prescriptions"."section_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."helm_lifting_sections" "s"
     JOIN "public"."helm_lifting_days" "d" ON (("d"."id" = "s"."lift_day_id")))
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("s"."id" = "helm_lifting_prescriptions"."section_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlpr_update" ON "public"."helm_lifting_prs" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlrc_delete" ON "public"."helm_lifting_readiness_checkins" FOR DELETE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlrc_insert" ON "public"."helm_lifting_readiness_checkins" FOR INSERT TO "authenticated" WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlrc_select" ON "public"."helm_lifting_readiness_checkins" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlrc_update" ON "public"."helm_lifting_readiness_checkins" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id"))) WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlscr_delete" ON "public"."helm_lifting_soreness_check_requests" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlscr_insert" ON "public"."helm_lifting_soreness_check_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlscr_select" ON "public"."helm_lifting_soreness_check_requests" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlscr_update" ON "public"."helm_lifting_soreness_check_requests" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id"))) WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlscs_delete" ON "public"."helm_lifting_soreness_check_schedules" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlscs_insert" ON "public"."helm_lifting_soreness_check_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlscs_select" ON "public"."helm_lifting_soreness_check_schedules" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_can_view_org"("organization_id", "sport") AND (("visibility" <> 'head_coach_only'::"text") OR "public"."helm_lifting_is_head_coach_viewer"("organization_id"))));

CREATE POLICY "hlscs_update" ON "public"."helm_lifting_soreness_check_schedules" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlse_delete" ON "public"."helm_lifting_session_exercises" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_sessions" "s"
  WHERE (("s"."id" = "helm_lifting_session_exercises"."session_id") AND "public"."helm_lifting_can_edit_org"("s"."organization_id")))));

CREATE POLICY "hlse_insert" ON "public"."helm_lifting_session_exercises" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_sessions" "s"
  WHERE (("s"."id" = "helm_lifting_session_exercises"."session_id") AND "public"."helm_lifting_can_edit_org"("s"."organization_id")))));

CREATE POLICY "hlse_select" ON "public"."helm_lifting_session_exercises" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_sessions" "s"
  WHERE (("s"."id" = "helm_lifting_session_exercises"."session_id") AND ("public"."helm_lifting_is_my_athlete"("s"."athlete_id") OR "public"."helm_lifting_can_view_org"("s"."organization_id", "s"."sport"))))));

CREATE POLICY "hlse_update" ON "public"."helm_lifting_session_exercises" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_sessions" "s"
  WHERE (("s"."id" = "helm_lifting_session_exercises"."session_id") AND ("public"."helm_lifting_is_my_athlete"("s"."athlete_id") OR "public"."helm_lifting_can_edit_org"("s"."organization_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_sessions" "s"
  WHERE (("s"."id" = "helm_lifting_session_exercises"."session_id") AND ("public"."helm_lifting_is_my_athlete"("s"."athlete_id") OR "public"."helm_lifting_can_edit_org"("s"."organization_id"))))));

CREATE POLICY "hlsec_delete" ON "public"."helm_lifting_sections" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."helm_lifting_days" "d"
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("d"."id" = "helm_lifting_sections"."lift_day_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlsec_insert" ON "public"."helm_lifting_sections" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."helm_lifting_days" "d"
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("d"."id" = "helm_lifting_sections"."lift_day_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlsec_select" ON "public"."helm_lifting_sections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."helm_lifting_days" "d"
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("d"."id" = "helm_lifting_sections"."lift_day_id") AND "public"."helm_lifting_can_view_org"("p"."organization_id", "p"."sport")))));

CREATE POLICY "hlsec_update" ON "public"."helm_lifting_sections" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."helm_lifting_days" "d"
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("d"."id" = "helm_lifting_sections"."lift_day_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."helm_lifting_days" "d"
     JOIN "public"."helm_lifting_weeks" "w" ON (("w"."id" = "d"."week_id")))
     JOIN "public"."helm_lifting_programs" "p" ON (("p"."id" = "w"."program_id")))
  WHERE (("d"."id" = "helm_lifting_sections"."lift_day_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlsess_delete" ON "public"."helm_lifting_sessions" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlsess_insert" ON "public"."helm_lifting_sessions" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlsess_select" ON "public"."helm_lifting_sessions" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlsess_update" ON "public"."helm_lifting_sessions" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id"))) WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlsm_delete" ON "public"."helm_lifting_soreness_maps" FOR DELETE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlsm_insert" ON "public"."helm_lifting_soreness_maps" FOR INSERT TO "authenticated" WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlsm_select" ON "public"."helm_lifting_soreness_maps" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlsm_update" ON "public"."helm_lifting_soreness_maps" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id"))) WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlsr_delete" ON "public"."helm_lifting_set_results" FOR DELETE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlsr_insert" ON "public"."helm_lifting_set_results" FOR INSERT TO "authenticated" WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlsr_select" ON "public"."helm_lifting_set_results" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlsr_update" ON "public"."helm_lifting_set_results" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id"))) WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlw_delete" ON "public"."helm_lifting_weeks" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_programs" "p"
  WHERE (("p"."id" = "helm_lifting_weeks"."program_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlw_insert" ON "public"."helm_lifting_weeks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_programs" "p"
  WHERE (("p"."id" = "helm_lifting_weeks"."program_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlw_select" ON "public"."helm_lifting_weeks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_programs" "p"
  WHERE (("p"."id" = "helm_lifting_weeks"."program_id") AND "public"."helm_lifting_can_view_org"("p"."organization_id", "p"."sport")))));

CREATE POLICY "hlw_update" ON "public"."helm_lifting_weeks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_programs" "p"
  WHERE (("p"."id" = "helm_lifting_weeks"."program_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."helm_lifting_programs" "p"
  WHERE (("p"."id" = "helm_lifting_weeks"."program_id") AND "public"."helm_lifting_can_edit_org"("p"."organization_id")))));

CREATE POLICY "hlwcr_delete" ON "public"."helm_lifting_weight_checkin_requests" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlwcr_insert" ON "public"."helm_lifting_weight_checkin_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlwcr_select" ON "public"."helm_lifting_weight_checkin_requests" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_view_org"("organization_id", "sport")));

CREATE POLICY "hlwcr_update" ON "public"."helm_lifting_weight_checkin_requests" FOR UPDATE TO "authenticated" USING (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id"))) WITH CHECK (("public"."helm_lifting_is_my_athlete"("athlete_id") OR "public"."helm_lifting_can_edit_org"("organization_id")));

CREATE POLICY "hlwcs_delete" ON "public"."helm_lifting_weight_checkin_schedules" FOR DELETE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlwcs_insert" ON "public"."helm_lifting_weight_checkin_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));

CREATE POLICY "hlwcs_select" ON "public"."helm_lifting_weight_checkin_schedules" FOR SELECT TO "authenticated" USING (("public"."helm_lifting_can_view_org"("organization_id", "sport") AND (("visibility" <> 'head_coach_only'::"text") OR "public"."helm_lifting_is_head_coach_viewer"("organization_id"))));

CREATE POLICY "hlwcs_update" ON "public"."helm_lifting_weight_checkin_schedules" FOR UPDATE TO "authenticated" USING ("public"."helm_lifting_can_edit_org"("organization_id")) WITH CHECK ("public"."helm_lifting_can_edit_org"("organization_id"));
