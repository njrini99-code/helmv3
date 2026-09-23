ALTER TABLE ONLY "public"."approach_miss_details"
    ADD CONSTRAINT "approach_miss_details_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."approach_miss_details"
    ADD CONSTRAINT "approach_miss_details_shot_id_unique" UNIQUE ("shot_id");

ALTER TABLE ONLY "public"."golf_academic_exclusions"
    ADD CONSTRAINT "golf_academic_exclusions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_announcement_acknowledgements"
    ADD CONSTRAINT "golf_announcement_acknowledgement_announcement_id_player_id_key" UNIQUE ("announcement_id", "player_id");

ALTER TABLE ONLY "public"."golf_announcement_acknowledgements"
    ADD CONSTRAINT "golf_announcement_acknowledgements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_announcement_documents"
    ADD CONSTRAINT "golf_announcement_documents_announcement_id_document_id_key" UNIQUE ("announcement_id", "document_id");

ALTER TABLE ONLY "public"."golf_announcement_documents"
    ADD CONSTRAINT "golf_announcement_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_announcement_recipients"
    ADD CONSTRAINT "golf_announcement_recipients_announcement_id_player_id_key" UNIQUE ("announcement_id", "player_id");

ALTER TABLE ONLY "public"."golf_announcement_recipients"
    ADD CONSTRAINT "golf_announcement_recipients_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_announcement_tasks"
    ADD CONSTRAINT "golf_announcement_tasks_announcement_id_task_id_key" UNIQUE ("announcement_id", "task_id");

ALTER TABLE ONLY "public"."golf_announcement_tasks"
    ADD CONSTRAINT "golf_announcement_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_announcements"
    ADD CONSTRAINT "golf_announcements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_attendance_summary"
    ADD CONSTRAINT "golf_attendance_summary_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_attendance_summary"
    ADD CONSTRAINT "golf_attendance_summary_player_id_team_id_period_start_date_key" UNIQUE ("player_id", "team_id", "period_start_date", "period_end_date");

ALTER TABLE ONLY "public"."golf_calendar_feeds"
    ADD CONSTRAINT "golf_calendar_feeds_feed_token_key" UNIQUE ("feed_token");

ALTER TABLE ONLY "public"."golf_calendar_feeds"
    ADD CONSTRAINT "golf_calendar_feeds_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_calendar_notifications"
    ADD CONSTRAINT "golf_calendar_notifications_event_id_user_id_notification_t_key" UNIQUE ("event_id", "user_id", "notification_type");

ALTER TABLE ONLY "public"."golf_calendar_notifications"
    ADD CONSTRAINT "golf_calendar_notifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_causal_relationships"
    ADD CONSTRAINT "golf_causal_relationships_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coach_behavior_log"
    ADD CONSTRAINT "golf_coach_behavior_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coach_blocked_time"
    ADD CONSTRAINT "golf_coach_blocked_time_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coach_insights"
    ADD CONSTRAINT "golf_coach_insights_dedup_key" UNIQUE NULLS NOT DISTINCT ("signature", "player_id", "coach_id", "team_id");

ALTER TABLE ONLY "public"."golf_coach_insights"
    ADD CONSTRAINT "golf_coach_insights_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coach_philosophy"
    ADD CONSTRAINT "golf_coach_philosophy_coach_id_key" UNIQUE ("coach_id");

ALTER TABLE ONLY "public"."golf_coach_philosophy"
    ADD CONSTRAINT "golf_coach_philosophy_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coach_player_intent"
    ADD CONSTRAINT "golf_coach_player_intent_pkey" PRIMARY KEY ("coach_id", "player_id");

ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."golf_coachhelm_action_runs"
    ADD CONSTRAINT "golf_coachhelm_action_runs_idem_unique" UNIQUE ("coach_id", "idempotency_key");

ALTER TABLE ONLY "public"."golf_coachhelm_action_runs"
    ADD CONSTRAINT "golf_coachhelm_action_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coachhelm_chat_conversations"
    ADD CONSTRAINT "golf_coachhelm_chat_conversations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coachhelm_chat_messages"
    ADD CONSTRAINT "golf_coachhelm_chat_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coachhelm_coach_weights"
    ADD CONSTRAINT "golf_coachhelm_coach_weights_pkey" PRIMARY KEY ("coach_id", "insight_type", "intent");

ALTER TABLE ONLY "public"."golf_coachhelm_llm_budget"
    ADD CONSTRAINT "golf_coachhelm_llm_budget_pkey" PRIMARY KEY ("coach_id", "date");

ALTER TABLE ONLY "public"."golf_coachhelm_llm_calls"
    ADD CONSTRAINT "golf_coachhelm_llm_calls_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_coachhelm_settings"
    ADD CONSTRAINT "golf_coachhelm_settings_coach_id_key" UNIQUE ("coach_id");

ALTER TABLE ONLY "public"."golf_coachhelm_settings"
    ADD CONSTRAINT "golf_coachhelm_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_confidence_calibration"
    ADD CONSTRAINT "golf_confidence_calibration_pkey" PRIMARY KEY ("bucket", "prediction_type");

ALTER TABLE ONLY "public"."golf_conversation_participants"
    ADD CONSTRAINT "golf_conversation_participants_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");

ALTER TABLE ONLY "public"."golf_conversation_participants"
    ADD CONSTRAINT "golf_conversation_participants_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_conversations"
    ADD CONSTRAINT "golf_conversations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_course_edit_history"
    ADD CONSTRAINT "golf_course_edit_history_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_course_holes"
    ADD CONSTRAINT "golf_course_holes_course_id_hole_number_key" UNIQUE ("course_id", "hole_number");

ALTER TABLE ONLY "public"."golf_course_holes"
    ADD CONSTRAINT "golf_course_holes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_course_tee_edit_history"
    ADD CONSTRAINT "golf_course_tee_edit_history_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_course_tee_holes"
    ADD CONSTRAINT "golf_course_tee_holes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_demo_sessions"
    ADD CONSTRAINT "golf_demo_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_document_versions"
    ADD CONSTRAINT "golf_document_versions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_documents"
    ADD CONSTRAINT "golf_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_drills"
    ADD CONSTRAINT "golf_drills_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_drills"
    ADD CONSTRAINT "golf_drills_slug_key" UNIQUE ("slug");

ALTER TABLE ONLY "public"."golf_event_attendance"
    ADD CONSTRAINT "golf_event_attendance_event_id_player_id_key" UNIQUE ("event_id", "player_id");

ALTER TABLE ONLY "public"."golf_event_attendance"
    ADD CONSTRAINT "golf_event_attendance_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_event_documents"
    ADD CONSTRAINT "golf_event_documents_pkey" PRIMARY KEY ("event_id", "document_id");

ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_global_patterns"
    ADD CONSTRAINT "golf_global_patterns_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_global_patterns"
    ADD CONSTRAINT "golf_global_patterns_signature_unique" UNIQUE ("signature");

ALTER TABLE ONLY "public"."golf_goal_suggestions"
    ADD CONSTRAINT "golf_goal_suggestions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_goals"
    ADD CONSTRAINT "golf_goals_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_holes"
    ADD CONSTRAINT "golf_holes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_holes"
    ADD CONSTRAINT "golf_holes_round_id_hole_number_key" UNIQUE ("round_id", "hole_number");

ALTER TABLE ONLY "public"."golf_ingest_connections"
    ADD CONSTRAINT "golf_ingest_connections_pkey" PRIMARY KEY ("player_id", "provider");

ALTER TABLE ONLY "public"."golf_ingest_sync_log"
    ADD CONSTRAINT "golf_ingest_sync_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_insight_action"
    ADD CONSTRAINT "golf_insight_action_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_insight_drill_attachments"
    ADD CONSTRAINT "golf_insight_drill_attachments_pkey" PRIMARY KEY ("insight_id", "drill_id");

ALTER TABLE ONLY "public"."golf_insight_effectiveness"
    ADD CONSTRAINT "golf_insight_effectiveness_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_insight_exposure"
    ADD CONSTRAINT "golf_insight_exposure_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_insight_generation_log"
    ADD CONSTRAINT "golf_insight_generation_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_insight_outcome_attribution"
    ADD CONSTRAINT "golf_insight_outcome_attribution_pkey" PRIMARY KEY ("insight_id");

ALTER TABLE ONLY "public"."golf_insight_outcome"
    ADD CONSTRAINT "golf_insight_outcome_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_insight_player_feedback"
    ADD CONSTRAINT "golf_insight_player_feedback_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_insight_player_feedback"
    ADD CONSTRAINT "golf_insight_player_feedback_unique" UNIQUE ("insight_id", "player_id");

ALTER TABLE ONLY "public"."golf_learned_behavior"
    ADD CONSTRAINT "golf_learned_behavior_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_message_attachments"
    ADD CONSTRAINT "golf_message_attachments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_message_mentions"
    ADD CONSTRAINT "golf_message_mentions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_message_reactions"
    ADD CONSTRAINT "golf_message_reactions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_message_reactions"
    ADD CONSTRAINT "golf_message_reactions_unique" UNIQUE ("message_id", "user_id", "emoji");

ALTER TABLE ONLY "public"."golf_message_responses"
    ADD CONSTRAINT "golf_message_responses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_message_responses"
    ADD CONSTRAINT "golf_message_responses_unique" UNIQUE ("message_id", "user_id");

ALTER TABLE ONLY "public"."golf_messages"
    ADD CONSTRAINT "golf_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_metrics"
    ADD CONSTRAINT "golf_metrics_pkey" PRIMARY KEY ("metric_id");

ALTER TABLE ONLY "public"."golf_patterns_v2"
    ADD CONSTRAINT "golf_patterns_v2_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_pga_standards"
    ADD CONSTRAINT "golf_pga_standards_pkey" PRIMARY KEY ("metric_id", "season", "tour");

ALTER TABLE ONLY "public"."golf_platform_metrics_daily"
    ADD CONSTRAINT "golf_platform_metrics_daily_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_platform_metrics_daily"
    ADD CONSTRAINT "golf_platform_metrics_daily_snapshot_date_key" UNIQUE ("snapshot_date");

ALTER TABLE ONLY "public"."golf_player_classes"
    ADD CONSTRAINT "golf_player_classes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_player_courses"
    ADD CONSTRAINT "golf_player_courses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_player_focus_areas"
    ADD CONSTRAINT "golf_player_focus_areas_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_player_genome"
    ADD CONSTRAINT "golf_player_genome_pkey" PRIMARY KEY ("player_id");

ALTER TABLE ONLY "public"."golf_player_notification_state"
    ADD CONSTRAINT "golf_player_notification_state_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_player_notification_state"
    ADD CONSTRAINT "golf_player_notification_state_player_id_key" UNIQUE ("player_id");

ALTER TABLE ONLY "public"."golf_player_standing"
    ADD CONSTRAINT "golf_player_standing_pkey" PRIMARY KEY ("player_id", "metric_id");

ALTER TABLE ONLY "public"."golf_player_stats_cache"
    ADD CONSTRAINT "golf_player_stats_cache_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_player_stats_cache"
    ADD CONSTRAINT "golf_player_stats_cache_player_id_key" UNIQUE ("player_id");

ALTER TABLE ONLY "public"."golf_players"
    ADD CONSTRAINT "golf_players_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_players"
    ADD CONSTRAINT "golf_players_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."golf_practice_sessions"
    ADD CONSTRAINT "golf_practice_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_prediction_model_performance"
    ADD CONSTRAINT "golf_prediction_model_perform_team_id_model_type_period_sta_key" UNIQUE ("team_id", "model_type", "period_start", "period_end");

ALTER TABLE ONLY "public"."golf_prediction_model_performance"
    ADD CONSTRAINT "golf_prediction_model_performance_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_prediction_validations"
    ADD CONSTRAINT "golf_prediction_validations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_predictions"
    ADD CONSTRAINT "golf_predictions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_qualifier_id_player_id_key" UNIQUE ("qualifier_id", "player_id");

ALTER TABLE ONLY "public"."golf_qualifier_round_courses"
    ADD CONSTRAINT "golf_qualifier_round_courses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_qualifier_round_courses"
    ADD CONSTRAINT "golf_qualifier_round_courses_qualifier_id_round_number_key" UNIQUE ("qualifier_id", "round_number");

ALTER TABLE ONLY "public"."golf_qualifier_selections"
    ADD CONSTRAINT "golf_qualifier_selections_pkey" PRIMARY KEY ("qualifier_id", "player_id");

ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_recruit_documents"
    ADD CONSTRAINT "golf_recruit_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_recruits"
    ADD CONSTRAINT "golf_recruits_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_review_events"
    ADD CONSTRAINT "golf_review_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_round_reviews"
    ADD CONSTRAINT "golf_round_reviews_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_round_reviews"
    ADD CONSTRAINT "golf_round_reviews_round_id_key" UNIQUE ("round_id");

ALTER TABLE ONLY "public"."golf_round_stats_cache"
    ADD CONSTRAINT "golf_round_stats_cache_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_round_stats_cache"
    ADD CONSTRAINT "golf_round_stats_cache_round_id_key" UNIQUE ("round_id");

ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_shots"
    ADD CONSTRAINT "golf_shots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_staff_invite_codes"
    ADD CONSTRAINT "golf_staff_invite_codes_pkey" PRIMARY KEY ("code");

ALTER TABLE ONLY "public"."golf_staff_invite_redemptions"
    ADD CONSTRAINT "golf_staff_invite_redemptions_pkey" PRIMARY KEY ("nonce");

ALTER TABLE ONLY "public"."golf_task_assignments"
    ADD CONSTRAINT "golf_task_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_task_assignments"
    ADD CONSTRAINT "golf_task_assignments_task_id_player_id_key" UNIQUE ("task_id", "player_id");

ALTER TABLE ONLY "public"."golf_task_reminders"
    ADD CONSTRAINT "golf_task_reminders_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_task_templates"
    ADD CONSTRAINT "golf_task_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_team_coach_staff"
    ADD CONSTRAINT "golf_team_coach_staff_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_team_coach_staff"
    ADD CONSTRAINT "golf_team_coach_staff_team_id_coach_id_key" UNIQUE ("team_id", "coach_id");

ALTER TABLE ONLY "public"."golf_team_coachhelm_settings"
    ADD CONSTRAINT "golf_team_coachhelm_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_team_coachhelm_settings"
    ADD CONSTRAINT "golf_team_coachhelm_settings_team_id_key" UNIQUE ("team_id");

ALTER TABLE ONLY "public"."golf_team_join_requests"
    ADD CONSTRAINT "golf_team_join_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_team_join_requests"
    ADD CONSTRAINT "golf_team_join_requests_team_id_player_id_status_key" UNIQUE ("team_id", "player_id", "status");

ALTER TABLE ONLY "public"."golf_team_members"
    ADD CONSTRAINT "golf_team_members_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_team_members"
    ADD CONSTRAINT "golf_team_members_team_id_player_id_key" UNIQUE ("team_id", "player_id");

ALTER TABLE ONLY "public"."golf_team_saved_courses"
    ADD CONSTRAINT "golf_team_saved_courses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_team_settings"
    ADD CONSTRAINT "golf_team_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_team_settings"
    ADD CONSTRAINT "golf_team_settings_team_id_key" UNIQUE ("team_id");

ALTER TABLE ONLY "public"."golf_teams"
    ADD CONSTRAINT "golf_teams_join_code_key" UNIQUE ("join_code");

ALTER TABLE ONLY "public"."golf_teams"
    ADD CONSTRAINT "golf_teams_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_travel_budgets"
    ADD CONSTRAINT "golf_travel_budgets_itinerary_id_category_key" UNIQUE ("itinerary_id", "category");

ALTER TABLE ONLY "public"."golf_travel_budgets"
    ADD CONSTRAINT "golf_travel_budgets_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_travel_expenses"
    ADD CONSTRAINT "golf_travel_expenses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."putt_details"
    ADD CONSTRAINT "putt_details_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."putt_details"
    ADD CONSTRAINT "putt_details_shot_id_unique" UNIQUE ("shot_id");

ALTER TABLE ONLY "public"."golf_document_versions"
    ADD CONSTRAINT "unique_document_version" UNIQUE ("document_id", "version_number");

ALTER TABLE ONLY "public"."approach_miss_details"
    ADD CONSTRAINT "approach_miss_details_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "public"."golf_shots"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_academic_exclusions"
    ADD CONSTRAINT "golf_academic_exclusions_excluded_by_fkey" FOREIGN KEY ("excluded_by") REFERENCES "public"."golf_coaches"("id");

ALTER TABLE ONLY "public"."golf_academic_exclusions"
    ADD CONSTRAINT "golf_academic_exclusions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_acknowledgements"
    ADD CONSTRAINT "golf_announcement_acknowledgements_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."golf_announcements"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_acknowledgements"
    ADD CONSTRAINT "golf_announcement_acknowledgements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_documents"
    ADD CONSTRAINT "golf_announcement_documents_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."golf_announcements"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_documents"
    ADD CONSTRAINT "golf_announcement_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."golf_documents"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_recipients"
    ADD CONSTRAINT "golf_announcement_recipients_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."golf_announcements"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_recipients"
    ADD CONSTRAINT "golf_announcement_recipients_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_tasks"
    ADD CONSTRAINT "golf_announcement_tasks_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."golf_announcements"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcement_tasks"
    ADD CONSTRAINT "golf_announcement_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."golf_tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_announcements"
    ADD CONSTRAINT "golf_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id");

ALTER TABLE ONLY "public"."golf_announcements"
    ADD CONSTRAINT "golf_announcements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_attendance_summary"
    ADD CONSTRAINT "golf_attendance_summary_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_attendance_summary"
    ADD CONSTRAINT "golf_attendance_summary_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_calendar_feeds"
    ADD CONSTRAINT "golf_calendar_feeds_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_calendar_feeds"
    ADD CONSTRAINT "golf_calendar_feeds_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_calendar_feeds"
    ADD CONSTRAINT "golf_calendar_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_calendar_notifications"
    ADD CONSTRAINT "golf_calendar_notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."golf_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_calendar_notifications"
    ADD CONSTRAINT "golf_calendar_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_causal_relationships"
    ADD CONSTRAINT "golf_causal_relationships_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_causal_relationships"
    ADD CONSTRAINT "golf_causal_relationships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coach_blocked_time"
    ADD CONSTRAINT "golf_coach_blocked_time_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coach_insights"
    ADD CONSTRAINT "golf_coach_insights_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coach_insights"
    ADD CONSTRAINT "golf_coach_insights_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coach_insights"
    ADD CONSTRAINT "golf_coach_insights_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coach_philosophy"
    ADD CONSTRAINT "golf_coach_philosophy_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coach_player_intent"
    ADD CONSTRAINT "golf_coach_player_intent_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coach_player_intent"
    ADD CONSTRAINT "golf_coach_player_intent_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_coaches"
    ADD CONSTRAINT "golf_coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_action_runs"
    ADD CONSTRAINT "golf_coachhelm_action_runs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_action_runs"
    ADD CONSTRAINT "golf_coachhelm_action_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."golf_coachhelm_chat_conversations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_coachhelm_action_runs"
    ADD CONSTRAINT "golf_coachhelm_action_runs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."golf_coachhelm_chat_messages"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_coachhelm_action_runs"
    ADD CONSTRAINT "golf_coachhelm_action_runs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_chat_conversations"
    ADD CONSTRAINT "golf_coachhelm_chat_conversations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_chat_messages"
    ADD CONSTRAINT "golf_coachhelm_chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."golf_coachhelm_chat_conversations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_coach_weights"
    ADD CONSTRAINT "golf_coachhelm_coach_weights_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_llm_budget"
    ADD CONSTRAINT "golf_coachhelm_llm_budget_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_llm_calls"
    ADD CONSTRAINT "golf_coachhelm_llm_calls_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_coachhelm_llm_calls"
    ADD CONSTRAINT "golf_coachhelm_llm_calls_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_coachhelm_settings"
    ADD CONSTRAINT "golf_coachhelm_settings_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_coachhelm_settings"
    ADD CONSTRAINT "golf_coachhelm_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_coachhelm_settings"
    ADD CONSTRAINT "golf_coachhelm_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_conversation_participants"
    ADD CONSTRAINT "golf_conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."golf_conversations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_conversation_participants"
    ADD CONSTRAINT "golf_conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_conversations"
    ADD CONSTRAINT "golf_conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_conversations"
    ADD CONSTRAINT "golf_conversations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_edit_history"
    ADD CONSTRAINT "golf_course_edit_history_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_course_edit_history"
    ADD CONSTRAINT "golf_course_edit_history_edited_by_team_id_fkey" FOREIGN KEY ("edited_by_team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_edit_history"
    ADD CONSTRAINT "golf_course_edit_history_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_holes"
    ADD CONSTRAINT "golf_course_holes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_course_tee_edit_history"
    ADD CONSTRAINT "golf_course_tee_edit_history_edited_by_team_id_fkey" FOREIGN KEY ("edited_by_team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_tee_edit_history"
    ADD CONSTRAINT "golf_course_tee_edit_history_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_tee_edit_history"
    ADD CONSTRAINT "golf_course_tee_edit_history_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."golf_course_tees"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_course_tee_holes"
    ADD CONSTRAINT "golf_course_tee_holes_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."golf_course_tees"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_created_by_team_id_fkey" FOREIGN KEY ("created_by_team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_last_edited_by_team_id_fkey" FOREIGN KEY ("last_edited_by_team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_course_tees"
    ADD CONSTRAINT "golf_course_tees_last_edited_by_user_id_fkey" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_created_by_team_id_fkey" FOREIGN KEY ("created_by_team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_last_edited_by_team_id_fkey" FOREIGN KEY ("last_edited_by_team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_courses"
    ADD CONSTRAINT "golf_courses_last_edited_by_user_id_fkey" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_demo_sessions"
    ADD CONSTRAINT "golf_demo_sessions_crm_coach_id_fkey" FOREIGN KEY ("crm_coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_document_versions"
    ADD CONSTRAINT "golf_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."golf_documents"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_documents"
    ADD CONSTRAINT "golf_documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "public"."golf_document_versions"("id");

ALTER TABLE ONLY "public"."golf_documents"
    ADD CONSTRAINT "golf_documents_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_documents"
    ADD CONSTRAINT "golf_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_drills"
    ADD CONSTRAINT "golf_drills_impacts_metric_id_fkey" FOREIGN KEY ("impacts_metric_id") REFERENCES "public"."golf_metrics"("metric_id");

ALTER TABLE ONLY "public"."golf_event_attendance"
    ADD CONSTRAINT "golf_event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."golf_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_event_attendance"
    ADD CONSTRAINT "golf_event_attendance_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_event_documents"
    ADD CONSTRAINT "golf_event_documents_attached_by_fkey" FOREIGN KEY ("attached_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_event_documents"
    ADD CONSTRAINT "golf_event_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."golf_documents"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_event_documents"
    ADD CONSTRAINT "golf_event_documents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."golf_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_parent_event_id_fkey" FOREIGN KEY ("parent_event_id") REFERENCES "public"."golf_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_events"
    ADD CONSTRAINT "golf_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_goal_suggestions"
    ADD CONSTRAINT "golf_goal_suggestions_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "public"."golf_metrics"("metric_id");

ALTER TABLE ONLY "public"."golf_goal_suggestions"
    ADD CONSTRAINT "golf_goal_suggestions_origin_insight_id_fkey" FOREIGN KEY ("origin_insight_id") REFERENCES "public"."golf_coach_insights"("id");

ALTER TABLE ONLY "public"."golf_goal_suggestions"
    ADD CONSTRAINT "golf_goal_suggestions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_goals"
    ADD CONSTRAINT "golf_goals_coach_id_if_assigned_fkey" FOREIGN KEY ("coach_id_if_assigned") REFERENCES "public"."golf_coaches"("id");

ALTER TABLE ONLY "public"."golf_goals"
    ADD CONSTRAINT "golf_goals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."golf_goals"
    ADD CONSTRAINT "golf_goals_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "public"."golf_metrics"("metric_id");

ALTER TABLE ONLY "public"."golf_goals"
    ADD CONSTRAINT "golf_goals_origin_insight_id_fkey" FOREIGN KEY ("origin_insight_id") REFERENCES "public"."golf_coach_insights"("id");

ALTER TABLE ONLY "public"."golf_goals"
    ADD CONSTRAINT "golf_goals_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_goals"
    ADD CONSTRAINT "golf_goals_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_holes"
    ADD CONSTRAINT "golf_holes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_ingest_connections"
    ADD CONSTRAINT "golf_ingest_connections_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_action"
    ADD CONSTRAINT "golf_insight_action_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."golf_coach_insights"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_action"
    ADD CONSTRAINT "golf_insight_action_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_drill_attachments"
    ADD CONSTRAINT "golf_insight_drill_attachments_drill_id_fkey" FOREIGN KEY ("drill_id") REFERENCES "public"."golf_drills"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_drill_attachments"
    ADD CONSTRAINT "golf_insight_drill_attachments_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."golf_coach_insights"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_effectiveness"
    ADD CONSTRAINT "golf_insight_effectiveness_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_exposure"
    ADD CONSTRAINT "golf_insight_exposure_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."golf_coach_insights"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_exposure"
    ADD CONSTRAINT "golf_insight_exposure_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_generation_log"
    ADD CONSTRAINT "golf_insight_generation_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_generation_log"
    ADD CONSTRAINT "golf_insight_generation_log_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_outcome_attribution"
    ADD CONSTRAINT "golf_insight_outcome_attribution_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."golf_coach_insights"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_outcome"
    ADD CONSTRAINT "golf_insight_outcome_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."golf_coach_insights"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_outcome"
    ADD CONSTRAINT "golf_insight_outcome_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_player_feedback"
    ADD CONSTRAINT "golf_insight_player_feedback_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."golf_coach_insights"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_insight_player_feedback"
    ADD CONSTRAINT "golf_insight_player_feedback_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_message_attachments"
    ADD CONSTRAINT "golf_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."golf_messages"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_message_mentions"
    ADD CONSTRAINT "golf_message_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_message_mentions"
    ADD CONSTRAINT "golf_message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."golf_messages"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_message_reactions"
    ADD CONSTRAINT "golf_message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."golf_messages"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_message_reactions"
    ADD CONSTRAINT "golf_message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_message_responses"
    ADD CONSTRAINT "golf_message_responses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."golf_messages"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_message_responses"
    ADD CONSTRAINT "golf_message_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_messages"
    ADD CONSTRAINT "golf_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."golf_conversations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_messages"
    ADD CONSTRAINT "golf_messages_pinned_by_fkey" FOREIGN KEY ("pinned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_messages"
    ADD CONSTRAINT "golf_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."golf_messages"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_messages"
    ADD CONSTRAINT "golf_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_patterns_v2"
    ADD CONSTRAINT "golf_patterns_v2_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_patterns_v2"
    ADD CONSTRAINT "golf_patterns_v2_validator_coach_id_fkey" FOREIGN KEY ("validator_coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_pga_standards"
    ADD CONSTRAINT "golf_pga_standards_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "public"."golf_metrics"("metric_id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."golf_player_classes"
    ADD CONSTRAINT "golf_player_classes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_player_classes"
    ADD CONSTRAINT "golf_player_classes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_player_courses"
    ADD CONSTRAINT "golf_player_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_player_courses"
    ADD CONSTRAINT "golf_player_courses_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_player_focus_areas"
    ADD CONSTRAINT "golf_player_focus_areas_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_player_focus_areas"
    ADD CONSTRAINT "golf_player_focus_areas_from_review_id_fkey" FOREIGN KEY ("from_review_id") REFERENCES "public"."golf_round_reviews"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_player_focus_areas"
    ADD CONSTRAINT "golf_player_focus_areas_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_player_focus_areas"
    ADD CONSTRAINT "golf_player_focus_areas_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_player_genome"
    ADD CONSTRAINT "golf_player_genome_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_player_notification_state"
    ADD CONSTRAINT "golf_player_notification_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_player_standing"
    ADD CONSTRAINT "golf_player_standing_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "public"."golf_metrics"("metric_id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."golf_player_standing"
    ADD CONSTRAINT "golf_player_standing_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_player_stats_cache"
    ADD CONSTRAINT "golf_player_stats_cache_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_players"
    ADD CONSTRAINT "golf_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_practice_sessions"
    ADD CONSTRAINT "golf_practice_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_prediction_model_performance"
    ADD CONSTRAINT "golf_prediction_model_performance_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_prediction_validations"
    ADD CONSTRAINT "golf_prediction_validations_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "public"."golf_predictions"("id") ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY "public"."golf_predictions"
    ADD CONSTRAINT "golf_predictions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_predictions"
    ADD CONSTRAINT "golf_predictions_related_event_id_fkey" FOREIGN KEY ("related_event_id") REFERENCES "public"."golf_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_predictions"
    ADD CONSTRAINT "golf_predictions_related_round_id_fkey" FOREIGN KEY ("related_round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_qualifier_id_fkey" FOREIGN KEY ("qualifier_id") REFERENCES "public"."golf_qualifiers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_qualifier_entries"
    ADD CONSTRAINT "golf_qualifier_entries_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_qualifier_round_courses"
    ADD CONSTRAINT "golf_qualifier_round_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id");

ALTER TABLE ONLY "public"."golf_qualifier_round_courses"
    ADD CONSTRAINT "golf_qualifier_round_courses_qualifier_id_fkey" FOREIGN KEY ("qualifier_id") REFERENCES "public"."golf_qualifiers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_qualifier_selections"
    ADD CONSTRAINT "golf_qualifier_selections_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_qualifier_selections"
    ADD CONSTRAINT "golf_qualifier_selections_qualifier_id_fkey" FOREIGN KEY ("qualifier_id") REFERENCES "public"."golf_qualifiers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_qualifier_selections"
    ADD CONSTRAINT "golf_qualifier_selections_selected_by_user_id_fkey" FOREIGN KEY ("selected_by_user_id") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_target_tournament_id_fkey" FOREIGN KEY ("target_tournament_id") REFERENCES "public"."golf_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_qualifiers"
    ADD CONSTRAINT "golf_qualifiers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_recruit_documents"
    ADD CONSTRAINT "golf_recruit_documents_recruit_id_fkey" FOREIGN KEY ("recruit_id") REFERENCES "public"."golf_recruits"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_recruit_documents"
    ADD CONSTRAINT "golf_recruit_documents_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_recruit_documents"
    ADD CONSTRAINT "golf_recruit_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_recruits"
    ADD CONSTRAINT "golf_recruits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_recruits"
    ADD CONSTRAINT "golf_recruits_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_review_events"
    ADD CONSTRAINT "golf_review_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_review_events"
    ADD CONSTRAINT "golf_review_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_review_events"
    ADD CONSTRAINT "golf_review_events_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."golf_round_reviews"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_round_reviews"
    ADD CONSTRAINT "golf_round_reviews_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_round_reviews"
    ADD CONSTRAINT "golf_round_reviews_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_round_reviews"
    ADD CONSTRAINT "golf_round_reviews_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_round_stats_cache"
    ADD CONSTRAINT "golf_round_stats_cache_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_round_stats_cache"
    ADD CONSTRAINT "golf_round_stats_cache_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_qualifier_id_fkey" FOREIGN KEY ("qualifier_id") REFERENCES "public"."golf_qualifiers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_rounds"
    ADD CONSTRAINT "golf_rounds_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."golf_course_tees"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_shots"
    ADD CONSTRAINT "golf_shots_hole_id_fkey" FOREIGN KEY ("hole_id") REFERENCES "public"."golf_holes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_shots"
    ADD CONSTRAINT "golf_shots_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."golf_rounds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_staff_invite_codes"
    ADD CONSTRAINT "golf_staff_invite_codes_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_staff_invite_codes"
    ADD CONSTRAINT "golf_staff_invite_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_staff_invite_codes"
    ADD CONSTRAINT "golf_staff_invite_codes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_staff_invite_redemptions"
    ADD CONSTRAINT "golf_staff_invite_redemptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_staff_invite_redemptions"
    ADD CONSTRAINT "golf_staff_invite_redemptions_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_staff_invite_redemptions"
    ADD CONSTRAINT "golf_staff_invite_redemptions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_task_assignments"
    ADD CONSTRAINT "golf_task_assignments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_task_assignments"
    ADD CONSTRAINT "golf_task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."golf_tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_task_reminders"
    ADD CONSTRAINT "golf_task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."golf_tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_task_templates"
    ADD CONSTRAINT "golf_task_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."golf_task_templates"
    ADD CONSTRAINT "golf_task_templates_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."golf_tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_tasks"
    ADD CONSTRAINT "golf_tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_coach_staff"
    ADD CONSTRAINT "golf_team_coach_staff_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."golf_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_coach_staff"
    ADD CONSTRAINT "golf_team_coach_staff_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_coachhelm_settings"
    ADD CONSTRAINT "golf_team_coachhelm_settings_disabled_by_fkey" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."golf_team_coachhelm_settings"
    ADD CONSTRAINT "golf_team_coachhelm_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_join_requests"
    ADD CONSTRAINT "golf_team_join_requests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_join_requests"
    ADD CONSTRAINT "golf_team_join_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_team_join_requests"
    ADD CONSTRAINT "golf_team_join_requests_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_members"
    ADD CONSTRAINT "golf_team_members_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_team_members"
    ADD CONSTRAINT "golf_team_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."golf_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_members"
    ADD CONSTRAINT "golf_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_saved_courses"
    ADD CONSTRAINT "golf_team_saved_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."golf_courses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_saved_courses"
    ADD CONSTRAINT "golf_team_saved_courses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_team_saved_courses"
    ADD CONSTRAINT "golf_team_saved_courses_default_tee_id_fkey" FOREIGN KEY ("default_tee_id") REFERENCES "public"."golf_course_tees"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_team_saved_courses"
    ADD CONSTRAINT "golf_team_saved_courses_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_team_settings"
    ADD CONSTRAINT "golf_team_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_teams"
    ADD CONSTRAINT "golf_teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_teams"
    ADD CONSTRAINT "golf_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_travel_budgets"
    ADD CONSTRAINT "golf_travel_budgets_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "public"."golf_travel_itineraries"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_travel_expenses"
    ADD CONSTRAINT "golf_travel_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."golf_travel_expenses"
    ADD CONSTRAINT "golf_travel_expenses_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "public"."golf_travel_itineraries"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_travel_expenses"
    ADD CONSTRAINT "golf_travel_expenses_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."golf_coaches"("id");

ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."golf_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."golf_travel_itineraries"
    ADD CONSTRAINT "golf_travel_itineraries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."golf_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."putt_details"
    ADD CONSTRAINT "putt_details_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "public"."golf_shots"("id") ON DELETE CASCADE;
