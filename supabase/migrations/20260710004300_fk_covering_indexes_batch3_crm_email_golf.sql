-- Advisor cleanup (unindexed_foreign_keys, batch 3/4): covering indexes for FKs.
-- Applied to prod 2026-07-10 via MCP (post-apply: 0 unindexed FKs in public).
-- REPLAY-SAFE REWRITE (same day): these indexes were generated from LIVE
-- prod catalogs; a fresh migrations-chain replay (CI shadow DB) can lack
-- drifted columns (e.g. baseball_ai_audit.outcome_by), so each index is
-- guarded on column existence and skipped with a NOTICE where absent.
-- Prod behavior is unchanged - everything below already exists there.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('crm_automations', 'created_by', 'crm_automations_created_by_idx'),
      ('crm_coaches', 'archived_by', 'crm_coaches_archived_by_idx'),
      ('crm_email_suppressions', 'suppressed_by', 'crm_email_suppressions_suppressed_by_idx'),
      ('crm_email_templates', 'created_by', 'crm_email_templates_created_by_idx'),
      ('crm_notes', 'author_id', 'crm_notes_author_id_idx'),
      ('crm_replies', 'contact_log_id', 'crm_replies_contact_log_id_idx'),
      ('crm_sequence_enrollments', 'enrolled_by', 'crm_sequence_enrollments_enrolled_by_idx'),
      ('crm_sequence_steps', 'template_id', 'crm_sequence_steps_template_id_idx'),
      ('crm_sequences', 'created_by', 'crm_sequences_created_by_idx'),
      ('crm_tasks', 'created_by', 'crm_tasks_created_by_idx'),
      ('email_clicks', 'email_event_id', 'email_clicks_email_event_id_idx'),
      ('golf_coach_player_intent', 'player_id', 'golf_coach_player_intent_player_id_idx'),
      ('golf_coachhelm_llm_calls', 'player_id', 'golf_coachhelm_llm_calls_player_id_idx'),
      ('golf_coachhelm_settings', 'team_id', 'golf_coachhelm_settings_team_id_idx'),
      ('golf_course_edit_history', 'edited_by_team_id', 'golf_course_edit_history_edited_by_team_id_idx'),
      ('golf_course_edit_history', 'edited_by_user_id', 'golf_course_edit_history_edited_by_user_id_idx'),
      ('golf_course_tee_edit_history', 'edited_by_team_id', 'golf_course_tee_edit_history_edited_by_team_id_idx'),
      ('golf_course_tee_edit_history', 'edited_by_user_id', 'golf_course_tee_edit_history_edited_by_user_id_idx'),
      ('golf_course_tees', 'created_by_team_id', 'golf_course_tees_created_by_team_id_idx'),
      ('golf_course_tees', 'last_edited_by_user_id', 'golf_course_tees_last_edited_by_user_id_idx'),
      ('golf_course_tees', 'last_edited_by_team_id', 'golf_course_tees_last_edited_by_team_id_idx'),
      ('golf_course_tees', 'created_by_user_id', 'golf_course_tees_created_by_user_id_idx'),
      ('golf_courses', 'created_by_user_id', 'golf_courses_created_by_user_id_idx'),
      ('golf_courses', 'last_edited_by_team_id', 'golf_courses_last_edited_by_team_id_idx'),
      ('golf_courses', 'created_by_team_id', 'golf_courses_created_by_team_id_idx'),
      ('golf_courses', 'last_edited_by_user_id', 'golf_courses_last_edited_by_user_id_idx'),
      ('golf_event_documents', 'attached_by', 'golf_event_documents_attached_by_idx'),
      ('golf_goal_suggestions', 'metric_id', 'golf_goal_suggestions_metric_id_idx'),
      ('golf_goal_suggestions', 'origin_insight_id', 'golf_goal_suggestions_origin_insight_id_idx'),
      ('golf_goals', 'origin_insight_id', 'golf_goals_origin_insight_id_idx'),
      ('golf_goals', 'metric_id', 'golf_goals_metric_id_idx'),
      ('golf_goals', 'created_by_user_id', 'golf_goals_created_by_user_id_idx'),
      ('golf_goals', 'coach_id_if_assigned', 'golf_goals_coach_id_if_assigned_idx'),
      ('golf_insight_drill_attachments', 'drill_id', 'golf_insight_drill_attachments_drill_id_idx'),
      ('golf_insight_generation_log', 'team_id', 'golf_insight_generation_log_team_id_idx'),
      ('golf_insight_player_feedback', 'player_id', 'golf_insight_player_feedback_player_id_idx'),
      ('golf_prediction_validations', 'prediction_id', 'golf_prediction_validations_prediction_id_idx'),
      ('golf_qualifier_round_courses', 'course_id', 'golf_qualifier_round_courses_course_id_idx'),
      ('golf_qualifier_selections', 'selected_by_user_id', 'golf_qualifier_selections_selected_by_user_id_idx'),
      ('golf_qualifiers', 'target_tournament_id', 'golf_qualifiers_target_tournament_id_idx'),
      ('golf_recruit_documents', 'uploaded_by', 'golf_recruit_documents_uploaded_by_idx'),
      ('golf_recruits', 'created_by', 'golf_recruits_created_by_idx'),
      ('golf_round_reviews', 'published_by', 'golf_round_reviews_published_by_idx'),
      ('golf_team_saved_courses', 'course_id', 'golf_team_saved_courses_course_id_idx'),
      ('golf_team_saved_courses', 'default_tee_id', 'golf_team_saved_courses_default_tee_id_idx'),
      ('golf_team_saved_courses', 'created_by_user_id', 'golf_team_saved_courses_created_by_user_id_idx')
    ) as t(tbl, col, idx)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = spec.tbl and column_name = spec.col
    ) then
      execute format('create index if not exists %I on public.%I (%I)', spec.idx, spec.tbl, spec.col);
    else
      raise notice 'skipping % - column %.% absent in this environment', spec.idx, spec.tbl, spec.col;
    end if;
  end loop;
end $$;
