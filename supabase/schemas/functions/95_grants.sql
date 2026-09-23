REVOKE ALL ON FUNCTION "helm_private"."configure_trace_context"("p_round_data" "jsonb") FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."guard_golf_round_lifecycle"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."prevent_active_team_member_deactivation"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."reject_completed_round_child_mutation"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."reject_completed_round_detail_mutation"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text", "p_actor_user_id" "uuid") FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."trace_checkpoint"("p_step_key" "text", "p_parent_step_key" "text", "p_phase" "text", "p_status" "text", "p_metadata" "jsonb") FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."trace_exception_checkpoint"("p_round_data" "jsonb", "p_step_key" "text", "p_parent_step_key" "text", "p_sqlstate" "text", "p_message" "text") FROM PUBLIC;

REVOKE ALL ON FUNCTION "helm_private"."trace_safe_metadata"("p_metadata" "jsonb") FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."__admin_rollup_b_gate"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."__admin_rollup_b_gate"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_auto_resolve_error_fingerprint"("p_fingerprint" "text", "p_last_seen_at" timestamp with time zone, "p_fixed_in_sha" "text", "p_note" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."admin_auto_resolve_error_fingerprint"("p_fingerprint" "text", "p_last_seen_at" timestamp with time zone, "p_fixed_in_sha" "text", "p_note" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_mark_error_regressed"("p_fingerprint" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."admin_mark_error_regressed"("p_fingerprint" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_resolve_error_fingerprint"("p_fingerprint" "text", "p_pr_number" integer, "p_pr_url" "text", "p_fixed_in_sha" "text", "p_note" "text", "p_last_seen_at" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."admin_resolve_error_fingerprint"("p_fingerprint" "text", "p_pr_number" integer, "p_pr_url" "text", "p_fixed_in_sha" "text", "p_note" "text", "p_last_seen_at" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."admin_resolve_error_fingerprint"("p_fingerprint" "text", "p_pr_number" integer, "p_pr_url" "text", "p_fixed_in_sha" "text", "p_note" "text", "p_last_seen_at" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_unresolve_error_fingerprint"("p_fingerprint" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."admin_unresolve_error_fingerprint"("p_fingerprint" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."admin_unresolve_error_fingerprint"("p_fingerprint" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_accept_staff_invite"("p_token" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_accept_staff_invite"("p_token" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_accept_staff_invite"("p_token" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_announcement_has_recipients"("p_announcement_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_announcement_has_recipients"("p_announcement_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_announcement_has_recipients"("p_announcement_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_announcement_is_recipient"("p_announcement_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_announcement_is_recipient"("p_announcement_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_announcement_is_recipient"("p_announcement_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_can_invite_staff"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_can_invite_staff"("p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_can_invite_staff"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_conversation_has_other_participant"("p_conversation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_conversation_has_other_participant"("p_conversation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_conversation_has_other_participant"("p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_conversation_on_my_team"("p_conversation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_conversation_on_my_team"("p_conversation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_conversation_on_my_team"("p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_is_announcement_coach"("p_announcement_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_is_announcement_coach"("p_announcement_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_is_announcement_coach"("p_announcement_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_players_guard_recruiting_activated"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_players_guard_recruiting_activated"() TO "anon";

GRANT ALL ON FUNCTION "public"."baseball_players_guard_recruiting_activated"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_players_guard_recruiting_activated"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_register_for_camp"("p_camp_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_register_for_camp"("p_camp_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_register_for_camp"("p_camp_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_replace_lineup_positions"("p_lineup_id" "uuid", "p_name" "text", "p_positions" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_replace_lineup_positions"("p_lineup_id" "uuid", "p_name" "text", "p_positions" "jsonb") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_replace_lineup_positions"("p_lineup_id" "uuid", "p_name" "text", "p_positions" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."baseball_staff_has_note_capability"("p_team_id" "uuid", "p_capability" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."baseball_staff_has_note_capability"("p_team_id" "uuid", "p_capability" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."baseball_staff_has_note_capability"("p_team_id" "uuid", "p_capability" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."bridge_baseball_coach_lifting_access"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."bridge_baseball_coach_lifting_access"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bridge_baseball_coach_lifting_revoke_on_delete"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."bridge_baseball_coach_lifting_revoke_on_delete"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."calculate_round_strokes_gained"("p_round_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."calculate_round_strokes_gained"("p_round_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."calculate_round_strokes_gained"("p_round_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_insert_baseball_team_member"("p_team_id" "uuid", "p_status" "public"."team_member_status") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."can_insert_baseball_team_member"("p_team_id" "uuid", "p_status" "public"."team_member_status") TO "authenticated";

GRANT ALL ON FUNCTION "public"."can_insert_baseball_team_member"("p_team_id" "uuid", "p_status" "public"."team_member_status") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_manage_baseball_lift_group"("p_team_id" "uuid", "p_group_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."can_manage_baseball_lift_group"("p_team_id" "uuid", "p_group_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."can_manage_baseball_lift_group"("p_team_id" "uuid", "p_group_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_notify_baseball_user"("p_target_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."can_notify_baseball_user"("p_target_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."can_notify_baseball_user"("p_target_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_read_golf_shot_detail"("p_shot_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."can_read_golf_shot_detail"("p_shot_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."can_read_golf_shot_detail"("p_shot_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_view_baseball_player"("p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."can_view_baseball_player"("p_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."can_view_baseball_player"("p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_view_baseball_player"("p_team_id" "uuid", "p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."can_view_baseball_player"("p_team_id" "uuid", "p_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."can_view_baseball_player"("p_team_id" "uuid", "p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."check_rate_limit_atomic"("p_key" "text", "p_window_ms" bigint, "p_max_attempts" integer, "p_block_ms" bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."check_rate_limit_atomic"("p_key" "text", "p_window_ms" bigint, "p_max_attempts" integer, "p_block_ms" bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."coach_id_for_team"("p_team_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."coach_id_for_team"("p_team_id" "uuid", "p_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."coach_id_for_team"("p_team_id" "uuid", "p_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."current_coach_id"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."current_coach_id"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."current_coach_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."current_player_id"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."current_player_id"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."current_player_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."extract_email_click_from_event"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."extract_email_click_from_event"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."find_baseball_player_by_email_for_roster"("p_team_id" "uuid", "p_email" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."find_baseball_player_by_email_for_roster"("p_team_id" "uuid", "p_email" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."find_baseball_player_by_email_for_roster"("p_team_id" "uuid", "p_email" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_active_sessions"("p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_active_sessions"("p_user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_active_sessions"("p_user_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_admin_analytics_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_analytics_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_analytics_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_baseball_rollup"("p_ago30d" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_baseball_rollup"("p_ago30d" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_baseball_rollup"("p_ago30d" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_coachhelm_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_coachhelm_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_coachhelm_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_dashboard_rollup"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_dashboard_rollup"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_dashboard_rollup"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_errors_rollup"("p_ago7d" timestamp with time zone, "p_ago24h" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_errors_rollup"("p_ago7d" timestamp with time zone, "p_ago24h" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_errors_rollup"("p_ago7d" timestamp with time zone, "p_ago24h" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_event_summary"("p_days_back" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_event_summary"("p_days_back" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_event_summary"("p_days_back" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_feature_adoption_rollup"("p_ago30d" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_feature_adoption_rollup"("p_ago30d" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_feature_adoption_rollup"("p_ago30d" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_platform_stat_averages"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_platform_stat_averages"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_platform_stat_averages"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_rounds_rollup"("p_today" timestamp with time zone, "p_ago24h" timestamp with time zone, "p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago60d" timestamp with time zone, "p_ago12w" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_rounds_rollup"("p_today" timestamp with time zone, "p_ago24h" timestamp with time zone, "p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago60d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_rounds_rollup"("p_today" timestamp with time zone, "p_ago24h" timestamp with time zone, "p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago60d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_teams_scoring_rollup"("p_ago7d" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_teams_scoring_rollup"("p_ago7d" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_teams_scoring_rollup"("p_ago7d" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_admin_users_rollup"("p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_admin_users_rollup"("p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_admin_users_rollup"("p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_api_performance_summary"("days_back" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."get_api_performance_summary"("days_back" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_api_performance_summary"("days_back" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_audit_log_recent"("limit_count" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_audit_log_recent"("limit_count" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_audit_log_recent"("limit_count" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_baseball_conversations_with_details"("p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_baseball_conversations_with_details"("p_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_baseball_conversations_with_details"("p_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_baseball_public_player_stats"("p_player_id" "uuid", "p_season_year" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_baseball_public_player_stats"("p_player_id" "uuid", "p_season_year" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_baseball_public_player_stats"("p_player_id" "uuid", "p_season_year" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_baseball_team_join_context"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_baseball_team_join_context"("p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_baseball_team_join_context"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_coach_effectiveness_metrics"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_coach_effectiveness_metrics"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_coach_effectiveness_metrics"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_coach_today_schedule"("p_team_id" "uuid", "p_today_start" timestamp with time zone, "p_today_end" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_coach_today_schedule"("p_team_id" "uuid", "p_today_start" timestamp with time zone, "p_today_end" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_coach_today_schedule"("p_team_id" "uuid", "p_today_start" timestamp with time zone, "p_today_end" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_click_destinations"("p_window" "text", "p_limit" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_click_destinations"("p_window" "text", "p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_coach_email_events"("p_coach_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_coach_email_events"("p_coach_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_coach_stage_history"("p_coach_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_coach_stage_history"("p_coach_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_crm_coach_stage_history"("p_coach_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_email_stats"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_email_stats"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_crm_email_stats"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_email_stats_detailed"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_email_stats_detailed"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_events_in_range"("p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_events_in_range"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_crm_events_in_range"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_funnel"("p_window" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_funnel"("p_window" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_crm_funnel"("p_window" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_stage_ages"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_stage_ages"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_crm_stage_ages"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_template_performance"("p_window" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_template_performance"("p_window" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_time_to_open"("p_window" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_time_to_open"("p_window" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_crm_time_to_open"("p_window" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_crm_weekly_kpis"("p_weeks" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_crm_weekly_kpis"("p_weeks" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_crm_weekly_kpis"("p_weeks" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_current_golf_player_id"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_current_golf_player_id"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_current_golf_player_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_current_player_team_ids"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_current_player_team_ids"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_current_player_team_ids"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_db_telemetry"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_db_telemetry"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_db_telemetry"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_enhanced_system_health"() TO "anon";

GRANT ALL ON FUNCTION "public"."get_enhanced_system_health"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_enhanced_system_health"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_error_summary"("days_back" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."get_error_summary"("days_back" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_error_summary"("days_back" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_feature_health"("p_features" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_feature_health"("p_features" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_feature_health"("p_features" "jsonb") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_golf_conversations_with_details"("p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_golf_conversations_with_details"("p_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_golf_conversations_with_details"("p_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_golf_message_attachments"("p_message_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_golf_message_attachments"("p_message_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_golf_message_attachments"("p_message_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_my_baseball_conversation_ids"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_my_baseball_conversation_ids"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_my_baseball_conversation_ids"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_my_baseball_player_id"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_my_baseball_player_id"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_my_baseball_player_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_my_coach_id"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_my_coach_id"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_my_coach_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_my_player_id"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_my_player_id"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_my_player_id"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_onboarding_funnel_analysis"() TO "anon";

GRANT ALL ON FUNCTION "public"."get_onboarding_funnel_analysis"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_onboarding_funnel_analysis"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_pending_task_reminders"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_pending_task_reminders"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_platform_health_stats"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_platform_health_stats"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_platform_health_stats"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_player_hub_announcements"("p_team_id" "uuid", "p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_player_hub_announcements"("p_team_id" "uuid", "p_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_player_hub_announcements"("p_team_id" "uuid", "p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_player_hub_events"("p_team_id" "uuid", "p_player_id" "uuid", "p_since" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_player_hub_events"("p_team_id" "uuid", "p_player_id" "uuid", "p_since" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_player_hub_events"("p_team_id" "uuid", "p_player_id" "uuid", "p_since" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_player_stats_summary"("p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_player_stats_summary"("p_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_player_stats_summary"("p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_qualifier_leaderboard"("qualifier_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_qualifier_leaderboard"("qualifier_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_qualifier_leaderboard"("qualifier_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_resend_activity_stats"("p_window" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_resend_activity_stats"("p_window" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_resend_activity_stats"("p_window" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_resend_domain_breakdown"("p_window" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_resend_domain_breakdown"("p_window" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_resend_domain_breakdown"("p_window" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_shot_data_quality"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_shot_data_quality"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_shot_data_quality"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_team_health_dashboard"() TO "anon";

GRANT ALL ON FUNCTION "public"."get_team_health_dashboard"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_team_health_dashboard"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_engagement_summary"("time_range_days" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."get_user_engagement_summary"("time_range_days" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_engagement_summary"("time_range_days" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_user_golf_organization_id"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_user_golf_organization_id"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_golf_organization_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_user_golf_team_ids"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_user_golf_team_ids"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_golf_team_ids"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_user_last_active"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_user_last_active"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_users_with_auth"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."get_users_with_auth"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_users_with_auth"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_announcement_addressed_to_me"("p_announcement_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_announcement_addressed_to_me"("p_announcement_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_announcement_addressed_to_me"("p_announcement_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_conversation_created_by_me"("p_conversation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_conversation_created_by_me"("p_conversation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_conversation_created_by_me"("p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_conversation_has_me"("p_conversation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_conversation_has_me"("p_conversation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_conversation_has_me"("p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_conversation_has_other_participant"("p_conversation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_conversation_has_other_participant"("p_conversation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_conversation_has_other_participant"("p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_conversation_on_my_team"("p_conversation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_conversation_on_my_team"("p_conversation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_conversation_on_my_team"("p_conversation_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."golf_courses_set_normalized_name"() TO "anon";

GRANT ALL ON FUNCTION "public"."golf_courses_set_normalized_name"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_courses_set_normalized_name"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_event_documents_assert_same_team"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_event_documents_assert_same_team"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_holes_recompute_round_totals_fn"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_holes_recompute_round_totals_fn"() TO "service_role";

GRANT ALL ON FUNCTION "public"."golf_holes_set_gir_fn"() TO "anon";

GRANT ALL ON FUNCTION "public"."golf_holes_set_gir_fn"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_holes_set_gir_fn"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_join_team_with_code"("p_code" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_join_team_with_code"("p_code" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_join_team_with_code"("p_code" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_my_join_requests"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_my_join_requests"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_my_join_requests"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_normalize_name"("p" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_normalize_name"("p" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_normalize_name"("p" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_player_anonymize_on_unlink"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_player_anonymize_on_unlink"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_player_anonymize_on_unlink"() TO "service_role";

GRANT ALL ON FUNCTION "public"."golf_recruit_documents_assert_same_team"() TO "anon";

GRANT ALL ON FUNCTION "public"."golf_recruit_documents_assert_same_team"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_recruit_documents_assert_same_team"() TO "service_role";

GRANT ALL ON FUNCTION "public"."golf_recruit_documents_touch_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."golf_recruit_documents_touch_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_recruit_documents_touch_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."golf_team_by_join_code"("p_code" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."golf_team_by_join_code"("p_code" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."golf_team_by_join_code"("p_code" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."guard_users_role_self_change"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."guard_users_role_self_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."has_any_baseball_team_membership"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."has_any_baseball_team_membership"("p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."has_any_baseball_team_membership"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."has_baseball_staff_capability"("p_team_id" "uuid", "p_capability" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."has_baseball_staff_capability"("p_team_id" "uuid", "p_capability" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."has_baseball_staff_capability"("p_team_id" "uuid", "p_capability" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."heartbeat"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."heartbeat"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."heartbeat"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_db_health_snapshot"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_db_health_snapshot"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_db_lock_snapshot"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_db_lock_snapshot"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_db_table_snapshot"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_db_table_snapshot"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_finalize_trace"("p_trace_id" "uuid", "p_status" "text", "p_metadata" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_finalize_trace"("p_trace_id" "uuid", "p_status" "text", "p_metadata" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_get_trace"("p_trace_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_get_trace"("p_trace_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_list_traces"("p_limit" integer, "p_workflow" "text", "p_round_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_list_traces"("p_limit" integer, "p_workflow" "text", "p_round_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_prune"("p_retention_days" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_prune"("p_retention_days" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_prune_observability"("p_error_events_retention_days" integer, "p_health_samples_retention_days" integer, "p_stat_deltas_retention_days" integer, "p_prior_state_retention_days" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_prune_observability"("p_error_events_retention_days" integer, "p_health_samples_retention_days" integer, "p_stat_deltas_retention_days" integer, "p_prior_state_retention_days" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_db_error_events"("p_limit" integer, "p_since" timestamp with time zone, "p_min_severity" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_db_error_events"("p_limit" integer, "p_since" timestamp with time zone, "p_min_severity" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_db_health_history"("p_limit" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_db_health_history"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_db_lock_incidents"("p_limit" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_db_lock_incidents"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_db_platform_history"("p_limit" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_db_platform_history"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_db_stat_deltas"("p_regression_lookback_hours" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_db_stat_deltas"("p_regression_lookback_hours" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_db_table_health"("p_limit" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_db_table_health"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_jobs_health"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_jobs_health"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_read_observability_sizes"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_read_observability_sizes"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_record_trace_step"("p_trace_id" "uuid", "p_step_key" "text", "p_layer" "text", "p_status" "text", "p_requiredness" "text", "p_metadata" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_record_trace_step"("p_trace_id" "uuid", "p_step_key" "text", "p_layer" "text", "p_status" "text", "p_requiredness" "text", "p_metadata" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_start_trace"("p_trace_id" "uuid", "p_workflow" "text", "p_environment" "text", "p_metadata" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_start_trace"("p_trace_id" "uuid", "p_workflow" "text", "p_environment" "text", "p_metadata" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_debug_stat_statements_snapshot"("p_limit" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_debug_stat_statements_snapshot"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_accept_invite"("p_token" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_accept_invite"("p_token" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_accept_invite"("p_token" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_assign_team"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid", "p_team_name" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_assign_team"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid", "p_team_name" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_assign_team"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid", "p_team_name" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_can_edit_org"("p_org" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_can_edit_org"("p_org" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_can_edit_org"("p_org" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_can_view_org"("p_org" "uuid", "p_sport" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_can_view_org"("p_org" "uuid", "p_sport" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_can_view_org"("p_org" "uuid", "p_sport" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_coach_for_org"("p_org" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_coach_for_org"("p_org" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_coach_for_org"("p_org" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_is_head_coach_viewer"("p_org" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_is_head_coach_viewer"("p_org" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_is_head_coach_viewer"("p_org" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_is_my_athlete"("p_athlete" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_is_my_athlete"("p_athlete" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_is_my_athlete"("p_athlete" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_mark_athlete_onboarded"("p_athlete_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_mark_athlete_onboarded"("p_athlete_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_mark_athlete_onboarded"("p_athlete_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."helm_lifting_sync_org_athletes"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."helm_lifting_sync_org_athletes"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."helm_lifting_sync_org_athletes"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."hypopg_reset"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."hypopg_reset"() TO "anon";

GRANT ALL ON FUNCTION "public"."hypopg_reset"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."hypopg_reset"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."ingest_external_round_atomic"("p_round" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."ingest_external_round_atomic"("p_round" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_player_recruiting_discoverable"("p_player_id" "uuid", "p_player_type" "public"."baseball_player_type", "p_activated" boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_player_recruiting_discoverable"("p_player_id" "uuid", "p_player_type" "public"."baseball_player_type", "p_activated" boolean) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_player_recruiting_discoverable"("p_player_id" "uuid", "p_player_type" "public"."baseball_player_type", "p_activated" boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_primary_coach"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_primary_coach"("p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_primary_coach"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_team_coach"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_team_coach"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_team_coach"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_team_coach_v2"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_team_coach_v2"("p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_team_coach_v2"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_team_member"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_team_member"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_team_member"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_team_member_v2"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_team_member_v2"("p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_team_member_v2"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_team_player"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_team_player"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_team_player"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_baseball_team_staff"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_baseball_team_staff"("p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_baseball_team_staff"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_golf_coach"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_golf_coach"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_golf_coach"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_golf_team_coach"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_golf_team_coach"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_golf_team_coach"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_golf_team_head_coach"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_golf_team_head_coach"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_golf_team_head_coach"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_golf_team_player"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_golf_team_player"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_golf_team_player"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_golf_team_primary_coach"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_golf_team_primary_coach"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_golf_team_primary_coach"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_in_team"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_in_team"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_in_team"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_super_admin"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";

GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."is_team_coach"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_team_coach"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_team_coach"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_team_player"("team_uuid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_team_player"("team_uuid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_team_player"("team_uuid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_user_on_team"("p_user_id" "uuid", "p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_user_on_team"("p_user_id" "uuid", "p_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_user_on_team"("p_user_id" "uuid", "p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."log_crm_stage_transition"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."log_crm_stage_transition"() TO "service_role";

GRANT ALL ON FUNCTION "public"."log_review_status_change"() TO "anon";

GRANT ALL ON FUNCTION "public"."log_review_status_change"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."log_review_status_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_golf_messages_read"("p_conversation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."mark_golf_messages_read"("p_conversation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."mark_golf_messages_read"("p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_player_stats_stale"("p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."mark_player_stats_stale"("p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_task_reminder_sent"("p_task_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."mark_task_reminder_sent"("p_task_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."owns_golf_shot"("p_shot_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."owns_golf_shot"("p_shot_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."owns_golf_shot"("p_shot_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."prevent_golf_qualifier_round_cap_regression"() TO "anon";

GRANT ALL ON FUNCTION "public"."prevent_golf_qualifier_round_cap_regression"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."prevent_golf_qualifier_round_cap_regression"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."prune_stale_player_standing"("p_team_ids" "uuid"[], "p_cutoff" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."prune_stale_player_standing"("p_team_ids" "uuid"[], "p_cutoff" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."recalculate_baseball_season_stats"("p_player_id" "uuid", "p_team_id" "uuid", "p_season_year" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."recalculate_baseball_season_stats"("p_player_id" "uuid", "p_team_id" "uuid", "p_season_year" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."recalculate_baseball_season_stats"("p_player_id" "uuid", "p_team_id" "uuid", "p_season_year" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."recalculate_round_strokes_gained"("p_round_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."recalculate_round_strokes_gained"("p_round_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."recalculate_round_strokes_gained"("p_round_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."recalculate_team_baseball_season_stats"("p_team_id" "uuid", "p_season_year" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."recalculate_team_baseball_season_stats"("p_team_id" "uuid", "p_season_year" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."recalculate_team_baseball_season_stats"("p_team_id" "uuid", "p_season_year" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reclassify_golf_round"("p_round_id" "uuid", "p_round_type" "text", "p_qualifier_id" "uuid", "p_qualifier_round_number" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."reclassify_golf_round"("p_round_id" "uuid", "p_round_type" "text", "p_qualifier_id" "uuid", "p_qualifier_round_number" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."reclassify_golf_round"("p_round_id" "uuid", "p_round_type" "text", "p_qualifier_id" "uuid", "p_qualifier_round_number" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."recompute_golf_round_totals"("p_round_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."recompute_golf_round_totals"("p_round_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."recompute_golf_round_totals"("p_round_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."recompute_team_sg"("p_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."recompute_team_sg"("p_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_db_error_event"("p_service" "text", "p_environment" "text", "p_runtime" "text", "p_feature" "text", "p_action" "text", "p_operation" "text", "p_severity" "text", "p_expectedness" "text", "p_retryability" "text", "p_fingerprint" "text", "p_normalized_message" "text", "p_terminal" boolean, "p_release_sha" "text", "p_sport" "text", "p_journey" "text", "p_relation_name" "text", "p_rpc_name" "text", "p_function_name" "text", "p_bucket_class" "text", "p_error_code" "text", "p_sqlstate" "text", "p_postgrest_code" "text", "p_auth_code" "text", "p_storage_code" "text", "p_http_status" integer, "p_safe_details" "text", "p_safe_hint" "text", "p_helm_trace_id" "text", "p_sentry_trace_id" "text", "p_sentry_span_id" "text", "p_duration_ms" integer, "p_attempt" integer, "p_safe_metadata" "jsonb", "p_force_individual_row" boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."record_db_error_event"("p_service" "text", "p_environment" "text", "p_runtime" "text", "p_feature" "text", "p_action" "text", "p_operation" "text", "p_severity" "text", "p_expectedness" "text", "p_retryability" "text", "p_fingerprint" "text", "p_normalized_message" "text", "p_terminal" boolean, "p_release_sha" "text", "p_sport" "text", "p_journey" "text", "p_relation_name" "text", "p_rpc_name" "text", "p_function_name" "text", "p_bucket_class" "text", "p_error_code" "text", "p_sqlstate" "text", "p_postgrest_code" "text", "p_auth_code" "text", "p_storage_code" "text", "p_http_status" integer, "p_safe_details" "text", "p_safe_hint" "text", "p_helm_trace_id" "text", "p_sentry_trace_id" "text", "p_sentry_span_id" "text", "p_duration_ms" integer, "p_attempt" integer, "p_safe_metadata" "jsonb", "p_force_individual_row" boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_db_health_sample"("p_stats_reset_at" timestamp with time zone, "p_connections_total" integer, "p_connections_active" integer, "p_connections_idle_in_tx" integer, "p_connections_waiting_lock" integer, "p_connections_pct_max" numeric, "p_longest_active_ms" integer, "p_longest_idle_in_tx_ms" integer, "p_longest_lock_wait_ms" integer, "p_xact_commit" bigint, "p_xact_rollback" bigint, "p_deadlocks" bigint, "p_conflicts" bigint, "p_tup_returned" bigint, "p_tup_fetched" bigint, "p_tup_inserted" bigint, "p_tup_updated" bigint, "p_tup_deleted" bigint, "p_temp_files" bigint, "p_temp_bytes" bigint, "p_blks_read" bigint, "p_blks_hit" bigint, "p_db_size_bytes" bigint, "p_xact_commit_delta" bigint, "p_xact_rollback_delta" bigint, "p_deadlocks_delta" bigint, "p_conflicts_delta" bigint, "p_tup_returned_delta" bigint, "p_tup_fetched_delta" bigint, "p_tup_inserted_delta" bigint, "p_tup_updated_delta" bigint, "p_tup_deleted_delta" bigint, "p_temp_files_delta" bigint, "p_temp_bytes_delta" bigint, "p_blks_read_delta" bigint, "p_blks_hit_delta" bigint, "p_cache_hit_ratio" numeric, "p_collector_status" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."record_db_health_sample"("p_stats_reset_at" timestamp with time zone, "p_connections_total" integer, "p_connections_active" integer, "p_connections_idle_in_tx" integer, "p_connections_waiting_lock" integer, "p_connections_pct_max" numeric, "p_longest_active_ms" integer, "p_longest_idle_in_tx_ms" integer, "p_longest_lock_wait_ms" integer, "p_xact_commit" bigint, "p_xact_rollback" bigint, "p_deadlocks" bigint, "p_conflicts" bigint, "p_tup_returned" bigint, "p_tup_fetched" bigint, "p_tup_inserted" bigint, "p_tup_updated" bigint, "p_tup_deleted" bigint, "p_temp_files" bigint, "p_temp_bytes" bigint, "p_blks_read" bigint, "p_blks_hit" bigint, "p_db_size_bytes" bigint, "p_xact_commit_delta" bigint, "p_xact_rollback_delta" bigint, "p_deadlocks_delta" bigint, "p_conflicts_delta" bigint, "p_tup_returned_delta" bigint, "p_tup_fetched_delta" bigint, "p_tup_inserted_delta" bigint, "p_tup_updated_delta" bigint, "p_tup_deleted_delta" bigint, "p_temp_files_delta" bigint, "p_temp_bytes_delta" bigint, "p_blks_read_delta" bigint, "p_blks_hit_delta" bigint, "p_cache_hit_ratio" numeric, "p_collector_status" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_db_lock_incident"("p_kind" "text", "p_severity" "text", "p_role_class" "text", "p_wait_ms" integer, "p_blocked_query_class" "text", "p_blocking_query_class" "text", "p_blocked_pid_count" integer, "p_relation_name" "text", "p_feature" "text", "p_action" "text", "p_release_sha" "text", "p_helm_trace_id" "text", "p_safe_metadata" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."record_db_lock_incident"("p_kind" "text", "p_severity" "text", "p_role_class" "text", "p_wait_ms" integer, "p_blocked_query_class" "text", "p_blocking_query_class" "text", "p_blocked_pid_count" integer, "p_relation_name" "text", "p_feature" "text", "p_action" "text", "p_release_sha" "text", "p_helm_trace_id" "text", "p_safe_metadata" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_db_platform_sample"("p_db_up" smallint, "p_cpu_pct" numeric, "p_memory_pct" numeric, "p_connections_used" integer, "p_connections_max" integer, "p_pool_saturation_pct" numeric, "p_wal_or_replication_lag_seconds" numeric, "p_io_pressure" numeric, "p_db_size_bytes" bigint, "p_autovacuum_or_bloat_signal" numeric, "p_postgrest_pool_used" integer, "p_postgrest_pool_max" integer, "p_postgrest_pool_saturation_pct" numeric, "p_auth_pool_used" integer, "p_auth_pool_max" integer, "p_auth_pool_saturation_pct" numeric, "p_realtime_subscriptions" integer, "p_source_status" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."record_db_platform_sample"("p_db_up" smallint, "p_cpu_pct" numeric, "p_memory_pct" numeric, "p_connections_used" integer, "p_connections_max" integer, "p_pool_saturation_pct" numeric, "p_wal_or_replication_lag_seconds" numeric, "p_io_pressure" numeric, "p_db_size_bytes" bigint, "p_autovacuum_or_bloat_signal" numeric, "p_postgrest_pool_used" integer, "p_postgrest_pool_max" integer, "p_postgrest_pool_saturation_pct" numeric, "p_auth_pool_used" integer, "p_auth_pool_max" integer, "p_auth_pool_saturation_pct" numeric, "p_realtime_subscriptions" integer, "p_source_status" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_db_stat_snapshot"("p_sampled_at" timestamp with time zone, "p_stats_reset_at" timestamp with time zone, "p_delta_rows" "jsonb", "p_prior_state_rows" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."record_db_stat_snapshot"("p_sampled_at" timestamp with time zone, "p_stats_reset_at" timestamp with time zone, "p_delta_rows" "jsonb", "p_prior_state_rows" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_db_table_samples"("p_rows" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."record_db_table_samples"("p_rows" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_round_coachhelm_terminal_state"("p_round_id" "uuid", "p_analyzed_at" timestamp with time zone, "p_failed_at" timestamp with time zone, "p_failure_reason" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."record_round_coachhelm_terminal_state"("p_round_id" "uuid", "p_analyzed_at" timestamp with time zone, "p_failed_at" timestamp with time zone, "p_failure_reason" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_crm_coach_engagement"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."refresh_crm_coach_engagement"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_player_stats_cache"("p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."refresh_player_stats_cache"("p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."release_baseball_team_invitation_redemption"("p_invitation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."release_baseball_team_invitation_redemption"("p_invitation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."resolve_admin_event"("p_event_ids" "uuid"[]) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."resolve_admin_event"("p_event_ids" "uuid"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."resolve_admin_event"("p_event_ids" "uuid"[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."resolve_baseball_team_by_join_code"("p_join_code" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."resolve_baseball_team_by_join_code"("p_join_code" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."resolve_baseball_team_by_join_code"("p_join_code" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."resolve_baseball_team_invitation_by_code"("p_code" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."resolve_baseball_team_invitation_by_code"("p_code" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."resolve_baseball_team_invitation_by_code"("p_code" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."run_integrity_checks"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."run_integrity_checks"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_baseball_full_box_score"("p_game_id" "uuid", "p_batting" "jsonb", "p_pitching" "jsonb", "p_our_score" integer, "p_opponent_score" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."save_baseball_full_box_score"("p_game_id" "uuid", "p_batting" "jsonb", "p_pitching" "jsonb", "p_our_score" integer, "p_opponent_score" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."save_baseball_full_box_score"("p_game_id" "uuid", "p_batting" "jsonb", "p_pitching" "jsonb", "p_our_score" integer, "p_opponent_score" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_partial_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."save_partial_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb", "p_expected_updated_at" timestamp with time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."save_partial_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb", "p_expected_updated_at" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."select_stalest_teams"("p_limit" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."select_stalest_teams"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_calendar_feed_token"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."set_calendar_feed_token"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_document_version_number"() TO "anon";

GRANT ALL ON FUNCTION "public"."set_document_version_number"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."set_document_version_number"() TO "service_role";

GRANT ALL ON FUNCTION "public"."sg_baseline_scale"("p_key" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."sg_baseline_scale"("p_key" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."sg_baseline_scale"("p_key" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."sg_estimate_from_holes"("p_round_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."sg_estimate_from_holes"("p_round_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."sg_estimate_from_holes"("p_round_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric) TO "anon";

GRANT ALL ON FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric) TO "authenticated";

GRANT ALL ON FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric) TO "service_role";

GRANT ALL ON FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric, "p_scale" numeric) TO "anon";

GRANT ALL ON FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric, "p_scale" numeric) TO "authenticated";

GRANT ALL ON FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric, "p_scale" numeric) TO "service_role";

GRANT ALL ON FUNCTION "public"."sg_normalize_lie"("p_lie" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."sg_normalize_lie"("p_lie" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."sg_normalize_lie"("p_lie" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."sg_scale_for_player"("p_player_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."sg_scale_for_player"("p_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."sg_scale_for_player"("p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."shares_my_baseball_organization"("p_org_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."shares_my_baseball_organization"("p_org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."shares_my_baseball_organization"("p_org_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."shares_my_golf_organization"("p_org_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."shares_my_golf_organization"("p_org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."shares_my_golf_organization"("p_org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."stop_sequences_on_reply"() TO "anon";

GRANT ALL ON FUNCTION "public"."stop_sequences_on_reply"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."stop_sequences_on_reply"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."submit_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."submit_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb") TO "authenticated";

GRANT ALL ON FUNCTION "public"."submit_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_coach_last_email_event"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."sync_coach_last_email_event"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_email_snapshot_from_event"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."sync_email_snapshot_from_event"() TO "service_role";

GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."try_redeem_baseball_team_invitation"("p_invitation_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."try_redeem_baseball_team_invitation"("p_invitation_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."try_redeem_baseball_team_invitation"("p_invitation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."unresolve_admin_event"("p_event_ids" "uuid"[]) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."unresolve_admin_event"("p_event_ids" "uuid"[]) TO "authenticated";

GRANT ALL ON FUNCTION "public"."unresolve_admin_event"("p_event_ids" "uuid"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_automations_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_automations_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_automations_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_coaches_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_coaches_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_coaches_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_events_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_events_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_events_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_google_tokens_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_google_tokens_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_google_tokens_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_notes_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_notes_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_notes_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_segments_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_segments_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_segments_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_sequences_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_sequences_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_sequences_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_crm_tasks_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_crm_tasks_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_crm_tasks_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_device_tokens_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_device_tokens_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_device_tokens_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_document_version_info"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_document_version_info"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_document_version_info"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_golf_expenses_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_golf_expenses_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_golf_expenses_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_golf_task_reminders_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_golf_task_reminders_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_golf_task_reminders_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_golf_task_templates_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_golf_task_templates_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_golf_task_templates_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_golf_team_join_requests_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_golf_team_join_requests_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_golf_team_join_requests_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_message_has_attachments"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_message_has_attachments"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_message_has_attachments"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_player_distance_proximity"("p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."update_player_distance_proximity"("p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_player_putt_make_pct"("p_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."update_player_putt_make_pct"("p_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_player_stats_complete"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."update_player_stats_complete"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_player_stats_strokes_gained"("p_player_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."update_player_stats_strokes_gained"("p_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_player_stats_strokes_gained"("p_player_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."update_push_subscriptions_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_push_subscriptions_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_push_subscriptions_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_qualifier_leaderboard"("p_qualifier_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."update_qualifier_leaderboard"("p_qualifier_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_qualifier_leaderboard"("p_qualifier_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_round_stats_cache"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."update_round_stats_cache"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_user_last_seen"("target_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."update_user_last_seen"("target_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_user_last_seen"("target_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."user_conversation_ids"("p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."user_conversation_ids"("p_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."user_conversation_ids"("p_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."user_has_pending_join_request_to_coach_team"("check_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."user_has_pending_join_request_to_coach_team"("check_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."user_has_pending_join_request_to_coach_team"("check_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."user_is_coach_of_golf_player"("check_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."user_is_coach_of_golf_player"("check_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."user_is_coach_of_golf_player"("check_player_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."user_is_golf_team_member"("check_team_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."user_is_golf_team_member"("check_team_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."user_is_golf_team_member"("check_team_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."user_is_teammate_of_golf_player"("check_player_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."user_is_teammate_of_golf_player"("check_player_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."user_is_teammate_of_golf_player"("check_player_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."validate_notification_preferences"() TO "anon";

GRANT ALL ON FUNCTION "public"."validate_notification_preferences"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."validate_notification_preferences"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."verify_coach_owns_player"("p_player_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."verify_coach_owns_player"("p_player_id" "uuid", "p_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."verify_coach_owns_player"("p_player_id" "uuid", "p_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."verify_coach_owns_team"("p_team_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."verify_coach_owns_team"("p_team_id" "uuid", "p_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."verify_coach_owns_team"("p_team_id" "uuid", "p_user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."write_suppression_on_unsubscribe"() TO "anon";

GRANT ALL ON FUNCTION "public"."write_suppression_on_unsubscribe"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."write_suppression_on_unsubscribe"() TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

