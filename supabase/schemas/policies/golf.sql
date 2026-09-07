CREATE POLICY "Admins and coaches can view validations" ON "public"."golf_prediction_validations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = ANY (ARRAY['admin'::"public"."user_role", 'coach'::"public"."user_role"]))))));

CREATE POLICY "Anyone can view course holes" ON "public"."golf_course_holes" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Coaches can create team task reminders" ON "public"."golf_task_reminders" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."golf_tasks" "t"
     JOIN "public"."golf_teams" "tm" ON (("tm"."id" = "t"."team_id")))
     JOIN "public"."golf_coaches" "c" ON (("c"."organization_id" = "tm"."organization_id")))
  WHERE (("t"."id" = "golf_task_reminders"."task_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can delete document versions" ON "public"."golf_document_versions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_documents" "d"
     JOIN "public"."golf_teams" "t" ON (("d"."team_id" = "t"."id")))
     JOIN "public"."golf_coaches" "c" ON (("t"."organization_id" = "c"."organization_id")))
  WHERE (("d"."id" = "golf_document_versions"."document_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can delete team task reminders" ON "public"."golf_task_reminders" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_tasks" "t"
     JOIN "public"."golf_teams" "tm" ON (("tm"."id" = "t"."team_id")))
     JOIN "public"."golf_coaches" "c" ON (("c"."organization_id" = "tm"."organization_id")))
  WHERE (("t"."id" = "golf_task_reminders"."task_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can insert document versions" ON "public"."golf_document_versions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."golf_documents" "d"
     JOIN "public"."golf_teams" "t" ON (("d"."team_id" = "t"."id")))
     JOIN "public"."golf_coaches" "c" ON (("t"."organization_id" = "c"."organization_id")))
  WHERE (("d"."id" = "golf_document_versions"."document_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can insert generation logs" ON "public"."golf_insight_generation_log" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_insight_generation_log"."team_id")))));

CREATE POLICY "Coaches can manage announcements" ON "public"."golf_announcements" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_announcements"."team_id")))));

CREATE POLICY "Coaches can manage course holes" ON "public"."golf_course_holes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "c"
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "Coaches can manage exclusions" ON "public"."golf_academic_exclusions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_team_members" "tm"
     JOIN "public"."golf_team_coach_staff" "tcs" ON (("tcs"."team_id" = "tm"."team_id")))
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("tm"."player_id" = "golf_academic_exclusions"."player_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can manage round stats cache" ON "public"."golf_round_stats_cache" TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "Coaches can manage settings" ON "public"."golf_team_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_team_settings"."team_id")))));

CREATE POLICY "Coaches can manage team stats cache" ON "public"."golf_player_stats_cache" TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "Coaches can manage their insights" ON "public"."golf_coach_insights" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."id" = "golf_coach_insights"."coach_id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_coach_insights"."team_id")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."id" = "golf_coach_insights"."coach_id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_coach_insights"."team_id"))))));

CREATE POLICY "Coaches can manage their own blocked time" ON "public"."golf_coach_blocked_time" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."id" = "golf_coach_blocked_time"."coach_id")))));

CREATE POLICY "Coaches can manage travel" ON "public"."golf_travel_itineraries" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_travel_itineraries"."team_id")))));

CREATE POLICY "Coaches can review team join requests" ON "public"."golf_team_join_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_coaches" "gc"
     JOIN "public"."golf_teams" "gt" ON (("gt"."organization_id" = "gc"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gt"."id" = "golf_team_join_requests"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."golf_coaches" "gc"
     JOIN "public"."golf_teams" "gt" ON (("gt"."organization_id" = "gc"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gt"."id" = "golf_team_join_requests"."team_id")))));

CREATE POLICY "Coaches can update team task reminders" ON "public"."golf_task_reminders" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_tasks" "t"
     JOIN "public"."golf_teams" "tm" ON (("tm"."id" = "t"."team_id")))
     JOIN "public"."golf_coaches" "c" ON (("c"."organization_id" = "tm"."organization_id")))
  WHERE (("t"."id" = "golf_task_reminders"."task_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can view document versions" ON "public"."golf_document_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_documents" "d"
     JOIN "public"."golf_teams" "t" ON (("d"."team_id" = "t"."id")))
     JOIN "public"."golf_coaches" "c" ON (("t"."organization_id" = "c"."organization_id")))
  WHERE (("d"."id" = "golf_document_versions"."document_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can view patterns for their team players" ON "public"."golf_patterns_v2" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE "public"."is_golf_team_coach"("gtm"."team_id"))));

CREATE POLICY "Coaches can view predictions for their team players" ON "public"."golf_predictions" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE "public"."is_golf_team_coach"("gtm"."team_id"))));

CREATE POLICY "Coaches can view team attendance" ON "public"."golf_attendance_summary" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_attendance_summary"."team_id")))));

CREATE POLICY "Coaches can view team join requests" ON "public"."golf_team_join_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_coaches" "gc"
     JOIN "public"."golf_teams" "gt" ON (("gt"."organization_id" = "gc"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gt"."id" = "golf_team_join_requests"."team_id")))));

CREATE POLICY "Coaches can view team player courses" ON "public"."golf_player_courses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_team_members" "gtm"
     JOIN "public"."golf_team_coach_staff" "tcs" ON (("tcs"."team_id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("gtm"."player_id" = "golf_player_courses"."player_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can view team player stats" ON "public"."golf_player_stats_cache" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "Coaches can view team round stats" ON "public"."golf_round_stats_cache" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "Coaches can view team task reminders" ON "public"."golf_task_reminders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_tasks" "t"
     JOIN "public"."golf_teams" "tm" ON (("tm"."id" = "t"."team_id")))
     JOIN "public"."golf_coaches" "c" ON (("c"."organization_id" = "tm"."organization_id")))
  WHERE (("t"."id" = "golf_task_reminders"."task_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can view their own insights" ON "public"."golf_coach_insights" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."id" = "golf_coach_insights"."coach_id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_coach_insights"."team_id"))))));

CREATE POLICY "Coaches can view their own learned behavior" ON "public"."golf_learned_behavior" FOR SELECT USING ((("entity_type" = 'coach'::"text") AND ("entity_id" IN ( SELECT "golf_coaches"."id"
   FROM "public"."golf_coaches"
  WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Coaches can view their team logs" ON "public"."golf_insight_generation_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_insight_generation_log"."team_id")))));

CREATE POLICY "Players can cancel their pending requests" ON "public"."golf_team_join_requests" FOR DELETE TO "authenticated" USING ((("status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_team_join_requests"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "Players can create their own join requests" ON "public"."golf_team_join_requests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_team_join_requests"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Players can create their own reviews" ON "public"."golf_round_reviews" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."id" = "golf_round_reviews"."player_id")))));

CREATE POLICY "Players can leave teams" ON "public"."golf_team_members" FOR DELETE TO "authenticated" USING (("player_id" = "public"."get_current_golf_player_id"()));

CREATE POLICY "Players can manage their golf courses" ON "public"."golf_player_courses" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gp"."id" = "golf_player_courses"."player_id")))));

CREATE POLICY "Players can update their own reviews" ON "public"."golf_round_reviews" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."id" = "golf_round_reviews"."player_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."id" = "golf_round_reviews"."player_id")))));

CREATE POLICY "Players can view document versions for visible docs" ON "public"."golf_document_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_documents" "d"
     JOIN "public"."golf_team_members" "tm" ON (("d"."team_id" = "tm"."team_id")))
     JOIN "public"."golf_players" "p" ON (("tm"."player_id" = "p"."id")))
  WHERE (("d"."id" = "golf_document_versions"."document_id") AND ("d"."is_public" = true) AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Players can view own round stats" ON "public"."golf_round_stats_cache" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "Players can view own stats" ON "public"."golf_player_stats_cache" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "Players can view teammates stats cache" ON "public"."golf_player_stats_cache" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_team_members" "me"
     JOIN "public"."golf_team_members" "teammate" ON (("teammate"."team_id" = "me"."team_id")))
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "me"."player_id")))
  WHERE (("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("me"."status" = 'active'::"public"."team_member_status") AND ("teammate"."status" = 'active'::"public"."team_member_status") AND ("teammate"."player_id" = "golf_player_stats_cache"."player_id")))));

CREATE POLICY "Players can view their own attendance" ON "public"."golf_attendance_summary" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."id" = "golf_attendance_summary"."player_id")))));

CREATE POLICY "Players can view their own exclusions" ON "public"."golf_academic_exclusions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."id" = "golf_academic_exclusions"."player_id")))));

CREATE POLICY "Players can view their own join requests" ON "public"."golf_team_join_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_team_join_requests"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Players can view their own learned behavior" ON "public"."golf_learned_behavior" FOR SELECT USING ((("entity_type" = 'player'::"text") AND ("entity_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Players can view their own patterns" ON "public"."golf_patterns_v2" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "Players can view their own predictions" ON "public"."golf_predictions" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "Players manage own notification state" ON "public"."golf_player_notification_state" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "Service role can insert patterns" ON "public"."golf_patterns_v2" FOR INSERT TO "service_role" WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "Service role can manage learned behavior" ON "public"."golf_learned_behavior" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "Service role can manage predictions" ON "public"."golf_predictions" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "Service role can update patterns" ON "public"."golf_patterns_v2" FOR UPDATE TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "Service role full access" ON "public"."golf_task_reminders" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "Team members can view announcements" ON "public"."golf_announcements" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_announcements"."team_id")))) OR ((EXISTS ( SELECT 1
   FROM ("public"."golf_team_members" "tm"
     JOIN "public"."golf_players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tm"."team_id" = "golf_announcements"."team_id")))) AND "public"."golf_announcement_addressed_to_me"("id"))));

CREATE POLICY "Team members can view settings" ON "public"."golf_team_settings" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_team_settings"."team_id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."golf_team_members" "tm"
     JOIN "public"."golf_players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tm"."team_id" = "golf_team_settings"."team_id"))))));

CREATE POLICY "Team members can view travel" ON "public"."golf_travel_itineraries" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "tcs"
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tcs"."team_id" = "golf_travel_itineraries"."team_id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."golf_team_members" "tm"
     JOIN "public"."golf_players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tm"."team_id" = "golf_travel_itineraries"."team_id"))))));

CREATE POLICY "Users can add attachments to their own messages" ON "public"."golf_message_attachments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_attachments"."message_id") AND ("m"."sender_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Users can delete their own attachments" ON "public"."golf_message_attachments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_attachments"."message_id") AND ("m"."sender_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Users can update their golf notifications" ON "public"."golf_calendar_notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "Users can view attachments in their conversations" ON "public"."golf_message_attachments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_messages" "m"
     JOIN "public"."golf_conversation_participants" "cp" ON (("cp"."conversation_id" = "m"."conversation_id")))
  WHERE (("m"."id" = "golf_message_attachments"."message_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Users can view relevant review events" ON "public"."golf_review_events" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (("public"."golf_coaches" "gc"
     JOIN "public"."golf_teams" "gt" ON (("gt"."organization_id" = "gc"."organization_id")))
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."team_id" = "gt"."id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gtm"."player_id" = "golf_review_events"."player_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gp"."id" = "golf_review_events"."player_id"))))));

CREATE POLICY "Users can view their golf calendar notifications" ON "public"."golf_calendar_notifications" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "admin_read_all" ON "public"."golf_announcements" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_attendance_summary" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_coach_insights" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_coach_philosophy" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_documents" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_events" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_insight_generation_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_messages" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_patterns_v2" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_player_stats_cache" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_players" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_predictions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_qualifiers" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_round_reviews" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_rounds" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_shots" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_tasks" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_team_members" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_teams" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "admin_read_all" ON "public"."golf_travel_itineraries" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "ann_documents_select_team" ON "public"."golf_announcement_documents" FOR SELECT TO "authenticated" USING (("announcement_id" IN ( SELECT "a"."id"
   FROM "public"."golf_announcements" "a"
  WHERE ("public"."is_golf_team_coach"("a"."team_id") OR "public"."is_golf_team_player"("a"."team_id")))));

CREATE POLICY "ann_tasks_select_team" ON "public"."golf_announcement_tasks" FOR SELECT TO "authenticated" USING (("announcement_id" IN ( SELECT "a"."id"
   FROM "public"."golf_announcements" "a"
  WHERE ("public"."is_golf_team_coach"("a"."team_id") OR "public"."is_golf_team_player"("a"."team_id")))));

CREATE POLICY "approach_miss_details_delete_own" ON "public"."approach_miss_details" FOR DELETE TO "authenticated" USING ("public"."owns_golf_shot"("shot_id"));

CREATE POLICY "approach_miss_details_insert_own" ON "public"."approach_miss_details" FOR INSERT TO "authenticated" WITH CHECK ("public"."owns_golf_shot"("shot_id"));

CREATE POLICY "approach_miss_details_select" ON "public"."approach_miss_details" FOR SELECT TO "authenticated" USING ("public"."can_read_golf_shot_detail"("shot_id"));

CREATE POLICY "approach_miss_details_update_own" ON "public"."approach_miss_details" FOR UPDATE TO "authenticated" USING ("public"."owns_golf_shot"("shot_id")) WITH CHECK ("public"."owns_golf_shot"("shot_id"));

CREATE POLICY "attribution_coach_read" ON "public"."golf_insight_outcome_attribution" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coach_insights" "i"
  WHERE (("i"."id" = "golf_insight_outcome_attribution"."insight_id") AND ("i"."coach_id" = "public"."current_coach_id"())))));

CREATE POLICY "chat_conversations_coach_only" ON "public"."golf_coachhelm_chat_conversations" TO "authenticated" USING (("coach_id" = "public"."current_coach_id"())) WITH CHECK (("coach_id" = "public"."current_coach_id"()));

CREATE POLICY "chat_messages_coach_only" ON "public"."golf_coachhelm_chat_messages" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coachhelm_chat_conversations" "c"
  WHERE (("c"."id" = "golf_coachhelm_chat_messages"."conversation_id") AND ("c"."coach_id" = "public"."current_coach_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_coachhelm_chat_conversations" "c"
  WHERE (("c"."id" = "golf_coachhelm_chat_messages"."conversation_id") AND ("c"."coach_id" = "public"."current_coach_id"())))));

CREATE POLICY "coach_behavior_admin_read" ON "public"."golf_coach_behavior_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "coach_behavior_insert_service" ON "public"."golf_coach_behavior_log" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "coach_behavior_select_own" ON "public"."golf_coach_behavior_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "c"
  WHERE (("c"."id" = "golf_coach_behavior_log"."coach_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "coach_insights_select_player_own" ON "public"."golf_coach_insights" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "coach_insights_select_via_player_team" ON "public"."golf_coach_insights" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_team_members" "tm"
     JOIN "public"."golf_team_coach_staff" "tcs" ON (("tcs"."team_id" = "tm"."team_id")))
     JOIN "public"."golf_coaches" "c" ON (("c"."id" = "tcs"."coach_id")))
  WHERE (("tm"."player_id" = "golf_coach_insights"."player_id") AND ("tm"."status" = 'active'::"public"."team_member_status") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "coach_insights_update_player_own" ON "public"."golf_coach_insights" FOR UPDATE TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

COMMENT ON POLICY "coach_insights_update_player_own" ON "public"."golf_coach_insights" IS 'Players can UPDATE their own insight rows, but column-level GRANTs restrict the writable surface to acknowledged_at + dismissed_at. Closes S-CRIT-2.';

CREATE POLICY "coach_weights_coach_only" ON "public"."golf_coachhelm_coach_weights" FOR SELECT TO "authenticated" USING (("coach_id" = "public"."current_coach_id"()));

CREATE POLICY "coachhelm_action_runs_coach_only" ON "public"."golf_coachhelm_action_runs" USING (("coach_id" = "public"."current_coach_id"())) WITH CHECK (("coach_id" = "public"."current_coach_id"()));

CREATE POLICY "drill_attachments_read_via_insight" ON "public"."golf_insight_drill_attachments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coach_insights" "gci"
  WHERE ("gci"."id" = "golf_insight_drill_attachments"."insight_id"))));

CREATE POLICY "drills_read_all_authenticated" ON "public"."golf_drills" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "effectiveness_insert_service" ON "public"."golf_insight_effectiveness" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "effectiveness_select_admin" ON "public"."golf_insight_effectiveness" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "effectiveness_select_team_coach" ON "public"."golf_insight_effectiveness" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "focus_areas_select_coach" ON "public"."golf_player_focus_areas" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "genome_coach_read" ON "public"."golf_player_genome" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "tm"
  WHERE (("tm"."player_id" = "golf_player_genome"."player_id") AND ("tm"."status" = 'active'::"public"."team_member_status") AND "public"."is_team_coach"("tm"."team_id")))));

CREATE POLICY "genome_player_read" ON "public"."golf_player_genome" FOR SELECT TO "authenticated" USING (("player_id" = "public"."current_player_id"()));

CREATE POLICY "global_patterns_select_authed" ON "public"."golf_global_patterns" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "global_patterns_write_service" ON "public"."golf_global_patterns" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "goal_suggestions_player_own" ON "public"."golf_goal_suggestions" TO "authenticated" USING (("player_id" = "public"."current_player_id"()));

CREATE POLICY "goals_coach_create" ON "public"."golf_goals" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_coach"("team_id") AND ("creator_role" = 'coach'::"text") AND ("coach_id_if_assigned" = "public"."current_coach_id"())));

CREATE POLICY "goals_coach_view" ON "public"."golf_goals" FOR SELECT TO "authenticated" USING (("public"."is_team_coach"("team_id") AND (("creator_role" = 'coach'::"text") OR ("shared_with_coach" = true))));

CREATE POLICY "goals_player_own" ON "public"."golf_goals" TO "authenticated" USING (("player_id" = "public"."current_player_id"()));

CREATE POLICY "golf_acks_insert_own" ON "public"."golf_announcement_acknowledgements" FOR INSERT TO "authenticated" WITH CHECK (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_acks_select_coaches" ON "public"."golf_announcement_acknowledgements" FOR SELECT TO "authenticated" USING (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_acks_select_own" ON "public"."golf_announcement_acknowledgements" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_ann_documents_delete_coaches" ON "public"."golf_announcement_documents" FOR DELETE TO "authenticated" USING (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_ann_documents_insert_coaches" ON "public"."golf_announcement_documents" FOR INSERT TO "authenticated" WITH CHECK (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_ann_recipients_delete_coaches" ON "public"."golf_announcement_recipients" FOR DELETE TO "authenticated" USING (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_ann_recipients_insert_coaches" ON "public"."golf_announcement_recipients" FOR INSERT TO "authenticated" WITH CHECK (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_ann_recipients_select_coaches" ON "public"."golf_announcement_recipients" FOR SELECT TO "authenticated" USING (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_ann_recipients_select_own" ON "public"."golf_announcement_recipients" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "golf_players"."id"
   FROM "public"."golf_players"
  WHERE ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_ann_tasks_delete_coaches" ON "public"."golf_announcement_tasks" FOR DELETE TO "authenticated" USING (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_ann_tasks_insert_coaches" ON "public"."golf_announcement_tasks" FOR INSERT TO "authenticated" WITH CHECK (("announcement_id" IN ( SELECT "golf_announcements"."id"
   FROM "public"."golf_announcements"
  WHERE ("golf_announcements"."team_id" IN ( SELECT "golf_announcements"."team_id"
           FROM "public"."golf_coaches"
          WHERE ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_calendar_feeds_delete_own" ON "public"."golf_calendar_feeds" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_calendar_feeds_insert_own_team" ON "public"."golf_calendar_feeds" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("team_id" IS NULL) OR "public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id"))));

CREATE POLICY "golf_calendar_feeds_select_own" ON "public"."golf_calendar_feeds" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_calendar_feeds_update_own_team" ON "public"."golf_calendar_feeds" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("team_id" IS NULL) OR "public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id"))));

CREATE POLICY "golf_calendar_notifications_insert_own" ON "public"."golf_calendar_notifications" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("user_id" IN ( SELECT "gp"."user_id"
   FROM ((("public"."golf_players" "gp"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gp"."id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gtm"."status" = 'active'::"public"."team_member_status"))))));

CREATE POLICY "golf_calendar_notifications_insert_policy" ON "public"."golf_calendar_notifications" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ((("public"."golf_coaches" "gc"
     JOIN "public"."golf_teams" "gt" ON (("gt"."organization_id" = "gc"."organization_id")))
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."team_id" = "gt"."id")))
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gtm"."player_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gp"."user_id" = "golf_calendar_notifications"."user_id") AND ("gtm"."status" = 'active'::"public"."team_member_status"))))));

CREATE POLICY "golf_causal_relationships_select_coach" ON "public"."golf_causal_relationships" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gp"."id"
   FROM ((("public"."golf_players" "gp"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gp"."id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_causal_relationships_select_player" ON "public"."golf_causal_relationships" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gp"."id"
   FROM "public"."golf_players" "gp"
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_causal_relationships_service_role_all" ON "public"."golf_causal_relationships" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "golf_classes_select_coaches" ON "public"."golf_player_classes" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "golf_coach_philosophy_delete_coach" ON "public"."golf_coach_philosophy" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coach_philosophy"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_coach_philosophy_insert_coach" ON "public"."golf_coach_philosophy" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coach_philosophy"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_coach_philosophy_select_coach" ON "public"."golf_coach_philosophy" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coach_philosophy"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_coach_philosophy_update_coach" ON "public"."golf_coach_philosophy" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coach_philosophy"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_coaches_delete_own" ON "public"."golf_coaches" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_coaches_insert_own" ON "public"."golf_coaches" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_coaches_select" ON "public"."golf_coaches" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."shares_my_golf_organization"("organization_id")));

CREATE POLICY "golf_coaches_update_own" ON "public"."golf_coaches" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_coachhelm_settings_delete_coach" ON "public"."golf_coachhelm_settings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coachhelm_settings"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_coachhelm_settings_insert_coach" ON "public"."golf_coachhelm_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coachhelm_settings"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_coachhelm_settings_select_coach" ON "public"."golf_coachhelm_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coachhelm_settings"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_coachhelm_settings_update_coach" ON "public"."golf_coachhelm_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_coachhelm_settings"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_confidence_calibration_admin_read_all" ON "public"."golf_confidence_calibration" FOR SELECT USING ("public"."is_admin"());

CREATE POLICY "golf_confidence_calibration_service_role_all" ON "public"."golf_confidence_calibration" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "golf_conversations_insert_v2" ON "public"."golf_conversations" FOR INSERT WITH CHECK ((("team_id" IS NULL) OR "public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id")));

CREATE POLICY "golf_conversations_select_v2" ON "public"."golf_conversations" FOR SELECT USING ((("id" IN ( SELECT "public"."user_conversation_ids"(( SELECT "auth"."uid"() AS "uid")) AS "user_conversation_ids")) OR ((("is_team_chat" = true) OR ("is_team_channel" = true)) AND "public"."is_golf_team_coach"("team_id")) OR ((("is_team_chat" = true) OR ("is_team_channel" = true)) AND "public"."is_golf_team_player"("team_id"))));

CREATE POLICY "golf_conversations_update_v2" ON "public"."golf_conversations" FOR UPDATE USING (("id" IN ( SELECT "public"."user_conversation_ids"(( SELECT "auth"."uid"() AS "uid")) AS "user_conversation_ids"))) WITH CHECK (("id" IN ( SELECT "public"."user_conversation_ids"(( SELECT "auth"."uid"() AS "uid")) AS "user_conversation_ids")));

CREATE POLICY "golf_course_edit_history_insert" ON "public"."golf_course_edit_history" FOR INSERT TO "authenticated" WITH CHECK (("edited_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_course_edit_history_select" ON "public"."golf_course_edit_history" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_course_tee_edit_history_insert" ON "public"."golf_course_tee_edit_history" FOR INSERT TO "authenticated" WITH CHECK (("edited_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_course_tee_edit_history_select" ON "public"."golf_course_tee_edit_history" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_course_tee_holes_delete" ON "public"."golf_course_tee_holes" FOR DELETE TO "authenticated" USING (("public"."is_golf_coach"() OR "public"."is_super_admin"()));

CREATE POLICY "golf_course_tee_holes_insert" ON "public"."golf_course_tee_holes" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "golf_course_tee_holes_select" ON "public"."golf_course_tee_holes" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_course_tee_holes_update" ON "public"."golf_course_tee_holes" FOR UPDATE TO "authenticated" USING (("public"."is_golf_coach"() OR "public"."is_super_admin"())) WITH CHECK (("public"."is_golf_coach"() OR "public"."is_super_admin"()));

CREATE POLICY "golf_course_tees_insert" ON "public"."golf_course_tees" FOR INSERT TO "authenticated" WITH CHECK (("created_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_course_tees_select" ON "public"."golf_course_tees" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_course_tees_update" ON "public"."golf_course_tees" FOR UPDATE TO "authenticated" USING (("public"."is_golf_coach"() OR "public"."is_super_admin"())) WITH CHECK ((("public"."is_golf_coach"() OR "public"."is_super_admin"()) AND ("last_edited_by_user_id" = "auth"."uid"())));

CREATE POLICY "golf_courses_insert_authenticated" ON "public"."golf_courses" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));

CREATE POLICY "golf_courses_select_all" ON "public"."golf_courses" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_courses_update_authenticated" ON "public"."golf_courses" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("public"."is_super_admin"() OR (("created_by_user_id" IS NOT NULL) AND "public"."is_golf_coach"())))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."is_super_admin"() OR (("created_by_user_id" IS NOT NULL) AND "public"."is_golf_coach"()))));

CREATE POLICY "golf_demo_sessions_deny_all" ON "public"."golf_demo_sessions" AS RESTRICTIVE USING (false) WITH CHECK (false);

CREATE POLICY "golf_documents_delete_coach" ON "public"."golf_documents" FOR DELETE USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_documents_insert_coach" ON "public"."golf_documents" FOR INSERT WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_documents_select_team" ON "public"."golf_documents" FOR SELECT USING (("public"."is_golf_team_coach"("team_id") OR ("public"."is_golf_team_player"("team_id") AND ("is_public" = true))));

CREATE POLICY "golf_documents_update_coach" ON "public"."golf_documents" FOR UPDATE USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_event_attendance_delete_coach" ON "public"."golf_event_attendance" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_attendance"."event_id") AND "public"."is_golf_team_coach"("e"."team_id")))));

CREATE POLICY "golf_event_attendance_insert_coach" ON "public"."golf_event_attendance" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_attendance"."event_id") AND "public"."is_golf_team_coach"("e"."team_id")))));

CREATE POLICY "golf_event_attendance_insert_self" ON "public"."golf_event_attendance" FOR INSERT TO "authenticated" WITH CHECK ((("player_id" IN ( SELECT "gp"."id"
   FROM "public"."golf_players" "gp"
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND (EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_attendance"."event_id") AND "public"."is_golf_team_player"("e"."team_id"))))));

CREATE POLICY "golf_event_attendance_select_team" ON "public"."golf_event_attendance" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_attendance"."event_id") AND ("public"."is_golf_team_coach"("e"."team_id") OR "public"."is_golf_team_player"("e"."team_id"))))));

CREATE POLICY "golf_event_attendance_update_coach_or_player" ON "public"."golf_event_attendance" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_attendance"."event_id") AND ("public"."is_golf_team_coach"("e"."team_id") OR ("public"."is_golf_team_player"("e"."team_id") AND ("golf_event_attendance"."player_id" IN ( SELECT "gp"."id"
           FROM "public"."golf_players" "gp"
          WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))))));

CREATE POLICY "golf_event_documents_delete_coach" ON "public"."golf_event_documents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_documents"."event_id") AND "public"."is_golf_team_coach"("e"."team_id")))));

CREATE POLICY "golf_event_documents_insert_coach" ON "public"."golf_event_documents" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_documents"."event_id") AND "public"."is_golf_team_coach"("e"."team_id")))));

CREATE POLICY "golf_event_documents_select_team" ON "public"."golf_event_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."golf_events" "e"
  WHERE (("e"."id" = "golf_event_documents"."event_id") AND ("public"."is_golf_team_coach"("e"."team_id") OR "public"."is_golf_team_player"("e"."team_id"))))));

CREATE POLICY "golf_events_delete_coach" ON "public"."golf_events" FOR DELETE USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_events_insert_coach" ON "public"."golf_events" FOR INSERT WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_events_select_team" ON "public"."golf_events" FOR SELECT USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id")));

CREATE POLICY "golf_events_update_coach" ON "public"."golf_events" FOR UPDATE USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_holes_delete" ON "public"."golf_holes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE (("gr"."id" = "golf_holes"."round_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_holes_delete_coach" ON "public"."golf_holes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_holes"."round_id") AND ("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_head_coach"("gr"."team_id")))));

CREATE POLICY "golf_holes_insert" ON "public"."golf_holes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE (("gr"."id" = "golf_holes"."round_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_holes_insert_coach" ON "public"."golf_holes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_holes"."round_id") AND ("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("gr"."team_id")))));

CREATE POLICY "golf_holes_select" ON "public"."golf_holes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_holes"."round_id") AND ((EXISTS ( SELECT 1
           FROM "public"."golf_players"
          WHERE (("golf_players"."id" = "gr"."player_id") AND ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("gr"."team_id")) OR (("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_player"("gr"."team_id")))))));

CREATE POLICY "golf_holes_select_team" ON "public"."golf_holes" FOR SELECT TO "authenticated" USING (("round_id" IN ( SELECT "gr"."id"
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("gr"."team_id")))));

CREATE POLICY "golf_holes_update" ON "public"."golf_holes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE (("gr"."id" = "golf_holes"."round_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_holes_update_coach" ON "public"."golf_holes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_holes"."round_id") AND ("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("gr"."team_id")))));

CREATE POLICY "golf_holes_update_team" ON "public"."golf_holes" FOR UPDATE TO "authenticated" USING (("round_id" IN ( SELECT "gr"."id"
   FROM ((("public"."golf_rounds" "gr"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gr"."player_id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gtm"."status" = 'active'::"public"."team_member_status"))))) WITH CHECK (("round_id" IN ( SELECT "gr"."id"
   FROM ((("public"."golf_rounds" "gr"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gr"."player_id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gtm"."status" = 'active'::"public"."team_member_status")))));

CREATE POLICY "golf_insight_action_coach_select_team" ON "public"."golf_insight_action" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_insight_action"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "golf_insight_action_player_select_own" ON "public"."golf_insight_action" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_insight_action"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_insight_exposure_coach_select_team" ON "public"."golf_insight_exposure" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_insight_exposure"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "golf_insight_exposure_player_select_own" ON "public"."golf_insight_exposure" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_insight_exposure"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_insight_outcome_coach_select_team" ON "public"."golf_insight_outcome" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_insight_outcome"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "golf_insight_outcome_player_select_own" ON "public"."golf_insight_outcome" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_insight_outcome"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_message_mentions_insert" ON "public"."golf_message_mentions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_mentions"."message_id") AND ("m"."sender_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_message_mentions_select" ON "public"."golf_message_mentions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_mentions"."message_id") AND "public"."golf_conversation_has_me"("m"."conversation_id")))));

CREATE POLICY "golf_message_reactions_delete" ON "public"."golf_message_reactions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_message_reactions_insert" ON "public"."golf_message_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_reactions"."message_id") AND "public"."golf_conversation_has_me"("m"."conversation_id"))))));

CREATE POLICY "golf_message_reactions_select" ON "public"."golf_message_reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_reactions"."message_id") AND "public"."golf_conversation_has_me"("m"."conversation_id")))));

CREATE POLICY "golf_message_responses_delete" ON "public"."golf_message_responses" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_message_responses_insert" ON "public"."golf_message_responses" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_responses"."message_id") AND "public"."golf_conversation_has_me"("m"."conversation_id"))))));

CREATE POLICY "golf_message_responses_select" ON "public"."golf_message_responses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_messages" "m"
  WHERE (("m"."id" = "golf_message_responses"."message_id") AND "public"."golf_conversation_has_me"("m"."conversation_id")))));

CREATE POLICY "golf_message_responses_update" ON "public"."golf_message_responses" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_messages_delete" ON "public"."golf_messages" FOR DELETE TO "authenticated" USING (("sender_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_messages_insert_v2" ON "public"."golf_messages" FOR INSERT WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("conversation_id" IN ( SELECT "public"."user_conversation_ids"(( SELECT "auth"."uid"() AS "uid")) AS "user_conversation_ids"))));

CREATE POLICY "golf_messages_select_v2" ON "public"."golf_messages" FOR SELECT USING (("conversation_id" IN ( SELECT "public"."user_conversation_ids"(( SELECT "auth"."uid"() AS "uid")) AS "user_conversation_ids")));

CREATE POLICY "golf_messages_update_v2" ON "public"."golf_messages" FOR UPDATE USING (("sender_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("sender_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_metrics_authenticated_read" ON "public"."golf_metrics" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_participants_delete" ON "public"."golf_conversation_participants" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_participants_insert_v2" ON "public"."golf_conversation_participants" FOR INSERT WITH CHECK (((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("public"."golf_conversation_created_by_me"("conversation_id") OR (EXISTS ( SELECT 1
   FROM "public"."golf_conversations" "c"
  WHERE (("c"."id" = "golf_conversation_participants"."conversation_id") AND ("c"."is_team_chat" = true) AND ("c"."team_id" IS NOT NULL) AND "public"."golf_conversation_on_my_team"("golf_conversation_participants"."conversation_id")))))) OR ((EXISTS ( SELECT 1
   FROM "public"."golf_conversations" "gc"
  WHERE (("gc"."id" = "golf_conversation_participants"."conversation_id") AND ("gc"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))) AND (NOT "public"."golf_conversation_has_other_participant"("conversation_id")))));

CREATE POLICY "golf_participants_select_v2" ON "public"."golf_conversation_participants" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("conversation_id" IN ( SELECT "public"."user_conversation_ids"(( SELECT "auth"."uid"() AS "uid")) AS "user_conversation_ids"))));

CREATE POLICY "golf_participants_update" ON "public"."golf_conversation_participants" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_pga_standards_authenticated_read" ON "public"."golf_pga_standards" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_platform_metrics_daily_admin_read" ON "public"."golf_platform_metrics_daily" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "golf_platform_metrics_daily_service_write" ON "public"."golf_platform_metrics_daily" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "golf_player_classes_delete_player" ON "public"."golf_player_classes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_classes"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_player_classes_insert_player" ON "public"."golf_player_classes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_classes"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_player_classes_select_team" ON "public"."golf_player_classes" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_classes"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_player_classes"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id"))))));

CREATE POLICY "golf_player_classes_update_player" ON "public"."golf_player_classes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_classes"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_player_focus_areas_delete_coach" ON "public"."golf_player_focus_areas" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_player_focus_areas"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "golf_player_focus_areas_insert_coach" ON "public"."golf_player_focus_areas" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_player_focus_areas"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "golf_player_focus_areas_select_team" ON "public"."golf_player_focus_areas" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_focus_areas"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_player_focus_areas"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id"))))));

CREATE POLICY "golf_player_focus_areas_update_coach" ON "public"."golf_player_focus_areas" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_player_focus_areas"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "golf_player_focus_areas_update_player" ON "public"."golf_player_focus_areas" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_focus_areas"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_player_focus_areas"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_player_standing_coach_read" ON "public"."golf_player_standing" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "m"
  WHERE (("m"."player_id" = "golf_player_standing"."player_id") AND "public"."is_team_coach"("m"."team_id")))));

CREATE POLICY "golf_player_standing_player_read" ON "public"."golf_player_standing" FOR SELECT TO "authenticated" USING (("player_id" = "public"."current_player_id"()));

CREATE POLICY "golf_players_insert_own" ON "public"."golf_players" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_players_select" ON "public"."golf_players" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_is_coach_of_golf_player"("id") OR "public"."user_has_pending_join_request_to_coach_team"("id") OR "public"."user_is_teammate_of_golf_player"("id")));

CREATE POLICY "golf_players_update_own" ON "public"."golf_players" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "golf_prediction_model_performance_select" ON "public"."golf_prediction_model_performance" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "golf_qualifier_entries_delete_coach" ON "public"."golf_qualifier_entries" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_entries"."qualifier_id") AND "public"."is_golf_team_coach"("q"."team_id")))));

CREATE POLICY "golf_qualifier_entries_insert_coach" ON "public"."golf_qualifier_entries" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_entries"."qualifier_id") AND "public"."is_golf_team_coach"("q"."team_id")))));

CREATE POLICY "golf_qualifier_entries_select_team" ON "public"."golf_qualifier_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_entries"."qualifier_id") AND ("public"."is_golf_team_coach"("q"."team_id") OR "public"."is_golf_team_player"("q"."team_id"))))));

CREATE POLICY "golf_qualifier_entries_update_coach" ON "public"."golf_qualifier_entries" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_entries"."qualifier_id") AND "public"."is_golf_team_coach"("q"."team_id")))));

CREATE POLICY "golf_qualifier_round_courses_delete_coach" ON "public"."golf_qualifier_round_courses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_round_courses"."qualifier_id") AND "public"."is_golf_team_coach"("q"."team_id")))));

CREATE POLICY "golf_qualifier_round_courses_insert_coach" ON "public"."golf_qualifier_round_courses" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_round_courses"."qualifier_id") AND "public"."is_golf_team_coach"("q"."team_id")))));

CREATE POLICY "golf_qualifier_round_courses_select_team" ON "public"."golf_qualifier_round_courses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_round_courses"."qualifier_id") AND ("public"."is_golf_team_coach"("q"."team_id") OR "public"."is_golf_team_player"("q"."team_id"))))));

CREATE POLICY "golf_qualifier_round_courses_update_coach" ON "public"."golf_qualifier_round_courses" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_round_courses"."qualifier_id") AND "public"."is_golf_team_coach"("q"."team_id")))));

CREATE POLICY "golf_qualifiers_delete_coach" ON "public"."golf_qualifiers" FOR DELETE USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_qualifiers_insert_coach" ON "public"."golf_qualifiers" FOR INSERT WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_qualifiers_select_team" ON "public"."golf_qualifiers" FOR SELECT USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id")));

CREATE POLICY "golf_qualifiers_update_coach" ON "public"."golf_qualifiers" FOR UPDATE USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_recruit_documents_delete_coach" ON "public"."golf_recruit_documents" FOR DELETE TO "authenticated" USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_recruit_documents_insert_coach" ON "public"."golf_recruit_documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_recruit_documents_select_coach" ON "public"."golf_recruit_documents" FOR SELECT TO "authenticated" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_admin"()));

CREATE POLICY "golf_recruit_documents_update_coach" ON "public"."golf_recruit_documents" FOR UPDATE TO "authenticated" USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_recruits_delete_coach" ON "public"."golf_recruits" FOR DELETE USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_recruits_insert_coach" ON "public"."golf_recruits" FOR INSERT WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_recruits_select_coach" ON "public"."golf_recruits" FOR SELECT USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_recruits_update_coach" ON "public"."golf_recruits" FOR UPDATE USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_rounds_delete" ON "public"."golf_rounds" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players"
  WHERE (("golf_players"."id" = "golf_rounds"."player_id") AND ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_rounds_delete_coach" ON "public"."golf_rounds" FOR DELETE USING ((("team_id" IS NOT NULL) AND "public"."is_golf_team_head_coach"("team_id")));

CREATE POLICY "golf_rounds_insert" ON "public"."golf_rounds" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players"
  WHERE (("golf_players"."id" = "golf_rounds"."player_id") AND ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_rounds_insert_coach" ON "public"."golf_rounds" FOR INSERT WITH CHECK ((("team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("team_id")));

CREATE POLICY "golf_rounds_select" ON "public"."golf_rounds" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."golf_players"
  WHERE (("golf_players"."id" = "golf_rounds"."player_id") AND ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (("team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("team_id")) OR (("team_id" IS NOT NULL) AND "public"."is_golf_team_player"("team_id"))));

CREATE POLICY "golf_rounds_select_team" ON "public"."golf_rounds" FOR SELECT TO "authenticated" USING ((("team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("team_id")));

CREATE POLICY "golf_rounds_update" ON "public"."golf_rounds" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players"
  WHERE (("golf_players"."id" = "golf_rounds"."player_id") AND ("golf_players"."user_id" = "auth"."uid"()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."golf_players"
  WHERE (("golf_players"."id" = "golf_rounds"."player_id") AND ("golf_players"."user_id" = "auth"."uid"())))) AND (("team_id" IS NULL) OR "public"."is_golf_team_player"("team_id"))));

COMMENT ON POLICY "golf_rounds_update" ON "public"."golf_rounds" IS 'Player may update their own round. WITH CHECK pins the resulting team_id to a team they actually play for. Present in production since before 2026-08-08 but absent from every migration until now.';

CREATE POLICY "golf_rounds_update_coach" ON "public"."golf_rounds" FOR UPDATE USING ((("team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("team_id")));

CREATE POLICY "golf_rounds_update_team" ON "public"."golf_rounds" FOR UPDATE TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM (("public"."golf_team_members" "gtm"
     JOIN "public"."golf_team_coach_staff" "gtcs" ON (("gtcs"."team_id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."id" = "gtcs"."coach_id")))
  WHERE (("gc"."user_id" = "auth"."uid"()) AND ("gtm"."status" = 'active'::"public"."team_member_status"))))) WITH CHECK ((("player_id" IN ( SELECT "gtm"."player_id"
   FROM (("public"."golf_team_members" "gtm"
     JOIN "public"."golf_team_coach_staff" "gtcs" ON (("gtcs"."team_id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."id" = "gtcs"."coach_id")))
  WHERE (("gc"."user_id" = "auth"."uid"()) AND ("gtm"."status" = 'active'::"public"."team_member_status")))) AND (("team_id" IS NULL) OR "public"."is_golf_team_coach"("team_id"))));

COMMENT ON POLICY "golf_rounds_update_team" ON "public"."golf_rounds" IS 'Coach may update a round for a player on a team they staff. WITH CHECK also pins the resulting team_id to a team the coach staffs, so a round cannot be moved onto another squad''s books (added 2026-08-08).';

CREATE POLICY "golf_shots_delete" ON "public"."golf_shots" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE (("gr"."id" = "golf_shots"."round_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_shots_delete_coach" ON "public"."golf_shots" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_shots"."round_id") AND ("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_head_coach"("gr"."team_id")))));

CREATE POLICY "golf_shots_delete_own" ON "public"."golf_shots" FOR DELETE TO "authenticated" USING ((("hole_id" IN ( SELECT "gh"."id"
   FROM (("public"."golf_holes" "gh"
     JOIN "public"."golf_rounds" "gr" ON (("gr"."id" = "gh"."round_id")))
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("round_id" IN ( SELECT "gr"."id"
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_shots_insert" ON "public"."golf_shots" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE (("gr"."id" = "golf_shots"."round_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_shots_insert_coach" ON "public"."golf_shots" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_shots"."round_id") AND ("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("gr"."team_id")))));

CREATE POLICY "golf_shots_insert_own" ON "public"."golf_shots" FOR INSERT TO "authenticated" WITH CHECK ((("hole_id" IN ( SELECT "gh"."id"
   FROM (("public"."golf_holes" "gh"
     JOIN "public"."golf_rounds" "gr" ON (("gr"."id" = "gh"."round_id")))
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("round_id" IN ( SELECT "gr"."id"
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_shots_select" ON "public"."golf_shots" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_shots"."round_id") AND ((EXISTS ( SELECT 1
           FROM "public"."golf_players"
          WHERE (("golf_players"."id" = "gr"."player_id") AND ("golf_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("gr"."team_id")) OR (("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_player"("gr"."team_id")))))));

CREATE POLICY "golf_shots_update" ON "public"."golf_shots" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE (("gr"."id" = "golf_shots"."round_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_shots_update_coach" ON "public"."golf_shots" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_rounds" "gr"
  WHERE (("gr"."id" = "golf_shots"."round_id") AND ("gr"."team_id" IS NOT NULL) AND "public"."is_golf_team_coach"("gr"."team_id")))));

CREATE POLICY "golf_shots_update_own" ON "public"."golf_shots" FOR UPDATE TO "authenticated" USING ((("hole_id" IN ( SELECT "gh"."id"
   FROM (("public"."golf_holes" "gh"
     JOIN "public"."golf_rounds" "gr" ON (("gr"."id" = "gh"."round_id")))
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("round_id" IN ( SELECT "gr"."id"
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((("hole_id" IN ( SELECT "gh"."id"
   FROM (("public"."golf_holes" "gh"
     JOIN "public"."golf_rounds" "gr" ON (("gr"."id" = "gh"."round_id")))
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("round_id" IN ( SELECT "gr"."id"
   FROM ("public"."golf_rounds" "gr"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gr"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_shots_update_team" ON "public"."golf_shots" FOR UPDATE TO "authenticated" USING (("hole_id" IN ( SELECT "gh"."id"
   FROM (((("public"."golf_holes" "gh"
     JOIN "public"."golf_rounds" "gr" ON (("gr"."id" = "gh"."round_id")))
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gr"."player_id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gtm"."status" = 'active'::"public"."team_member_status"))))) WITH CHECK (("hole_id" IN ( SELECT "gh"."id"
   FROM (((("public"."golf_holes" "gh"
     JOIN "public"."golf_rounds" "gr" ON (("gr"."id" = "gh"."round_id")))
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gr"."player_id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gtm"."status" = 'active'::"public"."team_member_status")))));

CREATE POLICY "golf_staff_invite_codes_select" ON "public"."golf_staff_invite_codes" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_head_coach"("team_id"));

CREATE POLICY "golf_staff_invite_redemptions_select" ON "public"."golf_staff_invite_redemptions" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_head_coach"("team_id"));

CREATE POLICY "golf_task_assignments_coach_all" ON "public"."golf_task_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_tasks" "t"
  WHERE (("t"."id" = "golf_task_assignments"."task_id") AND "public"."is_golf_team_coach"("t"."team_id")))));

CREATE POLICY "golf_task_assignments_player_insert" ON "public"."golf_task_assignments" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_task_assignments"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND (EXISTS ( SELECT 1
   FROM ("public"."golf_tasks" "t"
     JOIN "public"."golf_team_members" "tm" ON (("tm"."team_id" = "t"."team_id")))
  WHERE (("t"."id" = "golf_task_assignments"."task_id") AND ("tm"."player_id" = "golf_task_assignments"."player_id") AND ("tm"."status" = 'active'::"public"."team_member_status"))))));

CREATE POLICY "golf_task_assignments_player_select" ON "public"."golf_task_assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_task_assignments"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_task_assignments_player_update" ON "public"."golf_task_assignments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_task_assignments"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_task_templates_delete_coaches" ON "public"."golf_task_templates" FOR DELETE TO "authenticated" USING (("team_id" IN ( SELECT "gt"."id"
   FROM ("public"."golf_teams" "gt"
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_task_templates_insert_coaches" ON "public"."golf_task_templates" FOR INSERT TO "authenticated" WITH CHECK (("team_id" IN ( SELECT "gt"."id"
   FROM ("public"."golf_teams" "gt"
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_task_templates_select_coaches" ON "public"."golf_task_templates" FOR SELECT TO "authenticated" USING (("team_id" IN ( SELECT "gt"."id"
   FROM ("public"."golf_teams" "gt"
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_task_templates_select_players" ON "public"."golf_task_templates" FOR SELECT TO "authenticated" USING (("team_id" IN ( SELECT "gtm"."team_id"
   FROM ("public"."golf_team_members" "gtm"
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gtm"."player_id")))
  WHERE ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_task_templates_update_coaches" ON "public"."golf_task_templates" FOR UPDATE TO "authenticated" USING (("team_id" IN ( SELECT "gt"."id"
   FROM ("public"."golf_teams" "gt"
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("team_id" IN ( SELECT "gt"."id"
   FROM ("public"."golf_teams" "gt"
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "golf_tasks_delete_coach" ON "public"."golf_tasks" FOR DELETE USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_tasks_insert_coach" ON "public"."golf_tasks" FOR INSERT WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_tasks_select_team" ON "public"."golf_tasks" FOR SELECT USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id")));

CREATE POLICY "golf_tasks_update_coach" ON "public"."golf_tasks" FOR UPDATE USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_team_coach_staff_delete" ON "public"."golf_team_coach_staff" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."id" = "golf_team_coach_staff"."coach_id") AND ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_team_coach_staff_insert" ON "public"."golf_team_coach_staff" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_golf_team_head_coach"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."id" = "golf_team_coach_staff"."coach_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "golf_team_coach_staff_select" ON "public"."golf_team_coach_staff" FOR SELECT TO "authenticated" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id")));

CREATE POLICY "golf_team_members_delete_coach" ON "public"."golf_team_members" FOR DELETE TO "authenticated" USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_team_members_insert_coach" ON "public"."golf_team_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_team_members_select_v5" ON "public"."golf_team_members" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."golf_team_coach_staff" "gtcs"
     JOIN "public"."golf_coaches" "gc" ON (("gc"."id" = "gtcs"."coach_id")))
  WHERE (("gtcs"."team_id" = "golf_team_members"."team_id") AND ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR ("team_id" IN ( SELECT "public"."get_current_player_team_ids"() AS "get_current_player_team_ids"))));

CREATE POLICY "golf_team_members_update_coach" ON "public"."golf_team_members" FOR UPDATE TO "authenticated" USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_team_saved_courses_select" ON "public"."golf_team_saved_courses" FOR SELECT TO "authenticated" USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id")));

CREATE POLICY "golf_team_saved_courses_write" ON "public"."golf_team_saved_courses" TO "authenticated" USING ("public"."is_golf_team_coach"("team_id")) WITH CHECK ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "golf_teams_delete_coach" ON "public"."golf_teams" FOR DELETE USING ("public"."is_golf_team_coach"("id"));

CREATE POLICY "golf_teams_delete_creator" ON "public"."golf_teams" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."id" = "golf_teams"."created_by") AND ("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "golf_teams_insert_coaches" ON "public"."golf_teams" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gc"."organization_id" = "golf_teams"."organization_id")))));

CREATE POLICY "golf_teams_select" ON "public"."golf_teams" FOR SELECT TO "authenticated" USING (("public"."is_golf_team_coach"("id") OR "public"."is_golf_team_player"("id")));

CREATE POLICY "golf_teams_update_coach" ON "public"."golf_teams" FOR UPDATE TO "authenticated" USING ("public"."is_golf_team_coach"("id")) WITH CHECK (("public"."is_golf_team_coach"("id") AND (EXISTS ( SELECT 1
   FROM "public"."golf_coaches" "gc"
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gc"."organization_id" = "golf_teams"."organization_id"))))));

CREATE POLICY "golf_travel_budgets_coach_all" ON "public"."golf_travel_budgets" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_travel_itineraries" "gti"
     JOIN "public"."golf_coaches" "gc" ON ((EXISTS ( SELECT 1
           FROM "public"."golf_teams" "gt"
          WHERE (("gt"."organization_id" = "gc"."organization_id") AND ("gt"."id" = "gti"."team_id"))))))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gti"."id" = "golf_travel_budgets"."itinerary_id")))));

CREATE POLICY "golf_travel_budgets_player_select" ON "public"."golf_travel_budgets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."golf_travel_itineraries" "gti"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."team_id" = "gti"."team_id")))
     JOIN "public"."golf_players" "gp" ON (("gp"."id" = "gtm"."player_id")))
  WHERE (("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gti"."id" = "golf_travel_budgets"."itinerary_id")))));

CREATE POLICY "golf_travel_expenses_coach_all" ON "public"."golf_travel_expenses" USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_coaches" "gc"
     JOIN "public"."golf_teams" "gt" ON (("gt"."organization_id" = "gc"."organization_id")))
  WHERE (("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gt"."id" = "golf_travel_expenses"."team_id")))));

CREATE POLICY "golf_travel_expenses_player_select" ON "public"."golf_travel_expenses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."golf_players" "gp"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gp"."id")))
  WHERE (("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("gtm"."team_id" = "golf_travel_expenses"."team_id")))));

CREATE POLICY "ingest_connections_player_only" ON "public"."golf_ingest_connections" TO "authenticated" USING (("player_id" = "public"."current_player_id"())) WITH CHECK (("player_id" = "public"."current_player_id"()));

CREATE POLICY "ingest_sync_log_player_read" ON "public"."golf_ingest_sync_log" FOR SELECT TO "authenticated" USING (("player_id" = "public"."current_player_id"()));

CREATE POLICY "intent_coach_only" ON "public"."golf_coach_player_intent" TO "authenticated" USING (("coach_id" = "public"."current_coach_id"())) WITH CHECK (("coach_id" = "public"."current_coach_id"()));

CREATE POLICY "ipf_coach_select_team" ON "public"."golf_insight_player_feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_insight_player_feedback"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "ipf_player_insert_own" ON "public"."golf_insight_player_feedback" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_insight_player_feedback"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "ipf_player_select_own" ON "public"."golf_insight_player_feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_insight_player_feedback"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "ipf_player_update_own" ON "public"."golf_insight_player_feedback" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_insight_player_feedback"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_insight_player_feedback"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "llm_budget_coach_read" ON "public"."golf_coachhelm_llm_budget" FOR SELECT TO "authenticated" USING (("coach_id" = "public"."current_coach_id"()));

CREATE POLICY "llm_calls_coach_read" ON "public"."golf_coachhelm_llm_calls" FOR SELECT TO "authenticated" USING (("coach_id" = "public"."current_coach_id"()));

CREATE POLICY "patterns_v2_insert_coach" ON "public"."golf_patterns_v2" FOR INSERT TO "authenticated" WITH CHECK (("player_id" IN ( SELECT "gp"."id"
   FROM ((("public"."golf_players" "gp"
     JOIN "public"."golf_team_members" "gtm" ON (("gtm"."player_id" = "gp"."id")))
     JOIN "public"."golf_teams" "gt" ON (("gt"."id" = "gtm"."team_id")))
     JOIN "public"."golf_coaches" "gc" ON (("gc"."organization_id" = "gt"."organization_id")))
  WHERE ("gc"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "patterns_v2_update_coach" ON "public"."golf_patterns_v2" FOR UPDATE TO "authenticated" USING (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE "public"."is_golf_team_coach"("gtm"."team_id")))) WITH CHECK (("player_id" IN ( SELECT "gtm"."player_id"
   FROM "public"."golf_team_members" "gtm"
  WHERE "public"."is_golf_team_coach"("gtm"."team_id"))));

CREATE POLICY "practice_sessions_coach_read" ON "public"."golf_practice_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "tm"
  WHERE (("tm"."player_id" = "golf_practice_sessions"."player_id") AND ("tm"."status" = 'active'::"public"."team_member_status") AND "public"."is_team_coach"("tm"."team_id")))));

CREATE POLICY "practice_sessions_player_only" ON "public"."golf_practice_sessions" TO "authenticated" USING (("player_id" = "public"."current_player_id"())) WITH CHECK (("player_id" = "public"."current_player_id"()));

CREATE POLICY "putt_details_delete_own" ON "public"."putt_details" FOR DELETE TO "authenticated" USING ("public"."owns_golf_shot"("shot_id"));

CREATE POLICY "putt_details_insert_own" ON "public"."putt_details" FOR INSERT TO "authenticated" WITH CHECK ("public"."owns_golf_shot"("shot_id"));

CREATE POLICY "putt_details_select" ON "public"."putt_details" FOR SELECT TO "authenticated" USING ("public"."can_read_golf_shot_detail"("shot_id"));

CREATE POLICY "putt_details_update_own" ON "public"."putt_details" FOR UPDATE TO "authenticated" USING ("public"."owns_golf_shot"("shot_id")) WITH CHECK ("public"."owns_golf_shot"("shot_id"));

CREATE POLICY "qualifier_selections_coach_write" ON "public"."golf_qualifier_selections" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_selections"."qualifier_id") AND "public"."is_team_coach"("q"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_selections"."qualifier_id") AND "public"."is_team_coach"("q"."team_id")))));

CREATE POLICY "qualifier_selections_player_read" ON "public"."golf_qualifier_selections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_qualifiers" "q"
  WHERE (("q"."id" = "golf_qualifier_selections"."qualifier_id") AND ("q"."selection_state" = 'selected'::"text") AND "public"."is_team_player"("q"."team_id")))));

CREATE POLICY "round_reviews_insert_coach" ON "public"."golf_round_reviews" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_round_reviews"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "round_reviews_select_coach" ON "public"."golf_round_reviews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_round_reviews"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "round_reviews_select_player" ON "public"."golf_round_reviews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_players" "gp"
  WHERE (("gp"."id" = "golf_round_reviews"."player_id") AND ("gp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "round_reviews_write_coach" ON "public"."golf_round_reviews" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_round_reviews"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."golf_team_members" "gtm"
  WHERE (("gtm"."player_id" = "golf_round_reviews"."player_id") AND ("gtm"."status" = 'active'::"public"."team_member_status") AND "public"."is_golf_team_coach"("gtm"."team_id")))));

CREATE POLICY "team_chs_settings_select_team" ON "public"."golf_team_coachhelm_settings" FOR SELECT TO "authenticated" USING ("public"."is_golf_team_coach"("team_id"));

CREATE POLICY "team_chs_settings_write_team" ON "public"."golf_team_coachhelm_settings" TO "authenticated" USING ("public"."is_golf_team_head_coach"("team_id")) WITH CHECK ("public"."is_golf_team_head_coach"("team_id"));

COMMENT ON POLICY "team_chs_settings_write_team" ON "public"."golf_team_coachhelm_settings" IS 'Only a head coach of the team may write team-level CoachHelm settings. Head-coach (not primary) so a program head can manage both teams; assistants stay locked out.';
