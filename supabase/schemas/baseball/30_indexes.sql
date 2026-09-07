CREATE INDEX "baseball_actions_assignee_coach_id_idx" ON "public"."baseball_actions" USING "btree" ("assignee_coach_id");

CREATE INDEX "baseball_actions_assignee_coach_idx" ON "public"."baseball_actions" USING "btree" ("team_id", "assignee_coach_id");

CREATE INDEX "baseball_actions_assignee_player_id_idx" ON "public"."baseball_actions" USING "btree" ("assignee_player_id");

CREATE INDEX "baseball_actions_assignee_player_idx" ON "public"."baseball_actions" USING "btree" ("team_id", "assignee_player_id");

CREATE INDEX "baseball_actions_created_by_idx" ON "public"."baseball_actions" USING "btree" ("created_by");

CREATE INDEX "baseball_actions_owner_coach_id_idx" ON "public"."baseball_actions" USING "btree" ("owner_coach_id");

CREATE INDEX "baseball_actions_player_idx" ON "public"."baseball_actions" USING "btree" ("player_id") WHERE ("player_id" IS NOT NULL);

CREATE INDEX "baseball_actions_reviewed_by_idx" ON "public"."baseball_actions" USING "btree" ("reviewed_by");

CREATE INDEX "baseball_actions_signal_idx" ON "public"."baseball_actions" USING "btree" ("signal_id") WHERE ("signal_id" IS NOT NULL);

CREATE INDEX "baseball_actions_team_idx" ON "public"."baseball_actions" USING "btree" ("team_id", "status");

CREATE INDEX "baseball_actions_team_status_idx" ON "public"."baseball_actions" USING "btree" ("team_id", "status", "due_date");

CREATE UNIQUE INDEX "baseball_ai_audit_dedupe_uidx" ON "public"."baseball_ai_audit" USING "btree" ("team_id", "output_kind", "dedupe_key");

CREATE INDEX "baseball_ai_audit_outcome_by_idx" ON "public"."baseball_ai_audit" USING "btree" ("outcome_by");

CREATE INDEX "baseball_ai_audit_player_idx" ON "public"."baseball_ai_audit" USING "btree" ("player_id");

CREATE INDEX "baseball_ai_audit_team_kind_idx" ON "public"."baseball_ai_audit" USING "btree" ("team_id", "output_kind", "created_at" DESC);

CREATE INDEX "baseball_baserunning_events_game_id_idx" ON "public"."baseball_baserunning_events" USING "btree" ("game_id");

CREATE INDEX "baseball_baserunning_events_pa_id_idx" ON "public"."baseball_baserunning_events" USING "btree" ("pa_id");

CREATE INDEX "baseball_baserunning_events_player_idx" ON "public"."baseball_baserunning_events" USING "btree" ("player_id");

CREATE INDEX "baseball_baserunning_events_runner_id_idx" ON "public"."baseball_baserunning_events" USING "btree" ("runner_id");

CREATE INDEX "baseball_baserunning_events_team_idx" ON "public"."baseball_baserunning_events" USING "btree" ("team_id");

CREATE INDEX "baseball_batted_ball_events_batter_id_idx" ON "public"."baseball_batted_ball_events" USING "btree" ("batter_id");

CREATE INDEX "baseball_batted_ball_events_game_id_idx" ON "public"."baseball_batted_ball_events" USING "btree" ("game_id");

CREATE INDEX "baseball_batted_ball_events_import_run_id_idx" ON "public"."baseball_batted_ball_events" USING "btree" ("import_run_id");

CREATE INDEX "baseball_batted_ball_events_pa_id_idx" ON "public"."baseball_batted_ball_events" USING "btree" ("pa_id");

CREATE INDEX "baseball_batted_ball_events_player_idx" ON "public"."baseball_batted_ball_events" USING "btree" ("player_id");

CREATE INDEX "baseball_batted_ball_events_team_idx" ON "public"."baseball_batted_ball_events" USING "btree" ("team_id");

CREATE INDEX "baseball_catching_events_catcher_id_idx" ON "public"."baseball_catching_events" USING "btree" ("catcher_id");

CREATE INDEX "baseball_catching_events_game_id_idx" ON "public"."baseball_catching_events" USING "btree" ("game_id");

CREATE INDEX "baseball_catching_events_pitch_event_id_idx" ON "public"."baseball_catching_events" USING "btree" ("pitch_event_id");

CREATE INDEX "baseball_catching_events_player_idx" ON "public"."baseball_catching_events" USING "btree" ("player_id");

CREATE INDEX "baseball_catching_events_team_idx" ON "public"."baseball_catching_events" USING "btree" ("team_id");

CREATE INDEX "baseball_class_conflicts_class_id_idx" ON "public"."baseball_class_conflicts" USING "btree" ("class_id");

CREATE UNIQUE INDEX "baseball_class_conflicts_dedupe_open_uidx" ON "public"."baseball_class_conflicts" USING "btree" ("team_id", "dedupe_key") WHERE (("dedupe_key" IS NOT NULL) AND ("disposition" = ANY (ARRAY['open'::"text", 'acknowledged'::"text"])));

CREATE INDEX "baseball_class_conflicts_event_idx" ON "public"."baseball_class_conflicts" USING "btree" ("event_id");

CREATE INDEX "baseball_class_conflicts_player_id_idx" ON "public"."baseball_class_conflicts" USING "btree" ("player_id");

CREATE INDEX "baseball_class_conflicts_signal_idx" ON "public"."baseball_class_conflicts" USING "btree" ("signal_id");

CREATE INDEX "baseball_class_conflicts_team_disposition_idx" ON "public"."baseball_class_conflicts" USING "btree" ("team_id", "disposition", "severity", "obligation_start");

CREATE INDEX "baseball_class_conflicts_team_player_idx" ON "public"."baseball_class_conflicts" USING "btree" ("team_id", "player_id");

CREATE INDEX "baseball_coach_notes_author_idx" ON "public"."baseball_coach_notes" USING "btree" ("author_coach_id");

CREATE INDEX "baseball_coach_notes_created_by_idx" ON "public"."baseball_coach_notes" USING "btree" ("created_by");

CREATE INDEX "baseball_coach_notes_player_id_idx" ON "public"."baseball_coach_notes" USING "btree" ("player_id");

CREATE INDEX "baseball_coach_notes_scope_idx" ON "public"."baseball_coach_notes" USING "btree" ("team_id", "scope");

CREATE INDEX "baseball_coach_notes_team_player_idx" ON "public"."baseball_coach_notes" USING "btree" ("team_id", "player_id", "created_at" DESC);

CREATE INDEX "baseball_coach_player_notes_author_coach_id_idx" ON "public"."baseball_coach_player_notes" USING "btree" ("author_coach_id");

CREATE INDEX "baseball_coach_player_notes_created_by_idx" ON "public"."baseball_coach_player_notes" USING "btree" ("created_by");

CREATE INDEX "baseball_coach_player_notes_player_id_idx" ON "public"."baseball_coach_player_notes" USING "btree" ("player_id");

CREATE INDEX "baseball_coach_player_notes_signal_idx" ON "public"."baseball_coach_player_notes" USING "btree" ("source_signal_id");

CREATE INDEX "baseball_coach_player_notes_source_action_id_idx" ON "public"."baseball_coach_player_notes" USING "btree" ("source_action_id");

CREATE INDEX "baseball_coach_player_notes_team_player_idx" ON "public"."baseball_coach_player_notes" USING "btree" ("team_id", "player_id", "created_at" DESC);

CREATE INDEX "baseball_decision_log_action_id_idx" ON "public"."baseball_decision_log" USING "btree" ("action_id");

CREATE INDEX "baseball_decision_log_created_by_idx" ON "public"."baseball_decision_log" USING "btree" ("created_by");

CREATE INDEX "baseball_decision_log_decided_by_idx" ON "public"."baseball_decision_log" USING "btree" ("decided_by");

CREATE INDEX "baseball_decision_log_meeting_item_id_idx" ON "public"."baseball_decision_log" USING "btree" ("meeting_item_id");

CREATE INDEX "baseball_decision_log_player_idx" ON "public"."baseball_decision_log" USING "btree" ("player_id");

CREATE INDEX "baseball_decision_log_signal_id_idx" ON "public"."baseball_decision_log" USING "btree" ("signal_id");

CREATE INDEX "baseball_decision_log_team_decided_at_idx" ON "public"."baseball_decision_log" USING "btree" ("team_id", "decided_at" DESC);

CREATE INDEX "baseball_demo_sessions_crm_coach_id_idx" ON "public"."baseball_demo_sessions" USING "btree" ("crm_coach_id");

CREATE INDEX "baseball_demo_sessions_email_idx" ON "public"."baseball_demo_sessions" USING "btree" ("email");

CREATE INDEX "baseball_demo_sessions_entered_at_idx" ON "public"."baseball_demo_sessions" USING "btree" ("entered_at" DESC);

CREATE INDEX "baseball_demo_sessions_traffic_quality_entered_at_idx" ON "public"."baseball_demo_sessions" USING "btree" ("traffic_quality", "entered_at" DESC);

CREATE INDEX "baseball_exercises_created_by_coach_id_idx" ON "public"."baseball_exercises" USING "btree" ("created_by_coach_id");

CREATE INDEX "baseball_exercises_global_idx" ON "public"."baseball_exercises" USING "btree" ("is_global") WHERE ("is_global" = true);

CREATE INDEX "baseball_exercises_team_idx" ON "public"."baseball_exercises" USING "btree" ("team_id");

CREATE INDEX "baseball_fielding_events_game_id_idx" ON "public"."baseball_fielding_events" USING "btree" ("game_id");

CREATE INDEX "baseball_fielding_events_player_idx" ON "public"."baseball_fielding_events" USING "btree" ("player_id");

CREATE INDEX "baseball_fielding_events_team_idx" ON "public"."baseball_fielding_events" USING "btree" ("team_id");

CREATE INDEX "baseball_import_runs_source_config_id_idx" ON "public"."baseball_import_runs" USING "btree" ("source_config_id");

CREATE INDEX "baseball_import_sources_team_idx" ON "public"."baseball_import_sources" USING "btree" ("team_id");

CREATE INDEX "baseball_integration_configs_created_by_idx" ON "public"."baseball_integration_configs" USING "btree" ("created_by");

CREATE INDEX "baseball_integration_configs_team_idx" ON "public"."baseball_integration_configs" USING "btree" ("team_id");

CREATE INDEX "baseball_lineup_positions_player_id_idx" ON "public"."baseball_lineup_positions" USING "btree" ("player_id");

CREATE INDEX "baseball_meeting_items_action_idx" ON "public"."baseball_meeting_items" USING "btree" ("source_action_id");

CREATE INDEX "baseball_meeting_items_created_by_idx" ON "public"."baseball_meeting_items" USING "btree" ("created_by");

CREATE INDEX "baseball_meeting_items_owner_coach_id_idx" ON "public"."baseball_meeting_items" USING "btree" ("owner_coach_id");

CREATE INDEX "baseball_meeting_items_player_id_idx" ON "public"."baseball_meeting_items" USING "btree" ("player_id");

CREATE INDEX "baseball_meeting_items_resolved_by_idx" ON "public"."baseball_meeting_items" USING "btree" ("resolved_by");

CREATE INDEX "baseball_meeting_items_signal_idx" ON "public"."baseball_meeting_items" USING "btree" ("source_signal_id");

CREATE INDEX "baseball_meeting_items_team_status_idx" ON "public"."baseball_meeting_items" USING "btree" ("team_id", "status", "created_at" DESC);

CREATE INDEX "baseball_passport_share_tokens_team_player_idx" ON "public"."baseball_player_passport_share_tokens" USING "btree" ("team_id", "player_id");

CREATE INDEX "baseball_passport_share_tokens_token_idx" ON "public"."baseball_player_passport_share_tokens" USING "btree" ("token");

CREATE INDEX "baseball_pitch_events_game_id_idx" ON "public"."baseball_pitch_events" USING "btree" ("game_id");

CREATE INDEX "baseball_pitch_events_import_run_id_idx" ON "public"."baseball_pitch_events" USING "btree" ("import_run_id");

CREATE INDEX "baseball_pitch_events_pa_idx" ON "public"."baseball_pitch_events" USING "btree" ("pa_id");

CREATE INDEX "baseball_pitch_events_pitcher_id_idx" ON "public"."baseball_pitch_events" USING "btree" ("pitcher_id");

CREATE INDEX "baseball_pitch_events_player_idx" ON "public"."baseball_pitch_events" USING "btree" ("player_id");

CREATE INDEX "baseball_pitch_events_team_idx" ON "public"."baseball_pitch_events" USING "btree" ("team_id");

CREATE INDEX "baseball_plate_appearances_game_idx" ON "public"."baseball_plate_appearances" USING "btree" ("game_id");

CREATE INDEX "baseball_plate_appearances_pitcher_id_idx" ON "public"."baseball_plate_appearances" USING "btree" ("pitcher_id");

CREATE INDEX "baseball_plate_appearances_player_idx" ON "public"."baseball_plate_appearances" USING "btree" ("player_id");

CREATE INDEX "baseball_plate_appearances_team_idx" ON "public"."baseball_plate_appearances" USING "btree" ("team_id");

CREATE INDEX "baseball_player_daily_contracts_coach_acknowledged_by_idx" ON "public"."baseball_player_daily_contracts" USING "btree" ("coach_acknowledged_by");

CREATE INDEX "baseball_player_development_metrics_player_id_idx" ON "public"."baseball_player_development_metrics" USING "btree" ("player_id");

CREATE INDEX "baseball_player_development_metrics_team_player_idx" ON "public"."baseball_player_development_metrics" USING "btree" ("team_id", "player_id");

CREATE INDEX "baseball_player_passport_settings_updated_by_idx" ON "public"."baseball_player_passport_settings" USING "btree" ("updated_by");

CREATE INDEX "baseball_player_passport_share_tokens_created_by_idx" ON "public"."baseball_player_passport_share_tokens" USING "btree" ("created_by");

CREATE INDEX "baseball_player_passport_share_tokens_player_id_idx" ON "public"."baseball_player_passport_share_tokens" USING "btree" ("player_id");

CREATE INDEX "baseball_player_stats_import_run_id_idx" ON "public"."baseball_player_stats" USING "btree" ("import_run_id");

CREATE INDEX "baseball_player_timeline_events_created_by_idx" ON "public"."baseball_player_timeline_events" USING "btree" ("created_by");

CREATE INDEX "baseball_postgame_review_items_player_idx" ON "public"."baseball_postgame_review_items" USING "btree" ("player_id") WHERE ("player_id" IS NOT NULL);

CREATE INDEX "baseball_postgame_review_items_review_idx" ON "public"."baseball_postgame_review_items" USING "btree" ("review_id");

CREATE INDEX "baseball_postgame_review_items_team_id_idx" ON "public"."baseball_postgame_review_items" USING "btree" ("team_id");

CREATE INDEX "baseball_postgame_review_items_timeline_event_id_idx" ON "public"."baseball_postgame_review_items" USING "btree" ("timeline_event_id");

CREATE INDEX "baseball_postgame_reviews_coach_id_idx" ON "public"."baseball_postgame_reviews" USING "btree" ("coach_id");

CREATE INDEX "baseball_postgame_reviews_created_by_coach_id_idx" ON "public"."baseball_postgame_reviews" USING "btree" ("created_by_coach_id");

CREATE INDEX "baseball_postgame_reviews_game_id_idx" ON "public"."baseball_postgame_reviews" USING "btree" ("game_id");

CREATE INDEX "baseball_postgame_reviews_team_idx" ON "public"."baseball_postgame_reviews" USING "btree" ("team_id", "created_at" DESC);

CREATE INDEX "baseball_practice_block_objectives_block_idx" ON "public"."baseball_practice_block_objectives" USING "btree" ("block_id");

CREATE INDEX "baseball_practice_block_objectives_team_id_idx" ON "public"."baseball_practice_block_objectives" USING "btree" ("team_id");

CREATE INDEX "baseball_practice_blocks_source_postgame_item_idx" ON "public"."baseball_practice_blocks" USING "btree" ("source_postgame_item_id");

CREATE INDEX "baseball_practice_blocks_source_signal_idx" ON "public"."baseball_practice_blocks" USING "btree" ("source_signal_id");

CREATE INDEX "baseball_practice_effectiveness_revie_reviewed_by_coach_id_idx" ON "public"."baseball_practice_effectiveness_reviews" USING "btree" ("reviewed_by_coach_id");

CREATE INDEX "baseball_practice_effectiveness_reviews_block_id_idx" ON "public"."baseball_practice_effectiveness_reviews" USING "btree" ("block_id");

CREATE INDEX "baseball_practice_effectiveness_reviews_objective_id_idx" ON "public"."baseball_practice_effectiveness_reviews" USING "btree" ("objective_id");

CREATE INDEX "baseball_practice_effectiveness_reviews_practice_idx" ON "public"."baseball_practice_effectiveness_reviews" USING "btree" ("practice_id");

CREATE INDEX "baseball_practice_lineup_slots_player_id_idx" ON "public"."baseball_practice_lineup_slots" USING "btree" ("player_id");

CREATE INDEX "baseball_practice_lineup_slots_scrimmage_idx" ON "public"."baseball_practice_lineup_slots" USING "btree" ("scrimmage_id");

CREATE INDEX "baseball_practice_lineup_slots_team_id_idx" ON "public"."baseball_practice_lineup_slots" USING "btree" ("team_id");

CREATE INDEX "baseball_practice_scrimmages_block_id_idx" ON "public"."baseball_practice_scrimmages" USING "btree" ("block_id");

CREATE INDEX "baseball_practice_scrimmages_practice_idx" ON "public"."baseball_practice_scrimmages" USING "btree" ("practice_id");

CREATE UNIQUE INDEX "baseball_practices_one_backlog_per_team_uidx" ON "public"."baseball_practices" USING "btree" ("team_id") WHERE ("is_backlog" = true);

CREATE INDEX "baseball_program_settings_team_idx" ON "public"."baseball_program_settings" USING "btree" ("team_id");

CREATE INDEX "baseball_program_settings_updated_by_idx" ON "public"."baseball_program_settings" USING "btree" ("updated_by");

CREATE INDEX "baseball_seasons_created_by_coach_id_idx" ON "public"."baseball_seasons" USING "btree" ("created_by_coach_id");

CREATE INDEX "baseball_seasons_team_idx" ON "public"."baseball_seasons" USING "btree" ("team_id", "status");

CREATE INDEX "baseball_settings_audit_log_actor_coach_id_idx" ON "public"."baseball_settings_audit_log" USING "btree" ("actor_coach_id");

CREATE INDEX "baseball_settings_audit_log_changed_by_idx" ON "public"."baseball_settings_audit_log" USING "btree" ("changed_by");

CREATE INDEX "baseball_settings_audit_log_event_type_idx" ON "public"."baseball_settings_audit_log" USING "btree" ("team_id", "event_type");

CREATE INDEX "baseball_settings_audit_log_team_idx" ON "public"."baseball_settings_audit_log" USING "btree" ("team_id", "created_at" DESC);

CREATE INDEX "baseball_signals_acknowledged_by_idx" ON "public"."baseball_signals" USING "btree" ("acknowledged_by");

CREATE INDEX "baseball_signals_created_by_idx" ON "public"."baseball_signals" USING "btree" ("created_by");

CREATE INDEX "baseball_signals_owner_coach_id_idx" ON "public"."baseball_signals" USING "btree" ("owner_coach_id");

CREATE INDEX "baseball_signals_player_idx" ON "public"."baseball_signals" USING "btree" ("player_id", "status") WHERE ("player_id" IS NOT NULL);

CREATE INDEX "baseball_signals_team_category_idx" ON "public"."baseball_signals" USING "btree" ("team_id", "category");

CREATE INDEX "baseball_signals_team_disposition_idx" ON "public"."baseball_signals" USING "btree" ("team_id", "disposition", "severity", "created_at" DESC);

CREATE INDEX "baseball_signals_team_idx" ON "public"."baseball_signals" USING "btree" ("team_id", "status", "severity");

CREATE INDEX "baseball_signals_team_player_idx" ON "public"."baseball_signals" USING "btree" ("team_id", "player_id");

CREATE INDEX "baseball_staff_audit_events_actor_coach_id_idx" ON "public"."baseball_staff_audit_events" USING "btree" ("actor_coach_id");

CREATE INDEX "baseball_staff_audit_events_coach_id_idx" ON "public"."baseball_staff_audit_events" USING "btree" ("coach_id");

CREATE INDEX "baseball_staff_audit_events_team_idx" ON "public"."baseball_staff_audit_events" USING "btree" ("team_id", "created_at" DESC);

CREATE INDEX "baseball_staff_invitations_accepted_by_idx" ON "public"."baseball_staff_invitations" USING "btree" ("accepted_by_user_id") WHERE ("accepted_by_user_id" IS NOT NULL);

CREATE INDEX "baseball_staff_invitations_email_idx" ON "public"."baseball_staff_invitations" USING "btree" ("lower"("email"));

CREATE INDEX "baseball_staff_invitations_invited_by_coach_id_idx" ON "public"."baseball_staff_invitations" USING "btree" ("invited_by_coach_id");

CREATE INDEX "baseball_staff_invitations_invited_by_idx" ON "public"."baseball_staff_invitations" USING "btree" ("invited_by");

CREATE INDEX "baseball_staff_invitations_status_idx" ON "public"."baseball_staff_invitations" USING "btree" ("status");

CREATE INDEX "baseball_staff_invitations_team_id_idx" ON "public"."baseball_staff_invitations" USING "btree" ("team_id");

CREATE UNIQUE INDEX "baseball_staff_invitations_token_key" ON "public"."baseball_staff_invitations" USING "btree" ("token");

CREATE INDEX "baseball_stat_sources_team_idx" ON "public"."baseball_stat_sources" USING "btree" ("team_id");

CREATE INDEX "baseball_stat_visual_views_created_by_coach_id_idx" ON "public"."baseball_stat_visual_views" USING "btree" ("created_by_coach_id");

CREATE INDEX "baseball_stat_visual_views_player_idx" ON "public"."baseball_stat_visual_views" USING "btree" ("player_id") WHERE ("player_id" IS NOT NULL);

CREATE INDEX "baseball_stat_visual_views_team_idx" ON "public"."baseball_stat_visual_views" USING "btree" ("team_id");

CREATE INDEX "baseball_swing_events_game_id_idx" ON "public"."baseball_swing_events" USING "btree" ("game_id");

CREATE INDEX "baseball_swing_events_import_run_id_idx" ON "public"."baseball_swing_events" USING "btree" ("import_run_id");

CREATE INDEX "baseball_swing_events_pa_id_idx" ON "public"."baseball_swing_events" USING "btree" ("pa_id");

CREATE INDEX "baseball_swing_events_pitch_event_id_idx" ON "public"."baseball_swing_events" USING "btree" ("pitch_event_id");

CREATE INDEX "baseball_swing_events_player_idx" ON "public"."baseball_swing_events" USING "btree" ("player_id");

CREATE INDEX "baseball_swing_events_team_idx" ON "public"."baseball_swing_events" USING "btree" ("team_id");

CREATE INDEX "baseball_timeline_event_acks_acked_by_idx" ON "public"."baseball_timeline_event_acks" USING "btree" ("acked_by");

CREATE INDEX "baseball_timeline_event_acks_player_idx" ON "public"."baseball_timeline_event_acks" USING "btree" ("player_id");

CREATE INDEX "baseball_timeline_event_acks_team_event_idx" ON "public"."baseball_timeline_event_acks" USING "btree" ("team_id", "timeline_event_id");

CREATE INDEX "baseball_video_events_game_id_idx" ON "public"."baseball_video_events" USING "btree" ("game_id");

CREATE INDEX "baseball_video_events_pitch_event_id_idx" ON "public"."baseball_video_events" USING "btree" ("pitch_event_id");

CREATE INDEX "baseball_video_events_player_idx" ON "public"."baseball_video_events" USING "btree" ("player_id");

CREATE INDEX "baseball_video_events_team_idx" ON "public"."baseball_video_events" USING "btree" ("team_id");

CREATE INDEX "baseball_workload_events_game_id_idx" ON "public"."baseball_workload_events" USING "btree" ("game_id");

CREATE INDEX "baseball_workload_events_player_date_idx" ON "public"."baseball_workload_events" USING "btree" ("player_id", "event_date" DESC);

CREATE INDEX "baseball_workload_events_team_idx" ON "public"."baseball_workload_events" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_acad_elig_team" ON "public"."baseball_academic_eligibility" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_academic_eligibility_player" ON "public"."baseball_academic_eligibility" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_academic_eligibility_semester" ON "public"."baseball_academic_eligibility" USING "btree" ("semester");

CREATE INDEX "idx_baseball_academic_eligibility_updated_by" ON "public"."baseball_academic_eligibility" USING "btree" ("updated_by") WHERE ("updated_by" IS NOT NULL);

CREATE INDEX "idx_baseball_aggregates_player_id" ON "public"."baseball_player_aggregates" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_aggregates_team_id" ON "public"."baseball_player_aggregates" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_ann_acks_announcement" ON "public"."baseball_announcement_acknowledgements" USING "btree" ("announcement_id");

CREATE INDEX "idx_baseball_ann_acks_player" ON "public"."baseball_announcement_acknowledgements" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_ann_recipients_announcement" ON "public"."baseball_announcement_recipients" USING "btree" ("announcement_id");

CREATE INDEX "idx_baseball_ann_recipients_player" ON "public"."baseball_announcement_recipients" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_announcements_created_by" ON "public"."baseball_announcements" USING "btree" ("created_by_id");

CREATE INDEX "idx_baseball_announcements_published" ON "public"."baseball_announcements" USING "btree" ("published_at" DESC);

CREATE INDEX "idx_baseball_announcements_team" ON "public"."baseball_announcements" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_batted_ball_events_current" ON "public"."baseball_batted_ball_events" USING "btree" ("team_id", "player_id") WHERE ("superseded_by_run_id" IS NULL);

CREATE INDEX "idx_baseball_batted_ball_events_superseded_by" ON "public"."baseball_batted_ball_events" USING "btree" ("superseded_by_run_id") WHERE ("superseded_by_run_id" IS NOT NULL);

CREATE INDEX "idx_baseball_bsb_game_id" ON "public"."baseball_box_score_batting" USING "btree" ("game_id");

CREATE INDEX "idx_baseball_bsb_player_id" ON "public"."baseball_box_score_batting" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_bsb_team_id" ON "public"."baseball_box_score_batting" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_bsp_game_id" ON "public"."baseball_box_score_pitching" USING "btree" ("game_id");

CREATE INDEX "idx_baseball_bsp_player_id" ON "public"."baseball_box_score_pitching" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_bsp_team_id" ON "public"."baseball_box_score_pitching" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_bsu_coach_id" ON "public"."baseball_box_score_uploads" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_bsu_game_id" ON "public"."baseball_box_score_uploads" USING "btree" ("game_id");

CREATE INDEX "idx_baseball_bsu_team_id" ON "public"."baseball_box_score_uploads" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_camp_regs_camp_id" ON "public"."baseball_camp_registrations" USING "btree" ("camp_id");

CREATE INDEX "idx_baseball_camp_regs_player_id" ON "public"."baseball_camp_registrations" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_camps_coach_id" ON "public"."baseball_camps" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_camps_org_id" ON "public"."baseball_camps" USING "btree" ("organization_id");

CREATE INDEX "idx_baseball_coach_insights_rank" ON "public"."baseball_coach_insights" USING "btree" ("team_id", "rank_score" DESC NULLS LAST) WHERE ("rank_score" IS NOT NULL);

CREATE INDEX "idx_baseball_coach_insights_team_persisted" ON "public"."baseball_coach_insights" USING "btree" ("team_id", "lifecycle_state", "rank_score" DESC) WHERE ("lifecycle_state" = ANY (ARRAY['active'::"text", 'persisted'::"text"]));

CREATE INDEX "idx_baseball_coach_philosophy_coach_id" ON "public"."baseball_coach_philosophy" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_coaches_org_id" ON "public"."baseball_coaches" USING "btree" ("organization_id");

CREATE INDEX "idx_baseball_coaches_type" ON "public"."baseball_coaches" USING "btree" ("coach_type");

CREATE INDEX "idx_baseball_coaches_user_id" ON "public"."baseball_coaches" USING "btree" ("user_id");

CREATE INDEX "idx_baseball_comparisons_coach_id" ON "public"."baseball_player_comparisons" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_conv_participants_conv" ON "public"."baseball_conversation_participants" USING "btree" ("conversation_id");

CREATE INDEX "idx_baseball_conv_participants_user" ON "public"."baseball_conversation_participants" USING "btree" ("user_id");

CREATE INDEX "idx_baseball_conversations_created" ON "public"."baseball_conversations" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_baseball_conversations_created_by" ON "public"."baseball_conversations" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_baseball_conversations_team" ON "public"."baseball_conversations" USING "btree" ("team_id") WHERE ("team_id" IS NOT NULL);

CREATE INDEX "idx_baseball_conversations_team_id" ON "public"."baseball_conversations" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_daily_contract_player" ON "public"."baseball_player_daily_contracts" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_daily_contract_player_date" ON "public"."baseball_player_daily_contracts" USING "btree" ("player_id", "contract_date" DESC);

CREATE INDEX "idx_baseball_daily_contract_team" ON "public"."baseball_player_daily_contracts" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_daily_contract_team_date_active" ON "public"."baseball_player_daily_contracts" USING "btree" ("team_id", "contract_date") WHERE ("missed_at" IS NULL);

CREATE INDEX "idx_baseball_daily_contract_team_date_shared" ON "public"."baseball_player_daily_contracts" USING "btree" ("team_id", "contract_date") WHERE ("visibility" IS NOT NULL);

CREATE INDEX "idx_baseball_dev_plans_coach_id" ON "public"."baseball_developmental_plans" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_dev_plans_player_id" ON "public"."baseball_developmental_plans" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_dev_plans_team_id" ON "public"."baseball_developmental_plans" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_document_versions_document" ON "public"."baseball_document_versions" USING "btree" ("document_id");

CREATE INDEX "idx_baseball_document_versions_uploaded_by" ON "public"."baseball_document_versions" USING "btree" ("uploaded_by") WHERE ("uploaded_by" IS NOT NULL);

CREATE INDEX "idx_baseball_documents_category" ON "public"."baseball_documents" USING "btree" ("category");

CREATE INDEX "idx_baseball_documents_team" ON "public"."baseball_documents" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_documents_uploaded_by" ON "public"."baseball_documents" USING "btree" ("uploaded_by") WHERE ("uploaded_by" IS NOT NULL);

CREATE INDEX "idx_baseball_documents_visible" ON "public"."baseball_documents" USING "btree" ("is_player_visible");

CREATE INDEX "idx_baseball_engagement_coach_id" ON "public"."baseball_player_engagement_events" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_engagement_coach_type_date" ON "public"."baseball_player_engagement_events" USING "btree" ("coach_id", "engagement_type", "created_at" DESC) WHERE ("coach_id" IS NOT NULL);

CREATE INDEX "idx_baseball_engagement_created" ON "public"."baseball_player_engagement_events" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_baseball_engagement_events_coach_type_date" ON "public"."baseball_player_engagement_events" USING "btree" ("coach_id", "engagement_type", "engagement_date" DESC);

CREATE INDEX "idx_baseball_engagement_events_date" ON "public"."baseball_player_engagement_events" USING "btree" ("engagement_date" DESC);

CREATE INDEX "idx_baseball_engagement_events_player_type_date" ON "public"."baseball_player_engagement_events" USING "btree" ("player_id", "engagement_type", "engagement_date" DESC);

CREATE INDEX "idx_baseball_engagement_player_id" ON "public"."baseball_player_engagement_events" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_engagement_player_type_date" ON "public"."baseball_player_engagement_events" USING "btree" ("player_id", "engagement_type", "created_at" DESC);

CREATE INDEX "idx_baseball_engagement_type" ON "public"."baseball_player_engagement_events" USING "btree" ("engagement_type");

CREATE INDEX "idx_baseball_event_acks_event_id" ON "public"."baseball_event_acknowledgements" USING "btree" ("event_id");

CREATE INDEX "idx_baseball_event_acks_user_id" ON "public"."baseball_event_acknowledgements" USING "btree" ("user_id");

CREATE INDEX "idx_baseball_event_attendance_event" ON "public"."baseball_event_attendance" USING "btree" ("event_id");

CREATE INDEX "idx_baseball_event_attendance_player" ON "public"."baseball_event_attendance" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_event_attendance_status" ON "public"."baseball_event_attendance" USING "btree" ("status");

CREATE INDEX "idx_baseball_events_created_by" ON "public"."baseball_events" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_baseball_events_start" ON "public"."baseball_events" USING "btree" ("start_time");

CREATE INDEX "idx_baseball_events_status" ON "public"."baseball_events" USING "btree" ("status");

CREATE INDEX "idx_baseball_events_team_id" ON "public"."baseball_events" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_games_created_by" ON "public"."baseball_games" USING "btree" ("created_by");

CREATE INDEX "idx_baseball_games_event_id" ON "public"."baseball_games" USING "btree" ("event_id");

CREATE INDEX "idx_baseball_games_game_date" ON "public"."baseball_games" USING "btree" ("game_date" DESC);

CREATE INDEX "idx_baseball_games_status" ON "public"."baseball_games" USING "btree" ("status");

CREATE INDEX "idx_baseball_games_team_id" ON "public"."baseball_games" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_import_runs_file_hash" ON "public"."baseball_import_runs" USING "btree" ("team_id", "source_id", "file_hash") WHERE (("file_hash" IS NOT NULL) AND ("status" = 'committed'::"text"));

CREATE INDEX "idx_baseball_import_runs_source" ON "public"."baseball_import_runs" USING "btree" ("source_id");

CREATE INDEX "idx_baseball_import_runs_status" ON "public"."baseball_import_runs" USING "btree" ("status");

CREATE INDEX "idx_baseball_import_runs_team" ON "public"."baseball_import_runs" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_insights_coach_id" ON "public"."baseball_coach_insights" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_insights_lifecycle" ON "public"."baseball_coach_insights" USING "btree" ("team_id", "lifecycle_state", "created_at" DESC) WHERE ("lifecycle_state" IS NOT NULL);

CREATE INDEX "idx_baseball_insights_player_id" ON "public"."baseball_coach_insights" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_insights_player_visible" ON "public"."baseball_coach_insights" USING "btree" ("player_id", "player_visible", "created_at" DESC);

CREATE INDEX "idx_baseball_insights_status" ON "public"."baseball_coach_insights" USING "btree" ("status");

CREATE INDEX "idx_baseball_insights_team_id" ON "public"."baseball_coach_insights" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_lineup_positions_lineup" ON "public"."baseball_lineup_positions" USING "btree" ("lineup_id");

CREATE INDEX "idx_baseball_messages_conv_id" ON "public"."baseball_messages" USING "btree" ("conversation_id");

CREATE INDEX "idx_baseball_messages_conversation" ON "public"."baseball_messages" USING "btree" ("conversation_id", "created_at" DESC);

CREATE INDEX "idx_baseball_messages_sender" ON "public"."baseball_messages" USING "btree" ("sender_id");

CREATE INDEX "idx_baseball_messages_unread" ON "public"."baseball_messages" USING "btree" ("conversation_id", "read") WHERE ("read" = false);

CREATE INDEX "idx_baseball_notifications_user_unread" ON "public"."baseball_notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);

CREATE INDEX "idx_baseball_passport_settings_player" ON "public"."baseball_player_passport_settings" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_passport_settings_team" ON "public"."baseball_player_passport_settings" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_pitch_events_current" ON "public"."baseball_pitch_events" USING "btree" ("team_id", "player_id") WHERE ("superseded_by_run_id" IS NULL);

CREATE INDEX "idx_baseball_pitch_events_superseded_by" ON "public"."baseball_pitch_events" USING "btree" ("superseded_by_run_id") WHERE ("superseded_by_run_id" IS NOT NULL);

CREATE INDEX "idx_baseball_player_classes_player" ON "public"."baseball_player_classes" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_player_classes_semester" ON "public"."baseball_player_classes" USING "btree" ("semester");

CREATE INDEX "idx_baseball_player_classes_team" ON "public"."baseball_player_classes" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_player_external_ids_player" ON "public"."baseball_player_external_ids" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_player_external_ids_source" ON "public"."baseball_player_external_ids" USING "btree" ("source_id");

CREATE INDEX "idx_baseball_player_external_ids_team_player" ON "public"."baseball_player_external_ids" USING "btree" ("team_id", "player_id");

CREATE INDEX "idx_baseball_player_percentiles_grad_year" ON "public"."baseball_player_percentiles" USING "btree" ("grad_year");

CREATE INDEX "idx_baseball_player_settings_player_id" ON "public"."baseball_player_settings" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_player_stats_coach_id" ON "public"."baseball_player_stats" USING "btree" ("coach_id") WHERE ("coach_id" IS NOT NULL);

CREATE INDEX "idx_baseball_player_stats_player" ON "public"."baseball_player_stats" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_player_stats_source_external_id" ON "public"."baseball_player_stats" USING "btree" ("team_id", "source_external_id") WHERE ("source_external_id" IS NOT NULL);

CREATE INDEX "idx_baseball_player_stats_team_date" ON "public"."baseball_player_stats" USING "btree" ("team_id", "session_date" DESC);

CREATE INDEX "idx_baseball_players_grad_year" ON "public"."baseball_players" USING "btree" ("grad_year");

CREATE INDEX "idx_baseball_players_position" ON "public"."baseball_players" USING "btree" ("primary_position");

CREATE INDEX "idx_baseball_players_recruiting" ON "public"."baseball_players" USING "btree" ("recruiting_activated") WHERE ("recruiting_activated" = true);

CREATE INDEX "idx_baseball_players_state" ON "public"."baseball_players" USING "btree" ("state");

CREATE INDEX "idx_baseball_players_type" ON "public"."baseball_players" USING "btree" ("player_type");

CREATE INDEX "idx_baseball_players_user_id" ON "public"."baseball_players" USING "btree" ("user_id");

CREATE INDEX "idx_baseball_practice_effectiveness_reviews_team_verdict" ON "public"."baseball_practice_effectiveness_reviews" USING "btree" ("team_id", "verdict");

CREATE INDEX "idx_baseball_pss_player_id" ON "public"."baseball_player_season_stats" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_pss_season_year" ON "public"."baseball_player_season_stats" USING "btree" ("season_year");

CREATE INDEX "idx_baseball_pss_team_id" ON "public"."baseball_player_season_stats" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_recruiting_interests_org_id" ON "public"."baseball_recruiting_interests" USING "btree" ("organization_id");

CREATE INDEX "idx_baseball_recruiting_interests_player_id" ON "public"."baseball_recruiting_interests" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_recruiting_philosophy_coach" ON "public"."baseball_coach_recruiting_philosophy" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_staff_invitations_pending_email" ON "public"."baseball_staff_invitations" USING "btree" ("lower"("email")) WHERE ("status" = 'pending'::"text");

CREATE INDEX "idx_baseball_stat_uploads_coach_id" ON "public"."baseball_stat_uploads" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_stat_uploads_import_run_id" ON "public"."baseball_stat_uploads" USING "btree" ("import_run_id");

CREATE INDEX "idx_baseball_stat_uploads_session_date" ON "public"."baseball_stat_uploads" USING "btree" ("session_date");

CREATE INDEX "idx_baseball_stat_uploads_source_id" ON "public"."baseball_stat_uploads" USING "btree" ("source_id");

CREATE INDEX "idx_baseball_stat_uploads_stat_type" ON "public"."baseball_stat_uploads" USING "btree" ("stat_type");

CREATE INDEX "idx_baseball_stat_uploads_status" ON "public"."baseball_stat_uploads" USING "btree" ("status");

CREATE INDEX "idx_baseball_stat_uploads_team_created" ON "public"."baseball_stat_uploads" USING "btree" ("team_id", "created_at" DESC);

CREATE INDEX "idx_baseball_stat_uploads_team_id" ON "public"."baseball_stat_uploads" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_swing_events_current" ON "public"."baseball_swing_events" USING "btree" ("team_id", "player_id") WHERE ("superseded_by_run_id" IS NULL);

CREATE INDEX "idx_baseball_swing_events_superseded_by" ON "public"."baseball_swing_events" USING "btree" ("superseded_by_run_id") WHERE ("superseded_by_run_id" IS NOT NULL);

CREATE INDEX "idx_baseball_task_assignments_player" ON "public"."baseball_task_assignments" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_task_assignments_task" ON "public"."baseball_task_assignments" USING "btree" ("task_id");

CREATE INDEX "idx_baseball_task_templates_created_by_id" ON "public"."baseball_task_templates" USING "btree" ("created_by_id") WHERE ("created_by_id" IS NOT NULL);

CREATE INDEX "idx_baseball_task_templates_team" ON "public"."baseball_task_templates" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_tasks_created_by" ON "public"."baseball_tasks" USING "btree" ("created_by_id");

CREATE INDEX "idx_baseball_tasks_due_date" ON "public"."baseball_tasks" USING "btree" ("due_date");

CREATE INDEX "idx_baseball_tasks_pending_reminder" ON "public"."baseball_tasks" USING "btree" ("reminder_at") WHERE (("reminder_at" IS NOT NULL) AND ("reminder_sent" = false));

CREATE INDEX "idx_baseball_tasks_status" ON "public"."baseball_tasks" USING "btree" ("status");

CREATE INDEX "idx_baseball_tasks_team" ON "public"."baseball_tasks" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_team_coach_staff_coach_id" ON "public"."baseball_team_coach_staff" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_team_coach_staff_team_id" ON "public"."baseball_team_coach_staff" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_team_invitations_code" ON "public"."baseball_team_invitations" USING "btree" ("code");

CREATE INDEX "idx_baseball_team_invitations_created_by_coach_id" ON "public"."baseball_team_invitations" USING "btree" ("created_by_coach_id") WHERE ("created_by_coach_id" IS NOT NULL);

CREATE INDEX "idx_baseball_team_invitations_team" ON "public"."baseball_team_invitations" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_team_lineups_created_by_coach_id" ON "public"."baseball_team_lineups" USING "btree" ("created_by_coach_id") WHERE ("created_by_coach_id" IS NOT NULL);

CREATE INDEX "idx_baseball_team_lineups_team" ON "public"."baseball_team_lineups" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_team_members_approved_by" ON "public"."baseball_team_members" USING "btree" ("approved_by") WHERE ("approved_by" IS NOT NULL);

CREATE INDEX "idx_baseball_team_members_player_id" ON "public"."baseball_team_members" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_team_members_status" ON "public"."baseball_team_members" USING "btree" ("status");

CREATE INDEX "idx_baseball_team_members_team_id" ON "public"."baseball_team_members" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_teams_created_by" ON "public"."baseball_teams" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_baseball_teams_join_code" ON "public"."baseball_teams" USING "btree" ("join_code");

CREATE INDEX "idx_baseball_teams_org_id" ON "public"."baseball_teams" USING "btree" ("organization_id");

CREATE INDEX "idx_baseball_teams_type" ON "public"."baseball_teams" USING "btree" ("team_type");

CREATE INDEX "idx_baseball_timeline_occurred_at" ON "public"."baseball_player_timeline_events" USING "btree" ("occurred_at" DESC);

CREATE INDEX "idx_baseball_timeline_player_id" ON "public"."baseball_player_timeline_events" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_timeline_player_occurred" ON "public"."baseball_player_timeline_events" USING "btree" ("player_id", "occurred_at" DESC);

CREATE INDEX "idx_baseball_timeline_team_id" ON "public"."baseball_player_timeline_events" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_travel_expenses_category" ON "public"."baseball_travel_expenses" USING "btree" ("category");

CREATE INDEX "idx_baseball_travel_expenses_created_by" ON "public"."baseball_travel_expenses" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_baseball_travel_expenses_itinerary" ON "public"."baseball_travel_expenses" USING "btree" ("itinerary_id");

CREATE INDEX "idx_baseball_travel_expenses_team" ON "public"."baseball_travel_expenses" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_travel_itineraries_created_by" ON "public"."baseball_travel_itineraries" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);

CREATE INDEX "idx_baseball_travel_itineraries_departure" ON "public"."baseball_travel_itineraries" USING "btree" ("departure_date");

CREATE INDEX "idx_baseball_travel_itineraries_team" ON "public"."baseball_travel_itineraries" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_video_game" ON "public"."baseball_video_events" USING "btree" ("team_id", "game_id");

CREATE INDEX "idx_baseball_video_pa" ON "public"."baseball_video_events" USING "btree" ("plate_appearance_id");

CREATE INDEX "idx_baseball_video_players_tagged" ON "public"."baseball_video_events" USING "gin" ("players_tagged");

CREATE INDEX "idx_baseball_video_review_status" ON "public"."baseball_video_events" USING "btree" ("team_id", "review_status");

CREATE INDEX "idx_baseball_video_signal" ON "public"."baseball_video_events" USING "btree" ("linked_signal_id");

CREATE INDEX "idx_baseball_videos_parent_video_id" ON "public"."baseball_videos" USING "btree" ("parent_video_id") WHERE ("parent_video_id" IS NOT NULL);

CREATE INDEX "idx_baseball_videos_player_id" ON "public"."baseball_videos" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_videos_primary" ON "public"."baseball_videos" USING "btree" ("player_id") WHERE ("is_primary" = true);

CREATE INDEX "idx_baseball_videos_team_id" ON "public"."baseball_videos" USING "btree" ("team_id");

CREATE INDEX "idx_baseball_watchlists_coach_id" ON "public"."baseball_watchlists" USING "btree" ("coach_id");

CREATE INDEX "idx_baseball_watchlists_player_id" ON "public"."baseball_watchlists" USING "btree" ("player_id");

CREATE INDEX "idx_baseball_watchlists_stage" ON "public"."baseball_watchlists" USING "btree" ("pipeline_stage");

CREATE INDEX "idx_bp_event" ON "public"."baseball_practices" USING "btree" ("event_id");

CREATE INDEX "idx_bp_team" ON "public"."baseball_practices" USING "btree" ("team_id");

CREATE INDEX "idx_bpa_player" ON "public"."baseball_practice_attendance" USING "btree" ("player_id");

CREATE INDEX "idx_bpa_practice" ON "public"."baseball_practice_attendance" USING "btree" ("practice_id");

CREATE INDEX "idx_bpa_team" ON "public"."baseball_practice_attendance" USING "btree" ("team_id");

CREATE INDEX "idx_bpb_coach_owner" ON "public"."baseball_practice_blocks" USING "btree" ("coach_owner_id") WHERE ("coach_owner_id" IS NOT NULL);

CREATE INDEX "idx_bpb_practice" ON "public"."baseball_practice_blocks" USING "btree" ("practice_id");

CREATE INDEX "idx_bpb_team" ON "public"."baseball_practice_blocks" USING "btree" ("team_id");

CREATE INDEX "idx_bps_completed" ON "public"."baseball_practice_scrimmages" USING "btree" ("team_id", "completed_at") WHERE ("completed_at" IS NOT NULL);

CREATE UNIQUE INDEX "uq_baseball_bb_external" ON "public"."baseball_batted_ball_events" USING "btree" ("source_id", "external_event_id") WHERE (("source_id" IS NOT NULL) AND ("external_event_id" IS NOT NULL));

CREATE UNIQUE INDEX "uq_baseball_import_runs_same_file" ON "public"."baseball_import_runs" USING "btree" ("team_id", "import_type", "file_hash") WHERE (("file_hash" IS NOT NULL) AND ("status" = 'committed'::"text"));

CREATE UNIQUE INDEX "uq_baseball_pitch_external" ON "public"."baseball_pitch_events" USING "btree" ("source_id", "external_pitch_id") WHERE (("source_id" IS NOT NULL) AND ("external_pitch_id" IS NOT NULL));

CREATE UNIQUE INDEX "uq_baseball_stat_uploads_import_run_id" ON "public"."baseball_stat_uploads" USING "btree" ("import_run_id") WHERE ("import_run_id" IS NOT NULL);

CREATE UNIQUE INDEX "uq_baseball_swing_external" ON "public"."baseball_swing_events" USING "btree" ("source_id", "external_swing_id") WHERE (("source_id" IS NOT NULL) AND ("external_swing_id" IS NOT NULL));
