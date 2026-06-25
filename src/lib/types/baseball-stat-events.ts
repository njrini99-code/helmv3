// =============================================================================
// baseball-stat-events.ts
//
// Hand-written TypeScript types for the BaseballHelm elite stat EVENT model:
//   supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql
//
// WHY THIS FILE EXISTS
//   The generated src/lib/types/database.ts is regenerated from the live DB and
//   does NOT reflect this freshly-written-but-not-yet-applied migration. This
//   file hand-mirrors the EXACT column names/types from the SQL so feature code
//   (stat-visuals fan-out, adapters, read models) can be written today. Once the
//   migration is applied and database.ts is regenerated, the generated table
//   types supersede these; collapse to thin aliases then.
//
//   SQL -> TS mapping (same convention as baseball-extended.ts):
//     uuid -> string | text -> string | integer/numeric -> number |
//     boolean -> boolean | jsonb -> Json | date/timestamptz -> string (ISO) |
//     NOT NULL -> required | NULLable -> `| null` | has DEFAULT -> optional in Insert.
//
// OWNERSHIP: this file + (optionally) a one-line re-export in index.ts. Do NOT
// edit the generated database.ts.
// =============================================================================

import type { Json } from './baseball-extended';

// -----------------------------------------------------------------------------
// Shared vocabulary (CHECK-constraint domains in the migration). These are the
// single source of truth for context / trust / visibility across every event
// table AND every stat visual's source-confidence model.
// -----------------------------------------------------------------------------

/** v10 §"Data Contexts" — the bucket every event/fact is tagged with. */
export type BaseballDataContext =
  | 'official_game'
  | 'scrimmage'
  | 'practice'
  | 'bullpen'
  | 'cage'
  | 'showcase'
  | 'sensor'
  | 'video'
  | 'lift'
  | 'readiness'
  | 'manual';

/** v6 §"Source Trust and Metric Authority" — provenance trust tier. */
export type BaseballTrustTier =
  | 'official'
  | 'verified_vendor'
  | 'coach_reviewed'
  | 'player_submitted'
  | 'unverified'
  | 'inferred';

/** Role-safe visibility (V2 role-permission matrix). */
export type BaseballEventVisibility = 'staff_only' | 'player_visible' | 'restricted';

/** Honest sample-size-aware confidence (V10 + zip non-negotiable). */
export type BaseballMetricConfidence = 'high' | 'medium' | 'low' | 'insufficient';

/** Source registry source_key vocabulary (V6 baseball_stat_sources.source_key). */
export type BaseballSourceKey =
  | 'manual'
  | 'gamechanger_xml'
  | 'statcrew_xml'
  | 'ncaa_live_stats'
  | 'prestosports_xml'
  | 'sidearm_xml'
  | 'statbroadcast_xml'
  | 'trackman_csv'
  | 'rapsodo_csv'
  | 'yakkertech_csv'
  | 'hittrax_csv'
  | 'pocket_radar_csv'
  | 'blast_csv'
  | 'diamond_kinetics_csv'
  | 'synergy_export'
  | 'six_four_three_export'
  | 'awre_video'
  | 'onform_export'
  | 'armcare_csv'
  | 'teambuildr_csv'
  | 'teamworks_csv'
  | 'google_sheets'
  | 'generic_csv'
  | 'generic_xlsx'
  | 'pdf_extract';

export type BaseballSourceCategory =
  | 'official_game'
  | 'player_development'
  | 'tracking'
  | 'video'
  | 'strength'
  | 'academics'
  | 'operations';

// -----------------------------------------------------------------------------
// baseball_stat_sources
// NOTE: named *Row to avoid colliding with the legacy `BaseballStatSource`
// string-union in @/lib/types/index.ts (that is the old upload-source enum;
// this is the new source-registry table row — different concept).
// -----------------------------------------------------------------------------
export interface BaseballStatSourceRow {
  id: string;
  team_id: string;
  source_key: BaseballSourceKey;
  source_name: string;
  source_category: BaseballSourceCategory;
  trust_tier: BaseballTrustTier;
  is_enabled: boolean;
  default_visibility: BaseballEventVisibility;
  requires_review: boolean;
  ai_can_use: boolean;
  expected_cadence_days: number | null;
  field_mapping_profile: Json | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// baseball_import_field_mappings
// -----------------------------------------------------------------------------
export interface BaseballImportFieldMapping {
  id: string;
  team_id: string;
  source_id: string | null;
  mapping_name: string;
  import_type: string;
  csv_header: string;
  canonical_field: string;
  transform_rule: string | null;
  unit: string | null;
  is_required: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// baseball_plate_appearances
// -----------------------------------------------------------------------------
export interface BaseballPlateAppearance {
  id: string;
  team_id: string;
  game_id: string | null;
  practice_id: string | null;
  batter_id: string | null;
  pitcher_id: string | null;
  pitcher_external_name: string | null;
  data_context: BaseballDataContext;
  inning: number | null;
  half: 'top' | 'bottom' | null;
  outs_before: number | null;
  balls_before: number | null;
  strikes_before: number | null;
  base_state_before: string | null;
  score_diff_before: number | null;
  lineup_slot: number | null;
  result: string | null;
  rbi: number | null;
  runs_scored: number | null;
  is_quality_at_bat: boolean | null;
  quality_at_bat_reasons: Json | null;
  video_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  measured_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_pitch_events
// -----------------------------------------------------------------------------
export interface BaseballPitchEvent {
  id: string;
  team_id: string;
  game_id: string | null;
  practice_id: string | null;
  plate_appearance_id: string | null;
  pitcher_id: string | null;
  batter_id: string | null;
  catcher_id: string | null;
  data_context: BaseballDataContext;
  pitch_number: number | null;
  pitch_type: string | null;
  pitch_type_classified: string | null;
  pitch_call: string | null;
  pitch_result: string | null;
  velocity: number | null;
  spin_rate: number | null;
  spin_axis: number | null;
  spin_efficiency: number | null;
  seam_orientation: string | null;
  induced_vertical_break: number | null;
  horizontal_break: number | null;
  release_height: number | null;
  release_side: number | null;
  extension: number | null;
  plate_height: number | null;
  plate_side: number | null;
  zone: number | null;
  intended_location: string | null;
  miss_distance: number | null;
  is_swing: boolean | null;
  is_whiff: boolean | null;
  is_chase: boolean | null;
  is_called_strike: boolean | null;
  is_in_zone: boolean | null;
  count_state: string | null;
  batter_handedness: 'L' | 'R' | 'S' | null;
  video_id: string | null;
  external_pitch_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  measured_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_batted_ball_events
// -----------------------------------------------------------------------------
export type BaseballBattedBallType = 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup';

export interface BaseballBattedBallEvent {
  id: string;
  team_id: string;
  game_id: string | null;
  practice_id: string | null;
  plate_appearance_id: string | null;
  pitch_event_id: string | null;
  batter_id: string | null;
  pitcher_id: string | null;
  data_context: BaseballDataContext;
  exit_velocity: number | null;
  launch_angle: number | null;
  spray_angle: number | null;
  distance: number | null;
  hang_time: number | null;
  batted_ball_type: BaseballBattedBallType | null;
  field_zone: string | null;
  is_hard_hit: boolean | null;
  is_barrel: boolean | null;
  is_sweet_spot: boolean | null;
  result: string | null;
  pitch_type: string | null;
  video_id: string | null;
  external_event_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  measured_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_swing_events  (developmental — trust_tier can never be 'official')
// -----------------------------------------------------------------------------
export interface BaseballSwingEvent {
  id: string;
  team_id: string;
  player_id: string | null;
  game_id: string | null;
  practice_id: string | null;
  pitch_event_id: string | null;
  data_context: BaseballDataContext;
  bat_speed: number | null;
  attack_angle: number | null;
  vertical_bat_angle: number | null;
  on_plane_efficiency: number | null;
  time_to_contact: number | null;
  rotational_acceleration: number | null;
  connection_score: number | null;
  early_connection: number | null;
  connection_at_impact: number | null;
  peak_hand_speed: number | null;
  power_score: number | null;
  max_barrel_speed: number | null;
  max_acceleration: number | null;
  impact_momentum: number | null;
  contact_point: string | null;
  pitch_context: string | null;
  drill_context: string | null;
  video_id: string | null;
  external_swing_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  /** never 'official' — enforced by a DB CHECK. */
  trust_tier: Exclude<BaseballTrustTier, 'official'>;
  visibility: BaseballEventVisibility;
  measured_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_fielding_events
// -----------------------------------------------------------------------------
export interface BaseballFieldingEvent {
  id: string;
  team_id: string;
  game_id: string | null;
  practice_id: string | null;
  player_id: string | null;
  data_context: BaseballDataContext;
  position: string | null;
  event_type: string | null;
  chance_difficulty: string | null;
  result: string | null;
  error_type: string | null;
  throw_velocity: number | null;
  exchange_time: number | null;
  arm_accuracy: string | null;
  route_grade: string | null;
  footwork_grade: string | null;
  communication_grade: string | null;
  field_x: number | null;
  field_y: number | null;
  video_id: string | null;
  external_event_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  measured_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_catching_events
// -----------------------------------------------------------------------------
export type BaseballCatchingEventType =
  | 'receive'
  | 'block'
  | 'throwdown'
  | 'game_call'
  | 'mound_visit';

export interface BaseballCatchingEvent {
  id: string;
  team_id: string;
  game_id: string | null;
  practice_id: string | null;
  catcher_id: string | null;
  pitcher_id: string | null;
  pitch_event_id: string | null;
  data_context: BaseballDataContext;
  event_type: BaseballCatchingEventType | null;
  pop_time: number | null;
  exchange_time: number | null;
  throw_velocity: number | null;
  throw_accuracy: string | null;
  block_result: string | null;
  framing_result: string | null;
  steal_result: string | null;
  video_id: string | null;
  external_event_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  measured_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_baserunning_events
// -----------------------------------------------------------------------------
export interface BaseballBaserunningEvent {
  id: string;
  team_id: string;
  game_id: string | null;
  practice_id: string | null;
  runner_id: string | null;
  data_context: BaseballDataContext;
  event_type: string | null;
  result: string | null;
  lead_size: number | null;
  jump_time: number | null;
  home_to_first: number | null;
  first_to_third: number | null;
  second_to_home: number | null;
  sixty_time: number | null;
  sprint_speed: number | null;
  decision_quality: string | null;
  video_id: string | null;
  external_event_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  measured_at: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_workload_events
// -----------------------------------------------------------------------------
export type BaseballWorkloadEventType =
  | 'game_pitches'
  | 'bullpen'
  | 'flat_ground'
  | 'long_toss'
  | 'catch_play'
  | 'position_throwing'
  | 'lift'
  | 'sprint'
  | 'recovery';

export interface BaseballWorkloadEvent {
  id: string;
  team_id: string;
  player_id: string | null;
  game_id: string | null;
  practice_id: string | null;
  event_date: string;
  event_type: BaseballWorkloadEventType;
  count: number | null;
  high_intent_count: number | null;
  duration_minutes: number | null;
  intensity: string | null;
  rpe: number | null;
  notes: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_video_events
// -----------------------------------------------------------------------------
export interface BaseballVideoEvent {
  id: string;
  team_id: string;
  player_id: string | null;
  video_id: string | null;
  external_video_url: string | null;
  game_id: string | null;
  practice_id: string | null;
  plate_appearance_id: string | null;
  pitch_event_id: string | null;
  swing_event_id: string | null;
  data_context: BaseballDataContext;
  clip_start_time: number | null;
  clip_end_time: number | null;
  tag_family: string | null;
  tags: Json | null;
  coach_annotation: string | null;
  player_response: string | null;
  linked_task_id: string | null;
  linked_insight_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_stat_facts  (generic source-linked metric escape hatch)
// -----------------------------------------------------------------------------
export interface BaseballStatFact {
  id: string;
  team_id: string;
  player_id: string | null;
  game_id: string | null;
  event_id: string | null;
  practice_id: string | null;
  video_id: string | null;
  import_run_id: string | null;
  source_id: string | null;
  data_context: BaseballDataContext;
  metric_key: string;
  metric_value_numeric: number | null;
  metric_value_text: string | null;
  metric_value_json: Json | null;
  unit: string | null;
  context: Json | null;
  measured_at: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  created_at: string;
}

// -----------------------------------------------------------------------------
// baseball_player_development_metrics  (calculated source-attributed snapshots)
// -----------------------------------------------------------------------------
export type BaseballMetricGroup =
  | 'hitting'
  | 'pitching'
  | 'catching'
  | 'fielding'
  | 'baserunning'
  | 'swing'
  | 'readiness'
  | 'workload'
  | 'composite';

export interface BaseballPlayerDevelopmentMetric {
  id: string;
  team_id: string;
  player_id: string;
  metric_key: string;
  metric_group: BaseballMetricGroup | null;
  data_context: BaseballDataContext;
  as_of_date: string;
  window_label: string | null;
  value_numeric: number | null;
  sample_size: number | null;
  confidence: BaseballMetricConfidence;
  trust_tier: BaseballTrustTier;
  percentile: number | null;
  source_id: string | null;
  import_run_id: string | null;
  visibility: BaseballEventVisibility;
  computed_at: string;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Convenience union of every fact-bearing event row (for read models / charts
// that fan over heterogeneous events with a shared source/trust/context shape).
// -----------------------------------------------------------------------------
export type BaseballStatEvent =
  | BaseballPlateAppearance
  | BaseballPitchEvent
  | BaseballBattedBallEvent
  | BaseballSwingEvent
  | BaseballFieldingEvent
  | BaseballCatchingEvent
  | BaseballBaserunningEvent
  | BaseballWorkloadEvent
  | BaseballVideoEvent
  | BaseballStatFact;

/** The provenance fields every event row carries — the StatVisualFrame contract. */
export interface BaseballStatProvenance {
  source_id: string | null;
  import_run_id: string | null;
  trust_tier: BaseballTrustTier;
  visibility: BaseballEventVisibility;
  data_context: BaseballDataContext;
}
