-- Advisor cleanup (unindexed_foreign_keys, batch 1/4): covering indexes for FKs.
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
      ('admin_api_perf_log', 'user_id', 'admin_api_perf_log_user_id_idx'),
      ('admin_client_errors', 'user_id', 'admin_client_errors_user_id_idx'),
      ('baseball_actions', 'assignee_player_id', 'baseball_actions_assignee_player_id_idx'),
      ('baseball_actions', 'assignee_coach_id', 'baseball_actions_assignee_coach_id_idx'),
      ('baseball_actions', 'reviewed_by', 'baseball_actions_reviewed_by_idx'),
      ('baseball_actions', 'owner_coach_id', 'baseball_actions_owner_coach_id_idx'),
      ('baseball_actions', 'created_by', 'baseball_actions_created_by_idx'),
      ('baseball_ai_audit', 'outcome_by', 'baseball_ai_audit_outcome_by_idx'),
      ('baseball_baserunning_events', 'runner_id', 'baseball_baserunning_events_runner_id_idx'),
      ('baseball_baserunning_events', 'game_id', 'baseball_baserunning_events_game_id_idx'),
      ('baseball_baserunning_events', 'pa_id', 'baseball_baserunning_events_pa_id_idx'),
      ('baseball_batted_ball_events', 'import_run_id', 'baseball_batted_ball_events_import_run_id_idx'),
      ('baseball_batted_ball_events', 'batter_id', 'baseball_batted_ball_events_batter_id_idx'),
      ('baseball_batted_ball_events', 'game_id', 'baseball_batted_ball_events_game_id_idx'),
      ('baseball_batted_ball_events', 'pa_id', 'baseball_batted_ball_events_pa_id_idx'),
      ('baseball_catching_events', 'game_id', 'baseball_catching_events_game_id_idx'),
      ('baseball_catching_events', 'pitch_event_id', 'baseball_catching_events_pitch_event_id_idx'),
      ('baseball_catching_events', 'catcher_id', 'baseball_catching_events_catcher_id_idx'),
      ('baseball_class_conflicts', 'class_id', 'baseball_class_conflicts_class_id_idx'),
      ('baseball_class_conflicts', 'player_id', 'baseball_class_conflicts_player_id_idx'),
      ('baseball_coach_notes', 'player_id', 'baseball_coach_notes_player_id_idx'),
      ('baseball_coach_notes', 'created_by', 'baseball_coach_notes_created_by_idx'),
      ('baseball_coach_player_notes', 'player_id', 'baseball_coach_player_notes_player_id_idx'),
      ('baseball_coach_player_notes', 'source_action_id', 'baseball_coach_player_notes_source_action_id_idx'),
      ('baseball_coach_player_notes', 'created_by', 'baseball_coach_player_notes_created_by_idx'),
      ('baseball_coach_player_notes', 'author_coach_id', 'baseball_coach_player_notes_author_coach_id_idx'),
      ('baseball_decision_log', 'signal_id', 'baseball_decision_log_signal_id_idx'),
      ('baseball_decision_log', 'decided_by', 'baseball_decision_log_decided_by_idx'),
      ('baseball_decision_log', 'created_by', 'baseball_decision_log_created_by_idx'),
      ('baseball_decision_log', 'action_id', 'baseball_decision_log_action_id_idx'),
      ('baseball_exercises', 'created_by_coach_id', 'baseball_exercises_created_by_coach_id_idx'),
      ('baseball_fielding_events', 'game_id', 'baseball_fielding_events_game_id_idx'),
      ('baseball_import_runs', 'source_config_id', 'baseball_import_runs_source_config_id_idx'),
      ('baseball_integration_configs', 'created_by', 'baseball_integration_configs_created_by_idx'),
      ('baseball_lineup_positions', 'player_id', 'baseball_lineup_positions_player_id_idx'),
      ('baseball_meeting_items', 'created_by', 'baseball_meeting_items_created_by_idx'),
      ('baseball_meeting_items', 'owner_coach_id', 'baseball_meeting_items_owner_coach_id_idx'),
      ('baseball_meeting_items', 'resolved_by', 'baseball_meeting_items_resolved_by_idx'),
      ('baseball_meeting_items', 'player_id', 'baseball_meeting_items_player_id_idx')
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
