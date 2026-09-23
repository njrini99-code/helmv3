ALTER TABLE ONLY "public"."baseball_academic_eligibility"
    ADD CONSTRAINT "baseball_academic_eligibility_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_ai_audit"
    ADD CONSTRAINT "baseball_ai_audit_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."baseball_ai_audit"
    ADD CONSTRAINT "baseball_ai_audit_visibility_check" CHECK ((("visibility" IS NULL) OR ("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text", 'staff_only'::"text"])))) NOT VALID;

ALTER TABLE ONLY "public"."baseball_announcement_acknowledgements"
    ADD CONSTRAINT "baseball_announcement_acknowledge_announcement_id_player_id_key" UNIQUE ("announcement_id", "player_id");

ALTER TABLE ONLY "public"."baseball_announcement_acknowledgements"
    ADD CONSTRAINT "baseball_announcement_acknowledgements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_announcement_recipients"
    ADD CONSTRAINT "baseball_announcement_recipients_announcement_id_player_id_key" UNIQUE ("announcement_id", "player_id");

ALTER TABLE ONLY "public"."baseball_announcement_recipients"
    ADD CONSTRAINT "baseball_announcement_recipients_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_announcements"
    ADD CONSTRAINT "baseball_announcements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_baserunning_events"
    ADD CONSTRAINT "baseball_baserunning_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_box_score_batting"
    ADD CONSTRAINT "baseball_box_score_batting_game_id_player_id_key" UNIQUE ("game_id", "player_id");

ALTER TABLE ONLY "public"."baseball_box_score_batting"
    ADD CONSTRAINT "baseball_box_score_batting_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_box_score_pitching"
    ADD CONSTRAINT "baseball_box_score_pitching_game_id_player_id_key" UNIQUE ("game_id", "player_id");

ALTER TABLE ONLY "public"."baseball_box_score_pitching"
    ADD CONSTRAINT "baseball_box_score_pitching_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_box_score_uploads"
    ADD CONSTRAINT "baseball_box_score_uploads_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_camp_registrations"
    ADD CONSTRAINT "baseball_camp_registrations_camp_id_player_id_key" UNIQUE ("camp_id", "player_id");

ALTER TABLE ONLY "public"."baseball_camp_registrations"
    ADD CONSTRAINT "baseball_camp_registrations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_camps"
    ADD CONSTRAINT "baseball_camps_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_catching_events"
    ADD CONSTRAINT "baseball_catching_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_class_conflicts"
    ADD CONSTRAINT "baseball_class_conflicts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_coach_insights"
    ADD CONSTRAINT "baseball_coach_insights_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_coach_notes"
    ADD CONSTRAINT "baseball_coach_notes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_coach_philosophy"
    ADD CONSTRAINT "baseball_coach_philosophy_coach_id_key" UNIQUE ("coach_id");

ALTER TABLE ONLY "public"."baseball_coach_philosophy"
    ADD CONSTRAINT "baseball_coach_philosophy_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_coach_player_notes"
    ADD CONSTRAINT "baseball_coach_player_notes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_coach_recruiting_philosophy"
    ADD CONSTRAINT "baseball_coach_recruiting_philosophy_coach_id_key" UNIQUE ("coach_id");

ALTER TABLE ONLY "public"."baseball_coach_recruiting_philosophy"
    ADD CONSTRAINT "baseball_coach_recruiting_philosophy_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_coaches"
    ADD CONSTRAINT "baseball_coaches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_coaches"
    ADD CONSTRAINT "baseball_coaches_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."baseball_conversation_participants"
    ADD CONSTRAINT "baseball_conversation_participants_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");

ALTER TABLE ONLY "public"."baseball_conversation_participants"
    ADD CONSTRAINT "baseball_conversation_participants_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_conversations"
    ADD CONSTRAINT "baseball_conversations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_daily_contracts"
    ADD CONSTRAINT "baseball_daily_contract_player_team_date_key" UNIQUE ("player_id", "team_id", "contract_date");

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_demo_sessions"
    ADD CONSTRAINT "baseball_demo_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_developmental_plans"
    ADD CONSTRAINT "baseball_developmental_plans_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_document_versions"
    ADD CONSTRAINT "baseball_document_versions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_documents"
    ADD CONSTRAINT "baseball_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_event_acknowledgements"
    ADD CONSTRAINT "baseball_event_acknowledgements_event_user_key" UNIQUE ("event_id", "user_id");

ALTER TABLE ONLY "public"."baseball_event_acknowledgements"
    ADD CONSTRAINT "baseball_event_acknowledgements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_event_attendance"
    ADD CONSTRAINT "baseball_event_attendance_event_id_player_id_key" UNIQUE ("event_id", "player_id");

ALTER TABLE ONLY "public"."baseball_event_attendance"
    ADD CONSTRAINT "baseball_event_attendance_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_events"
    ADD CONSTRAINT "baseball_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_exercises"
    ADD CONSTRAINT "baseball_exercises_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_fielding_events"
    ADD CONSTRAINT "baseball_fielding_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_games"
    ADD CONSTRAINT "baseball_games_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_import_runs"
    ADD CONSTRAINT "baseball_import_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_import_sources"
    ADD CONSTRAINT "baseball_import_sources_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_integration_configs"
    ADD CONSTRAINT "baseball_integration_configs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_integration_configs"
    ADD CONSTRAINT "baseball_integration_configs_team_provider_key" UNIQUE ("team_id", "provider_key");

ALTER TABLE ONLY "public"."baseball_lineup_positions"
    ADD CONSTRAINT "baseball_lineup_positions_lineup_id_batting_order_key" UNIQUE ("lineup_id", "batting_order");

ALTER TABLE ONLY "public"."baseball_lineup_positions"
    ADD CONSTRAINT "baseball_lineup_positions_lineup_id_player_id_key" UNIQUE ("lineup_id", "player_id");

ALTER TABLE ONLY "public"."baseball_lineup_positions"
    ADD CONSTRAINT "baseball_lineup_positions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_messages"
    ADD CONSTRAINT "baseball_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_notifications"
    ADD CONSTRAINT "baseball_notifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_passport_settings"
    ADD CONSTRAINT "baseball_passport_settings_player_team_key" UNIQUE ("player_id", "team_id");

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_source_trust_level_check" CHECK ((("source_trust_level" IS NULL) OR ("source_trust_level" = ANY (ARRAY['official'::"text", 'device_export'::"text", 'staff_entered'::"text", 'player_entered'::"text", 'ai_derived'::"text", 'unreviewed'::"text"])))) NOT VALID;

ALTER TABLE ONLY "public"."baseball_plate_appearances"
    ADD CONSTRAINT "baseball_plate_appearances_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."baseball_plate_appearances"
    ADD CONSTRAINT "baseball_plate_appearances_source_trust_level_check" CHECK ((("source_trust_level" IS NULL) OR ("source_trust_level" = ANY (ARRAY['official'::"text", 'device_export'::"text", 'staff_entered'::"text", 'player_entered'::"text", 'ai_derived'::"text", 'unreviewed'::"text"])))) NOT VALID;

ALTER TABLE "public"."baseball_plate_appearances"
    ADD CONSTRAINT "baseball_plate_appearances_source_visibility_check" CHECK ((("source_visibility" IS NULL) OR ("source_visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"])))) NOT VALID;

ALTER TABLE ONLY "public"."baseball_player_aggregates"
    ADD CONSTRAINT "baseball_player_aggregates_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_aggregates"
    ADD CONSTRAINT "baseball_player_aggregates_player_id_team_id_key" UNIQUE ("player_id", "team_id");

ALTER TABLE ONLY "public"."baseball_player_classes"
    ADD CONSTRAINT "baseball_player_classes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_comparisons"
    ADD CONSTRAINT "baseball_player_comparisons_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_daily_contracts"
    ADD CONSTRAINT "baseball_player_daily_contracts_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."baseball_player_daily_contracts"
    ADD CONSTRAINT "baseball_player_daily_contracts_visibility_check" CHECK ((("visibility" IS NULL) OR ("visibility" = ANY (ARRAY['team'::"text", 'player_only'::"text", 'staff_only'::"text"])))) NOT VALID;

ALTER TABLE ONLY "public"."baseball_player_development_metrics"
    ADD CONSTRAINT "baseball_player_development_metrics_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_engagement_events"
    ADD CONSTRAINT "baseball_player_engagement_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_external_ids"
    ADD CONSTRAINT "baseball_player_external_ids_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_passport_settings"
    ADD CONSTRAINT "baseball_player_passport_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_passport_share_tokens"
    ADD CONSTRAINT "baseball_player_passport_share_tokens_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_passport_share_tokens"
    ADD CONSTRAINT "baseball_player_passport_share_tokens_token_key" UNIQUE ("token");

ALTER TABLE ONLY "public"."baseball_player_percentiles"
    ADD CONSTRAINT "baseball_player_percentiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_percentiles"
    ADD CONSTRAINT "baseball_player_percentiles_player_id_key" UNIQUE ("player_id");

ALTER TABLE ONLY "public"."baseball_player_season_stats"
    ADD CONSTRAINT "baseball_player_season_stats_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_season_stats"
    ADD CONSTRAINT "baseball_player_season_stats_player_id_team_id_season_year_key" UNIQUE ("player_id", "team_id", "season_year");

ALTER TABLE ONLY "public"."baseball_player_settings"
    ADD CONSTRAINT "baseball_player_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_player_settings"
    ADD CONSTRAINT "baseball_player_settings_player_id_key" UNIQUE ("player_id");

ALTER TABLE ONLY "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_source_match_tier_check" CHECK ((("source_match_tier" IS NULL) OR ("source_match_tier" = ANY (ARRAY['external_id'::"text", 'exact_roster'::"text", 'name_jersey_class'::"text", 'fuzzy_name'::"text", 'manual'::"text", 'unmatched'::"text"])))) NOT VALID;

ALTER TABLE "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_source_trust_level_check" CHECK ((("source_trust_level" IS NULL) OR ("source_trust_level" = ANY (ARRAY['official'::"text", 'device_export'::"text", 'staff_entered'::"text", 'player_entered'::"text", 'ai_derived'::"text", 'unreviewed'::"text"])))) NOT VALID;

ALTER TABLE "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_source_visibility_check" CHECK ((("source_visibility" IS NULL) OR ("source_visibility" = ANY (ARRAY['staff_only'::"text", 'player_visible'::"text", 'restricted'::"text"])))) NOT VALID;

ALTER TABLE ONLY "public"."baseball_player_timeline_events"
    ADD CONSTRAINT "baseball_player_timeline_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_players"
    ADD CONSTRAINT "baseball_players_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_players"
    ADD CONSTRAINT "baseball_players_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."baseball_postgame_review_items"
    ADD CONSTRAINT "baseball_postgame_review_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_postgame_reviews"
    ADD CONSTRAINT "baseball_postgame_reviews_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_practice_attendance"
    ADD CONSTRAINT "baseball_practice_attendance_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_practice_block_objectives"
    ADD CONSTRAINT "baseball_practice_block_objectives_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_practice_blocks"
    ADD CONSTRAINT "baseball_practice_blocks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "baseball_practice_effectiveness_reviews_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_practice_lineup_slots"
    ADD CONSTRAINT "baseball_practice_lineup_slots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_practice_scrimmages"
    ADD CONSTRAINT "baseball_practice_scrimmages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_practices"
    ADD CONSTRAINT "baseball_practices_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_program_settings"
    ADD CONSTRAINT "baseball_program_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_program_settings"
    ADD CONSTRAINT "baseball_program_settings_team_id_key" UNIQUE ("team_id");

ALTER TABLE ONLY "public"."baseball_recruiting_interests"
    ADD CONSTRAINT "baseball_recruiting_interests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_recruiting_interests"
    ADD CONSTRAINT "baseball_recruiting_interests_player_id_organization_id_key" UNIQUE ("player_id", "organization_id");

ALTER TABLE ONLY "public"."baseball_seasons"
    ADD CONSTRAINT "baseball_seasons_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_settings_audit_log"
    ADD CONSTRAINT "baseball_settings_audit_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_signals"
    ADD CONSTRAINT "baseball_signals_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_staff_audit_events"
    ADD CONSTRAINT "baseball_staff_audit_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_staff_invitations"
    ADD CONSTRAINT "baseball_staff_invitations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_stat_sources"
    ADD CONSTRAINT "baseball_stat_sources_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_stat_uploads"
    ADD CONSTRAINT "baseball_stat_uploads_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_stat_visual_views"
    ADD CONSTRAINT "baseball_stat_visual_views_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_task_assignments"
    ADD CONSTRAINT "baseball_task_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_task_assignments"
    ADD CONSTRAINT "baseball_task_assignments_task_id_player_id_key" UNIQUE ("task_id", "player_id");

ALTER TABLE ONLY "public"."baseball_task_templates"
    ADD CONSTRAINT "baseball_task_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_tasks"
    ADD CONSTRAINT "baseball_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_team_coach_staff"
    ADD CONSTRAINT "baseball_team_coach_staff_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_team_coach_staff"
    ADD CONSTRAINT "baseball_team_coach_staff_team_id_coach_id_key" UNIQUE ("team_id", "coach_id");

ALTER TABLE ONLY "public"."baseball_team_invitations"
    ADD CONSTRAINT "baseball_team_invitations_code_key" UNIQUE ("code");

ALTER TABLE ONLY "public"."baseball_team_invitations"
    ADD CONSTRAINT "baseball_team_invitations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_team_lineups"
    ADD CONSTRAINT "baseball_team_lineups_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_team_members"
    ADD CONSTRAINT "baseball_team_members_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_team_members"
    ADD CONSTRAINT "baseball_team_members_team_id_player_id_key" UNIQUE ("team_id", "player_id");

ALTER TABLE ONLY "public"."baseball_teams"
    ADD CONSTRAINT "baseball_teams_join_code_key" UNIQUE ("join_code");

ALTER TABLE ONLY "public"."baseball_teams"
    ADD CONSTRAINT "baseball_teams_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_timeline_event_acks"
    ADD CONSTRAINT "baseball_timeline_event_acks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_timeline_event_acks"
    ADD CONSTRAINT "baseball_timeline_event_acks_timeline_event_id_acked_by_key" UNIQUE ("timeline_event_id", "acked_by");

ALTER TABLE ONLY "public"."baseball_travel_expenses"
    ADD CONSTRAINT "baseball_travel_expenses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_travel_itineraries"
    ADD CONSTRAINT "baseball_travel_itineraries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_video_events"
    ADD CONSTRAINT "baseball_video_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_videos"
    ADD CONSTRAINT "baseball_videos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_watchlists"
    ADD CONSTRAINT "baseball_watchlists_coach_id_player_id_key" UNIQUE ("coach_id", "player_id");

ALTER TABLE ONLY "public"."baseball_watchlists"
    ADD CONSTRAINT "baseball_watchlists_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_workload_events"
    ADD CONSTRAINT "baseball_workload_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."baseball_document_versions"
    ADD CONSTRAINT "unique_baseball_document_version" UNIQUE ("document_id", "version_number");

ALTER TABLE ONLY "public"."baseball_player_external_ids"
    ADD CONSTRAINT "unique_baseball_player_external_id" UNIQUE ("team_id", "source_id", "external_id");

ALTER TABLE ONLY "public"."baseball_coach_insights"
    ADD CONSTRAINT "uq_baseball_insights_dedupe" UNIQUE ("player_id", "dedupe_key") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "public"."baseball_integration_configs"
    ADD CONSTRAINT "uq_baseball_integration_config" UNIQUE ("team_id", "integration_key");

ALTER TABLE ONLY "public"."baseball_postgame_review_items"
    ADD CONSTRAINT "uq_baseball_postgame_item" UNIQUE ("review_id", "dedupe_key");

ALTER TABLE ONLY "public"."baseball_postgame_reviews"
    ADD CONSTRAINT "uq_baseball_postgame_review" UNIQUE ("team_id", "game_id");

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "uq_baseball_practice_eff_review" UNIQUE ("practice_id", "block_id");

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "uq_baseball_practice_effectiveness_team_dedupe" UNIQUE ("team_id", "dedupe_key");

ALTER TABLE ONLY "public"."baseball_seasons"
    ADD CONSTRAINT "uq_baseball_season" UNIQUE ("team_id", "season_year");

ALTER TABLE ONLY "public"."baseball_signals"
    ADD CONSTRAINT "uq_baseball_signal_dedupe" UNIQUE ("team_id", "dedupe_key");

ALTER TABLE ONLY "public"."baseball_stat_sources"
    ADD CONSTRAINT "uq_baseball_stat_sources_team_key" UNIQUE ("team_id", "source_key", "source_name");

ALTER TABLE ONLY "public"."baseball_practice_attendance"
    ADD CONSTRAINT "uq_bpa" UNIQUE ("practice_id", "player_id");

ALTER TABLE ONLY "public"."baseball_academic_eligibility"
    ADD CONSTRAINT "baseball_academic_eligibility_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_academic_eligibility"
    ADD CONSTRAINT "baseball_academic_eligibility_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_academic_eligibility"
    ADD CONSTRAINT "baseball_academic_eligibility_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_assignee_coach_id_fkey" FOREIGN KEY ("assignee_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_assignee_player_id_fkey" FOREIGN KEY ("assignee_player_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_owner_coach_id_fkey" FOREIGN KEY ("owner_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "public"."baseball_signals"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_actions"
    ADD CONSTRAINT "baseball_actions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_ai_audit"
    ADD CONSTRAINT "baseball_ai_audit_outcome_by_fkey" FOREIGN KEY ("outcome_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_ai_audit"
    ADD CONSTRAINT "baseball_ai_audit_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_ai_audit"
    ADD CONSTRAINT "baseball_ai_audit_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_announcement_acknowledgements"
    ADD CONSTRAINT "baseball_announcement_acknowledgements_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."baseball_announcements"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_announcement_acknowledgements"
    ADD CONSTRAINT "baseball_announcement_acknowledgements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_announcement_recipients"
    ADD CONSTRAINT "baseball_announcement_recipients_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."baseball_announcements"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_announcement_recipients"
    ADD CONSTRAINT "baseball_announcement_recipients_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_announcements"
    ADD CONSTRAINT "baseball_announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_announcements"
    ADD CONSTRAINT "baseball_announcements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_baserunning_events"
    ADD CONSTRAINT "baseball_baserunning_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_baserunning_events"
    ADD CONSTRAINT "baseball_baserunning_events_pa_id_fkey" FOREIGN KEY ("pa_id") REFERENCES "public"."baseball_plate_appearances"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_baserunning_events"
    ADD CONSTRAINT "baseball_baserunning_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_baserunning_events"
    ADD CONSTRAINT "baseball_baserunning_events_runner_id_fkey" FOREIGN KEY ("runner_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_baserunning_events"
    ADD CONSTRAINT "baseball_baserunning_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_batter_id_fkey" FOREIGN KEY ("batter_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_pa_id_fkey" FOREIGN KEY ("pa_id") REFERENCES "public"."baseball_plate_appearances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."baseball_stat_sources"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_superseded_by_run_id_fkey" FOREIGN KEY ("superseded_by_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_batted_ball_events"
    ADD CONSTRAINT "baseball_batted_ball_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_box_score_batting"
    ADD CONSTRAINT "baseball_box_score_batting_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_box_score_batting"
    ADD CONSTRAINT "baseball_box_score_batting_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_box_score_batting"
    ADD CONSTRAINT "baseball_box_score_batting_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_box_score_pitching"
    ADD CONSTRAINT "baseball_box_score_pitching_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_box_score_pitching"
    ADD CONSTRAINT "baseball_box_score_pitching_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_box_score_pitching"
    ADD CONSTRAINT "baseball_box_score_pitching_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_box_score_uploads"
    ADD CONSTRAINT "baseball_box_score_uploads_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id");

ALTER TABLE ONLY "public"."baseball_box_score_uploads"
    ADD CONSTRAINT "baseball_box_score_uploads_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_box_score_uploads"
    ADD CONSTRAINT "baseball_box_score_uploads_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_camp_registrations"
    ADD CONSTRAINT "baseball_camp_registrations_camp_id_fkey" FOREIGN KEY ("camp_id") REFERENCES "public"."baseball_camps"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_camp_registrations"
    ADD CONSTRAINT "baseball_camp_registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_camps"
    ADD CONSTRAINT "baseball_camps_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_camps"
    ADD CONSTRAINT "baseball_camps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_catching_events"
    ADD CONSTRAINT "baseball_catching_events_catcher_id_fkey" FOREIGN KEY ("catcher_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_catching_events"
    ADD CONSTRAINT "baseball_catching_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_catching_events"
    ADD CONSTRAINT "baseball_catching_events_pitch_event_id_fkey" FOREIGN KEY ("pitch_event_id") REFERENCES "public"."baseball_pitch_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_catching_events"
    ADD CONSTRAINT "baseball_catching_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_catching_events"
    ADD CONSTRAINT "baseball_catching_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_class_conflicts"
    ADD CONSTRAINT "baseball_class_conflicts_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."baseball_player_classes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_class_conflicts"
    ADD CONSTRAINT "baseball_class_conflicts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_class_conflicts"
    ADD CONSTRAINT "baseball_class_conflicts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_insights"
    ADD CONSTRAINT "baseball_coach_insights_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_insights"
    ADD CONSTRAINT "baseball_coach_insights_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_insights"
    ADD CONSTRAINT "baseball_coach_insights_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coach_notes"
    ADD CONSTRAINT "baseball_coach_notes_author_coach_id_fkey" FOREIGN KEY ("author_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coach_notes"
    ADD CONSTRAINT "baseball_coach_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coach_notes"
    ADD CONSTRAINT "baseball_coach_notes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_notes"
    ADD CONSTRAINT "baseball_coach_notes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_philosophy"
    ADD CONSTRAINT "baseball_coach_philosophy_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_player_notes"
    ADD CONSTRAINT "baseball_coach_player_notes_author_coach_id_fkey" FOREIGN KEY ("author_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coach_player_notes"
    ADD CONSTRAINT "baseball_coach_player_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coach_player_notes"
    ADD CONSTRAINT "baseball_coach_player_notes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_player_notes"
    ADD CONSTRAINT "baseball_coach_player_notes_source_action_id_fkey" FOREIGN KEY ("source_action_id") REFERENCES "public"."baseball_actions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coach_player_notes"
    ADD CONSTRAINT "baseball_coach_player_notes_source_signal_id_fkey" FOREIGN KEY ("source_signal_id") REFERENCES "public"."baseball_signals"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coach_player_notes"
    ADD CONSTRAINT "baseball_coach_player_notes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coach_recruiting_philosophy"
    ADD CONSTRAINT "baseball_coach_recruiting_philosophy_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_coaches"
    ADD CONSTRAINT "baseball_coaches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_coaches"
    ADD CONSTRAINT "baseball_coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_conversation_participants"
    ADD CONSTRAINT "baseball_conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."baseball_conversations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_conversation_participants"
    ADD CONSTRAINT "baseball_conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_conversations"
    ADD CONSTRAINT "baseball_conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_conversations"
    ADD CONSTRAINT "baseball_conversations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."baseball_actions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_meeting_item_id_fkey" FOREIGN KEY ("meeting_item_id") REFERENCES "public"."baseball_meeting_items"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "public"."baseball_signals"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_decision_log"
    ADD CONSTRAINT "baseball_decision_log_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_demo_sessions"
    ADD CONSTRAINT "baseball_demo_sessions_crm_coach_id_fkey" FOREIGN KEY ("crm_coach_id") REFERENCES "public"."crm_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_developmental_plans"
    ADD CONSTRAINT "baseball_developmental_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_developmental_plans"
    ADD CONSTRAINT "baseball_developmental_plans_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_developmental_plans"
    ADD CONSTRAINT "baseball_developmental_plans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_document_versions"
    ADD CONSTRAINT "baseball_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."baseball_documents"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_document_versions"
    ADD CONSTRAINT "baseball_document_versions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_documents"
    ADD CONSTRAINT "baseball_documents_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_documents"
    ADD CONSTRAINT "baseball_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_event_acknowledgements"
    ADD CONSTRAINT "baseball_event_acknowledgements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."baseball_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_event_acknowledgements"
    ADD CONSTRAINT "baseball_event_acknowledgements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_event_attendance"
    ADD CONSTRAINT "baseball_event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."baseball_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_event_attendance"
    ADD CONSTRAINT "baseball_event_attendance_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_events"
    ADD CONSTRAINT "baseball_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_events"
    ADD CONSTRAINT "baseball_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_exercises"
    ADD CONSTRAINT "baseball_exercises_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_exercises"
    ADD CONSTRAINT "baseball_exercises_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_fielding_events"
    ADD CONSTRAINT "baseball_fielding_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_fielding_events"
    ADD CONSTRAINT "baseball_fielding_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_fielding_events"
    ADD CONSTRAINT "baseball_fielding_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_games"
    ADD CONSTRAINT "baseball_games_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."baseball_coaches"("id");

ALTER TABLE ONLY "public"."baseball_games"
    ADD CONSTRAINT "baseball_games_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."baseball_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_games"
    ADD CONSTRAINT "baseball_games_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_import_runs"
    ADD CONSTRAINT "baseball_import_runs_source_config_id_fkey" FOREIGN KEY ("source_config_id") REFERENCES "public"."baseball_import_sources"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_import_runs"
    ADD CONSTRAINT "baseball_import_runs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_import_sources"
    ADD CONSTRAINT "baseball_import_sources_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_integration_configs"
    ADD CONSTRAINT "baseball_integration_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_integration_configs"
    ADD CONSTRAINT "baseball_integration_configs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_lineup_positions"
    ADD CONSTRAINT "baseball_lineup_positions_lineup_id_fkey" FOREIGN KEY ("lineup_id") REFERENCES "public"."baseball_team_lineups"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_lineup_positions"
    ADD CONSTRAINT "baseball_lineup_positions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_owner_coach_id_fkey" FOREIGN KEY ("owner_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_source_action_id_fkey" FOREIGN KEY ("source_action_id") REFERENCES "public"."baseball_actions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_source_signal_id_fkey" FOREIGN KEY ("source_signal_id") REFERENCES "public"."baseball_signals"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_meeting_items"
    ADD CONSTRAINT "baseball_meeting_items_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_messages"
    ADD CONSTRAINT "baseball_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."baseball_conversations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_messages"
    ADD CONSTRAINT "baseball_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_notifications"
    ADD CONSTRAINT "baseball_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_pa_id_fkey" FOREIGN KEY ("pa_id") REFERENCES "public"."baseball_plate_appearances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_pitcher_id_fkey" FOREIGN KEY ("pitcher_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."baseball_stat_sources"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_superseded_by_run_id_fkey" FOREIGN KEY ("superseded_by_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_pitch_events"
    ADD CONSTRAINT "baseball_pitch_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_plate_appearances"
    ADD CONSTRAINT "baseball_plate_appearances_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_plate_appearances"
    ADD CONSTRAINT "baseball_plate_appearances_pitcher_id_fkey" FOREIGN KEY ("pitcher_id") REFERENCES "public"."baseball_players"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_plate_appearances"
    ADD CONSTRAINT "baseball_plate_appearances_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_plate_appearances"
    ADD CONSTRAINT "baseball_plate_appearances_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_aggregates"
    ADD CONSTRAINT "baseball_player_aggregates_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_aggregates"
    ADD CONSTRAINT "baseball_player_aggregates_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_classes"
    ADD CONSTRAINT "baseball_player_classes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_classes"
    ADD CONSTRAINT "baseball_player_classes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_comparisons"
    ADD CONSTRAINT "baseball_player_comparisons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_daily_contracts"
    ADD CONSTRAINT "baseball_player_daily_contracts_coach_acknowledged_by_fkey" FOREIGN KEY ("coach_acknowledged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_daily_contracts"
    ADD CONSTRAINT "baseball_player_daily_contracts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_daily_contracts"
    ADD CONSTRAINT "baseball_player_daily_contracts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_development_metrics"
    ADD CONSTRAINT "baseball_player_development_metrics_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_development_metrics"
    ADD CONSTRAINT "baseball_player_development_metrics_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_engagement_events"
    ADD CONSTRAINT "baseball_player_engagement_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_engagement_events"
    ADD CONSTRAINT "baseball_player_engagement_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_external_ids"
    ADD CONSTRAINT "baseball_player_external_ids_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_external_ids"
    ADD CONSTRAINT "baseball_player_external_ids_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_passport_settings"
    ADD CONSTRAINT "baseball_player_passport_settings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_passport_settings"
    ADD CONSTRAINT "baseball_player_passport_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_passport_settings"
    ADD CONSTRAINT "baseball_player_passport_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_passport_share_tokens"
    ADD CONSTRAINT "baseball_player_passport_share_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_passport_share_tokens"
    ADD CONSTRAINT "baseball_player_passport_share_tokens_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_passport_share_tokens"
    ADD CONSTRAINT "baseball_player_passport_share_tokens_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_percentiles"
    ADD CONSTRAINT "baseball_player_percentiles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_season_stats"
    ADD CONSTRAINT "baseball_player_season_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_season_stats"
    ADD CONSTRAINT "baseball_player_season_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_settings"
    ADD CONSTRAINT "baseball_player_settings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id");

ALTER TABLE ONLY "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_stats"
    ADD CONSTRAINT "baseball_player_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_timeline_events"
    ADD CONSTRAINT "baseball_player_timeline_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_player_timeline_events"
    ADD CONSTRAINT "baseball_player_timeline_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_player_timeline_events"
    ADD CONSTRAINT "baseball_player_timeline_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_players"
    ADD CONSTRAINT "baseball_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_postgame_review_items"
    ADD CONSTRAINT "baseball_postgame_review_items_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_postgame_review_items"
    ADD CONSTRAINT "baseball_postgame_review_items_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."baseball_postgame_reviews"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_postgame_review_items"
    ADD CONSTRAINT "baseball_postgame_review_items_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_postgame_review_items"
    ADD CONSTRAINT "baseball_postgame_review_items_timeline_event_id_fkey" FOREIGN KEY ("timeline_event_id") REFERENCES "public"."baseball_player_timeline_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_postgame_reviews"
    ADD CONSTRAINT "baseball_postgame_reviews_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id");

ALTER TABLE ONLY "public"."baseball_postgame_reviews"
    ADD CONSTRAINT "baseball_postgame_reviews_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_postgame_reviews"
    ADD CONSTRAINT "baseball_postgame_reviews_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_postgame_reviews"
    ADD CONSTRAINT "baseball_postgame_reviews_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_attendance"
    ADD CONSTRAINT "baseball_practice_attendance_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id");

ALTER TABLE ONLY "public"."baseball_practice_attendance"
    ADD CONSTRAINT "baseball_practice_attendance_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "public"."baseball_practices"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_attendance"
    ADD CONSTRAINT "baseball_practice_attendance_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id");

ALTER TABLE ONLY "public"."baseball_practice_block_objectives"
    ADD CONSTRAINT "baseball_practice_block_objectives_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."baseball_practice_blocks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_block_objectives"
    ADD CONSTRAINT "baseball_practice_block_objectives_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_blocks"
    ADD CONSTRAINT "baseball_practice_blocks_coach_owner_id_fkey" FOREIGN KEY ("coach_owner_id") REFERENCES "public"."baseball_coaches"("id");

ALTER TABLE ONLY "public"."baseball_practice_blocks"
    ADD CONSTRAINT "baseball_practice_blocks_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "public"."baseball_practices"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_blocks"
    ADD CONSTRAINT "baseball_practice_blocks_source_postgame_item_id_fkey" FOREIGN KEY ("source_postgame_item_id") REFERENCES "public"."baseball_postgame_review_items"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_practice_blocks"
    ADD CONSTRAINT "baseball_practice_blocks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id");

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "baseball_practice_effectiveness_revie_reviewed_by_coach_id_fkey" FOREIGN KEY ("reviewed_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "baseball_practice_effectiveness_reviews_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."baseball_practice_blocks"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "baseball_practice_effectiveness_reviews_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."baseball_practice_block_objectives"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "baseball_practice_effectiveness_reviews_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "public"."baseball_practices"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_effectiveness_reviews"
    ADD CONSTRAINT "baseball_practice_effectiveness_reviews_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_lineup_slots"
    ADD CONSTRAINT "baseball_practice_lineup_slots_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_lineup_slots"
    ADD CONSTRAINT "baseball_practice_lineup_slots_scrimmage_id_fkey" FOREIGN KEY ("scrimmage_id") REFERENCES "public"."baseball_practice_scrimmages"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_lineup_slots"
    ADD CONSTRAINT "baseball_practice_lineup_slots_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_scrimmages"
    ADD CONSTRAINT "baseball_practice_scrimmages_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."baseball_practice_blocks"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_practice_scrimmages"
    ADD CONSTRAINT "baseball_practice_scrimmages_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "public"."baseball_practices"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practice_scrimmages"
    ADD CONSTRAINT "baseball_practice_scrimmages_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_practices"
    ADD CONSTRAINT "baseball_practices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."baseball_events"("id");

ALTER TABLE ONLY "public"."baseball_practices"
    ADD CONSTRAINT "baseball_practices_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id");

ALTER TABLE ONLY "public"."baseball_program_settings"
    ADD CONSTRAINT "baseball_program_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_program_settings"
    ADD CONSTRAINT "baseball_program_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_recruiting_interests"
    ADD CONSTRAINT "baseball_recruiting_interests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_recruiting_interests"
    ADD CONSTRAINT "baseball_recruiting_interests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_seasons"
    ADD CONSTRAINT "baseball_seasons_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_seasons"
    ADD CONSTRAINT "baseball_seasons_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_settings_audit_log"
    ADD CONSTRAINT "baseball_settings_audit_log_actor_coach_id_fkey" FOREIGN KEY ("actor_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_settings_audit_log"
    ADD CONSTRAINT "baseball_settings_audit_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_settings_audit_log"
    ADD CONSTRAINT "baseball_settings_audit_log_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_signals"
    ADD CONSTRAINT "baseball_signals_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_signals"
    ADD CONSTRAINT "baseball_signals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_signals"
    ADD CONSTRAINT "baseball_signals_owner_coach_id_fkey" FOREIGN KEY ("owner_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_signals"
    ADD CONSTRAINT "baseball_signals_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_signals"
    ADD CONSTRAINT "baseball_signals_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_staff_audit_events"
    ADD CONSTRAINT "baseball_staff_audit_events_actor_coach_id_fkey" FOREIGN KEY ("actor_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_staff_audit_events"
    ADD CONSTRAINT "baseball_staff_audit_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_staff_audit_events"
    ADD CONSTRAINT "baseball_staff_audit_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_staff_invitations"
    ADD CONSTRAINT "baseball_staff_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_staff_invitations"
    ADD CONSTRAINT "baseball_staff_invitations_invited_by_coach_id_fkey" FOREIGN KEY ("invited_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_staff_invitations"
    ADD CONSTRAINT "baseball_staff_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_staff_invitations"
    ADD CONSTRAINT "baseball_staff_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_stat_sources"
    ADD CONSTRAINT "baseball_stat_sources_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_stat_uploads"
    ADD CONSTRAINT "baseball_stat_uploads_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_stat_uploads"
    ADD CONSTRAINT "baseball_stat_uploads_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_stat_visual_views"
    ADD CONSTRAINT "baseball_stat_visual_views_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_stat_visual_views"
    ADD CONSTRAINT "baseball_stat_visual_views_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_stat_visual_views"
    ADD CONSTRAINT "baseball_stat_visual_views_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_pa_id_fkey" FOREIGN KEY ("pa_id") REFERENCES "public"."baseball_plate_appearances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_pitch_event_id_fkey" FOREIGN KEY ("pitch_event_id") REFERENCES "public"."baseball_pitch_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."baseball_stat_sources"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_superseded_by_run_id_fkey" FOREIGN KEY ("superseded_by_run_id") REFERENCES "public"."baseball_import_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_swing_events"
    ADD CONSTRAINT "baseball_swing_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_task_assignments"
    ADD CONSTRAINT "baseball_task_assignments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_task_assignments"
    ADD CONSTRAINT "baseball_task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."baseball_tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_task_templates"
    ADD CONSTRAINT "baseball_task_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_task_templates"
    ADD CONSTRAINT "baseball_task_templates_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_tasks"
    ADD CONSTRAINT "baseball_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_tasks"
    ADD CONSTRAINT "baseball_tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_team_coach_staff"
    ADD CONSTRAINT "baseball_team_coach_staff_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_team_coach_staff"
    ADD CONSTRAINT "baseball_team_coach_staff_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_team_invitations"
    ADD CONSTRAINT "baseball_team_invitations_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id");

ALTER TABLE ONLY "public"."baseball_team_invitations"
    ADD CONSTRAINT "baseball_team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_team_lineups"
    ADD CONSTRAINT "baseball_team_lineups_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_team_lineups"
    ADD CONSTRAINT "baseball_team_lineups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_team_members"
    ADD CONSTRAINT "baseball_team_members_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_team_members"
    ADD CONSTRAINT "baseball_team_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_team_members"
    ADD CONSTRAINT "baseball_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_teams"
    ADD CONSTRAINT "baseball_teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."baseball_coaches"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_teams"
    ADD CONSTRAINT "baseball_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_timeline_event_acks"
    ADD CONSTRAINT "baseball_timeline_event_acks_acked_by_fkey" FOREIGN KEY ("acked_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_timeline_event_acks"
    ADD CONSTRAINT "baseball_timeline_event_acks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_timeline_event_acks"
    ADD CONSTRAINT "baseball_timeline_event_acks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_timeline_event_acks"
    ADD CONSTRAINT "baseball_timeline_event_acks_timeline_event_id_fkey" FOREIGN KEY ("timeline_event_id") REFERENCES "public"."baseball_player_timeline_events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_travel_expenses"
    ADD CONSTRAINT "baseball_travel_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_travel_expenses"
    ADD CONSTRAINT "baseball_travel_expenses_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "public"."baseball_travel_itineraries"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_travel_expenses"
    ADD CONSTRAINT "baseball_travel_expenses_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_travel_itineraries"
    ADD CONSTRAINT "baseball_travel_itineraries_created_by_id_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_travel_itineraries"
    ADD CONSTRAINT "baseball_travel_itineraries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_video_events"
    ADD CONSTRAINT "baseball_video_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_video_events"
    ADD CONSTRAINT "baseball_video_events_pitch_event_id_fkey" FOREIGN KEY ("pitch_event_id") REFERENCES "public"."baseball_pitch_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_video_events"
    ADD CONSTRAINT "baseball_video_events_plate_appearance_id_fkey" FOREIGN KEY ("plate_appearance_id") REFERENCES "public"."baseball_plate_appearances"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_video_events"
    ADD CONSTRAINT "baseball_video_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_video_events"
    ADD CONSTRAINT "baseball_video_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_videos"
    ADD CONSTRAINT "baseball_videos_parent_video_id_fkey" FOREIGN KEY ("parent_video_id") REFERENCES "public"."baseball_videos"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_videos"
    ADD CONSTRAINT "baseball_videos_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_videos"
    ADD CONSTRAINT "baseball_videos_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_watchlists"
    ADD CONSTRAINT "baseball_watchlists_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."baseball_coaches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_watchlists"
    ADD CONSTRAINT "baseball_watchlists_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_workload_events"
    ADD CONSTRAINT "baseball_workload_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."baseball_games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."baseball_workload_events"
    ADD CONSTRAINT "baseball_workload_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."baseball_players"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."baseball_workload_events"
    ADD CONSTRAINT "baseball_workload_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."baseball_teams"("id") ON DELETE CASCADE;
