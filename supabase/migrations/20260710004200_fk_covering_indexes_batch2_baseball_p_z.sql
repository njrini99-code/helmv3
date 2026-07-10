-- Advisor cleanup (unindexed_foreign_keys, batch 2/4): covering indexes for FKs.
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
      ('baseball_pitch_events', 'game_id', 'baseball_pitch_events_game_id_idx'),
      ('baseball_pitch_events', 'import_run_id', 'baseball_pitch_events_import_run_id_idx'),
      ('baseball_pitch_events', 'pitcher_id', 'baseball_pitch_events_pitcher_id_idx'),
      ('baseball_plate_appearances', 'pitcher_id', 'baseball_plate_appearances_pitcher_id_idx'),
      ('baseball_player_daily_contracts', 'coach_acknowledged_by', 'baseball_player_daily_contracts_coach_acknowledged_by_idx'),
      ('baseball_player_development_metrics', 'player_id', 'baseball_player_development_metrics_player_id_idx'),
      ('baseball_player_passport_settings', 'updated_by', 'baseball_player_passport_settings_updated_by_idx'),
      ('baseball_player_passport_share_tokens', 'created_by', 'baseball_player_passport_share_tokens_created_by_idx'),
      ('baseball_player_passport_share_tokens', 'player_id', 'baseball_player_passport_share_tokens_player_id_idx'),
      ('baseball_player_stats', 'import_run_id', 'baseball_player_stats_import_run_id_idx'),
      ('baseball_player_timeline_events', 'created_by', 'baseball_player_timeline_events_created_by_idx'),
      ('baseball_postgame_review_items', 'team_id', 'baseball_postgame_review_items_team_id_idx'),
      ('baseball_postgame_reviews', 'created_by_coach_id', 'baseball_postgame_reviews_created_by_coach_id_idx'),
      ('baseball_postgame_reviews', 'game_id', 'baseball_postgame_reviews_game_id_idx'),
      ('baseball_practice_block_objectives', 'team_id', 'baseball_practice_block_objectives_team_id_idx'),
      ('baseball_practice_effectiveness_reviews', 'reviewed_by_coach_id', 'baseball_practice_effectiveness_revie_reviewed_by_coach_id_idx'),
      ('baseball_practice_effectiveness_reviews', 'objective_id', 'baseball_practice_effectiveness_reviews_objective_id_idx'),
      ('baseball_practice_effectiveness_reviews', 'block_id', 'baseball_practice_effectiveness_reviews_block_id_idx'),
      ('baseball_practice_lineup_slots', 'team_id', 'baseball_practice_lineup_slots_team_id_idx'),
      ('baseball_practice_lineup_slots', 'player_id', 'baseball_practice_lineup_slots_player_id_idx'),
      ('baseball_practice_scrimmages', 'block_id', 'baseball_practice_scrimmages_block_id_idx'),
      ('baseball_program_settings', 'updated_by', 'baseball_program_settings_updated_by_idx'),
      ('baseball_seasons', 'created_by_coach_id', 'baseball_seasons_created_by_coach_id_idx'),
      ('baseball_settings_audit_log', 'changed_by', 'baseball_settings_audit_log_changed_by_idx'),
      ('baseball_signals', 'created_by', 'baseball_signals_created_by_idx'),
      ('baseball_signals', 'owner_coach_id', 'baseball_signals_owner_coach_id_idx'),
      ('baseball_signals', 'acknowledged_by', 'baseball_signals_acknowledged_by_idx'),
      ('baseball_staff_audit_events', 'actor_coach_id', 'baseball_staff_audit_events_actor_coach_id_idx'),
      ('baseball_staff_audit_events', 'coach_id', 'baseball_staff_audit_events_coach_id_idx'),
      ('baseball_staff_invitations', 'invited_by', 'baseball_staff_invitations_invited_by_idx'),
      ('baseball_staff_invitations', 'invited_by_coach_id', 'baseball_staff_invitations_invited_by_coach_id_idx'),
      ('baseball_stat_visual_views', 'created_by_coach_id', 'baseball_stat_visual_views_created_by_coach_id_idx'),
      ('baseball_swing_events', 'pa_id', 'baseball_swing_events_pa_id_idx'),
      ('baseball_swing_events', 'game_id', 'baseball_swing_events_game_id_idx'),
      ('baseball_swing_events', 'import_run_id', 'baseball_swing_events_import_run_id_idx'),
      ('baseball_swing_events', 'pitch_event_id', 'baseball_swing_events_pitch_event_id_idx'),
      ('baseball_timeline_event_acks', 'acked_by', 'baseball_timeline_event_acks_acked_by_idx'),
      ('baseball_video_events', 'game_id', 'baseball_video_events_game_id_idx'),
      ('baseball_video_events', 'pitch_event_id', 'baseball_video_events_pitch_event_id_idx'),
      ('baseball_workload_events', 'game_id', 'baseball_workload_events_game_id_idx')
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
