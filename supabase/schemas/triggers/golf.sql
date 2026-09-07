CREATE OR REPLACE TRIGGER "approach_miss_details_reject_completed_round_mutation" BEFORE INSERT OR DELETE OR UPDATE ON "public"."approach_miss_details" FOR EACH ROW EXECUTE FUNCTION "helm_private"."reject_completed_round_detail_mutation"();

CREATE OR REPLACE TRIGGER "golf_event_documents_team_consistency" BEFORE INSERT OR UPDATE ON "public"."golf_event_documents" FOR EACH ROW EXECUTE FUNCTION "public"."golf_event_documents_assert_same_team"();

CREATE OR REPLACE TRIGGER "golf_global_patterns_touch" BEFORE UPDATE ON "public"."golf_global_patterns" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();

CREATE OR REPLACE TRIGGER "golf_holes_recompute_round_totals" AFTER INSERT OR DELETE OR UPDATE ON "public"."golf_holes" FOR EACH ROW EXECUTE FUNCTION "public"."golf_holes_recompute_round_totals_fn"();

CREATE OR REPLACE TRIGGER "golf_holes_reject_completed_round_mutation" BEFORE INSERT OR DELETE OR UPDATE ON "public"."golf_holes" FOR EACH ROW EXECUTE FUNCTION "helm_private"."reject_completed_round_child_mutation"();

CREATE OR REPLACE TRIGGER "golf_holes_set_gir" BEFORE INSERT OR UPDATE OF "par", "score", "putts" ON "public"."golf_holes" FOR EACH ROW EXECUTE FUNCTION "public"."golf_holes_set_gir_fn"();

CREATE OR REPLACE TRIGGER "golf_players_anonymize_on_unlink" BEFORE UPDATE OF "user_id" ON "public"."golf_players" FOR EACH ROW EXECUTE FUNCTION "public"."golf_player_anonymize_on_unlink"();

CREATE OR REPLACE TRIGGER "golf_qualifier_entries_prevent_active_round_stranding" BEFORE DELETE ON "public"."golf_qualifier_entries" FOR EACH ROW EXECUTE FUNCTION "helm_private"."prevent_qualifier_entry_active_round_stranding"();

CREATE OR REPLACE TRIGGER "golf_qualifiers_prevent_active_round_stranding" BEFORE DELETE ON "public"."golf_qualifiers" FOR EACH ROW EXECUTE FUNCTION "helm_private"."prevent_qualifier_active_round_stranding"();

CREATE OR REPLACE TRIGGER "golf_recruit_documents_same_team" BEFORE INSERT OR UPDATE ON "public"."golf_recruit_documents" FOR EACH ROW EXECUTE FUNCTION "public"."golf_recruit_documents_assert_same_team"();

CREATE OR REPLACE TRIGGER "golf_recruit_documents_touch" BEFORE UPDATE ON "public"."golf_recruit_documents" FOR EACH ROW EXECUTE FUNCTION "public"."golf_recruit_documents_touch_updated_at"();

CREATE OR REPLACE TRIGGER "golf_rounds_guard_lifecycle" BEFORE INSERT OR DELETE OR UPDATE ON "public"."golf_rounds" FOR EACH ROW EXECUTE FUNCTION "helm_private"."guard_golf_round_lifecycle"();

CREATE OR REPLACE TRIGGER "golf_shots_reject_completed_round_mutation" BEFORE INSERT OR DELETE OR UPDATE ON "public"."golf_shots" FOR EACH ROW EXECUTE FUNCTION "helm_private"."reject_completed_round_child_mutation"();

CREATE OR REPLACE TRIGGER "golf_task_reminders_updated_at" BEFORE UPDATE ON "public"."golf_task_reminders" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_task_reminders_updated_at"();

CREATE OR REPLACE TRIGGER "golf_team_join_requests_updated_at" BEFORE UPDATE ON "public"."golf_team_join_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_team_join_requests_updated_at"();

CREATE OR REPLACE TRIGGER "golf_team_members_prevent_active_round_deactivation" BEFORE UPDATE OF "status" ON "public"."golf_team_members" FOR EACH ROW EXECUTE FUNCTION "helm_private"."prevent_active_team_member_deactivation"();

CREATE OR REPLACE TRIGGER "golf_team_members_prevent_active_round_stranding" BEFORE DELETE ON "public"."golf_team_members" FOR EACH ROW EXECUTE FUNCTION "helm_private"."prevent_team_member_active_round_stranding"();

CREATE OR REPLACE TRIGGER "golf_teams_prevent_active_round_stranding" BEFORE DELETE ON "public"."golf_teams" FOR EACH ROW EXECUTE FUNCTION "helm_private"."prevent_team_active_round_stranding"();

CREATE OR REPLACE TRIGGER "guard_golf_qualifier_round_cap" BEFORE INSERT OR UPDATE OF "num_rounds" ON "public"."golf_qualifiers" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_golf_qualifier_round_cap_regression"();

CREATE OR REPLACE TRIGGER "putt_details_reject_completed_round_mutation" BEFORE INSERT OR DELETE OR UPDATE ON "public"."putt_details" FOR EACH ROW EXECUTE FUNCTION "helm_private"."reject_completed_round_detail_mutation"();

CREATE OR REPLACE TRIGGER "set_document_version_number_trigger" BEFORE INSERT ON "public"."golf_document_versions" FOR EACH ROW WHEN ((("new"."version_number" IS NULL) OR ("new"."version_number" = 0))) EXECUTE FUNCTION "public"."set_document_version_number"();

CREATE OR REPLACE TRIGGER "trg_golf_courses_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "public"."golf_courses" FOR EACH ROW EXECUTE FUNCTION "public"."golf_courses_set_normalized_name"();

CREATE OR REPLACE TRIGGER "trg_golf_task_templates_updated_at" BEFORE UPDATE ON "public"."golf_task_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_task_templates_updated_at"();

CREATE OR REPLACE TRIGGER "trg_update_message_has_attachments" AFTER INSERT OR DELETE ON "public"."golf_message_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."update_message_has_attachments"();

CREATE OR REPLACE TRIGGER "trg_update_player_stats_complete" AFTER INSERT OR DELETE OR UPDATE ON "public"."golf_round_stats_cache" FOR EACH ROW EXECUTE FUNCTION "public"."update_player_stats_complete"();

CREATE OR REPLACE TRIGGER "trg_update_round_stats_cache" AFTER INSERT OR UPDATE OF "status", "total_score", "score_to_par", "total_putts", "total_fairways_hit", "total_fairways", "total_gir", "total_gir_possible", "round_date", "holes_played" ON "public"."golf_rounds" FOR EACH ROW WHEN (("new"."status" = 'completed'::"text")) EXECUTE FUNCTION "public"."update_round_stats_cache"();

CREATE OR REPLACE TRIGGER "trigger_review_status_change" AFTER UPDATE ON "public"."golf_round_reviews" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."log_review_status_change"();

CREATE OR REPLACE TRIGGER "trigger_set_calendar_feed_token" BEFORE INSERT ON "public"."golf_calendar_feeds" FOR EACH ROW EXECUTE FUNCTION "public"."set_calendar_feed_token"();

CREATE OR REPLACE TRIGGER "update_approach_miss_details_updated_at" BEFORE UPDATE ON "public"."approach_miss_details" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_document_version_info_trigger" AFTER INSERT ON "public"."golf_document_versions" FOR EACH ROW EXECUTE FUNCTION "public"."update_document_version_info"();

CREATE OR REPLACE TRIGGER "update_golf_academic_exclusions_updated_at" BEFORE UPDATE ON "public"."golf_academic_exclusions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_announcements_updated_at" BEFORE UPDATE ON "public"."golf_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_attendance_summary_updated_at" BEFORE UPDATE ON "public"."golf_attendance_summary" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_calendar_feeds_updated_at" BEFORE UPDATE ON "public"."golf_calendar_feeds" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_causal_relationships_timestamp" BEFORE UPDATE ON "public"."golf_causal_relationships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_coach_blocked_time_updated_at" BEFORE UPDATE ON "public"."golf_coach_blocked_time" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_coach_insights_updated_at" BEFORE UPDATE ON "public"."golf_coach_insights" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_confidence_calibration_timestamp" BEFORE UPDATE ON "public"."golf_confidence_calibration" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_message_attachments_updated_at" BEFORE UPDATE ON "public"."golf_message_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE TRIGGER "update_golf_player_stats_cache_updated_at" BEFORE UPDATE ON "public"."golf_player_stats_cache" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_round_reviews_updated_at" BEFORE UPDATE ON "public"."golf_round_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_round_stats_cache_updated_at" BEFORE UPDATE ON "public"."golf_round_stats_cache" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_shots_updated_at" BEFORE UPDATE ON "public"."golf_shots" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_team_coachhelm_settings_updated_at" BEFORE UPDATE ON "public"."golf_team_coachhelm_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_team_members_updated_at" BEFORE UPDATE ON "public"."golf_team_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE TRIGGER "update_golf_team_settings_updated_at" BEFORE UPDATE ON "public"."golf_team_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_golf_travel_budgets_updated_at" BEFORE UPDATE ON "public"."golf_travel_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_expenses_updated_at"();

CREATE OR REPLACE TRIGGER "update_golf_travel_expenses_updated_at" BEFORE UPDATE ON "public"."golf_travel_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_golf_expenses_updated_at"();

CREATE OR REPLACE TRIGGER "update_golf_travel_itineraries_updated_at" BEFORE UPDATE ON "public"."golf_travel_itineraries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_putt_details_updated_at" BEFORE UPDATE ON "public"."putt_details" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
