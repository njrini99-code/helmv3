CREATE INDEX "golf_causal_relationships_updated_at_idx" ON "public"."golf_causal_relationships" USING "btree" ("updated_at" DESC);

CREATE INDEX "golf_coach_player_intent_player_id_idx" ON "public"."golf_coach_player_intent" USING "btree" ("player_id");

CREATE INDEX "golf_coachhelm_chat_conversations_coach_idx" ON "public"."golf_coachhelm_chat_conversations" USING "btree" ("coach_id", "updated_at" DESC);

CREATE INDEX "golf_coachhelm_chat_messages_conv_idx" ON "public"."golf_coachhelm_chat_messages" USING "btree" ("conversation_id", "created_at");

CREATE UNIQUE INDEX "golf_coachhelm_chat_messages_conv_turn_uniq" ON "public"."golf_coachhelm_chat_messages" USING "btree" ("conversation_id", "role", "client_turn_id");

COMMENT ON INDEX "public"."golf_coachhelm_chat_messages_conv_turn_uniq" IS 'Idempotency arbiter for the user-turn upsert. Deliberately NOT partial: PostgREST on_conflict cannot express an index predicate, and a partial index made every idempotent send fail. Null client_turn_id rows stay unconstrained because Postgres treats NULLs as distinct.';

CREATE INDEX "golf_coachhelm_llm_budget_date_idx" ON "public"."golf_coachhelm_llm_budget" USING "btree" ("date" DESC);

CREATE INDEX "golf_coachhelm_llm_calls_coach_task_idx" ON "public"."golf_coachhelm_llm_calls" USING "btree" ("coach_id", "task", "created_at" DESC);

CREATE INDEX "golf_coachhelm_llm_calls_created_idx" ON "public"."golf_coachhelm_llm_calls" USING "btree" ("created_at" DESC);

CREATE INDEX "golf_coachhelm_llm_calls_player_id_idx" ON "public"."golf_coachhelm_llm_calls" USING "btree" ("player_id");

CREATE INDEX "golf_coachhelm_settings_team_id_idx" ON "public"."golf_coachhelm_settings" USING "btree" ("team_id");

CREATE INDEX "golf_course_edit_history_course_idx" ON "public"."golf_course_edit_history" USING "btree" ("course_id", "created_at" DESC);

CREATE INDEX "golf_course_edit_history_edited_by_team_id_idx" ON "public"."golf_course_edit_history" USING "btree" ("edited_by_team_id");

CREATE INDEX "golf_course_edit_history_edited_by_user_id_idx" ON "public"."golf_course_edit_history" USING "btree" ("edited_by_user_id");

CREATE INDEX "golf_course_tee_edit_history_edited_by_team_id_idx" ON "public"."golf_course_tee_edit_history" USING "btree" ("edited_by_team_id");

CREATE INDEX "golf_course_tee_edit_history_edited_by_user_id_idx" ON "public"."golf_course_tee_edit_history" USING "btree" ("edited_by_user_id");

CREATE INDEX "golf_course_tee_edit_history_tee_idx" ON "public"."golf_course_tee_edit_history" USING "btree" ("tee_id", "created_at" DESC);

CREATE UNIQUE INDEX "golf_course_tee_holes_tee_hole_uidx" ON "public"."golf_course_tee_holes" USING "btree" ("tee_id", "hole_number");

CREATE INDEX "golf_course_tees_course_idx" ON "public"."golf_course_tees" USING "btree" ("course_id") WHERE ("deleted_at" IS NULL);

CREATE UNIQUE INDEX "golf_course_tees_course_norm_uidx" ON "public"."golf_course_tees" USING "btree" ("course_id", "normalized_tee_name") WHERE ("deleted_at" IS NULL);

CREATE INDEX "golf_course_tees_created_by_team_id_idx" ON "public"."golf_course_tees" USING "btree" ("created_by_team_id");

CREATE INDEX "golf_course_tees_created_by_user_id_idx" ON "public"."golf_course_tees" USING "btree" ("created_by_user_id");

CREATE INDEX "golf_course_tees_last_edited_by_team_id_idx" ON "public"."golf_course_tees" USING "btree" ("last_edited_by_team_id");

CREATE INDEX "golf_course_tees_last_edited_by_user_id_idx" ON "public"."golf_course_tees" USING "btree" ("last_edited_by_user_id");

CREATE INDEX "golf_courses_created_by_team_id_idx" ON "public"."golf_courses" USING "btree" ("created_by_team_id");

CREATE INDEX "golf_courses_created_by_user_id_idx" ON "public"."golf_courses" USING "btree" ("created_by_user_id");

CREATE INDEX "golf_courses_last_edited_by_team_id_idx" ON "public"."golf_courses" USING "btree" ("last_edited_by_team_id");

CREATE INDEX "golf_courses_last_edited_by_user_id_idx" ON "public"."golf_courses" USING "btree" ("last_edited_by_user_id");

CREATE UNIQUE INDEX "golf_courses_normalized_name_key" ON "public"."golf_courses" USING "btree" ("normalized_name") WHERE (("deleted_at" IS NULL) AND ("normalized_name" IS NOT NULL) AND ("normalized_name" <> ''::"text"));

CREATE INDEX "golf_demo_sessions_crm_coach_id_idx" ON "public"."golf_demo_sessions" USING "btree" ("crm_coach_id");

CREATE INDEX "golf_demo_sessions_email_idx" ON "public"."golf_demo_sessions" USING "btree" ("email");

CREATE INDEX "golf_demo_sessions_entered_at_idx" ON "public"."golf_demo_sessions" USING "btree" ("entered_at" DESC);

CREATE INDEX "golf_demo_sessions_traffic_quality_entered_at_idx" ON "public"."golf_demo_sessions" USING "btree" ("traffic_quality", "entered_at" DESC);

CREATE INDEX "golf_drills_impacts_metric_idx" ON "public"."golf_drills" USING "btree" ("impacts_metric_id") WHERE ("impacts_metric_id" IS NOT NULL);

CREATE INDEX "golf_event_documents_attached_by_idx" ON "public"."golf_event_documents" USING "btree" ("attached_by");

CREATE INDEX "golf_goal_suggestions_metric_id_idx" ON "public"."golf_goal_suggestions" USING "btree" ("metric_id");

CREATE INDEX "golf_goal_suggestions_origin_insight_id_idx" ON "public"."golf_goal_suggestions" USING "btree" ("origin_insight_id");

CREATE INDEX "golf_goals_coach_id_if_assigned_idx" ON "public"."golf_goals" USING "btree" ("coach_id_if_assigned");

CREATE INDEX "golf_goals_created_by_user_id_idx" ON "public"."golf_goals" USING "btree" ("created_by_user_id");

CREATE INDEX "golf_goals_metric_id_idx" ON "public"."golf_goals" USING "btree" ("metric_id");

CREATE INDEX "golf_goals_origin_insight_id_idx" ON "public"."golf_goals" USING "btree" ("origin_insight_id");

CREATE INDEX "golf_ingest_sync_log_player_idx" ON "public"."golf_ingest_sync_log" USING "btree" ("player_id", "ran_at" DESC);

CREATE INDEX "golf_insight_action_insight_idx" ON "public"."golf_insight_action" USING "btree" ("insight_id");

CREATE INDEX "golf_insight_action_player_idx" ON "public"."golf_insight_action" USING "btree" ("player_id", "created_at" DESC);

CREATE INDEX "golf_insight_drill_attachments_drill_id_idx" ON "public"."golf_insight_drill_attachments" USING "btree" ("drill_id");

CREATE UNIQUE INDEX "golf_insight_effectiveness_natural_key" ON "public"."golf_insight_effectiveness" USING "btree" ("team_id", "insight_type", "period_start", "period_end");

COMMENT ON INDEX "public"."golf_insight_effectiveness_natural_key" IS 'Daily rollup natural key written by src/lib/coachhelm/v2/analytics/effectiveness-writer.ts';

CREATE INDEX "golf_insight_exposure_created_at_idx" ON "public"."golf_insight_exposure" USING "btree" ("created_at" DESC);

CREATE INDEX "golf_insight_exposure_insight_idx" ON "public"."golf_insight_exposure" USING "btree" ("insight_id");

CREATE INDEX "golf_insight_exposure_player_idx" ON "public"."golf_insight_exposure" USING "btree" ("player_id", "shown_at" DESC);

CREATE INDEX "golf_insight_generation_log_team_id_idx" ON "public"."golf_insight_generation_log" USING "btree" ("team_id");

CREATE INDEX "golf_insight_outcome_attribution_metric_idx" ON "public"."golf_insight_outcome_attribution" USING "btree" ("target_metric_id", "attributed_at" DESC);

CREATE INDEX "golf_insight_outcome_insight_idx" ON "public"."golf_insight_outcome" USING "btree" ("insight_id");

CREATE INDEX "golf_insight_outcome_player_idx" ON "public"."golf_insight_outcome" USING "btree" ("player_id", "measured_at" DESC);

CREATE INDEX "golf_insight_player_feedback_player_id_idx" ON "public"."golf_insight_player_feedback" USING "btree" ("player_id");

CREATE INDEX "golf_message_mentions_message_idx" ON "public"."golf_message_mentions" USING "btree" ("message_id");

CREATE INDEX "golf_message_mentions_user_idx" ON "public"."golf_message_mentions" USING "btree" ("mentioned_user_id") WHERE ("mentioned_user_id" IS NOT NULL);

CREATE INDEX "golf_message_reactions_message_idx" ON "public"."golf_message_reactions" USING "btree" ("message_id");

CREATE INDEX "golf_message_responses_message_idx" ON "public"."golf_message_responses" USING "btree" ("message_id");

CREATE INDEX "golf_messages_pinned_idx" ON "public"."golf_messages" USING "btree" ("conversation_id", "pinned_at" DESC) WHERE ("pinned_at" IS NOT NULL);

CREATE INDEX "golf_messages_reply_to_idx" ON "public"."golf_messages" USING "btree" ("reply_to_id") WHERE ("reply_to_id" IS NOT NULL);

CREATE INDEX "golf_player_genome_computed_idx" ON "public"."golf_player_genome" USING "btree" ("computed_at" DESC);

CREATE INDEX "golf_players_anonymized_at_idx" ON "public"."golf_players" USING "btree" ("anonymized_at") WHERE ("anonymized_at" IS NOT NULL);

CREATE INDEX "golf_practice_sessions_player_idx" ON "public"."golf_practice_sessions" USING "btree" ("player_id", "session_date" DESC);

CREATE INDEX "golf_prediction_validations_prediction_id_idx" ON "public"."golf_prediction_validations" USING "btree" ("prediction_id");

CREATE UNIQUE INDEX "golf_predictions_natural_key" ON "public"."golf_predictions" USING "btree" ("player_id", "metric", "due_date");

COMMENT ON INDEX "public"."golf_predictions_natural_key" IS 'Natural key for upsert: one prediction per (player, metric, due_date). Non-partial so PostgREST onConflict can infer it.';

CREATE INDEX "golf_qualifier_round_courses_course_id_idx" ON "public"."golf_qualifier_round_courses" USING "btree" ("course_id");

CREATE INDEX "golf_qualifier_selections_player_idx" ON "public"."golf_qualifier_selections" USING "btree" ("player_id");

CREATE INDEX "golf_qualifier_selections_selected_by_user_id_idx" ON "public"."golf_qualifier_selections" USING "btree" ("selected_by_user_id");

CREATE INDEX "golf_qualifiers_selection_state_idx" ON "public"."golf_qualifiers" USING "btree" ("team_id", "selection_state") WHERE ("selection_state" = ANY (ARRAY['scoring'::"text", 'closed'::"text"]));

CREATE INDEX "golf_qualifiers_target_tournament_id_idx" ON "public"."golf_qualifiers" USING "btree" ("target_tournament_id");

CREATE INDEX "golf_recruit_documents_recruit_id_idx" ON "public"."golf_recruit_documents" USING "btree" ("recruit_id");

CREATE INDEX "golf_recruit_documents_team_id_idx" ON "public"."golf_recruit_documents" USING "btree" ("team_id");

CREATE INDEX "golf_recruit_documents_uploaded_by_idx" ON "public"."golf_recruit_documents" USING "btree" ("uploaded_by");

CREATE INDEX "golf_recruits_created_by_idx" ON "public"."golf_recruits" USING "btree" ("created_by");

CREATE INDEX "golf_round_reviews_published_by_idx" ON "public"."golf_round_reviews" USING "btree" ("published_by");

CREATE INDEX "golf_rounds_pending_coachhelm_idx" ON "public"."golf_rounds" USING "btree" ("created_at") WHERE (("coachhelm_analyzed_at" IS NULL) AND ("coachhelm_failed_at" IS NULL) AND ("status" = 'completed'::"text"));

CREATE UNIQUE INDEX "golf_rounds_qualifier_player_round_number_uq" ON "public"."golf_rounds" USING "btree" ("qualifier_id", "player_id", "qualifier_round_number") WHERE (("qualifier_id" IS NOT NULL) AND ("qualifier_round_number" IS NOT NULL) AND ("status" IS DISTINCT FROM 'abandoned'::"text"));

CREATE INDEX "golf_rounds_tee_id_idx" ON "public"."golf_rounds" USING "btree" ("tee_id") WHERE ("tee_id" IS NOT NULL);

CREATE INDEX "golf_shots_updated_at_idx" ON "public"."golf_shots" USING "btree" ("updated_at" DESC);

CREATE INDEX "golf_staff_invite_codes_team_idx" ON "public"."golf_staff_invite_codes" USING "btree" ("team_id", "created_at" DESC);

CREATE INDEX "golf_staff_invite_redemptions_team_idx" ON "public"."golf_staff_invite_redemptions" USING "btree" ("team_id", "redeemed_at" DESC);

CREATE INDEX "golf_team_saved_courses_course_id_idx" ON "public"."golf_team_saved_courses" USING "btree" ("course_id");

CREATE INDEX "golf_team_saved_courses_created_by_user_id_idx" ON "public"."golf_team_saved_courses" USING "btree" ("created_by_user_id");

CREATE INDEX "golf_team_saved_courses_default_tee_id_idx" ON "public"."golf_team_saved_courses" USING "btree" ("default_tee_id");

CREATE UNIQUE INDEX "golf_team_saved_courses_team_course_uidx" ON "public"."golf_team_saved_courses" USING "btree" ("team_id", "course_id");

CREATE UNIQUE INDEX "golf_teams_org_gender_uidx" ON "public"."golf_teams" USING "btree" ("organization_id", "gender") WHERE ("gender" IS NOT NULL);

COMMENT ON INDEX "public"."golf_teams_org_gender_uidx" IS 'Enforces one program (organization_id) has at most one team per gender. addSecondTeam catches the 23505 violation.';

CREATE INDEX "idx_approach_miss_details_shot_id" ON "public"."approach_miss_details" USING "btree" ("shot_id");

CREATE INDEX "idx_coach_insights_engine_version" ON "public"."golf_coach_insights" USING "btree" ("engine_version", "created_at" DESC);

CREATE INDEX "idx_coach_player_intent_coach" ON "public"."golf_coach_player_intent" USING "btree" ("coach_id");

CREATE INDEX "idx_coachhelm_action_runs_coach_time" ON "public"."golf_coachhelm_action_runs" USING "btree" ("coach_id", "proposed_at" DESC);

CREATE INDEX "idx_coachhelm_action_runs_conversation" ON "public"."golf_coachhelm_action_runs" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);

CREATE INDEX "idx_drill_attachments_insight" ON "public"."golf_insight_drill_attachments" USING "btree" ("insight_id", "rank");

CREATE INDEX "idx_drills_category" ON "public"."golf_drills" USING "btree" ("category");

CREATE INDEX "idx_drills_tags" ON "public"."golf_drills" USING "gin" ("tags");

CREATE INDEX "idx_goal_suggestions_due_expiry" ON "public"."golf_goal_suggestions" USING "btree" ("expires_at") WHERE ("state" = ANY (ARRAY['pending'::"text", 'snoozed'::"text"]));

CREATE INDEX "idx_goal_suggestions_player_pending" ON "public"."golf_goal_suggestions" USING "btree" ("player_id", "expires_at") WHERE ("state" = 'pending'::"text");

CREATE INDEX "idx_goals_due_evaluation" ON "public"."golf_goals" USING "btree" ("ends_at") WHERE ("state" = 'active'::"text");

CREATE INDEX "idx_goals_player_active" ON "public"."golf_goals" USING "btree" ("player_id", "state") WHERE ("state" = 'active'::"text");

CREATE INDEX "idx_goals_team_active" ON "public"."golf_goals" USING "btree" ("team_id", "state") WHERE ("state" = 'active'::"text");

CREATE INDEX "idx_golf_academic_exclusions_dates" ON "public"."golf_academic_exclusions" USING "btree" ("start_date", "end_date");

CREATE INDEX "idx_golf_academic_exclusions_excluded_by" ON "public"."golf_academic_exclusions" USING "btree" ("excluded_by") WHERE ("excluded_by" IS NOT NULL);

CREATE INDEX "idx_golf_academic_exclusions_player" ON "public"."golf_academic_exclusions" USING "btree" ("player_id");

CREATE INDEX "idx_golf_acknowledgements_announcement" ON "public"."golf_announcement_acknowledgements" USING "btree" ("announcement_id");

CREATE INDEX "idx_golf_acknowledgements_player" ON "public"."golf_announcement_acknowledgements" USING "btree" ("player_id");

CREATE INDEX "idx_golf_ann_documents_announcement" ON "public"."golf_announcement_documents" USING "btree" ("announcement_id");

CREATE INDEX "idx_golf_ann_documents_document" ON "public"."golf_announcement_documents" USING "btree" ("document_id");

CREATE INDEX "idx_golf_ann_recipients_announcement" ON "public"."golf_announcement_recipients" USING "btree" ("announcement_id");

CREATE INDEX "idx_golf_ann_recipients_player" ON "public"."golf_announcement_recipients" USING "btree" ("player_id");

CREATE INDEX "idx_golf_ann_tasks_announcement" ON "public"."golf_announcement_tasks" USING "btree" ("announcement_id");

CREATE INDEX "idx_golf_ann_tasks_task" ON "public"."golf_announcement_tasks" USING "btree" ("task_id");

CREATE INDEX "idx_golf_announcement_recipients_announcement_player" ON "public"."golf_announcement_recipients" USING "btree" ("announcement_id", "player_id");

CREATE INDEX "idx_golf_announcements_created_by" ON "public"."golf_announcements" USING "btree" ("created_by");

CREATE INDEX "idx_golf_announcements_published" ON "public"."golf_announcements" USING "btree" ("published_at" DESC);

CREATE INDEX "idx_golf_announcements_team" ON "public"."golf_announcements" USING "btree" ("team_id");

CREATE INDEX "idx_golf_attendance_summary_player" ON "public"."golf_attendance_summary" USING "btree" ("player_id");

CREATE INDEX "idx_golf_attendance_summary_team" ON "public"."golf_attendance_summary" USING "btree" ("team_id");

CREATE INDEX "idx_golf_calendar_feeds_active_token" ON "public"."golf_calendar_feeds" USING "btree" ("feed_token") WHERE ("is_active" = true);

CREATE INDEX "idx_golf_calendar_feeds_player_id" ON "public"."golf_calendar_feeds" USING "btree" ("player_id") WHERE ("player_id" IS NOT NULL);

CREATE INDEX "idx_golf_calendar_feeds_team_id" ON "public"."golf_calendar_feeds" USING "btree" ("team_id") WHERE ("team_id" IS NOT NULL);

CREATE INDEX "idx_golf_calendar_feeds_token" ON "public"."golf_calendar_feeds" USING "btree" ("feed_token");

CREATE INDEX "idx_golf_calendar_feeds_user" ON "public"."golf_calendar_feeds" USING "btree" ("user_id");

CREATE INDEX "idx_golf_calendar_notifications_event" ON "public"."golf_calendar_notifications" USING "btree" ("event_id");

CREATE INDEX "idx_golf_calendar_notifications_user" ON "public"."golf_calendar_notifications" USING "btree" ("user_id");

CREATE INDEX "idx_golf_calendar_notifications_user_unread_type" ON "public"."golf_calendar_notifications" USING "btree" ("user_id", "notification_type") WHERE ("read_at" IS NULL);

CREATE INDEX "idx_golf_causal_relationships_player" ON "public"."golf_causal_relationships" USING "btree" ("player_id");

CREATE INDEX "idx_golf_causal_relationships_player_active" ON "public"."golf_causal_relationships" USING "btree" ("player_id", "created_at" DESC) WHERE "is_active";

CREATE INDEX "idx_golf_causal_relationships_team" ON "public"."golf_causal_relationships" USING "btree" ("team_id") WHERE ("team_id" IS NOT NULL);

CREATE INDEX "idx_golf_classes_player_id" ON "public"."golf_player_classes" USING "btree" ("player_id");

CREATE INDEX "idx_golf_coach_blocked_time_coach" ON "public"."golf_coach_blocked_time" USING "btree" ("coach_id");

CREATE INDEX "idx_golf_coach_insights_coach" ON "public"."golf_coach_insights" USING "btree" ("coach_id");

CREATE INDEX "idx_golf_coach_insights_coach_created" ON "public"."golf_coach_insights" USING "btree" ("coach_id", "created_at" DESC) WHERE ("coach_id" IS NOT NULL);

CREATE INDEX "idx_golf_coach_insights_player" ON "public"."golf_coach_insights" USING "btree" ("player_id");

CREATE INDEX "idx_golf_coach_insights_player_created" ON "public"."golf_coach_insights" USING "btree" ("player_id", "created_at" DESC);

CREATE INDEX "idx_golf_coach_insights_status" ON "public"."golf_coach_insights" USING "btree" ("status") WHERE ("status" = 'active'::"text");

CREATE INDEX "idx_golf_coach_insights_team_id" ON "public"."golf_coach_insights" USING "btree" ("team_id");

CREATE INDEX "idx_golf_coaches_org_id" ON "public"."golf_coaches" USING "btree" ("organization_id");

CREATE INDEX "idx_golf_coaches_user_id" ON "public"."golf_coaches" USING "btree" ("user_id");

CREATE INDEX "idx_golf_coachhelm_settings_coach_id" ON "public"."golf_coachhelm_settings" USING "btree" ("coach_id");

CREATE INDEX "idx_golf_coachhelm_settings_user_id" ON "public"."golf_coachhelm_settings" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);

CREATE INDEX "idx_golf_conv_participants_conv_id" ON "public"."golf_conversation_participants" USING "btree" ("conversation_id");

CREATE INDEX "idx_golf_conv_participants_user_id" ON "public"."golf_conversation_participants" USING "btree" ("user_id");

CREATE INDEX "idx_golf_conversations_created_by" ON "public"."golf_conversations" USING "btree" ("created_by");

CREATE INDEX "idx_golf_conversations_team_channel" ON "public"."golf_conversations" USING "btree" ("team_id", "is_team_channel") WHERE ("is_team_channel" = true);

CREATE INDEX "idx_golf_conversations_team_id" ON "public"."golf_conversations" USING "btree" ("team_id");

CREATE INDEX "idx_golf_conversations_team_updated" ON "public"."golf_conversations" USING "btree" ("team_id", "updated_at" DESC);

CREATE INDEX "idx_golf_course_holes_course" ON "public"."golf_course_holes" USING "btree" ("course_id");

CREATE INDEX "idx_golf_courses_name" ON "public"."golf_courses" USING "btree" ("name");

CREATE INDEX "idx_golf_courses_state" ON "public"."golf_courses" USING "btree" ("state");

CREATE INDEX "idx_golf_document_versions_created" ON "public"."golf_document_versions" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_golf_document_versions_document" ON "public"."golf_document_versions" USING "btree" ("document_id");

CREATE INDEX "idx_golf_documents_current_version" ON "public"."golf_documents" USING "btree" ("current_version_id");

CREATE INDEX "idx_golf_documents_folder" ON "public"."golf_documents" USING "btree" ("folder");

CREATE INDEX "idx_golf_documents_team_id" ON "public"."golf_documents" USING "btree" ("team_id");

CREATE INDEX "idx_golf_documents_uploaded_by" ON "public"."golf_documents" USING "btree" ("uploaded_by");

CREATE INDEX "idx_golf_event_attendance_event_id" ON "public"."golf_event_attendance" USING "btree" ("event_id");

CREATE INDEX "idx_golf_event_attendance_event_status" ON "public"."golf_event_attendance" USING "btree" ("event_id", "status");

COMMENT ON INDEX "public"."idx_golf_event_attendance_event_status" IS 'Optimizes RSVP count aggregation per event with status filtering';

CREATE INDEX "idx_golf_event_attendance_player_event" ON "public"."golf_event_attendance" USING "btree" ("player_id", "event_id");

COMMENT ON INDEX "public"."idx_golf_event_attendance_player_event" IS 'Optimizes player-specific RSVP lookup across multiple events';

CREATE INDEX "idx_golf_event_attendance_player_id" ON "public"."golf_event_attendance" USING "btree" ("player_id");

CREATE INDEX "idx_golf_event_documents_document_id" ON "public"."golf_event_documents" USING "btree" ("document_id");

CREATE INDEX "idx_golf_event_documents_event_id" ON "public"."golf_event_documents" USING "btree" ("event_id");

CREATE INDEX "idx_golf_events_course_id" ON "public"."golf_events" USING "btree" ("course_id");

CREATE INDEX "idx_golf_events_created_by" ON "public"."golf_events" USING "btree" ("created_by");

CREATE INDEX "idx_golf_events_parent_event_id" ON "public"."golf_events" USING "btree" ("parent_event_id") WHERE ("parent_event_id" IS NOT NULL);

CREATE INDEX "idx_golf_events_start_time" ON "public"."golf_events" USING "btree" ("start_time");

CREATE INDEX "idx_golf_events_status" ON "public"."golf_events" USING "btree" ("status");

CREATE INDEX "idx_golf_events_team_id" ON "public"."golf_events" USING "btree" ("team_id");

CREATE INDEX "idx_golf_events_team_start" ON "public"."golf_events" USING "btree" ("team_id", "start_time");

CREATE INDEX "idx_golf_events_type" ON "public"."golf_events" USING "btree" ("event_type");

CREATE INDEX "idx_golf_focus_areas_from_review" ON "public"."golf_player_focus_areas" USING "btree" ("from_review_id") WHERE ("from_review_id" IS NOT NULL);

CREATE INDEX "idx_golf_focus_areas_player_id" ON "public"."golf_player_focus_areas" USING "btree" ("player_id");

CREATE INDEX "idx_golf_focus_areas_team_id" ON "public"."golf_player_focus_areas" USING "btree" ("team_id");

CREATE INDEX "idx_golf_global_patterns_confidence" ON "public"."golf_global_patterns" USING "btree" ("confidence" DESC);

CREATE INDEX "idx_golf_global_patterns_pattern_type" ON "public"."golf_global_patterns" USING "btree" ("pattern_type");

CREATE INDEX "idx_golf_holes_round_id" ON "public"."golf_holes" USING "btree" ("round_id");

CREATE INDEX "idx_golf_holes_round_order" ON "public"."golf_holes" USING "btree" ("round_id", "hole_number");

CREATE INDEX "idx_golf_insight_effectiveness_team" ON "public"."golf_insight_effectiveness" USING "btree" ("team_id", "period_start" DESC);

CREATE INDEX "idx_golf_insight_gen_log_player_id" ON "public"."golf_insight_generation_log" USING "btree" ("player_id");

CREATE INDEX "idx_golf_insight_log_created" ON "public"."golf_insight_generation_log" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_golf_insight_outcome_attribution_metric" ON "public"."golf_insight_outcome_attribution" USING "btree" ("target_metric_id");

CREATE INDEX "idx_golf_insight_player_feedback_insight" ON "public"."golf_insight_player_feedback" USING "btree" ("insight_id");

CREATE INDEX "idx_golf_learned_behavior_entity" ON "public"."golf_learned_behavior" USING "btree" ("entity_id", "entity_type");

CREATE INDEX "idx_golf_learned_behavior_timestamp" ON "public"."golf_learned_behavior" USING "btree" ("timestamp");

CREATE INDEX "idx_golf_message_attachments_created" ON "public"."golf_message_attachments" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_golf_message_attachments_file_type" ON "public"."golf_message_attachments" USING "btree" ("file_type");

CREATE INDEX "idx_golf_message_attachments_message" ON "public"."golf_message_attachments" USING "btree" ("message_id");

CREATE INDEX "idx_golf_messages_conv_id" ON "public"."golf_messages" USING "btree" ("conversation_id");

CREATE INDEX "idx_golf_messages_conversation_created" ON "public"."golf_messages" USING "btree" ("conversation_id", "created_at" DESC);

CREATE INDEX "idx_golf_messages_has_attachments" ON "public"."golf_messages" USING "btree" ("conversation_id", "has_attachments") WHERE ("has_attachments" = true);

CREATE INDEX "idx_golf_messages_sender_id" ON "public"."golf_messages" USING "btree" ("sender_id");

CREATE INDEX "idx_golf_metrics_active_category" ON "public"."golf_metrics" USING "btree" ("category") WHERE ("active" = true);

CREATE INDEX "idx_golf_patterns_v2_active" ON "public"."golf_patterns_v2" USING "btree" ("is_active") WHERE ("is_active" = true);

CREATE INDEX "idx_golf_patterns_v2_confidence" ON "public"."golf_patterns_v2" USING "btree" ("confidence") WHERE ("confidence" >= 0.6);

CREATE INDEX "idx_golf_patterns_v2_lifecycle" ON "public"."golf_patterns_v2" USING "btree" ("lifecycle_state", "player_id");

CREATE INDEX "idx_golf_patterns_v2_player_id" ON "public"."golf_patterns_v2" USING "btree" ("player_id");

CREATE INDEX "idx_golf_patterns_v2_validator_coach_id" ON "public"."golf_patterns_v2" USING "btree" ("validator_coach_id") WHERE ("validator_coach_id" IS NOT NULL);

CREATE INDEX "idx_golf_player_classes_team_id" ON "public"."golf_player_classes" USING "btree" ("team_id") WHERE ("team_id" IS NOT NULL);

CREATE INDEX "idx_golf_player_courses_course" ON "public"."golf_player_courses" USING "btree" ("course_id");

CREATE INDEX "idx_golf_player_courses_player" ON "public"."golf_player_courses" USING "btree" ("player_id");

CREATE INDEX "idx_golf_player_focus_areas_coach_id" ON "public"."golf_player_focus_areas" USING "btree" ("coach_id") WHERE ("coach_id" IS NOT NULL);

CREATE INDEX "idx_golf_player_stats_cache_player" ON "public"."golf_player_stats_cache" USING "btree" ("player_id");

CREATE INDEX "idx_golf_player_stats_cache_refresh" ON "public"."golf_player_stats_cache" USING "btree" ("next_refresh_due") WHERE ("next_refresh_due" IS NOT NULL);

CREATE INDEX "idx_golf_player_stats_cache_stale" ON "public"."golf_player_stats_cache" USING "btree" ("is_stale") WHERE ("is_stale" = true);

CREATE INDEX "idx_golf_player_stats_cache_updated" ON "public"."golf_player_stats_cache" USING "btree" ("updated_at" DESC);

CREATE INDEX "idx_golf_players_state" ON "public"."golf_players" USING "btree" ("state");

CREATE INDEX "idx_golf_players_user_id" ON "public"."golf_players" USING "btree" ("user_id");

CREATE INDEX "idx_golf_predictions_due_date" ON "public"."golf_predictions" USING "btree" ("due_date") WHERE ("validated_at" IS NULL);

CREATE INDEX "idx_golf_predictions_player_created" ON "public"."golf_predictions" USING "btree" ("player_id", "created_at" DESC);

CREATE INDEX "idx_golf_predictions_player_id" ON "public"."golf_predictions" USING "btree" ("player_id");

CREATE INDEX "idx_golf_predictions_related_event_id" ON "public"."golf_predictions" USING "btree" ("related_event_id") WHERE ("related_event_id" IS NOT NULL);

CREATE INDEX "idx_golf_predictions_related_round_id" ON "public"."golf_predictions" USING "btree" ("related_round_id") WHERE ("related_round_id" IS NOT NULL);

CREATE INDEX "idx_golf_qualifier_entries_player_id" ON "public"."golf_qualifier_entries" USING "btree" ("player_id");

CREATE INDEX "idx_golf_qualifier_entries_qualifier_id" ON "public"."golf_qualifier_entries" USING "btree" ("qualifier_id");

CREATE INDEX "idx_golf_qualifier_entries_round_id" ON "public"."golf_qualifier_entries" USING "btree" ("round_id");

CREATE INDEX "idx_golf_qualifier_round_courses_qualifier_id" ON "public"."golf_qualifier_round_courses" USING "btree" ("qualifier_id");

CREATE INDEX "idx_golf_qualifiers_course_id" ON "public"."golf_qualifiers" USING "btree" ("course_id");

CREATE INDEX "idx_golf_qualifiers_created_by" ON "public"."golf_qualifiers" USING "btree" ("created_by");

CREATE INDEX "idx_golf_qualifiers_status" ON "public"."golf_qualifiers" USING "btree" ("status");

CREATE INDEX "idx_golf_qualifiers_team_id" ON "public"."golf_qualifiers" USING "btree" ("team_id");

CREATE INDEX "idx_golf_qualifiers_team_status" ON "public"."golf_qualifiers" USING "btree" ("team_id", "status");

CREATE INDEX "idx_golf_recruits_team_class" ON "public"."golf_recruits" USING "btree" ("team_id", "hs_class");

CREATE INDEX "idx_golf_recruits_team_status" ON "public"."golf_recruits" USING "btree" ("team_id", "status");

CREATE INDEX "idx_golf_review_events_actor_id" ON "public"."golf_review_events" USING "btree" ("actor_id") WHERE ("actor_id" IS NOT NULL);

CREATE INDEX "idx_golf_review_events_player" ON "public"."golf_review_events" USING "btree" ("player_id", "created_at" DESC);

CREATE INDEX "idx_golf_review_events_review" ON "public"."golf_review_events" USING "btree" ("review_id");

CREATE INDEX "idx_golf_round_reviews_coach_workflow" ON "public"."golf_round_reviews" USING "btree" ("player_id", "status", "created_at" DESC);

CREATE INDEX "idx_golf_round_reviews_created_at" ON "public"."golf_round_reviews" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_golf_round_reviews_player_created" ON "public"."golf_round_reviews" USING "btree" ("player_id", "created_at" DESC);

CREATE INDEX "idx_golf_round_stats_cache_player" ON "public"."golf_round_stats_cache" USING "btree" ("player_id");

CREATE INDEX "idx_golf_round_stats_cache_player_date" ON "public"."golf_round_stats_cache" USING "btree" ("player_id", "created_at" DESC);

CREATE INDEX "idx_golf_round_stats_cache_round" ON "public"."golf_round_stats_cache" USING "btree" ("round_id");

CREATE INDEX "idx_golf_rounds_course_id" ON "public"."golf_rounds" USING "btree" ("course_id");

CREATE INDEX "idx_golf_rounds_date" ON "public"."golf_rounds" USING "btree" ("round_date" DESC);

CREATE INDEX "idx_golf_rounds_player_completed" ON "public"."golf_rounds" USING "btree" ("player_id", "round_date" DESC) WHERE ("status" = 'completed'::"text");

CREATE INDEX "idx_golf_rounds_player_completed_scored" ON "public"."golf_rounds" USING "btree" ("player_id", "round_date" DESC) WHERE (("status" = 'completed'::"text") AND ("total_score" IS NOT NULL));

COMMENT ON INDEX "public"."idx_golf_rounds_player_completed_scored" IS 'Partial index for the most common query pattern: completed rounds with scores, sorted by date';

CREATE INDEX "idx_golf_rounds_player_course" ON "public"."golf_rounds" USING "btree" ("player_id", "course_name") WHERE (("status" = 'completed'::"text") AND ("course_name" IS NOT NULL));

COMMENT ON INDEX "public"."idx_golf_rounds_player_course" IS 'Optimizes course breakdown and filter options queries that group by player + course';

CREATE INDEX "idx_golf_rounds_player_created" ON "public"."golf_rounds" USING "btree" ("player_id", "created_at" DESC) WHERE ("player_id" IS NOT NULL);

CREATE INDEX "idx_golf_rounds_player_created_at" ON "public"."golf_rounds" USING "btree" ("player_id", "created_at" DESC);

CREATE INDEX "idx_golf_rounds_player_id" ON "public"."golf_rounds" USING "btree" ("player_id");

CREATE INDEX "idx_golf_rounds_player_sg" ON "public"."golf_rounds" USING "btree" ("player_id", "strokes_gained_total") WHERE ("strokes_gained_total" IS NOT NULL);

CREATE INDEX "idx_golf_rounds_player_type" ON "public"."golf_rounds" USING "btree" ("player_id", "round_type", "round_date" DESC) WHERE ("status" = 'completed'::"text");

COMMENT ON INDEX "public"."idx_golf_rounds_player_type" IS 'Optimizes round queries filtered by type (tournament/practice/qualifier) within completed rounds';

CREATE INDEX "idx_golf_rounds_qualifier" ON "public"."golf_rounds" USING "btree" ("qualifier_id") WHERE ("qualifier_id" IS NOT NULL);

CREATE INDEX "idx_golf_rounds_status" ON "public"."golf_rounds" USING "btree" ("status");

CREATE INDEX "idx_golf_rounds_team_created" ON "public"."golf_rounds" USING "btree" ("team_id", "created_at" DESC) WHERE ("team_id" IS NOT NULL);

CREATE INDEX "idx_golf_rounds_team_id" ON "public"."golf_rounds" USING "btree" ("team_id");

CREATE INDEX "idx_golf_rounds_type" ON "public"."golf_rounds" USING "btree" ("round_type");

CREATE INDEX "idx_golf_shots_distance_before" ON "public"."golf_shots" USING "btree" ("distance_to_hole_before") WHERE ("distance_to_hole_before" IS NOT NULL);

CREATE INDEX "idx_golf_shots_hole_id" ON "public"."golf_shots" USING "btree" ("hole_id");

CREATE INDEX "idx_golf_shots_lie_after" ON "public"."golf_shots" USING "btree" ("lie_after") WHERE ("lie_after" IS NOT NULL);

CREATE INDEX "idx_golf_shots_lie_before" ON "public"."golf_shots" USING "btree" ("lie_before");

CREATE INDEX "idx_golf_shots_putt_made" ON "public"."golf_shots" USING "btree" ("putt_made") WHERE ("putt_made" IS NOT NULL);

CREATE INDEX "idx_golf_shots_putting_analysis" ON "public"."golf_shots" USING "btree" ("shot_type", "putt_made", "putt_distance_feet") WHERE ("shot_type" = 'putting'::"text");

CREATE INDEX "idx_golf_shots_result" ON "public"."golf_shots" USING "btree" ("result");

CREATE INDEX "idx_golf_shots_round_created" ON "public"."golf_shots" USING "btree" ("round_id", "created_at");

CREATE INDEX "idx_golf_shots_round_hole" ON "public"."golf_shots" USING "btree" ("round_id", "hole_number");

CREATE UNIQUE INDEX "idx_golf_shots_round_hole_shot" ON "public"."golf_shots" USING "btree" ("round_id", "hole_number", "shot_number");

COMMENT ON INDEX "public"."idx_golf_shots_round_hole_shot" IS 'UNIQUE constraint: prevents duplicate shot numbers per hole per round. Replaces prior non-unique index.';

CREATE INDEX "idx_golf_shots_round_id" ON "public"."golf_shots" USING "btree" ("round_id");

CREATE INDEX "idx_golf_shots_round_id_covering" ON "public"."golf_shots" USING "btree" ("round_id", "hole_number", "shot_number") INCLUDE ("id", "hole_id", "shot_type", "club_type", "lie_before", "lie_after", "distance_to_hole_before", "distance_unit_before", "result", "distance_to_hole_after", "distance_unit_after", "shot_distance", "miss_direction", "putt_break", "putt_distance_feet", "putt_slope", "putt_made", "is_penalty", "penalty_type");

CREATE INDEX "idx_golf_shots_shot_type" ON "public"."golf_shots" USING "btree" ("shot_type");

CREATE INDEX "idx_golf_task_assignments_player_id" ON "public"."golf_task_assignments" USING "btree" ("player_id");

CREATE INDEX "idx_golf_task_assignments_task_id" ON "public"."golf_task_assignments" USING "btree" ("task_id");

CREATE INDEX "idx_golf_task_reminders_pending" ON "public"."golf_task_reminders" USING "btree" ("sent", "scheduled_for") WHERE ("sent" = false);

CREATE INDEX "idx_golf_task_reminders_scheduled_for" ON "public"."golf_task_reminders" USING "btree" ("scheduled_for") WHERE ("sent" = false);

CREATE INDEX "idx_golf_task_reminders_task_id" ON "public"."golf_task_reminders" USING "btree" ("task_id");

CREATE INDEX "idx_golf_task_templates_category" ON "public"."golf_task_templates" USING "btree" ("team_id", "category");

CREATE INDEX "idx_golf_task_templates_created_by" ON "public"."golf_task_templates" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_golf_task_templates_team_id" ON "public"."golf_task_templates" USING "btree" ("team_id");

CREATE INDEX "idx_golf_tasks_assigned_by" ON "public"."golf_tasks" USING "btree" ("assigned_by");

CREATE INDEX "idx_golf_tasks_assigned_to" ON "public"."golf_tasks" USING "btree" ("assigned_to");

CREATE INDEX "idx_golf_tasks_parent_task_id" ON "public"."golf_tasks" USING "btree" ("parent_task_id") WHERE ("parent_task_id" IS NOT NULL);

CREATE INDEX "idx_golf_tasks_reminder_pending" ON "public"."golf_tasks" USING "btree" ("reminder_at") WHERE (("reminder_at" IS NOT NULL) AND ("reminder_sent" = false));

CREATE INDEX "idx_golf_tasks_status" ON "public"."golf_tasks" USING "btree" ("status");

CREATE INDEX "idx_golf_tasks_team_id" ON "public"."golf_tasks" USING "btree" ("team_id");

CREATE INDEX "idx_golf_team_coach_staff_coach_id" ON "public"."golf_team_coach_staff" USING "btree" ("coach_id");

CREATE INDEX "idx_golf_team_coach_staff_team_id" ON "public"."golf_team_coach_staff" USING "btree" ("team_id");

CREATE INDEX "idx_golf_team_coachhelm_settings_disabled_by" ON "public"."golf_team_coachhelm_settings" USING "btree" ("disabled_by") WHERE ("disabled_by" IS NOT NULL);

CREATE INDEX "idx_golf_team_coachhelm_settings_team" ON "public"."golf_team_coachhelm_settings" USING "btree" ("team_id");

CREATE INDEX "idx_golf_team_join_requests_pending" ON "public"."golf_team_join_requests" USING "btree" ("team_id") WHERE ("status" = 'pending'::"text");

CREATE INDEX "idx_golf_team_join_requests_player" ON "public"."golf_team_join_requests" USING "btree" ("player_id");

CREATE INDEX "idx_golf_team_join_requests_reviewed_by" ON "public"."golf_team_join_requests" USING "btree" ("reviewed_by") WHERE ("reviewed_by" IS NOT NULL);

CREATE INDEX "idx_golf_team_join_requests_status" ON "public"."golf_team_join_requests" USING "btree" ("status");

CREATE INDEX "idx_golf_team_join_requests_team" ON "public"."golf_team_join_requests" USING "btree" ("team_id");

CREATE INDEX "idx_golf_team_members_approved_by" ON "public"."golf_team_members" USING "btree" ("approved_by") WHERE ("approved_by" IS NOT NULL);

CREATE INDEX "idx_golf_team_members_player" ON "public"."golf_team_members" USING "btree" ("player_id");

CREATE INDEX "idx_golf_team_members_status" ON "public"."golf_team_members" USING "btree" ("status");

CREATE INDEX "idx_golf_team_members_team" ON "public"."golf_team_members" USING "btree" ("team_id");

CREATE INDEX "idx_golf_team_members_team_active" ON "public"."golf_team_members" USING "btree" ("team_id", "player_id") WHERE ("status" = 'active'::"public"."team_member_status");

CREATE INDEX "idx_golf_teams_created_by" ON "public"."golf_teams" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_golf_teams_join_code" ON "public"."golf_teams" USING "btree" ("join_code");

CREATE INDEX "idx_golf_teams_org_id" ON "public"."golf_teams" USING "btree" ("organization_id");

CREATE INDEX "idx_golf_travel_budgets_itinerary" ON "public"."golf_travel_budgets" USING "btree" ("itinerary_id");

CREATE INDEX "idx_golf_travel_departure" ON "public"."golf_travel_itineraries" USING "btree" ("departure_date");

CREATE INDEX "idx_golf_travel_expenses_category" ON "public"."golf_travel_expenses" USING "btree" ("category");

CREATE INDEX "idx_golf_travel_expenses_created_at" ON "public"."golf_travel_expenses" USING "btree" ("created_at");

CREATE INDEX "idx_golf_travel_expenses_created_by" ON "public"."golf_travel_expenses" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_golf_travel_expenses_date" ON "public"."golf_travel_expenses" USING "btree" ("expense_date");

CREATE INDEX "idx_golf_travel_expenses_itinerary" ON "public"."golf_travel_expenses" USING "btree" ("itinerary_id");

CREATE INDEX "idx_golf_travel_expenses_itinerary_date" ON "public"."golf_travel_expenses" USING "btree" ("itinerary_id", "expense_date" DESC);

COMMENT ON INDEX "public"."idx_golf_travel_expenses_itinerary_date" IS 'Optimizes itinerary expense listing sorted by date';

CREATE INDEX "idx_golf_travel_expenses_team" ON "public"."golf_travel_expenses" USING "btree" ("team_id");

CREATE INDEX "idx_golf_travel_expenses_team_date" ON "public"."golf_travel_expenses" USING "btree" ("team_id", "expense_date" DESC);

COMMENT ON INDEX "public"."idx_golf_travel_expenses_team_date" IS 'Optimizes team expense summary and filtered expense queries with date ordering';

CREATE INDEX "idx_golf_travel_itineraries_created_by" ON "public"."golf_travel_itineraries" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_golf_travel_itineraries_event_id" ON "public"."golf_travel_itineraries" USING "btree" ("event_id");

CREATE INDEX "idx_golf_travel_team" ON "public"."golf_travel_itineraries" USING "btree" ("team_id");

CREATE INDEX "idx_insights_category_lifecycle" ON "public"."golf_coach_insights" USING "btree" ("player_id", "category", "lifecycle_state");

CREATE INDEX "idx_insights_signature_recent" ON "public"."golf_coach_insights" USING "btree" ("player_id", "signature", "created_at" DESC);

CREATE INDEX "idx_pga_standards_metric" ON "public"."golf_pga_standards" USING "btree" ("metric_id", "season" DESC);

CREATE INDEX "idx_pred_validations_date" ON "public"."golf_prediction_validations" USING "btree" ("validated_at" DESC);

CREATE INDEX "idx_pred_validations_player" ON "public"."golf_prediction_validations" USING "btree" ("player_id");

CREATE INDEX "idx_putt_details_shot_id" ON "public"."putt_details" USING "btree" ("shot_id");

CREATE INDEX "idx_standing_computed_at" ON "public"."golf_player_standing" USING "btree" ("computed_at" DESC);

CREATE INDEX "idx_standing_team_metric" ON "public"."golf_player_standing" USING "btree" ("metric_id", "team_pct") INCLUDE ("player_id");
