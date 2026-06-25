// =============================================================================
// src/lib/types/baseball-lifting-v11.ts
//
// HAND-WRITTEN Row/Insert/Update types for the V11 Premium Lifting system added
// by supabase/migrations/20260624000063_baseball_v11_premium_lifting.sql.
//
// We cannot regenerate database.ts (no live apply in this environment), so these
// mirror the migration DDL exactly. The "Lite" types (4 original tables) still
// live in baseball-lifting.ts and are untouched; this file is purely additive.
//
// Convention matches the generated supabase rows: every column present on Row;
// Insert makes DB-defaulted / nullable columns optional; Update makes all
// columns optional.
// =============================================================================

import type { Json } from '@/lib/types';

// -----------------------------------------------------------------------------
// String-enum vocabularies (mirror the CHECK constraints in the migration)
// -----------------------------------------------------------------------------

export type BaseballStrengthGroupType = 'static' | 'dynamic' | 'imported' | 'temporary';
export type BaseballGroupMemberSource = 'manual' | 'rule' | 'import';

export type BaseballLiftExerciseCategory =
  | 'warmup' | 'power' | 'strength' | 'accessory' | 'arm_care'
  | 'mobility' | 'conditioning' | 'recovery' | 'test';
export type BaseballLiftPrimaryPattern =
  | 'squat' | 'hinge' | 'push' | 'pull' | 'carry' | 'rotate' | 'anti_rotate'
  | 'sprint' | 'jump' | 'throw' | 'shoulder' | 'elbow' | 'hip' | 'ankle';
export type BaseballLiftBodyRegion = 'lower' | 'upper' | 'trunk' | 'arm' | 'full_body';
export type BaseballLiftUnit =
  | 'lb' | 'kg' | 'bodyweight' | 'seconds' | 'yards' | 'reps' | 'mph' | 'watts' | 'mps';

export type BaseballLiftProgramPhase =
  | 'fall' | 'winter' | 'preseason' | 'in_season' | 'postseason'
  | 'summer' | 'return_to_play' | 'testing';
export type BaseballLiftProgramGoal =
  | 'strength' | 'power' | 'hypertrophy' | 'speed' | 'maintenance'
  | 'recovery' | 'arm_care' | 'testing';
export type BaseballLiftProgramVisibility = 'staff_only' | 'assigned_players';
export type BaseballLiftProgramStatus = 'draft' | 'active' | 'archived';

export type BaseballLiftDayType =
  | 'lower' | 'upper' | 'full_body' | 'recovery' | 'arm_care'
  | 'conditioning' | 'testing' | 'custom';
export type BaseballLiftBaseballContext =
  | 'pre_game' | 'post_game' | 'bullpen_day' | 'starter_plus_1' | 'starter_plus_2'
  | 'travel_day' | 'off_day' | 'practice_day';
export type BaseballLiftSectionType =
  | 'warmup' | 'movement_prep' | 'power' | 'main_strength'
  | 'accessory' | 'arm_care' | 'mobility' | 'conditioning';
export type BaseballLiftPrescriptionType =
  | 'fixed' | 'percent_1rm' | 'rpe' | 'velocity' | 'coach_load' | 'player_select';

export type BaseballLiftAssignmentTargetType = 'team' | 'group' | 'player';
export type BaseballLiftProgramAssignmentStatus = 'draft' | 'published' | 'cancelled';

export type BaseballLiftSessionStatus =
  | 'assigned' | 'started' | 'completed' | 'missed' | 'excused' | 'modified';
export type BaseballLiftSessionReviewStatus = 'none' | 'needs_review' | 'reviewed';
export type BaseballLiftSessionExerciseStatus =
  | 'assigned' | 'completed' | 'skipped' | 'substituted';

export type BaseballSorenessSide = 'left' | 'right' | 'both' | 'center';
export type BaseballBodyweightSource = 'player' | 'coach' | 'import';
export type BaseballAvailabilityStatus =
  | 'available' | 'limited' | 'hold' | 'return_to_play' | 'unavailable';
export type BaseballAvailabilityReason =
  | 'soreness' | 'illness' | 'injury_note' | 'academic' | 'travel' | 'coach_decision' | 'other';
export type BaseballVisibility = 'staff' | 'performance_staff' | 'head_coach_only';

export type BaseballStrengthMaxType =
  | 'estimated_1rm' | 'tested_1rm' | 'training_max' | 'velocity_profile';
export type BaseballStrengthMaxSource =
  | 'coach_test' | 'player_entry' | 'import' | 'calculated';
export type BaseballStrengthPrType = 'load' | 'reps' | 'estimated_1rm' | 'velocity' | 'volume';

export type BaseballLiftImportSource =
  | 'teambuildr' | 'trainheroic' | 'bridge' | 'volt' | 'google_sheets' | 'csv' | 'manual';
export type BaseballLiftImportKind =
  | 'lift_assignment' | 'lift_result' | 'testing' | 'wellness' | 'attendance';
export type BaseballLiftImportStatus =
  | 'staged' | 'validated' | 'committed' | 'rolled_back' | 'failed';
export type BaseballLiftImportConfidence = 'verified' | 'reported' | 'inferred';

export type BaseballReadinessBand =
  | 'green' | 'yellow' | 'orange_lower' | 'orange_upper' | 'red' | 'blue';

// -----------------------------------------------------------------------------
// Strength groups
// -----------------------------------------------------------------------------

export interface BaseballStrengthGroupRow {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  group_type: BaseballStrengthGroupType;
  rule_json: Json;
  created_by_coach_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface BaseballStrengthGroupInsert {
  id?: string;
  team_id: string;
  name: string;
  description?: string | null;
  group_type?: BaseballStrengthGroupType;
  rule_json?: Json;
  created_by_coach_id?: string | null;
  is_active?: boolean;
}
export type BaseballStrengthGroupUpdate = Partial<BaseballStrengthGroupInsert> & { updated_at?: string };

export interface BaseballStrengthGroupMemberRow {
  id: string;
  group_id: string;
  player_id: string;
  source: BaseballGroupMemberSource;
  added_by_coach_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}
export interface BaseballStrengthGroupMemberInsert {
  id?: string;
  group_id: string;
  player_id: string;
  source?: BaseballGroupMemberSource;
  added_by_coach_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

// ---- Membership audit ledger (spec L198; migration 20260624000440) ----------
export type BaseballStrengthGroupAuditEvent =
  | 'group_created' | 'group_updated' | 'rule_changed' | 'type_changed'
  | 'member_added' | 'member_removed' | 'recomputed';
export type BaseballStrengthGroupAuditSource = 'manual' | 'rule' | 'import' | 'system';

export interface BaseballStrengthGroupAuditRow {
  id: string;
  team_id: string;
  group_id: string;
  event_type: BaseballStrengthGroupAuditEvent;
  player_id: string | null;
  source: BaseballStrengthGroupAuditSource;
  detail: string | null;
  meta_json: Json;
  actor_coach_id: string | null;
  created_at: string;
}
export interface BaseballStrengthGroupAuditInsert {
  id?: string;
  team_id: string;
  group_id: string;
  event_type?: BaseballStrengthGroupAuditEvent;
  player_id?: string | null;
  source?: BaseballStrengthGroupAuditSource;
  detail?: string | null;
  meta_json?: Json;
  actor_coach_id?: string | null;
}

// ---- Dynamic rule model (spec L177-189; engine in strength-group-rules.ts) ---
// The rule_json shape evaluated server-side. Every field is optional; an absent
// field is "don't filter on this". `match` chooses AND (all) / OR (any) across
// the active predicates. This is the contract the rule engine + UI both bind to.
export interface BaseballStrengthGroupRules {
  /** AND = a player must match every active predicate; OR = any one. */
  match?: 'all' | 'any';
  /** Position codes (primary or secondary), e.g. ['P','RHP','LHP','C']. */
  positions?: string[];
  /** Class years by grad year, e.g. [2027, 2028]. */
  grad_years?: number[];
  /** Pitcher role split, used with positions=P. */
  pitcher_role?: ('starter' | 'reliever')[];
  /** Availability statuses, e.g. ['limited','hold']. */
  availability_statuses?: BaseballAvailabilityStatus[];
  /** Min recent pitch count over `lookback_days` (workload watch). */
  min_recent_pitch_count?: number;
  /** Min recent game starts over `lookback_days`. */
  min_recent_game_starts?: number;
  /** Min reported soreness severity (0-10) on latest check-in. */
  min_soreness_severity?: number;
  /** Bodyweight range in lbs. */
  bodyweight_min?: number;
  bodyweight_max?: number;
  /** Training age in years (seasons since first grad-year-derived enrollment). */
  training_age_min?: number;
  training_age_max?: number;
  /** Lift completion over `lookback_days`: 'incomplete' = missed/assigned. */
  lift_completion?: 'completed' | 'incomplete';
  /** Always-include these player ids regardless of predicates (coach-selected). */
  always_include_player_ids?: string[];
  /** Always-exclude these player ids regardless of predicates. */
  always_exclude_player_ids?: string[];
  /** Window for recency predicates (pitch count, starts, lift completion). */
  lookback_days?: number;
}

// -----------------------------------------------------------------------------
// Exercise library + substitutions
// -----------------------------------------------------------------------------

export interface BaseballLiftExerciseRow {
  id: string;
  team_id: string | null;
  created_by_coach_id: string | null;
  name: string;
  category: BaseballLiftExerciseCategory;
  primary_pattern: BaseballLiftPrimaryPattern | null;
  body_region: BaseballLiftBodyRegion | null;
  equipment: string | null;
  unilateral: boolean;
  baseball_constraints: Json;
  baseball_tags: string[];
  default_unit: BaseballLiftUnit;
  track_load: boolean;
  track_reps: boolean;
  track_sets: boolean;
  track_velocity: boolean;
  track_distance: boolean;
  track_time: boolean;
  track_rpe: boolean;
  video_url: string | null;
  instructions: string | null;
  coaching_cues: string[];
  contraindication_notes: string | null;
  is_global: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface BaseballLiftExerciseInsert {
  id?: string;
  team_id?: string | null;
  created_by_coach_id?: string | null;
  name: string;
  category?: BaseballLiftExerciseCategory;
  primary_pattern?: BaseballLiftPrimaryPattern | null;
  body_region?: BaseballLiftBodyRegion | null;
  equipment?: string | null;
  unilateral?: boolean;
  baseball_constraints?: Json;
  baseball_tags?: string[];
  default_unit?: BaseballLiftUnit;
  track_load?: boolean;
  track_reps?: boolean;
  track_sets?: boolean;
  track_velocity?: boolean;
  track_distance?: boolean;
  track_time?: boolean;
  track_rpe?: boolean;
  video_url?: string | null;
  instructions?: string | null;
  coaching_cues?: string[];
  contraindication_notes?: string | null;
  is_global?: boolean;
  is_active?: boolean;
}
export type BaseballLiftExerciseUpdate = Partial<BaseballLiftExerciseInsert> & { updated_at?: string };

export interface BaseballLiftExerciseSubstitutionRow {
  id: string;
  team_id: string;
  exercise_id: string;
  substitute_exercise_id: string;
  reason: string | null;
  created_by_coach_id: string | null;
  created_at: string;
}
export interface BaseballLiftExerciseSubstitutionInsert {
  id?: string;
  team_id: string;
  exercise_id: string;
  substitute_exercise_id: string;
  reason?: string | null;
  created_by_coach_id?: string | null;
}

// -----------------------------------------------------------------------------
// Program model
// -----------------------------------------------------------------------------

export interface BaseballLiftProgramRow {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  phase: BaseballLiftProgramPhase;
  goal: BaseballLiftProgramGoal;
  created_by_coach_id: string | null;
  visibility: BaseballLiftProgramVisibility;
  status: BaseballLiftProgramStatus;
  is_template: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}
export interface BaseballLiftProgramInsert {
  id?: string;
  team_id: string;
  name: string;
  description?: string | null;
  phase?: BaseballLiftProgramPhase;
  goal?: BaseballLiftProgramGoal;
  created_by_coach_id?: string | null;
  visibility?: BaseballLiftProgramVisibility;
  status?: BaseballLiftProgramStatus;
  is_template?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}
export type BaseballLiftProgramUpdate = Partial<BaseballLiftProgramInsert> & { updated_at?: string };

export interface BaseballLiftWeekRow {
  id: string;
  program_id: string;
  week_number: number;
  name: string | null;
  theme: string | null;
  deload: boolean;
  created_at: string;
}
export interface BaseballLiftWeekInsert {
  id?: string;
  program_id: string;
  week_number: number;
  name?: string | null;
  theme?: string | null;
  deload?: boolean;
}

export interface BaseballLiftDayRow {
  id: string;
  week_id: string;
  day_number: number;
  name: string | null;
  day_type: BaseballLiftDayType;
  baseball_context: BaseballLiftBaseballContext | null;
  estimated_minutes: number | null;
  created_at: string;
}
export interface BaseballLiftDayInsert {
  id?: string;
  week_id: string;
  day_number: number;
  name?: string | null;
  day_type?: BaseballLiftDayType;
  baseball_context?: BaseballLiftBaseballContext | null;
  estimated_minutes?: number | null;
}

export interface BaseballLiftSectionRow {
  id: string;
  lift_day_id: string;
  section_order: number;
  name: string;
  section_type: BaseballLiftSectionType;
  instructions: string | null;
  created_at: string;
}
export interface BaseballLiftSectionInsert {
  id?: string;
  lift_day_id: string;
  section_order?: number;
  name: string;
  section_type?: BaseballLiftSectionType;
  instructions?: string | null;
}

export interface BaseballLiftPrescriptionRow {
  id: string;
  section_id: string;
  exercise_id: string | null;
  order_index: number;
  prescription_type: BaseballLiftPrescriptionType;
  sets: number | null;
  reps: number | null;
  load_value: number | null;
  load_unit: string | null;
  percent_1rm: number | null;
  target_rpe: number | null;
  target_rir: number | null;
  target_velocity_min: number | null;
  target_velocity_max: number | null;
  rest_seconds: number | null;
  tempo: string | null;
  coaching_note: string | null;
  substitution_group_id: string | null;
  created_at: string;
}
export interface BaseballLiftPrescriptionInsert {
  id?: string;
  section_id: string;
  exercise_id?: string | null;
  order_index?: number;
  prescription_type?: BaseballLiftPrescriptionType;
  sets?: number | null;
  reps?: number | null;
  load_value?: number | null;
  load_unit?: string | null;
  percent_1rm?: number | null;
  target_rpe?: number | null;
  target_rir?: number | null;
  target_velocity_min?: number | null;
  target_velocity_max?: number | null;
  rest_seconds?: number | null;
  tempo?: string | null;
  coaching_note?: string | null;
  substitution_group_id?: string | null;
}

// -----------------------------------------------------------------------------
// Program assignment + materialized sessions
// -----------------------------------------------------------------------------

export interface BaseballLiftProgramAssignmentRow {
  id: string;
  team_id: string;
  program_id: string;
  lift_day_id: string;
  assigned_by_coach_id: string | null;
  assignment_type: BaseballLiftAssignmentTargetType;
  group_id: string | null;
  player_id: string | null;
  event_id: string | null;
  scheduled_date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: BaseballLiftProgramAssignmentStatus;
  player_visible_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface BaseballLiftProgramAssignmentInsert {
  id?: string;
  team_id: string;
  program_id: string;
  lift_day_id: string;
  assigned_by_coach_id?: string | null;
  assignment_type?: BaseballLiftAssignmentTargetType;
  group_id?: string | null;
  player_id?: string | null;
  event_id?: string | null;
  scheduled_date: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status?: BaseballLiftProgramAssignmentStatus;
  player_visible_at?: string | null;
}
export type BaseballLiftProgramAssignmentUpdate =
  Partial<BaseballLiftProgramAssignmentInsert> & { updated_at?: string };

export interface BaseballLiftSessionRow {
  id: string;
  program_assignment_id: string | null;
  team_id: string;
  player_id: string;
  event_id: string | null;
  title: string | null;
  day_type: string | null;
  baseball_context: string | null;
  scheduled_date: string;
  estimated_minutes: number | null;
  status: BaseballLiftSessionStatus;
  started_at: string | null;
  completed_at: string | null;
  readiness_checkin_id: string | null;
  coach_review_status: BaseballLiftSessionReviewStatus;
  player_note: string | null;
  coach_note: string | null;
  created_at: string;
  updated_at: string;
}
export interface BaseballLiftSessionInsert {
  id?: string;
  program_assignment_id?: string | null;
  team_id: string;
  player_id: string;
  event_id?: string | null;
  title?: string | null;
  day_type?: string | null;
  baseball_context?: string | null;
  scheduled_date: string;
  estimated_minutes?: number | null;
  status?: BaseballLiftSessionStatus;
  started_at?: string | null;
  completed_at?: string | null;
  readiness_checkin_id?: string | null;
  coach_review_status?: BaseballLiftSessionReviewStatus;
  player_note?: string | null;
  coach_note?: string | null;
}
export type BaseballLiftSessionUpdate = Partial<BaseballLiftSessionInsert> & { updated_at?: string };

export interface BaseballLiftSessionExerciseRow {
  id: string;
  session_id: string;
  prescription_id: string | null;
  exercise_id: string | null;
  exercise_name_snapshot: string;
  section_name_snapshot: string | null;
  section_type_snapshot: string | null;
  order_index: number;
  prescribed_sets: number | null;
  prescribed_reps: number | null;
  prescribed_load: number | null;
  prescribed_load_unit: string | null;
  prescribed_rpe: number | null;
  modified_by_coach_id: string | null;
  modification_reason: string | null;
  status: BaseballLiftSessionExerciseStatus;
  created_at: string;
  updated_at: string;
}
export interface BaseballLiftSessionExerciseInsert {
  id?: string;
  session_id: string;
  prescription_id?: string | null;
  exercise_id?: string | null;
  exercise_name_snapshot: string;
  section_name_snapshot?: string | null;
  section_type_snapshot?: string | null;
  order_index?: number;
  prescribed_sets?: number | null;
  prescribed_reps?: number | null;
  prescribed_load?: number | null;
  prescribed_load_unit?: string | null;
  prescribed_rpe?: number | null;
  modified_by_coach_id?: string | null;
  modification_reason?: string | null;
  status?: BaseballLiftSessionExerciseStatus;
}
export type BaseballLiftSessionExerciseUpdate =
  Partial<BaseballLiftSessionExerciseInsert> & { updated_at?: string };

export interface BaseballLiftSetResultRow {
  id: string;
  session_exercise_id: string;
  team_id: string;
  player_id: string;
  set_number: number;
  prescribed_reps: number | null;
  actual_reps: number | null;
  prescribed_load: number | null;
  actual_load: number | null;
  load_unit: string | null;
  rpe: number | null;
  rir: number | null;
  velocity: number | null;
  completed_at: string | null;
  player_note: string | null;
  coach_observed: boolean;
  created_at: string;
}
export interface BaseballLiftSetResultInsert {
  id?: string;
  session_exercise_id: string;
  team_id: string;
  player_id: string;
  set_number: number;
  prescribed_reps?: number | null;
  actual_reps?: number | null;
  prescribed_load?: number | null;
  actual_load?: number | null;
  load_unit?: string | null;
  rpe?: number | null;
  rir?: number | null;
  velocity?: number | null;
  completed_at?: string | null;
  player_note?: string | null;
  coach_observed?: boolean;
}

// -----------------------------------------------------------------------------
// Readiness extras
// -----------------------------------------------------------------------------

export interface BaseballSorenessMapRow {
  id: string;
  checkin_id: string;
  team_id: string;
  player_id: string;
  body_region: string;
  side: BaseballSorenessSide;
  severity: number;
  note: string | null;
  created_at: string;
}
export interface BaseballSorenessMapInsert {
  id?: string;
  checkin_id: string;
  team_id: string;
  player_id: string;
  body_region: string;
  side?: BaseballSorenessSide;
  severity?: number;
  note?: string | null;
}

export interface BaseballBodyweightEntryRow {
  id: string;
  team_id: string;
  player_id: string;
  entry_date: string;
  weight_lbs: number;
  source: BaseballBodyweightSource;
  created_at: string;
}
export interface BaseballBodyweightEntryInsert {
  id?: string;
  team_id: string;
  player_id: string;
  entry_date: string;
  weight_lbs: number;
  source?: BaseballBodyweightSource;
}

export interface BaseballAvailabilityStatusRow {
  id: string;
  team_id: string;
  player_id: string;
  status: BaseballAvailabilityStatus;
  reason_category: BaseballAvailabilityReason | null;
  note: string | null;
  visibility: BaseballVisibility;
  starts_at: string;
  ends_at: string | null;
  created_by_coach_id: string | null;
  created_at: string;
}
export interface BaseballAvailabilityStatusInsert {
  id?: string;
  team_id: string;
  player_id: string;
  status?: BaseballAvailabilityStatus;
  reason_category?: BaseballAvailabilityReason | null;
  note?: string | null;
  visibility?: BaseballVisibility;
  starts_at?: string;
  ends_at?: string | null;
  created_by_coach_id?: string | null;
}

// -----------------------------------------------------------------------------
// Progression
// -----------------------------------------------------------------------------

export interface BaseballStrengthMaxRow {
  id: string;
  team_id: string;
  player_id: string;
  exercise_id: string;
  max_type: BaseballStrengthMaxType;
  value: number;
  unit: string;
  test_date: string | null;
  source: BaseballStrengthMaxSource;
  confidence: number | null;
  created_at: string;
  updated_at: string;
}
export interface BaseballStrengthMaxInsert {
  id?: string;
  team_id: string;
  player_id: string;
  exercise_id: string;
  max_type?: BaseballStrengthMaxType;
  value: number;
  unit?: string;
  test_date?: string | null;
  source?: BaseballStrengthMaxSource;
  confidence?: number | null;
}
export type BaseballStrengthMaxUpdate = Partial<BaseballStrengthMaxInsert> & { updated_at?: string };

export interface BaseballStrengthPrRow {
  id: string;
  team_id: string;
  player_id: string;
  exercise_id: string;
  pr_type: BaseballStrengthPrType;
  value: number;
  unit: string;
  achieved_at: string;
  lift_session_id: string | null;
  verified_by_coach_id: string | null;
  created_at: string;
}
export interface BaseballStrengthPrInsert {
  id?: string;
  team_id: string;
  player_id: string;
  exercise_id: string;
  pr_type?: BaseballStrengthPrType;
  value: number;
  unit?: string;
  achieved_at?: string;
  lift_session_id?: string | null;
  verified_by_coach_id?: string | null;
}

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

export interface BaseballLiftImportRunRow {
  id: string;
  team_id: string;
  created_by_coach_id: string | null;
  source: BaseballLiftImportSource;
  import_kind: BaseballLiftImportKind;
  file_name: string | null;
  file_hash: string | null;
  mapping_json: Json;
  units_json: Json;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  status: BaseballLiftImportStatus;
  source_confidence: BaseballLiftImportConfidence;
  committed_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface BaseballLiftImportRunInsert {
  id?: string;
  team_id: string;
  created_by_coach_id?: string | null;
  source?: BaseballLiftImportSource;
  import_kind?: BaseballLiftImportKind;
  file_name?: string | null;
  file_hash?: string | null;
  mapping_json?: Json;
  units_json?: Json;
  total_rows?: number;
  matched_rows?: number;
  unmatched_rows?: number;
  status?: BaseballLiftImportStatus;
  source_confidence?: BaseballLiftImportConfidence;
  committed_at?: string | null;
  rolled_back_at?: string | null;
}
export type BaseballLiftImportRunUpdate = Partial<BaseballLiftImportRunInsert> & { updated_at?: string };

export interface BaseballLiftImportRowRow {
  id: string;
  import_run_id: string;
  team_id: string;
  row_number: number;
  raw_json: Json;
  matched_player_id: string | null;
  match_status: 'matched' | 'unmatched' | 'ambiguous' | 'skipped';
  validation_error: string | null;
  created_at: string;
}
export interface BaseballLiftImportRowInsert {
  id?: string;
  import_run_id: string;
  team_id: string;
  row_number: number;
  raw_json?: Json;
  matched_player_id?: string | null;
  match_status?: 'matched' | 'unmatched' | 'ambiguous' | 'skipped';
  validation_error?: string | null;
}

// -----------------------------------------------------------------------------
// Composed view-models for the V11 UI (no DB row).
// -----------------------------------------------------------------------------

/** A materialized session joined with its exercises (player execution surface). */
export interface BaseballLiftSessionWithExercises extends BaseballLiftSessionRow {
  exercises: Array<BaseballLiftSessionExerciseRow & { sets: BaseballLiftSetResultRow[] }>;
}

/** A row on the Today Weight Room board (one per player session today). */
export interface BaseballWeightRoomBoardRow {
  session: BaseballLiftSessionRow;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  group_names: string[];
  readiness_band: BaseballReadinessBand | null;
  soreness_overall: number | null;
  bodyweight_delta_7d: number | null;
  prescribed_main_lift: string | null;
  actual_main_load: number | null;
  main_rpe: number | null;
}

/** Performance Command Center KPI strip (spec L54-60). */
export interface BaseballPerformanceKpis {
  today_completion_pct: number;
  today_total: number;
  today_completed: number;
  missed_lifts: number;
  readiness_risk: number;
  new_prs: number;
  pitcher_red_flags: number;
  load_modifications_pending: number;
  bodyweight_alerts: number;
}

// -----------------------------------------------------------------------------
// Live Weight Room view-models (spec L522-573 + Packet G). No DB row — these are
// composed server-side from today's sessions + session_exercises + set_results +
// readiness bands, and consumed by the /performance/live grid + drawer.
// -----------------------------------------------------------------------------

/** One logged set, flattened for the live drawer (coach-side set logger). */
export interface BaseballLiveSetRow {
  set_number: number;
  prescribed_reps: number | null;
  actual_reps: number | null;
  prescribed_load: number | null;
  actual_load: number | null;
  load_unit: string | null;
  rpe: number | null;
  velocity: number | null;
  coach_observed: boolean;
  completed_at: string | null;
  player_note: string | null;
}

/** One exercise on a live athlete card (the "station" they're working). */
export interface BaseballLiveExerciseRow {
  session_exercise_id: string;
  exercise_id: string | null;
  exercise_name: string;
  section_name: string | null;
  section_type: string | null;
  order_index: number;
  prescribed_sets: number | null;
  prescribed_reps: number | null;
  prescribed_load: number | null;
  prescribed_load_unit: string | null;
  prescribed_rpe: number | null;
  modification_reason: string | null;
  was_modified: boolean;
  status: BaseballLiftSessionExerciseStatus;
  sets: BaseballLiveSetRow[];
  /** Sets logged so far / prescribed (for the progress meter). */
  sets_logged: number;
}

/** A single athlete on the Live Weight Room grid (spec L538-549). */
export interface BaseballLiveAthleteRow {
  session_id: string;
  player_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  group_names: string[];
  session_status: BaseballLiftSessionStatus;
  readiness_band: BaseballReadinessBand | null;
  readiness_reasons: string[];
  availability_status: BaseballAvailabilityStatus | null;
  /** The exercise the athlete is currently on (first incomplete; else last). */
  current_station: string | null;
  current_exercise: string | null;
  /** Prescribed load on the current/main lift (the grid's "prescribed" column). */
  prescribed_load: number | null;
  /** Heaviest actual load logged on the current/main lift (grid "actual"). */
  actual_load: number | null;
  /** Last logged RPE on the current/main lift. */
  rpe: number | null;
  /** ISO of the most recent set logged across this session, or null. */
  last_update: string | null;
  /** True when ANY session exercise carries a coach modification_reason. */
  has_load_change: boolean;
  /** True when this athlete needs coach attention (red/orange band, missed, etc). */
  needs_coach: boolean;
  exercises: BaseballLiveExerciseRow[];
  total_exercises: number;
  completed_exercises: number;
}

/** The right-rail queues (spec L551-556). Each is a list of athlete ids + why. */
export interface BaseballLiveQueues {
  /** Athletes a coach should touch now: red band, missed check-in, or stalled. */
  needs_coach: Array<{ player_id: string; reason: string }>;
  /** Red / orange readiness bands. */
  readiness_flags: Array<{ player_id: string; band: BaseballReadinessBand }>;
  /** Athletes whose session exercises were load-modified today. */
  load_changes: Array<{ player_id: string; reason: string }>;
  /** Lifting today with NO readiness check-in logged. */
  missing_checkins: string[];
}

/** Top-bar live stats (spec L526-533). */
export interface BaseballLiveTopBar {
  team_name: string;
  lift_day_label: string;
  active_group: string | null;
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  risk_count: number;
}

/** The whole Live Weight Room payload (one server read; polled for refresh). */
export interface BaseballLiveWeightRoomData {
  top_bar: BaseballLiveTopBar;
  athletes: BaseballLiveAthleteRow[];
  queues: BaseballLiveQueues;
  /** Active strength-group filter options (id + name) for the top bar. */
  groups: Array<{ id: string; name: string }>;
  readiness_withheld: boolean;
  /** ISO timestamp this snapshot was computed (drives the "last refreshed" pill). */
  generated_at: string;
}

/** A transparent readiness computation (spec L631-638; never medical). */
export interface BaseballReadinessComputation {
  player_id: string;
  band: BaseballReadinessBand;
  /** Human-readable reasons that drove the band — each cites an input. */
  reasons: string[];
  /** Inputs that were missing/stale (honesty: never emit a false "high"). */
  missing_inputs: string[];
  stale: boolean;
  /** 'low' when box-score-only / sparse roster context — never a false "high". */
  confidence: 'low' | 'moderate' | 'high';
  suggested_action: string | null;
}
