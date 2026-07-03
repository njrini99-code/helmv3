# V6 Stats Data Model and Import Contract

This is the schema and upload contract the build agent should use to convert the existing BaseballHelm stats features into an elite, source-aware system. The goal is not just "upload CSV." The goal is provenance, trust, rollback, recalculation, video linkage, player matching, and CoachHelm-ready evidence.

## Existing Tables To Extend, Not Replace

Preserve and extend:

- `baseball_players`
- `baseball_teams`
- `baseball_team_members`
- `baseball_games`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- `baseball_box_score_uploads`
- `baseball_player_season_stats`
- `baseball_player_stats`
- `baseball_player_aggregates`
- `baseball_player_classes`
- `baseball_academic_eligibility`
- `baseball_videos`
- `baseball_coach_insights`
- `baseball_developmental_plans`
- `baseball_tasks`
- `baseball_events`

Do not create duplicate clean-room tables unless the existing table is the wrong grain.

## Tables To Add

### `baseball_stat_sources`

Purpose: source registry for official and development data.

Columns:

- `id`
- `team_id`
- `source_key`: `manual`, `gamechanger_xml`, `statcrew_xml`, `ncaa_live_stats`, `prestosports_xml`, `sidearm_xml`, `trackman_csv`, `rapsodo_csv`, `synergy_export`, `six_four_three_export`, `awre_video`, `blast_csv`, `diamond_kinetics_csv`, `hittrax_csv`, `pocket_radar_csv`, `armcare_csv`, `teambuildr_csv`, `teamworks_csv`, `google_sheets`, `onform_export`, `generic_csv`, `pdf_extract`
- `source_name`
- `source_category`: official_game, player_development, tracking, video, strength, academics, operations
- `trust_tier`: official, verified_vendor, coach_reviewed, player_submitted, unverified
- `is_enabled`
- `default_visibility`
- `requires_review`
- `field_mapping_profile`
- `created_by`
- `created_at`
- `updated_at`

### `baseball_external_identities`

Purpose: resolve one athlete across vendors.

Columns:

- `id`
- `player_id`
- `team_id`
- `source_id`
- `external_player_id`
- `external_display_name`
- `external_first_name`
- `external_last_name`
- `jersey_number`
- `position`
- `grad_year`
- `confidence`
- `match_status`: pending, matched, rejected, needs_review, retired
- `matched_by`
- `matched_at`
- `created_at`

Rules:

- Unique on `team_id`, `source_id`, `external_player_id` where not null.
- Allow multiple external identities per player.
- Keep rejected identities for future duplicate prevention.

### `baseball_import_runs`

Purpose: one upload/process/commit unit.

Columns:

- `id`
- `team_id`
- `source_id`
- `uploaded_by`
- `filename`
- `file_url`
- `file_hash`
- `file_mime_type`
- `file_size_bytes`
- `raw_text_snapshot`
- `parser_version`
- `import_type`: roster, official_box_score, official_season_stats, play_by_play, pitch_level, hitting_tracking, pitching_tracking, swing_sensor, strength, wellness, classes, video_index, scouting, generic
- `target_season`
- `target_game_id`
- `status`: uploaded, parsed, mapped, validated, needs_review, committed, rolled_back, failed
- `row_count`
- `valid_row_count`
- `error_row_count`
- `matched_player_count`
- `unmatched_player_count`
- `duplicate_count`
- `confidence_summary`
- `commit_summary`
- `rollback_summary`
- `started_at`
- `committed_at`
- `rolled_back_at`
- `created_at`
- `updated_at`

### `baseball_import_rows`

Purpose: auditable normalized rows before commit.

Columns:

- `id`
- `import_run_id`
- `row_number`
- `raw_row`
- `normalized_row`
- `target_table`
- `target_grain`: player_game, player_season, plate_appearance, pitch, swing, batted_ball, lift_set, class_meeting, video_clip, task
- `player_match_status`
- `player_id`
- `external_player_key`
- `confidence`
- `validation_errors`
- `validation_warnings`
- `duplicate_of_row_id`
- `commit_status`: pending, committed, skipped, failed, rolled_back
- `created_object_refs`
- `created_at`

### `baseball_import_field_mappings`

Purpose: save user-confirmed mapping profiles.

Columns:

- `id`
- `team_id`
- `source_id`
- `mapping_name`
- `import_type`
- `csv_header`
- `canonical_field`
- `transform_rule`
- `unit`
- `is_required`
- `created_by`
- `created_at`
- `updated_at`

### `baseball_stat_facts`

Purpose: generic source-linked metric facts when a full structured table is not yet available.

Columns:

- `id`
- `team_id`
- `player_id`
- `game_id`
- `event_id`
- `practice_id`
- `video_id`
- `import_run_id`
- `source_id`
- `metric_key`
- `metric_value_numeric`
- `metric_value_text`
- `metric_value_json`
- `unit`
- `context`
- `measured_at`
- `trust_tier`
- `visibility`
- `created_at`

Use this to avoid blocking on every future vendor-specific table. But when a metric becomes first-class and product-critical, promote it into structured tables.

### `baseball_plate_appearances`

Columns:

- `id`
- `team_id`
- `game_id`
- `batter_id`
- `pitcher_external_name`
- `opponent_pitcher_id` if tracked
- `inning`
- `half`
- `outs_before`
- `balls_before`
- `strikes_before`
- `base_state_before`
- `score_diff_before`
- `lineup_slot`
- `result`
- `rbi`
- `runs_scored`
- `is_quality_at_bat`
- `quality_at_bat_reasons`
- `video_id`
- `import_run_id`
- `source_id`
- `created_at`

### `baseball_pitch_events`

Columns:

- `id`
- `team_id`
- `game_id`
- `practice_id`
- `plate_appearance_id`
- `pitcher_id`
- `batter_id`
- `catcher_id`
- `pitch_number`
- `pitch_type`
- `pitch_call`
- `pitch_result`
- `velocity`
- `spin_rate`
- `spin_axis`
- `spin_efficiency`
- `seam_orientation`
- `induced_vertical_break`
- `horizontal_break`
- `release_height`
- `release_side`
- `extension`
- `plate_height`
- `plate_side`
- `zone`
- `intended_location`
- `miss_distance`
- `is_swing`
- `is_whiff`
- `is_chase`
- `is_called_strike`
- `is_in_zone`
- `video_id`
- `import_run_id`
- `source_id`
- `measured_at`

### `baseball_batted_ball_events`

Columns:

- `id`
- `team_id`
- `game_id`
- `practice_id`
- `plate_appearance_id`
- `pitch_event_id`
- `batter_id`
- `pitcher_id`
- `exit_velocity`
- `launch_angle`
- `spray_angle`
- `distance`
- `hang_time`
- `batted_ball_type`
- `field_zone`
- `is_hard_hit`
- `is_barrel`
- `is_sweet_spot`
- `result`
- `video_id`
- `import_run_id`
- `source_id`

### `baseball_swing_events`

Columns:

- `id`
- `team_id`
- `player_id`
- `game_id`
- `practice_id`
- `pitch_event_id`
- `source_id`
- `import_run_id`
- `bat_speed`
- `attack_angle`
- `vertical_bat_angle`
- `on_plane_efficiency`
- `time_to_contact`
- `rotational_acceleration`
- `connection_score`
- `early_connection`
- `connection_at_impact`
- `peak_hand_speed`
- `power_score`
- `max_barrel_speed`
- `max_acceleration`
- `impact_momentum`
- `contact_point`
- `pitch_context`
- `drill_context`
- `video_id`
- `measured_at`

### `baseball_fielding_events`

Columns:

- `id`
- `team_id`
- `game_id`
- `practice_id`
- `player_id`
- `position`
- `event_type`
- `chance_difficulty`
- `result`
- `error_type`
- `throw_velocity`
- `exchange_time`
- `arm_accuracy`
- `route_grade`
- `footwork_grade`
- `communication_grade`
- `video_id`
- `import_run_id`
- `source_id`

### `baseball_catching_events`

Columns:

- `id`
- `team_id`
- `game_id`
- `practice_id`
- `catcher_id`
- `pitcher_id`
- `event_type`: receive, block, throwdown, game_call, mound_visit
- `pitch_event_id`
- `pop_time`
- `exchange_time`
- `throw_velocity`
- `throw_accuracy`
- `block_result`
- `framing_result`
- `steal_result`
- `video_id`
- `source_id`
- `import_run_id`

### `baseball_lift_sessions`, `baseball_lift_assignments`, `baseball_lift_results`

Purpose: Phase 1 strength OS foundation.

`baseball_lift_sessions`:

- team, date, phase, focus, staff owner, notes, status

`baseball_lift_assignments`:

- session, player, exercise, prescription, due time/window, modification reason, player status

`baseball_lift_results`:

- assignment, set number, reps, load, RPE/RIR, velocity if present, completed, soreness/pain notes, coach notes, video, source/import

### `baseball_readiness_checkins`

Columns:

- `id`
- `team_id`
- `player_id`
- `date`
- `sleep_quality`
- `sleep_hours`
- `soreness_total`
- `arm_soreness`
- `elbow_soreness`
- `shoulder_soreness`
- `lower_body_soreness`
- `energy`
- `stress`
- `illness_flag`
- `throwing_readiness`
- `catching_readiness`
- `pitcher_readiness`
- `notes`
- `visibility`
- `source`

### `baseball_workload_events`

Columns:

- `id`
- `team_id`
- `player_id`
- `date`
- `event_type`: game_pitches, bullpen, flat_ground, long_toss, catch_play, position_throwing, lift, sprint, recovery
- `count`
- `high_intent_count`
- `duration_minutes`
- `intensity`
- `rpe`
- `source_id`
- `import_run_id`
- `game_id`
- `practice_id`
- `notes`

### `baseball_video_events`

Purpose: index video without forcing storage ownership.

Columns:

- `id`
- `team_id`
- `player_id`
- `video_id`
- `external_video_url`
- `source_id`
- `game_id`
- `practice_id`
- `plate_appearance_id`
- `pitch_event_id`
- `swing_event_id`
- `clip_start_time`
- `clip_end_time`
- `tag_family`
- `tags`
- `coach_annotation`
- `player_response`
- `linked_task_id`
- `linked_insight_id`

## Import Flow

The import flow must have these steps:

1. Upload: save file, compute hash, create `baseball_import_runs`.
2. Detect: identify type, source, delimiter, headers, encoding, likely season/game.
3. Parse: create `baseball_import_rows` with raw and normalized data.
4. Map: auto-map headers using saved profiles and known aliases; require human confirmation for low confidence.
5. Match players: exact external ID, exact roster ID, jersey+name, normalized name, fuzzy name, manual.
6. Validate: required fields, numeric ranges, units, official stat consistency, impossible values, duplicate source rows.
7. Preview: show affected players, games, metrics, new rows, updates, skipped duplicates, warnings.
8. Commit: write first-class tables or facts; stamp every created row with source/import references where possible.
9. Recalculate: aggregates, season stats, percentiles, signals, CoachHelm inputs, timeline events.
10. Review: surface generated signals and suggested actions.
11. Rollback: reverse rows created by a run, restore superseded values, mark insights that depended on rolled-back data stale.

## Player Matching Rules

Priority:

1. Existing `baseball_external_identities` exact source + external ID.
2. Team roster exact player ID field.
3. Exact normalized first/last name plus jersey number.
4. Exact normalized last name plus first initial plus jersey number.
5. Exact normalized name without jersey.
6. Fuzzy name with roster context.
7. Manual resolution.

Always persist:

- match confidence
- competing candidates
- who confirmed manual matches
- rejected candidates
- external display name

Never silently commit an official stat to a player below the configured confidence threshold.

## Duplicate and Versioning Rules

Duplicates are determined by source and grain:

- Official box score: team, game, player, stat line type, source file hash.
- Official season stat: team, season, player, source, stat period.
- Pitch event: game/session, pitch number, pitcher, batter, timestamp or vendor pitch ID.
- Swing event: session, player, timestamp, vendor swing ID.
- Lift result: assignment, player, set number, date/source.
- Class import: player, semester, course name, days/start/end.

If the same official game is re-imported:

- do not double-count
- show old vs new diff
- allow replace, merge, or cancel
- keep previous import as superseded
- mark downstream insights for recompute

## Source Trust and Metric Authority

Metric authority resolves conflicts:

- Official game stat from NCAA/StatCrew/GameChanger college XML beats coach manual entry for official record.
- Coach manual correction can override only with explicit reason and audit trail.
- TrackMan/Rapsodo pitch-level data can enrich official stats but should not override official scoring decisions.
- Swing sensor data is developmental, not official.
- Player-submitted data requires coach approval before powering CoachHelm.
- Video tags require reviewer identity and confidence before driving high-impact recommendations.

## Recalculation Contracts

After every committed import:

- update `baseball_player_season_stats` for official games
- update `baseball_player_aggregates` or next-generation aggregate views
- update player profile best verified measurables if applicable
- update `baseball_player_percentiles`
- create player timeline events
- create or update source-backed signals
- invalidate stale CoachHelm insights
- write import audit events
- notify responsible staff only if signal threshold is met

## RLS and Security

Follow Supabase best practices:

- Enable RLS on all new tables.
- Coaches read/write rows only for teams they staff.
- Players read only their own approved rows and approved insights.
- Strength staff can see performance/readiness/lift rows for assigned teams but not private academic notes unless granted.
- Academic viewers see academics/classes and schedule context only.
- Service role may write engine output, imports, and recalculations server-side; never expose service role to clients.
- Views that should respect RLS must use `security_invoker = true`.
- UPDATE policies need SELECT policies too.
- Do not authorize from mutable user metadata.

