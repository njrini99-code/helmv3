CREATE POLICY "Coaches can delete games" ON "public"."baseball_games" FOR DELETE USING ("public"."is_baseball_team_coach_v2"("team_id"));

CREATE POLICY "Coaches can insert games" ON "public"."baseball_games" FOR INSERT WITH CHECK ("public"."is_baseball_team_coach_v2"("team_id"));

CREATE POLICY "Coaches can manage their own philosophy" ON "public"."baseball_coach_recruiting_philosophy" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."id" = "baseball_coach_recruiting_philosophy"."coach_id")))));

CREATE POLICY "Coaches can update games" ON "public"."baseball_games" FOR UPDATE USING ("public"."is_baseball_team_coach_v2"("team_id"));

CREATE POLICY "Players can view lineup positions" ON "public"."baseball_lineup_positions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."baseball_team_lineups" "l"
     JOIN "public"."baseball_team_members" "tm" ON (("tm"."team_id" = "l"."team_id")))
     JOIN "public"."baseball_players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("l"."id" = "baseball_lineup_positions"."lineup_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "Players can view their own stats" ON "public"."baseball_player_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."id" = "baseball_player_stats"."player_id")))));

CREATE POLICY "Players can view their team lineups" ON "public"."baseball_team_lineups" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseball_team_members" "tm"
     JOIN "public"."baseball_players" "p" ON (("p"."id" = "tm"."player_id")))
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tm"."team_id" = "baseball_team_lineups"."team_id")))));

CREATE POLICY "Players see own + coaches see team batting" ON "public"."baseball_box_score_batting" FOR SELECT USING ((("player_id" = ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1)) OR "public"."is_baseball_team_coach_v2"("team_id")));

CREATE POLICY "Players see own + coaches see team pitching" ON "public"."baseball_box_score_pitching" FOR SELECT USING ((("player_id" = ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1)) OR "public"."is_baseball_team_coach_v2"("team_id")));

CREATE POLICY "Players see own + coaches see team season stats" ON "public"."baseball_player_season_stats" FOR SELECT USING ((("player_id" = ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1)) OR "public"."is_baseball_team_coach_v2"("team_id")));

CREATE POLICY "System can manage percentiles" ON "public"."baseball_player_percentiles" TO "service_role" USING (true);

CREATE POLICY "Team members and coaches can view games" ON "public"."baseball_games" FOR SELECT USING (("public"."is_baseball_team_member_v2"("team_id") OR "public"."is_baseball_team_coach_v2"("team_id")));

CREATE POLICY "baseball_acad_elig_delete" ON "public"."baseball_academic_eligibility" FOR DELETE TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "btm"
  WHERE (("btm"."player_id" = "baseball_academic_eligibility"."player_id") AND "public"."is_baseball_team_coach"("btm"."team_id"))))));

CREATE POLICY "baseball_acad_elig_insert" ON "public"."baseball_academic_eligibility" FOR INSERT TO "authenticated" WITH CHECK (((("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "btm"
  WHERE (("btm"."player_id" = "baseball_academic_eligibility"."player_id") AND "public"."is_baseball_team_coach"("btm"."team_id"))))));

CREATE POLICY "baseball_acad_elig_select_coach" ON "public"."baseball_academic_eligibility" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "btm"
  WHERE (("btm"."player_id" = "baseball_academic_eligibility"."player_id") AND "public"."is_baseball_team_coach"("btm"."team_id")))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id"))));

CREATE POLICY "baseball_acad_elig_select_player" ON "public"."baseball_academic_eligibility" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_acad_elig_update" ON "public"."baseball_academic_eligibility" FOR UPDATE TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "btm"
  WHERE (("btm"."player_id" = "baseball_academic_eligibility"."player_id") AND "public"."is_baseball_team_coach"("btm"."team_id"))))));

CREATE POLICY "baseball_academic_eligibility_insert" ON "public"."baseball_academic_eligibility" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_view_academics'::"text"));

CREATE POLICY "baseball_academic_eligibility_select" ON "public"."baseball_academic_eligibility" FOR SELECT TO "authenticated" USING (("public"."has_baseball_staff_capability"("team_id", 'can_view_academics'::"text") OR ("player_id" = "public"."get_my_baseball_player_id"())));

CREATE POLICY "baseball_actions_delete" ON "public"."baseball_actions" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_actions_insert" ON "public"."baseball_actions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_actions_select" ON "public"."baseball_actions" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_actions_update" ON "public"."baseball_actions" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_aggregates_insert" ON "public"."baseball_player_aggregates" FOR INSERT TO "authenticated" WITH CHECK ((("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")));

CREATE POLICY "baseball_aggregates_select" ON "public"."baseball_player_aggregates" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_player_aggregates"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id"))));

CREATE POLICY "baseball_aggregates_update" ON "public"."baseball_player_aggregates" FOR UPDATE TO "authenticated" USING ((("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")));

CREATE POLICY "baseball_ai_audit_insert" ON "public"."baseball_ai_audit" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_ai_audit_select" ON "public"."baseball_ai_audit" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_ai_audit_update" ON "public"."baseball_ai_audit" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_ann_acks_insert" ON "public"."baseball_announcement_acknowledgements" FOR INSERT TO "authenticated" WITH CHECK (("player_id" = "public"."get_my_player_id"()));

CREATE POLICY "baseball_ann_acks_select_coach" ON "public"."baseball_announcement_acknowledgements" FOR SELECT TO "authenticated" USING (("announcement_id" IN ( SELECT "baseball_announcements"."id"
   FROM "public"."baseball_announcements"
  WHERE "public"."is_baseball_team_coach"("baseball_announcements"."team_id"))));

CREATE POLICY "baseball_ann_acks_select_player" ON "public"."baseball_announcement_acknowledgements" FOR SELECT TO "authenticated" USING (("player_id" = "public"."get_my_player_id"()));

CREATE POLICY "baseball_ann_recipients_delete" ON "public"."baseball_announcement_recipients" FOR DELETE TO "authenticated" USING ("public"."baseball_is_announcement_coach"("announcement_id"));

CREATE POLICY "baseball_ann_recipients_insert" ON "public"."baseball_announcement_recipients" FOR INSERT TO "authenticated" WITH CHECK ("public"."baseball_is_announcement_coach"("announcement_id"));

CREATE POLICY "baseball_ann_recipients_select_coach" ON "public"."baseball_announcement_recipients" FOR SELECT TO "authenticated" USING ("public"."baseball_is_announcement_coach"("announcement_id"));

CREATE POLICY "baseball_ann_recipients_select_player" ON "public"."baseball_announcement_recipients" FOR SELECT TO "authenticated" USING (("player_id" = "public"."get_my_player_id"()));

CREATE POLICY "baseball_announcements_delete" ON "public"."baseball_announcements" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_announcements_insert" ON "public"."baseball_announcements" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_announcements_select_coach" ON "public"."baseball_announcements" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_announcements_select_player" ON "public"."baseball_announcements" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_member"("team_id") AND ((NOT "public"."baseball_announcement_has_recipients"("id")) OR "public"."baseball_announcement_is_recipient"("id"))));

CREATE POLICY "baseball_announcements_update" ON "public"."baseball_announcements" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id")) WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_baserunning_events_delete" ON "public"."baseball_baserunning_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_baserunning_events_insert" ON "public"."baseball_baserunning_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_baserunning_events_select" ON "public"."baseball_baserunning_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_baserunning_events_update" ON "public"."baseball_baserunning_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_batted_ball_events_delete" ON "public"."baseball_batted_ball_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_batted_ball_events_insert" ON "public"."baseball_batted_ball_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_batted_ball_events_select" ON "public"."baseball_batted_ball_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_batted_ball_events_update" ON "public"."baseball_batted_ball_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_box_score_batting_delete" ON "public"."baseball_box_score_batting" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_box_score_batting_insert" ON "public"."baseball_box_score_batting" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_box_score_batting_update" ON "public"."baseball_box_score_batting" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_box_score_pitching_delete" ON "public"."baseball_box_score_pitching" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_box_score_pitching_insert" ON "public"."baseball_box_score_pitching" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_box_score_pitching_update" ON "public"."baseball_box_score_pitching" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_box_score_uploads_delete" ON "public"."baseball_box_score_uploads" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text"));

CREATE POLICY "baseball_box_score_uploads_insert" ON "public"."baseball_box_score_uploads" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text"));

CREATE POLICY "baseball_box_score_uploads_select" ON "public"."baseball_box_score_uploads" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_box_score_uploads_update" ON "public"."baseball_box_score_uploads" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text"));

CREATE POLICY "baseball_camp_regs_insert" ON "public"."baseball_camp_registrations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_camp_registrations"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_camp_regs_select" ON "public"."baseball_camp_registrations" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_camp_registrations"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."baseball_camps" "bc"
     JOIN "public"."baseball_coaches" "bco" ON (("bco"."id" = "bc"."coach_id")))
  WHERE (("bc"."id" = "baseball_camp_registrations"."camp_id") AND ("bco"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "baseball_camp_regs_update" ON "public"."baseball_camp_registrations" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_camp_registrations"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."baseball_camps" "bc"
     JOIN "public"."baseball_coaches" "bco" ON (("bco"."id" = "bc"."coach_id")))
  WHERE (("bc"."id" = "baseball_camp_registrations"."camp_id") AND ("bco"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "baseball_camps_delete" ON "public"."baseball_camps" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_camps"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_camps_insert" ON "public"."baseball_camps" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_camps"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_camps_select" ON "public"."baseball_camps" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_camps"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR ("status" = 'published'::"text")));

CREATE POLICY "baseball_camps_update" ON "public"."baseball_camps" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_camps"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_catching_events_delete" ON "public"."baseball_catching_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_catching_events_insert" ON "public"."baseball_catching_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_catching_events_select" ON "public"."baseball_catching_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_catching_events_update" ON "public"."baseball_catching_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_class_conflicts_delete" ON "public"."baseball_class_conflicts" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_class_conflicts_insert" ON "public"."baseball_class_conflicts" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_my_coach_id"() IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_view_academics'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id")));

CREATE POLICY "baseball_class_conflicts_select" ON "public"."baseball_class_conflicts" FOR SELECT TO "authenticated" USING (((("public"."get_my_coach_id"() IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_view_academics'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id")) OR (("player_id" = "public"."get_my_baseball_player_id"()) AND ("visibility" <> 'staff_only'::"text"))));

CREATE POLICY "baseball_class_conflicts_update" ON "public"."baseball_class_conflicts" FOR UPDATE TO "authenticated" USING ((("public"."get_my_coach_id"() IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_view_academics'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id"))) WITH CHECK ((("public"."get_my_coach_id"() IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_view_academics'::"text") AND "public"."can_view_baseball_player"("team_id", "player_id")));

CREATE POLICY "baseball_coach_insights_insert" ON "public"."baseball_coach_insights" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_coach_insights_select" ON "public"."baseball_coach_insights" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("player_visible" = true) AND ("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"()))));

CREATE POLICY "baseball_coach_insights_staff_select" ON "public"."baseball_coach_insights" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_coach_insights_update" ON "public"."baseball_coach_insights" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_coach_notes_delete" ON "public"."baseball_coach_notes" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_coach_notes_insert" ON "public"."baseball_coach_notes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_coach_notes_select" ON "public"."baseball_coach_notes" FOR SELECT TO "authenticated" USING (
CASE "scope"
    WHEN 'staff_public'::"public"."baseball_note_scope" THEN "public"."is_baseball_team_staff"("team_id")
    WHEN 'coach_group'::"public"."baseball_note_scope" THEN "public"."is_baseball_team_staff"("team_id")
    WHEN 'strength'::"public"."baseball_note_scope" THEN "public"."baseball_staff_has_note_capability"("team_id", 'strength'::"text")
    WHEN 'academic'::"public"."baseball_note_scope" THEN "public"."baseball_staff_has_note_capability"("team_id", 'can_view_academics'::"text")
    WHEN 'player_visible'::"public"."baseball_note_scope" THEN ("public"."is_baseball_team_staff"("team_id") OR (("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"())))
    WHEN 'hidden_from_player'::"public"."baseball_note_scope" THEN "public"."is_baseball_team_staff"("team_id")
    ELSE false
END);

CREATE POLICY "baseball_coach_notes_update" ON "public"."baseball_coach_notes" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_coach_philosophy_insert" ON "public"."baseball_coach_philosophy" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_coach_philosophy"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_coach_philosophy_select" ON "public"."baseball_coach_philosophy" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_coach_philosophy"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_coach_philosophy_update" ON "public"."baseball_coach_philosophy" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_coach_philosophy"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_coach_player_notes_delete" ON "public"."baseball_coach_player_notes" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_coach_player_notes_insert" ON "public"."baseball_coach_player_notes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_coach_player_notes_select" ON "public"."baseball_coach_player_notes" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text"])) AND ("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"()))));

CREATE POLICY "baseball_coach_player_notes_update" ON "public"."baseball_coach_player_notes" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_coaches_insert_own" ON "public"."baseball_coaches" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_coaches_select" ON "public"."baseball_coaches" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."shares_my_baseball_organization"("organization_id")));

CREATE POLICY "baseball_coaches_update_own" ON "public"."baseball_coaches" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_comparisons_delete_own" ON "public"."baseball_player_comparisons" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_player_comparisons"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_comparisons_insert_own" ON "public"."baseball_player_comparisons" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_player_comparisons"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_comparisons_select_own" ON "public"."baseball_player_comparisons" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_player_comparisons"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_comparisons_update_own" ON "public"."baseball_player_comparisons" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_player_comparisons"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_conversation_participants_select" ON "public"."baseball_conversation_participants" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("conversation_id" IN ( SELECT "public"."get_my_baseball_conversation_ids"() AS "get_my_baseball_conversation_ids"))));

CREATE POLICY "baseball_conversations_insert" ON "public"."baseball_conversations" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_conversations_select" ON "public"."baseball_conversations" FOR SELECT TO "authenticated" USING ((("id" IN ( SELECT "public"."get_my_baseball_conversation_ids"() AS "get_my_baseball_conversation_ids")) OR (("is_team_chat" = true) AND ("team_id" IS NOT NULL) AND "public"."is_baseball_team_member"("team_id"))));

CREATE POLICY "baseball_daily_contract_coach_ack_update" ON "public"."baseball_player_daily_contracts" FOR UPDATE TO "authenticated" USING (("public"."is_baseball_team_coach_v2"("team_id") AND ("visibility" = ANY (ARRAY['coach'::"text", 'team'::"text", 'staff_only'::"text"])))) WITH CHECK (("public"."is_baseball_team_coach_v2"("team_id") AND ("visibility" = ANY (ARRAY['coach'::"text", 'team'::"text", 'staff_only'::"text"]))));

CREATE POLICY "baseball_daily_contract_delete" ON "public"."baseball_player_daily_contracts" FOR DELETE TO "authenticated" USING (("player_id" = "public"."get_my_baseball_player_id"()));

CREATE POLICY "baseball_daily_contract_insert" ON "public"."baseball_player_daily_contracts" FOR INSERT TO "authenticated" WITH CHECK ((("player_id" = "public"."get_my_baseball_player_id"()) AND "public"."is_baseball_team_member_v2"("team_id")));

CREATE POLICY "baseball_daily_contract_select" ON "public"."baseball_player_daily_contracts" FOR SELECT TO "authenticated" USING ((("player_id" = "public"."get_my_baseball_player_id"()) OR (("visibility" <> 'player_only'::"text") AND "public"."is_baseball_team_coach_v2"("team_id"))));

CREATE POLICY "baseball_daily_contract_update" ON "public"."baseball_player_daily_contracts" FOR UPDATE TO "authenticated" USING (("player_id" = "public"."get_my_baseball_player_id"())) WITH CHECK (("player_id" = "public"."get_my_baseball_player_id"()));

CREATE POLICY "baseball_decision_log_insert" ON "public"."baseball_decision_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_decision_log_select" ON "public"."baseball_decision_log" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_demo_sessions_deny_all" ON "public"."baseball_demo_sessions" AS RESTRICTIVE USING (false) WITH CHECK (false);

CREATE POLICY "baseball_dev_plans_delete_coach" ON "public"."baseball_developmental_plans" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_developmental_plans"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_dev_plans_insert_coach" ON "public"."baseball_developmental_plans" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_developmental_plans"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_dev_plans_select" ON "public"."baseball_developmental_plans" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_developmental_plans"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_developmental_plans"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "baseball_dev_plans_update_coach" ON "public"."baseball_developmental_plans" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_developmental_plans"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_dev_plans_update_player" ON "public"."baseball_developmental_plans" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_developmental_plans"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_developmental_plans"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_document_versions_insert" ON "public"."baseball_document_versions" FOR INSERT TO "authenticated" WITH CHECK (("document_id" IN ( SELECT "baseball_documents"."id"
   FROM "public"."baseball_documents"
  WHERE "public"."is_baseball_team_coach"("baseball_documents"."team_id"))));

CREATE POLICY "baseball_document_versions_select" ON "public"."baseball_document_versions" FOR SELECT TO "authenticated" USING (("document_id" IN ( SELECT "baseball_documents"."id"
   FROM "public"."baseball_documents"
  WHERE ("public"."is_baseball_team_coach"("baseball_documents"."team_id") OR (("baseball_documents"."is_player_visible" = true) AND "public"."is_baseball_team_player"("baseball_documents"."team_id"))))));

CREATE POLICY "baseball_documents_delete" ON "public"."baseball_documents" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_documents_insert" ON "public"."baseball_documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_documents_select_coach" ON "public"."baseball_documents" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_documents_select_player" ON "public"."baseball_documents" FOR SELECT TO "authenticated" USING ((("is_player_visible" = true) AND "public"."is_baseball_team_player"("team_id")));

CREATE POLICY "baseball_documents_update" ON "public"."baseball_documents" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id")) WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_engagement_insert" ON "public"."baseball_player_engagement_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_player_engagement_events"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_engagement_select" ON "public"."baseball_player_engagement_events" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_player_engagement_events"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_player_engagement_events"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "baseball_event_acknowledgements_delete" ON "public"."baseball_event_acknowledgements" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_event_acknowledgements_insert" ON "public"."baseball_event_acknowledgements" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_event_acknowledgements_select" ON "public"."baseball_event_acknowledgements" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_events" "e"
  WHERE (("e"."id" = "baseball_event_acknowledgements"."event_id") AND "public"."is_baseball_team_staff"("e"."team_id"))))));

CREATE POLICY "baseball_event_acknowledgements_update" ON "public"."baseball_event_acknowledgements" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_event_attendance_delete_coach" ON "public"."baseball_event_attendance" FOR DELETE TO "authenticated" USING (("event_id" IN ( SELECT "baseball_events"."id"
   FROM "public"."baseball_events"
  WHERE "public"."is_baseball_team_coach"("baseball_events"."team_id"))));

CREATE POLICY "baseball_event_attendance_insert" ON "public"."baseball_event_attendance" FOR INSERT TO "authenticated" WITH CHECK ((("event_id" IN ( SELECT "be"."id"
   FROM "public"."baseball_events" "be"
  WHERE "public"."is_baseball_team_coach"("be"."team_id"))) OR ("player_id" = "public"."get_my_player_id"())));

CREATE POLICY "baseball_event_attendance_select_coach" ON "public"."baseball_event_attendance" FOR SELECT TO "authenticated" USING (("event_id" IN ( SELECT "baseball_events"."id"
   FROM "public"."baseball_events"
  WHERE "public"."is_baseball_team_coach"("baseball_events"."team_id"))));

CREATE POLICY "baseball_event_attendance_select_player" ON "public"."baseball_event_attendance" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_event_attendance_update_coach" ON "public"."baseball_event_attendance" FOR UPDATE TO "authenticated" USING (("event_id" IN ( SELECT "baseball_events"."id"
   FROM "public"."baseball_events"
  WHERE "public"."is_baseball_team_coach"("baseball_events"."team_id"))));

CREATE POLICY "baseball_event_attendance_update_player" ON "public"."baseball_event_attendance" FOR UPDATE TO "authenticated" USING (("player_id" IN ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_events_delete_coach" ON "public"."baseball_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_events_insert_coach" ON "public"."baseball_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_events_select" ON "public"."baseball_events" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_coach"("team_id") OR "public"."is_baseball_team_player"("team_id")));

CREATE POLICY "baseball_events_update_coach" ON "public"."baseball_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_exercises_delete" ON "public"."baseball_exercises" FOR DELETE TO "authenticated" USING ((("team_id" IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "baseball_exercises_insert" ON "public"."baseball_exercises" FOR INSERT TO "authenticated" WITH CHECK ((("team_id" IS NOT NULL) AND ("is_global" = false) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "baseball_exercises_select" ON "public"."baseball_exercises" FOR SELECT TO "authenticated" USING (((("is_global" = true) AND (EXISTS ( SELECT 1
   FROM "public"."baseball_team_coach_staff" "tcs"
  WHERE ("tcs"."coach_id" = "public"."get_my_coach_id"())))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_staff"("team_id")) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_member"("team_id"))));

CREATE POLICY "baseball_exercises_update" ON "public"."baseball_exercises" FOR UPDATE TO "authenticated" USING ((("team_id" IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text"))) WITH CHECK ((("team_id" IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_lifting'::"text")));

CREATE POLICY "baseball_fielding_events_delete" ON "public"."baseball_fielding_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_fielding_events_insert" ON "public"."baseball_fielding_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_fielding_events_select" ON "public"."baseball_fielding_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_fielding_events_update" ON "public"."baseball_fielding_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_import_runs_delete" ON "public"."baseball_import_runs" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_import_runs_insert" ON "public"."baseball_import_runs" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text"));

CREATE POLICY "baseball_import_runs_select" ON "public"."baseball_import_runs" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_import_runs_update" ON "public"."baseball_import_runs" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text"));

CREATE POLICY "baseball_import_sources_delete" ON "public"."baseball_import_sources" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_import_sources_insert" ON "public"."baseball_import_sources" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_import_sources_select" ON "public"."baseball_import_sources" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_import_sources_update" ON "public"."baseball_import_sources" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id")) WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_insights_insert" ON "public"."baseball_coach_insights" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_coach_insights"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_insights_select" ON "public"."baseball_coach_insights" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_coach_insights"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_insights_update" ON "public"."baseball_coach_insights" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_coach_insights"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_integration_configs_delete" ON "public"."baseball_integration_configs" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_integration_configs_insert" ON "public"."baseball_integration_configs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_integration_configs_select" ON "public"."baseball_integration_configs" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_integration_configs_update" ON "public"."baseball_integration_configs" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id")) WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_lineup_positions_delete" ON "public"."baseball_lineup_positions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_lineups" "l"
  WHERE (("l"."id" = "baseball_lineup_positions"."lineup_id") AND "public"."has_baseball_staff_capability"("l"."team_id", 'can_manage_lineups'::"text")))));

CREATE POLICY "baseball_lineup_positions_insert" ON "public"."baseball_lineup_positions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_lineups" "l"
  WHERE (("l"."id" = "baseball_lineup_positions"."lineup_id") AND "public"."has_baseball_staff_capability"("l"."team_id", 'can_manage_lineups'::"text")))));

CREATE POLICY "baseball_lineup_positions_staff_select" ON "public"."baseball_lineup_positions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_lineups" "l"
  WHERE (("l"."id" = "baseball_lineup_positions"."lineup_id") AND "public"."is_baseball_team_staff"("l"."team_id")))));

CREATE POLICY "baseball_lineup_positions_update" ON "public"."baseball_lineup_positions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_lineups" "l"
  WHERE (("l"."id" = "baseball_lineup_positions"."lineup_id") AND "public"."has_baseball_staff_capability"("l"."team_id", 'can_manage_lineups'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_lineups" "l"
  WHERE (("l"."id" = "baseball_lineup_positions"."lineup_id") AND "public"."has_baseball_staff_capability"("l"."team_id", 'can_manage_lineups'::"text")))));

CREATE POLICY "baseball_meeting_items_delete" ON "public"."baseball_meeting_items" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_meeting_items_insert" ON "public"."baseball_meeting_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_meeting_items_select" ON "public"."baseball_meeting_items" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_meeting_items_update" ON "public"."baseball_meeting_items" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_messages_insert" ON "public"."baseball_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."baseball_conversation_participants"
  WHERE (("baseball_conversation_participants"."conversation_id" = "baseball_messages"."conversation_id") AND ("baseball_conversation_participants"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));

CREATE POLICY "baseball_messages_select" ON "public"."baseball_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_conversation_participants"
  WHERE (("baseball_conversation_participants"."conversation_id" = "baseball_messages"."conversation_id") AND ("baseball_conversation_participants"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_messages_update" ON "public"."baseball_messages" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_conversation_participants"
  WHERE (("baseball_conversation_participants"."conversation_id" = "baseball_messages"."conversation_id") AND ("baseball_conversation_participants"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_messages_update_read" ON "public"."baseball_messages" FOR UPDATE TO "authenticated" USING (("conversation_id" IN ( SELECT "baseball_conversation_participants"."conversation_id"
   FROM "public"."baseball_conversation_participants"
  WHERE ("baseball_conversation_participants"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("conversation_id" IN ( SELECT "baseball_conversation_participants"."conversation_id"
   FROM "public"."baseball_conversation_participants"
  WHERE ("baseball_conversation_participants"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_notifications_insert" ON "public"."baseball_notifications" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_notify_baseball_user"("user_id"));

CREATE POLICY "baseball_notifications_select" ON "public"."baseball_notifications" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "baseball_notifications_update" ON "public"."baseball_notifications" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "baseball_participants_insert_by_creator" ON "public"."baseball_conversation_participants" FOR INSERT WITH CHECK (((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ((EXISTS ( SELECT 1
   FROM "public"."baseball_conversations" "c"
  WHERE (("c"."id" = "baseball_conversation_participants"."conversation_id") AND ("c"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_conversations" "c"
  WHERE (("c"."id" = "baseball_conversation_participants"."conversation_id") AND ("c"."is_team_chat" = true) AND ("c"."team_id" IS NOT NULL) AND "public"."baseball_conversation_on_my_team"("baseball_conversation_participants"."conversation_id")))))) OR ((EXISTS ( SELECT 1
   FROM "public"."baseball_conversations" "gc"
  WHERE (("gc"."id" = "baseball_conversation_participants"."conversation_id") AND ("gc"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))) AND (NOT "public"."baseball_conversation_has_other_participant"("conversation_id")))));

CREATE POLICY "baseball_participants_update_own" ON "public"."baseball_conversation_participants" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_passport_settings_delete" ON "public"."baseball_player_passport_settings" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach_v2"("team_id"));

CREATE POLICY "baseball_passport_settings_insert" ON "public"."baseball_player_passport_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_baseball_team_coach_v2"("team_id") OR ("player_id" = "public"."get_my_baseball_player_id"())));

CREATE POLICY "baseball_passport_settings_select" ON "public"."baseball_player_passport_settings" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_coach_v2"("team_id") OR ("player_id" = "public"."get_my_baseball_player_id"())));

CREATE POLICY "baseball_passport_settings_update" ON "public"."baseball_player_passport_settings" FOR UPDATE TO "authenticated" USING (("public"."is_baseball_team_coach_v2"("team_id") OR ("player_id" = "public"."get_my_baseball_player_id"()))) WITH CHECK (("public"."is_baseball_team_coach_v2"("team_id") OR ("player_id" = "public"."get_my_baseball_player_id"())));

CREATE POLICY "baseball_passport_share_tokens_delete" ON "public"."baseball_player_passport_share_tokens" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_passport_share_tokens_insert" ON "public"."baseball_player_passport_share_tokens" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_coach_v2"("team_id"));

CREATE POLICY "baseball_passport_share_tokens_select" ON "public"."baseball_player_passport_share_tokens" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_coach_v2"("team_id"));

CREATE POLICY "baseball_passport_share_tokens_update" ON "public"."baseball_player_passport_share_tokens" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_coach_v2"("team_id")) WITH CHECK ("public"."is_baseball_team_coach_v2"("team_id"));

CREATE POLICY "baseball_pitch_events_delete" ON "public"."baseball_pitch_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_pitch_events_insert" ON "public"."baseball_pitch_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_pitch_events_select" ON "public"."baseball_pitch_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_pitch_events_update" ON "public"."baseball_pitch_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_plate_appearances_delete" ON "public"."baseball_plate_appearances" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_plate_appearances_insert" ON "public"."baseball_plate_appearances" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_plate_appearances_select" ON "public"."baseball_plate_appearances" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_plate_appearances_update" ON "public"."baseball_plate_appearances" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_player_classes_delete" ON "public"."baseball_player_classes" FOR DELETE TO "authenticated" USING (("player_id" IN ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_player_classes_insert" ON "public"."baseball_player_classes" FOR INSERT TO "authenticated" WITH CHECK ((("player_id" = "public"."get_my_player_id"()) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "btm"
  WHERE (("btm"."player_id" = "baseball_player_classes"."player_id") AND "public"."is_baseball_team_coach"("btm"."team_id"))))));

CREATE POLICY "baseball_player_classes_select_coach" ON "public"."baseball_player_classes" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "btm"
  WHERE (("btm"."player_id" = "baseball_player_classes"."player_id") AND "public"."is_baseball_team_coach"("btm"."team_id")))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id"))));

CREATE POLICY "baseball_player_classes_select_player" ON "public"."baseball_player_classes" FOR SELECT TO "authenticated" USING (("player_id" IN ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_player_classes_update" ON "public"."baseball_player_classes" FOR UPDATE TO "authenticated" USING (("player_id" IN ( SELECT "baseball_players"."id"
   FROM "public"."baseball_players"
  WHERE ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_player_development_metrics_delete" ON "public"."baseball_player_development_metrics" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_player_development_metrics_insert" ON "public"."baseball_player_development_metrics" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_player_development_metrics_select" ON "public"."baseball_player_development_metrics" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_player_development_metrics_update" ON "public"."baseball_player_development_metrics" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_player_external_ids_delete" ON "public"."baseball_player_external_ids" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "tm"
  WHERE (("tm"."player_id" = "baseball_player_external_ids"."player_id") AND "public"."is_baseball_team_coach"("tm"."team_id")))));

CREATE POLICY "baseball_player_external_ids_insert" ON "public"."baseball_player_external_ids" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "tm"
  WHERE (("tm"."player_id" = "baseball_player_external_ids"."player_id") AND "public"."has_baseball_staff_capability"("tm"."team_id", 'can_manage_imports'::"text"))
 LIMIT 1)));

CREATE POLICY "baseball_player_external_ids_select" ON "public"."baseball_player_external_ids" FOR SELECT TO "authenticated" USING ("public"."can_view_baseball_player"("player_id"));

CREATE POLICY "baseball_player_external_ids_update" ON "public"."baseball_player_external_ids" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "tm"
  WHERE (("tm"."player_id" = "baseball_player_external_ids"."player_id") AND "public"."is_baseball_team_coach"("tm"."team_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_team_members" "tm"
  WHERE (("tm"."player_id" = "baseball_player_external_ids"."player_id") AND "public"."is_baseball_team_coach"("tm"."team_id")))));

CREATE POLICY "baseball_player_percentiles_select" ON "public"."baseball_player_percentiles" FOR SELECT TO "authenticated" USING ("public"."can_view_baseball_player"("player_id"));

CREATE POLICY "baseball_player_season_stats_delete" ON "public"."baseball_player_season_stats" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_player_season_stats_insert" ON "public"."baseball_player_season_stats" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_player_season_stats_update" ON "public"."baseball_player_season_stats" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_player_settings_insert" ON "public"."baseball_player_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_player_settings"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_player_settings_select" ON "public"."baseball_player_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_player_settings"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_player_settings_update" ON "public"."baseball_player_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_player_settings"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_player_stats_delete" ON "public"."baseball_player_stats" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_player_stats_insert" ON "public"."baseball_player_stats" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_player_stats_select" ON "public"."baseball_player_stats" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR ("player_id" = "public"."get_my_baseball_player_id"())));

CREATE POLICY "baseball_player_stats_update" ON "public"."baseball_player_stats" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_stats'::"text"));

CREATE POLICY "baseball_players_insert_own" ON "public"."baseball_players" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_players_select" ON "public"."baseball_players" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."can_view_baseball_player"("id") OR "public"."is_baseball_player_recruiting_discoverable"("id", "player_type", "recruiting_activated")));

CREATE POLICY "baseball_players_update_own" ON "public"."baseball_players" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_postgame_review_items_delete" ON "public"."baseball_postgame_review_items" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_postgame_review_items_insert" ON "public"."baseball_postgame_review_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_postgame_review_items_select" ON "public"."baseball_postgame_review_items" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("visibility" = ANY (ARRAY['player_visible'::"text", 'team'::"text"])) AND ("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"()))));

CREATE POLICY "baseball_postgame_review_items_update" ON "public"."baseball_postgame_review_items" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_postgame_reviews_delete" ON "public"."baseball_postgame_reviews" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_postgame_reviews_insert" ON "public"."baseball_postgame_reviews" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_postgame_reviews_select" ON "public"."baseball_postgame_reviews" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_postgame_reviews_update" ON "public"."baseball_postgame_reviews" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_practice_attendance_delete" ON "public"."baseball_practice_attendance" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_attendance"."practice_id") AND ("baseball_practice_attendance"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text")))));

CREATE POLICY "baseball_practice_attendance_insert" ON "public"."baseball_practice_attendance" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_attendance"."practice_id") AND ("baseball_practice_attendance"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text")))));

CREATE POLICY "baseball_practice_attendance_select" ON "public"."baseball_practice_attendance" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_attendance"."practice_id") AND ("baseball_practice_attendance"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text")))) OR (("player_id" = "public"."get_my_baseball_player_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_attendance"."practice_id") AND ("baseball_practice_attendance"."team_id" = "p"."team_id")))))));

CREATE POLICY "baseball_practice_attendance_update" ON "public"."baseball_practice_attendance" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_attendance"."practice_id") AND ("baseball_practice_attendance"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_attendance"."practice_id") AND ("baseball_practice_attendance"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text")))));

CREATE POLICY "baseball_practice_block_objectives_delete" ON "public"."baseball_practice_block_objectives" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_block_objectives_insert" ON "public"."baseball_practice_block_objectives" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_block_objectives_select" ON "public"."baseball_practice_block_objectives" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_practice_block_objectives_update" ON "public"."baseball_practice_block_objectives" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_blocks_delete" ON "public"."baseball_practice_blocks" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_blocks"."practice_id") AND ("baseball_practice_blocks"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text")))));

CREATE POLICY "baseball_practice_blocks_insert" ON "public"."baseball_practice_blocks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_blocks"."practice_id") AND ("baseball_practice_blocks"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text")))));

CREATE POLICY "baseball_practice_blocks_select" ON "public"."baseball_practice_blocks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_blocks"."practice_id") AND ("baseball_practice_blocks"."team_id" = "p"."team_id") AND ("public"."is_baseball_team_staff"("p"."team_id") OR (("p"."status" = 'published'::"text") AND "public"."is_baseball_team_member"("p"."team_id") AND (("baseball_practice_blocks"."visibility" IS NULL) OR ("baseball_practice_blocks"."visibility" = 'player_visible'::"text"))))))));

CREATE POLICY "baseball_practice_blocks_update" ON "public"."baseball_practice_blocks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_blocks"."practice_id") AND ("baseball_practice_blocks"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_practices" "p"
  WHERE (("p"."id" = "baseball_practice_blocks"."practice_id") AND ("baseball_practice_blocks"."team_id" = "p"."team_id") AND "public"."has_baseball_staff_capability"("p"."team_id", 'can_manage_practice'::"text")))));

CREATE POLICY "baseball_practice_effectiveness_reviews_delete" ON "public"."baseball_practice_effectiveness_reviews" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_effectiveness_reviews_insert" ON "public"."baseball_practice_effectiveness_reviews" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_effectiveness_reviews_select" ON "public"."baseball_practice_effectiveness_reviews" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_practice_effectiveness_reviews_update" ON "public"."baseball_practice_effectiveness_reviews" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_lineup_slots_delete" ON "public"."baseball_practice_lineup_slots" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_lineup_slots_insert" ON "public"."baseball_practice_lineup_slots" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_lineup_slots_select" ON "public"."baseball_practice_lineup_slots" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR "public"."is_baseball_team_member"("team_id")));

CREATE POLICY "baseball_practice_lineup_slots_update" ON "public"."baseball_practice_lineup_slots" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_scrimmages_delete" ON "public"."baseball_practice_scrimmages" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_scrimmages_insert" ON "public"."baseball_practice_scrimmages" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practice_scrimmages_select" ON "public"."baseball_practice_scrimmages" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR "public"."is_baseball_team_member"("team_id")));

CREATE POLICY "baseball_practice_scrimmages_update" ON "public"."baseball_practice_scrimmages" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practices_delete" ON "public"."baseball_practices" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practices_insert" ON "public"."baseball_practices" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_practices_select" ON "public"."baseball_practices" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("status" = 'published'::"text") AND "public"."is_baseball_team_member"("team_id"))));

CREATE POLICY "baseball_practices_update" ON "public"."baseball_practices" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_practice'::"text"));

CREATE POLICY "baseball_program_settings_delete" ON "public"."baseball_program_settings" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_program_settings_insert" ON "public"."baseball_program_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_program_settings_select" ON "public"."baseball_program_settings" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_program_settings_update" ON "public"."baseball_program_settings" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id")) WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_recruiting_interests_delete_own" ON "public"."baseball_recruiting_interests" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_recruiting_interests"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_recruiting_interests_insert_own" ON "public"."baseball_recruiting_interests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_recruiting_interests"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_recruiting_interests_select_own" ON "public"."baseball_recruiting_interests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_recruiting_interests"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_recruiting_interests_update_own" ON "public"."baseball_recruiting_interests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_recruiting_interests"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_seasons_delete" ON "public"."baseball_seasons" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_seasons_insert" ON "public"."baseball_seasons" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_seasons_select" ON "public"."baseball_seasons" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_seasons_update" ON "public"."baseball_seasons" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id")) WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_settings_audit_log_delete" ON "public"."baseball_settings_audit_log" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_settings_audit_log_insert" ON "public"."baseball_settings_audit_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_baseball_staff_capability"("team_id", 'can_manage_settings'::"text") AND ("actor_user_id" = "auth"."uid"())));

CREATE POLICY "baseball_settings_audit_log_select" ON "public"."baseball_settings_audit_log" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_settings_audit_log_update" ON "public"."baseball_settings_audit_log" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id")) WITH CHECK ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_signals_delete" ON "public"."baseball_signals" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_signals_insert" ON "public"."baseball_signals" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_signals_select" ON "public"."baseball_signals" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text"])) AND ("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"()))));

CREATE POLICY "baseball_signals_update" ON "public"."baseball_signals" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_staff_audit_insert" ON "public"."baseball_staff_audit_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_staff_audit_select" ON "public"."baseball_staff_audit_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_primary_coach"("team_id"));

CREATE POLICY "baseball_staff_invitations_delete" ON "public"."baseball_staff_invitations" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text"));

CREATE POLICY "baseball_staff_invitations_insert" ON "public"."baseball_staff_invitations" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text"));

CREATE POLICY "baseball_staff_invitations_invitee_select" ON "public"."baseball_staff_invitations" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"text") AND ("expires_at" > "now"()) AND ("lower"("email") = "lower"(COALESCE((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text"), ''::"text")))));

CREATE POLICY "baseball_staff_invitations_select" ON "public"."baseball_staff_invitations" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_staff_invitations_update" ON "public"."baseball_staff_invitations" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text"));

CREATE POLICY "baseball_stat_sources_delete" ON "public"."baseball_stat_sources" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_sources_insert" ON "public"."baseball_stat_sources" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_sources_select" ON "public"."baseball_stat_sources" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_sources_update" ON "public"."baseball_stat_sources" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_uploads_insert" ON "public"."baseball_stat_uploads" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text"));

CREATE POLICY "baseball_stat_uploads_select" ON "public"."baseball_stat_uploads" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_uploads_update" ON "public"."baseball_stat_uploads" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_imports'::"text"));

CREATE POLICY "baseball_stat_visual_views_delete" ON "public"."baseball_stat_visual_views" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_visual_views_insert" ON "public"."baseball_stat_visual_views" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_stat_visual_views_select" ON "public"."baseball_stat_visual_views" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("visibility" = ANY (ARRAY['player_visible'::"text", 'team'::"text"])) AND ("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"()))));

CREATE POLICY "baseball_stat_visual_views_update" ON "public"."baseball_stat_visual_views" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_swing_events_delete" ON "public"."baseball_swing_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_swing_events_insert" ON "public"."baseball_swing_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_swing_events_select" ON "public"."baseball_swing_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_swing_events_update" ON "public"."baseball_swing_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_task_assignments_delete" ON "public"."baseball_task_assignments" FOR DELETE TO "authenticated" USING (("task_id" IN ( SELECT "baseball_tasks"."id"
   FROM "public"."baseball_tasks"
  WHERE "public"."is_baseball_team_coach"("baseball_tasks"."team_id"))));

CREATE POLICY "baseball_task_assignments_insert" ON "public"."baseball_task_assignments" FOR INSERT TO "authenticated" WITH CHECK (("task_id" IN ( SELECT "baseball_tasks"."id"
   FROM "public"."baseball_tasks"
  WHERE "public"."is_baseball_team_coach"("baseball_tasks"."team_id"))));

CREATE POLICY "baseball_task_assignments_select_coach" ON "public"."baseball_task_assignments" FOR SELECT TO "authenticated" USING (("task_id" IN ( SELECT "baseball_tasks"."id"
   FROM "public"."baseball_tasks"
  WHERE "public"."is_baseball_team_coach"("baseball_tasks"."team_id"))));

CREATE POLICY "baseball_task_assignments_select_player" ON "public"."baseball_task_assignments" FOR SELECT TO "authenticated" USING (("player_id" = "public"."get_my_player_id"()));

CREATE POLICY "baseball_task_assignments_update_coach" ON "public"."baseball_task_assignments" FOR UPDATE TO "authenticated" USING (("task_id" IN ( SELECT "baseball_tasks"."id"
   FROM "public"."baseball_tasks"
  WHERE "public"."is_baseball_team_coach"("baseball_tasks"."team_id"))));

CREATE POLICY "baseball_task_assignments_update_player" ON "public"."baseball_task_assignments" FOR UPDATE TO "authenticated" USING (("player_id" = "public"."get_my_player_id"())) WITH CHECK (("player_id" = "public"."get_my_player_id"()));

CREATE POLICY "baseball_task_templates_delete" ON "public"."baseball_task_templates" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_task_templates_insert" ON "public"."baseball_task_templates" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_task_templates_select" ON "public"."baseball_task_templates" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_task_templates_update" ON "public"."baseball_task_templates" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id")) WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_tasks_delete" ON "public"."baseball_tasks" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_tasks_insert" ON "public"."baseball_tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_tasks_select_coach" ON "public"."baseball_tasks" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_tasks_select_player" ON "public"."baseball_tasks" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_player"("team_id"));

CREATE POLICY "baseball_tasks_update" ON "public"."baseball_tasks" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id")) WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_team_coach_staff_delete" ON "public"."baseball_team_coach_staff" FOR DELETE TO "authenticated" USING (("public"."is_baseball_primary_coach"("team_id") OR "public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text") OR (("coach_id" = "public"."get_my_coach_id"()) AND ("is_primary" = false))));

CREATE POLICY "baseball_team_coach_staff_insert" ON "public"."baseball_team_coach_staff" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text"));

CREATE POLICY "baseball_team_coach_staff_select" ON "public"."baseball_team_coach_staff" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR "public"."is_baseball_team_member"("team_id")));

CREATE POLICY "baseball_team_coach_staff_update" ON "public"."baseball_team_coach_staff" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_invite_staff'::"text"));

CREATE POLICY "baseball_team_invitations_delete" ON "public"."baseball_team_invitations" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_roster'::"text"));

CREATE POLICY "baseball_team_invitations_insert" ON "public"."baseball_team_invitations" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_roster'::"text"));

CREATE POLICY "baseball_team_invitations_select" ON "public"."baseball_team_invitations" FOR SELECT TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_roster'::"text"));

CREATE POLICY "baseball_team_invitations_update" ON "public"."baseball_team_invitations" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_roster'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_roster'::"text"));

CREATE POLICY "baseball_team_lineups_delete" ON "public"."baseball_team_lineups" FOR DELETE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lineups'::"text"));

CREATE POLICY "baseball_team_lineups_insert" ON "public"."baseball_team_lineups" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lineups'::"text"));

CREATE POLICY "baseball_team_lineups_staff_select" ON "public"."baseball_team_lineups" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_team_lineups_update" ON "public"."baseball_team_lineups" FOR UPDATE TO "authenticated" USING ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lineups'::"text")) WITH CHECK ("public"."has_baseball_staff_capability"("team_id", 'can_manage_lineups'::"text"));

CREATE POLICY "baseball_team_members_delete_coach" ON "public"."baseball_team_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseball_team_coach_staff" "btcs"
     JOIN "public"."baseball_coaches" "bc" ON (("bc"."id" = "btcs"."coach_id")))
  WHERE (("btcs"."team_id" = "baseball_team_members"."team_id") AND ("bc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_team_members_insert" ON "public"."baseball_team_members" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_team_members"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND "public"."can_insert_baseball_team_member"("team_id", "status")));

CREATE POLICY "baseball_team_members_select" ON "public"."baseball_team_members" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."baseball_team_coach_staff" "btcs"
     JOIN "public"."baseball_coaches" "bc" ON (("bc"."id" = "btcs"."coach_id")))
  WHERE (("btcs"."team_id" = "baseball_team_members"."team_id") AND ("bc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "public"."is_baseball_team_member"("team_id")));

CREATE POLICY "baseball_team_members_update_coach" ON "public"."baseball_team_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseball_team_coach_staff" "btcs"
     JOIN "public"."baseball_coaches" "bc" ON (("bc"."id" = "btcs"."coach_id")))
  WHERE (("btcs"."team_id" = "baseball_team_members"."team_id") AND ("bc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_teams_delete" ON "public"."baseball_teams" FOR DELETE TO "authenticated" USING ("public"."is_baseball_primary_coach"("id"));

CREATE POLICY "baseball_teams_insert_coaches" ON "public"."baseball_teams" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "baseball_teams_select" ON "public"."baseball_teams" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("id") OR "public"."has_any_baseball_team_membership"("id")));

CREATE POLICY "baseball_teams_update" ON "public"."baseball_teams" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_primary_coach"("id")) WITH CHECK ("public"."is_baseball_primary_coach"("id"));

CREATE POLICY "baseball_teams_update_own_coach" ON "public"."baseball_teams" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseball_team_coach_staff" "btcs"
     JOIN "public"."baseball_coaches" "bc" ON (("bc"."id" = "btcs"."coach_id")))
  WHERE (("btcs"."team_id" = "baseball_teams"."id") AND ("bc"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_timeline_delete" ON "public"."baseball_player_timeline_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_timeline_event_acks_insert" ON "public"."baseball_timeline_event_acks" FOR INSERT TO "authenticated" WITH CHECK (("acked_by" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_timeline_event_acks_select" ON "public"."baseball_timeline_event_acks" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_coach_v2"("team_id") OR ("acked_by" = ( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "baseball_timeline_event_acks_update" ON "public"."baseball_timeline_event_acks" FOR UPDATE TO "authenticated" USING (("acked_by" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("acked_by" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "baseball_timeline_insert" ON "public"."baseball_player_timeline_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_timeline_select" ON "public"."baseball_player_timeline_events" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("visibility" <> 'staff_only'::"text") AND ("player_id" = "public"."get_my_baseball_player_id"()))));

CREATE POLICY "baseball_timeline_update" ON "public"."baseball_player_timeline_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_travel_exp_delete" ON "public"."baseball_travel_expenses" FOR DELETE TO "authenticated" USING ((("itinerary_id" IN ( SELECT "baseball_travel_itineraries"."id"
   FROM "public"."baseball_travel_itineraries"
  WHERE "public"."is_baseball_team_coach"("baseball_travel_itineraries"."team_id"))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id"))));

CREATE POLICY "baseball_travel_exp_insert" ON "public"."baseball_travel_expenses" FOR INSERT TO "authenticated" WITH CHECK (((("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")) OR ("itinerary_id" IN ( SELECT "bti"."id"
   FROM "public"."baseball_travel_itineraries" "bti"
  WHERE "public"."is_baseball_team_coach"("bti"."team_id")))));

CREATE POLICY "baseball_travel_exp_select_coach" ON "public"."baseball_travel_expenses" FOR SELECT TO "authenticated" USING ((("itinerary_id" IN ( SELECT "baseball_travel_itineraries"."id"
   FROM "public"."baseball_travel_itineraries"
  WHERE "public"."is_baseball_team_coach"("baseball_travel_itineraries"."team_id"))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id"))));

CREATE POLICY "baseball_travel_exp_select_player" ON "public"."baseball_travel_expenses" FOR SELECT TO "authenticated" USING ((("itinerary_id" IN ( SELECT "baseball_travel_itineraries"."id"
   FROM "public"."baseball_travel_itineraries"
  WHERE "public"."is_baseball_team_player"("baseball_travel_itineraries"."team_id"))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_player"("team_id"))));

CREATE POLICY "baseball_travel_exp_update" ON "public"."baseball_travel_expenses" FOR UPDATE TO "authenticated" USING ((("itinerary_id" IN ( SELECT "baseball_travel_itineraries"."id"
   FROM "public"."baseball_travel_itineraries"
  WHERE "public"."is_baseball_team_coach"("baseball_travel_itineraries"."team_id"))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id"))));

CREATE POLICY "baseball_travel_itin_delete" ON "public"."baseball_travel_itineraries" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_travel_itin_insert" ON "public"."baseball_travel_itineraries" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_travel_itin_select_coach" ON "public"."baseball_travel_itineraries" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_travel_itin_select_player" ON "public"."baseball_travel_itineraries" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_player"("team_id"));

CREATE POLICY "baseball_travel_itin_update" ON "public"."baseball_travel_itineraries" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_coach"("team_id"));

CREATE POLICY "baseball_video_events_delete" ON "public"."baseball_video_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_video_events_insert" ON "public"."baseball_video_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_video_events_select" ON "public"."baseball_video_events" FOR SELECT TO "authenticated" USING (("public"."is_baseball_team_staff"("team_id") OR (("visibility" = ANY (ARRAY['player_visible'::"text", 'team'::"text"])) AND ("player_id" IS NOT NULL) AND ("player_id" = "public"."get_my_baseball_player_id"()))));

CREATE POLICY "baseball_video_events_update" ON "public"."baseball_video_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_videos_delete_own" ON "public"."baseball_videos" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_videos"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_videos_insert_own" ON "public"."baseball_videos" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_videos"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_videos_insert_staff" ON "public"."baseball_videos" FOR INSERT TO "authenticated" WITH CHECK ((("team_id" IS NOT NULL) AND "public"."has_baseball_staff_capability"("team_id", 'can_manage_roster'::"text")));

CREATE POLICY "baseball_videos_select" ON "public"."baseball_videos" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_videos"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_coach"("team_id")) OR (("team_id" IS NOT NULL) AND "public"."is_baseball_team_player"("team_id")) OR (EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_videos"."player_id") AND ("baseball_players"."recruiting_activated" = true) AND ("baseball_players"."player_type" = ANY (ARRAY['high_school'::"public"."baseball_player_type", 'showcase'::"public"."baseball_player_type", 'juco'::"public"."baseball_player_type"])))))));

CREATE POLICY "baseball_videos_update_own" ON "public"."baseball_videos" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_players"
  WHERE (("baseball_players"."id" = "baseball_videos"."player_id") AND ("baseball_players"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_watchlists_delete_own" ON "public"."baseball_watchlists" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_watchlists"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_watchlists_insert_own" ON "public"."baseball_watchlists" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_watchlists"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_watchlists_select_own" ON "public"."baseball_watchlists" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_watchlists"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_watchlists_update_own" ON "public"."baseball_watchlists" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."id" = "baseball_watchlists"."coach_id") AND ("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "baseball_workload_events_delete" ON "public"."baseball_workload_events" FOR DELETE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_workload_events_insert" ON "public"."baseball_workload_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_workload_events_select" ON "public"."baseball_workload_events" FOR SELECT TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id"));

CREATE POLICY "baseball_workload_events_update" ON "public"."baseball_workload_events" FOR UPDATE TO "authenticated" USING ("public"."is_baseball_team_staff"("team_id")) WITH CHECK ("public"."is_baseball_team_staff"("team_id"));
