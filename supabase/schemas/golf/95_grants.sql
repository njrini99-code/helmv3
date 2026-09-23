GRANT ALL ON TABLE "public"."approach_miss_details" TO "anon";

GRANT ALL ON TABLE "public"."approach_miss_details" TO "authenticated";

GRANT ALL ON TABLE "public"."approach_miss_details" TO "service_role";

GRANT ALL ON TABLE "public"."golf_academic_exclusions" TO "anon";

GRANT ALL ON TABLE "public"."golf_academic_exclusions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_academic_exclusions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_announcement_acknowledgements" TO "anon";

GRANT ALL ON TABLE "public"."golf_announcement_acknowledgements" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_announcement_acknowledgements" TO "service_role";

GRANT ALL ON TABLE "public"."golf_announcement_documents" TO "anon";

GRANT ALL ON TABLE "public"."golf_announcement_documents" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_announcement_documents" TO "service_role";

GRANT ALL ON TABLE "public"."golf_announcement_recipients" TO "anon";

GRANT ALL ON TABLE "public"."golf_announcement_recipients" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_announcement_recipients" TO "service_role";

GRANT ALL ON TABLE "public"."golf_announcement_tasks" TO "anon";

GRANT ALL ON TABLE "public"."golf_announcement_tasks" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_announcement_tasks" TO "service_role";

GRANT ALL ON TABLE "public"."golf_announcements" TO "anon";

GRANT ALL ON TABLE "public"."golf_announcements" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_announcements" TO "service_role";

GRANT ALL ON TABLE "public"."golf_attendance_summary" TO "anon";

GRANT ALL ON TABLE "public"."golf_attendance_summary" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_attendance_summary" TO "service_role";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_calendar_feeds" TO "anon";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_calendar_feeds" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_calendar_feeds" TO "service_role";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_calendar_notifications" TO "anon";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_calendar_notifications" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_calendar_notifications" TO "service_role";

GRANT ALL ON TABLE "public"."golf_causal_relationships" TO "anon";

GRANT ALL ON TABLE "public"."golf_causal_relationships" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_causal_relationships" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coach_behavior_log" TO "anon";

GRANT ALL ON TABLE "public"."golf_coach_behavior_log" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coach_behavior_log" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coach_blocked_time" TO "anon";

GRANT ALL ON TABLE "public"."golf_coach_blocked_time" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coach_blocked_time" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coach_insights" TO "anon";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coach_insights" TO "service_role";

GRANT UPDATE("status") ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT UPDATE("acknowledged_at") ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT UPDATE("dismissed") ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT UPDATE("dismissed_at") ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT UPDATE("resolved_at") ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT UPDATE("metadata") ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT UPDATE("lifecycle_state") ON TABLE "public"."golf_coach_insights" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coach_philosophy" TO "anon";

GRANT ALL ON TABLE "public"."golf_coach_philosophy" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coach_philosophy" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coach_player_intent" TO "anon";

GRANT ALL ON TABLE "public"."golf_coach_player_intent" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coach_player_intent" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coaches" TO "anon";

GRANT ALL ON TABLE "public"."golf_coaches" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coaches" TO "service_role";

GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."golf_coachhelm_action_runs" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coachhelm_action_runs" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."golf_coachhelm_chat_conversations" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coachhelm_chat_conversations" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."golf_coachhelm_chat_messages" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coachhelm_chat_messages" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coachhelm_coach_weights" TO "anon";

GRANT ALL ON TABLE "public"."golf_coachhelm_coach_weights" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coachhelm_coach_weights" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coachhelm_llm_budget" TO "anon";

GRANT ALL ON TABLE "public"."golf_coachhelm_llm_budget" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coachhelm_llm_budget" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coachhelm_llm_calls" TO "anon";

GRANT ALL ON TABLE "public"."golf_coachhelm_llm_calls" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coachhelm_llm_calls" TO "service_role";

GRANT ALL ON TABLE "public"."golf_coachhelm_settings" TO "anon";

GRANT ALL ON TABLE "public"."golf_coachhelm_settings" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_coachhelm_settings" TO "service_role";

GRANT ALL ON TABLE "public"."golf_confidence_calibration" TO "anon";

GRANT ALL ON TABLE "public"."golf_confidence_calibration" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_confidence_calibration" TO "service_role";

GRANT ALL ON TABLE "public"."golf_conversation_participants" TO "anon";

GRANT ALL ON TABLE "public"."golf_conversation_participants" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_conversation_participants" TO "service_role";

GRANT ALL ON TABLE "public"."golf_conversations" TO "anon";

GRANT ALL ON TABLE "public"."golf_conversations" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_conversations" TO "service_role";

GRANT ALL ON TABLE "public"."golf_course_edit_history" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_course_edit_history" TO "service_role";

GRANT ALL ON TABLE "public"."golf_course_holes" TO "anon";

GRANT ALL ON TABLE "public"."golf_course_holes" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_course_holes" TO "service_role";

GRANT ALL ON TABLE "public"."golf_course_tee_edit_history" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_course_tee_edit_history" TO "service_role";

GRANT ALL ON TABLE "public"."golf_course_tee_holes" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_course_tee_holes" TO "service_role";

GRANT ALL ON TABLE "public"."golf_course_tees" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_course_tees" TO "service_role";

GRANT ALL ON TABLE "public"."golf_courses" TO "anon";

GRANT ALL ON TABLE "public"."golf_courses" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_courses" TO "service_role";

GRANT ALL ON TABLE "public"."golf_demo_sessions" TO "anon";

GRANT ALL ON TABLE "public"."golf_demo_sessions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_demo_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_document_versions" TO "anon";

GRANT ALL ON TABLE "public"."golf_document_versions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_document_versions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_documents" TO "anon";

GRANT ALL ON TABLE "public"."golf_documents" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_documents" TO "service_role";

GRANT ALL ON TABLE "public"."golf_drills" TO "anon";

GRANT ALL ON TABLE "public"."golf_drills" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_drills" TO "service_role";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_event_attendance" TO "anon";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_event_attendance" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_event_attendance" TO "service_role";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_event_documents" TO "anon";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_event_documents" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_event_documents" TO "service_role";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_events" TO "anon";

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."golf_events" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_events" TO "service_role";

GRANT ALL ON TABLE "public"."golf_global_patterns" TO "anon";

GRANT ALL ON TABLE "public"."golf_global_patterns" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_global_patterns" TO "service_role";

GRANT ALL ON TABLE "public"."golf_goal_suggestions" TO "anon";

GRANT ALL ON TABLE "public"."golf_goal_suggestions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_goal_suggestions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_goals" TO "anon";

GRANT ALL ON TABLE "public"."golf_goals" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_goals" TO "service_role";

GRANT ALL ON TABLE "public"."golf_holes" TO "anon";

GRANT ALL ON TABLE "public"."golf_holes" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_holes" TO "service_role";

GRANT ALL ON TABLE "public"."golf_ingest_connections" TO "anon";

GRANT ALL ON TABLE "public"."golf_ingest_connections" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_ingest_connections" TO "service_role";

GRANT ALL ON TABLE "public"."golf_ingest_sync_log" TO "anon";

GRANT ALL ON TABLE "public"."golf_ingest_sync_log" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_ingest_sync_log" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_action" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_action" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_drill_attachments" TO "anon";

GRANT ALL ON TABLE "public"."golf_insight_drill_attachments" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_drill_attachments" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_effectiveness" TO "anon";

GRANT ALL ON TABLE "public"."golf_insight_effectiveness" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_effectiveness" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_exposure" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_exposure" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_generation_log" TO "anon";

GRANT ALL ON TABLE "public"."golf_insight_generation_log" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_generation_log" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_outcome" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_outcome" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_outcome_attribution" TO "anon";

GRANT ALL ON TABLE "public"."golf_insight_outcome_attribution" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_outcome_attribution" TO "service_role";

GRANT ALL ON TABLE "public"."golf_insight_player_feedback" TO "anon";

GRANT ALL ON TABLE "public"."golf_insight_player_feedback" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_insight_player_feedback" TO "service_role";

GRANT ALL ON TABLE "public"."golf_learned_behavior" TO "anon";

GRANT ALL ON TABLE "public"."golf_learned_behavior" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_learned_behavior" TO "service_role";

GRANT ALL ON TABLE "public"."golf_message_attachments" TO "anon";

GRANT ALL ON TABLE "public"."golf_message_attachments" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_message_attachments" TO "service_role";

GRANT ALL ON TABLE "public"."golf_message_mentions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_message_mentions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_message_reactions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_message_reactions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_message_responses" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_message_responses" TO "service_role";

GRANT ALL ON TABLE "public"."golf_messages" TO "anon";

GRANT ALL ON TABLE "public"."golf_messages" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_messages" TO "service_role";

GRANT ALL ON TABLE "public"."golf_metrics" TO "anon";

GRANT ALL ON TABLE "public"."golf_metrics" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_metrics" TO "service_role";

GRANT ALL ON TABLE "public"."golf_patterns_v2" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_patterns_v2" TO "service_role";

GRANT ALL ON TABLE "public"."golf_pga_standards" TO "anon";

GRANT ALL ON TABLE "public"."golf_pga_standards" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_pga_standards" TO "service_role";

GRANT ALL ON TABLE "public"."golf_platform_metrics_daily" TO "anon";

GRANT ALL ON TABLE "public"."golf_platform_metrics_daily" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_platform_metrics_daily" TO "service_role";

GRANT ALL ON TABLE "public"."golf_player_classes" TO "anon";

GRANT ALL ON TABLE "public"."golf_player_classes" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_player_classes" TO "service_role";

GRANT ALL ON TABLE "public"."golf_player_courses" TO "anon";

GRANT ALL ON TABLE "public"."golf_player_courses" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_player_courses" TO "service_role";

GRANT ALL ON TABLE "public"."golf_player_focus_areas" TO "anon";

GRANT ALL ON TABLE "public"."golf_player_focus_areas" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_player_focus_areas" TO "service_role";

GRANT ALL ON TABLE "public"."golf_player_genome" TO "anon";

GRANT ALL ON TABLE "public"."golf_player_genome" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_player_genome" TO "service_role";

GRANT ALL ON TABLE "public"."golf_player_notification_state" TO "anon";

GRANT ALL ON TABLE "public"."golf_player_notification_state" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_player_notification_state" TO "service_role";

GRANT ALL ON TABLE "public"."golf_player_standing" TO "anon";

GRANT ALL ON TABLE "public"."golf_player_standing" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_player_standing" TO "service_role";

GRANT ALL ON TABLE "public"."golf_player_stats_cache" TO "anon";

GRANT ALL ON TABLE "public"."golf_player_stats_cache" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_player_stats_cache" TO "service_role";

GRANT ALL ON TABLE "public"."golf_players" TO "anon";

GRANT ALL ON TABLE "public"."golf_players" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_players" TO "service_role";

GRANT ALL ON TABLE "public"."golf_practice_sessions" TO "anon";

GRANT ALL ON TABLE "public"."golf_practice_sessions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_practice_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_prediction_model_performance" TO "anon";

GRANT ALL ON TABLE "public"."golf_prediction_model_performance" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_prediction_model_performance" TO "service_role";

GRANT ALL ON TABLE "public"."golf_prediction_validations" TO "anon";

GRANT ALL ON TABLE "public"."golf_prediction_validations" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_prediction_validations" TO "service_role";

GRANT ALL ON TABLE "public"."golf_predictions" TO "anon";

GRANT ALL ON TABLE "public"."golf_predictions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_predictions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_qualifier_entries" TO "anon";

GRANT ALL ON TABLE "public"."golf_qualifier_entries" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_qualifier_entries" TO "service_role";

GRANT ALL ON TABLE "public"."golf_qualifier_round_courses" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_qualifier_round_courses" TO "service_role";

GRANT ALL ON TABLE "public"."golf_qualifier_selections" TO "anon";

GRANT ALL ON TABLE "public"."golf_qualifier_selections" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_qualifier_selections" TO "service_role";

GRANT ALL ON TABLE "public"."golf_qualifiers" TO "anon";

GRANT ALL ON TABLE "public"."golf_qualifiers" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_qualifiers" TO "service_role";

GRANT ALL ON TABLE "public"."golf_recruit_documents" TO "anon";

GRANT ALL ON TABLE "public"."golf_recruit_documents" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_recruit_documents" TO "service_role";

GRANT ALL ON TABLE "public"."golf_recruits" TO "anon";

GRANT ALL ON TABLE "public"."golf_recruits" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_recruits" TO "service_role";

GRANT ALL ON TABLE "public"."golf_review_events" TO "anon";

GRANT ALL ON TABLE "public"."golf_review_events" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_review_events" TO "service_role";

GRANT ALL ON TABLE "public"."golf_round_reviews" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_round_reviews" TO "service_role";

GRANT UPDATE("updated_at") ON TABLE "public"."golf_round_reviews" TO "authenticated";

GRANT UPDATE("player_viewed_at") ON TABLE "public"."golf_round_reviews" TO "authenticated";

GRANT UPDATE("player_acknowledged_at") ON TABLE "public"."golf_round_reviews" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_round_stats_cache" TO "anon";

GRANT ALL ON TABLE "public"."golf_round_stats_cache" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_round_stats_cache" TO "service_role";

GRANT ALL ON TABLE "public"."golf_rounds" TO "anon";

GRANT ALL ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_rounds" TO "service_role";

GRANT UPDATE("player_id") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("team_id") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("course_id") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("course_name") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("course_city") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("course_state") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("course_rating") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("course_slope") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("tees_played") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("round_date") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("round_type") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("holes_played") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("total_score") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("front_nine") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("back_nine") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("score_to_par") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("status") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("current_hole") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("total_putts") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("total_fairways_hit") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("total_fairways") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("total_gir") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("total_gir_possible") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("weather_conditions") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("notes") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("updated_at") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("qualifier_id") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("qualifier_round_number") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("draft_data") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT UPDATE("total_penalties") ON TABLE "public"."golf_rounds" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_shots" TO "anon";

GRANT ALL ON TABLE "public"."golf_shots" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_shots" TO "service_role";

GRANT ALL ON TABLE "public"."golf_staff_invite_codes" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_staff_invite_codes" TO "service_role";

GRANT ALL ON TABLE "public"."golf_staff_invite_redemptions" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_staff_invite_redemptions" TO "service_role";

GRANT ALL ON TABLE "public"."golf_task_assignments" TO "anon";

GRANT ALL ON TABLE "public"."golf_task_assignments" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_task_assignments" TO "service_role";

GRANT ALL ON TABLE "public"."golf_task_reminders" TO "anon";

GRANT ALL ON TABLE "public"."golf_task_reminders" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_task_reminders" TO "service_role";

GRANT ALL ON TABLE "public"."golf_task_templates" TO "anon";

GRANT ALL ON TABLE "public"."golf_task_templates" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_task_templates" TO "service_role";

GRANT ALL ON TABLE "public"."golf_tasks" TO "anon";

GRANT ALL ON TABLE "public"."golf_tasks" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_tasks" TO "service_role";

GRANT ALL ON TABLE "public"."golf_team_coach_staff" TO "anon";

GRANT ALL ON TABLE "public"."golf_team_coach_staff" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_team_coach_staff" TO "service_role";

GRANT ALL ON TABLE "public"."golf_team_coachhelm_settings" TO "anon";

GRANT ALL ON TABLE "public"."golf_team_coachhelm_settings" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_team_coachhelm_settings" TO "service_role";

GRANT ALL ON TABLE "public"."golf_team_join_requests" TO "anon";

GRANT ALL ON TABLE "public"."golf_team_join_requests" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_team_join_requests" TO "service_role";

GRANT ALL ON TABLE "public"."golf_team_members" TO "anon";

GRANT ALL ON TABLE "public"."golf_team_members" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_team_members" TO "service_role";

GRANT ALL ON TABLE "public"."golf_team_saved_courses" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_team_saved_courses" TO "service_role";

GRANT ALL ON TABLE "public"."golf_team_settings" TO "anon";

GRANT ALL ON TABLE "public"."golf_team_settings" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_team_settings" TO "service_role";

GRANT ALL ON TABLE "public"."golf_teams" TO "anon";

GRANT ALL ON TABLE "public"."golf_teams" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_teams" TO "service_role";

GRANT ALL ON TABLE "public"."golf_travel_budgets" TO "anon";

GRANT ALL ON TABLE "public"."golf_travel_budgets" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_travel_budgets" TO "service_role";

GRANT ALL ON TABLE "public"."golf_travel_expenses" TO "anon";

GRANT ALL ON TABLE "public"."golf_travel_expenses" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_travel_expenses" TO "service_role";

GRANT ALL ON TABLE "public"."golf_travel_itineraries" TO "anon";

GRANT ALL ON TABLE "public"."golf_travel_itineraries" TO "authenticated";

GRANT ALL ON TABLE "public"."golf_travel_itineraries" TO "service_role";

GRANT ALL ON TABLE "public"."putt_details" TO "anon";

GRANT ALL ON TABLE "public"."putt_details" TO "authenticated";

GRANT ALL ON TABLE "public"."putt_details" TO "service_role";
