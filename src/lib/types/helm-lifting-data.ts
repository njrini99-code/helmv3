// =============================================================================
// src/lib/types/helm-lifting-data.ts
//
// HAND-WRITTEN Row/Insert/Update types for the Helm Lifting Lab DATA tables
// created by:
//   supabase/migrations/20260625000010_helm_lifting_data_library_programs.sql
//   supabase/migrations/20260625000020_helm_lifting_data_sessions_readiness.sql
//
// Structurally cloned from src/lib/types/baseball-lifting-v11.ts with:
//   * organization_id + sport replacing team_id-only scope
//   * athlete_id replacing player_id
//   * sport_context replacing baseball_context
//   * sport_constraints replacing baseball_constraints
//   * sport_tags replacing baseball_tags
//   * legacy_baseball_id added (nullable, for backfill traceability)
//   * helm_lifting_coaches (not baseball_coaches) for created_by_coach_id
//
// These are the type contract until a post-apply `db:types` regen. Actions use
// fromUntyped() from src/lib/supabase/untyped.ts.
// =============================================================================

import type { Json } from '@/lib/types';
import type { HelmLiftingSport } from './helm-lifting';

// -----------------------------------------------------------------------------
// String-enum vocabularies (mirror CHECK constraints in the migrations)
// -----------------------------------------------------------------------------

export type HelmLiftingGroupType = 'static' | 'dynamic' | 'imported' | 'temporary';
export type HelmLiftingGroupMemberSource = 'manual' | 'rule' | 'import';

export type HelmLiftingExerciseCategory =
  | 'warmup' | 'power' | 'strength' | 'accessory' | 'arm_care'
  | 'mobility' | 'conditioning' | 'recovery' | 'test';
export type HelmLiftingPrimaryPattern =
  | 'squat' | 'hinge' | 'push' | 'pull' | 'carry' | 'rotate' | 'anti_rotate'
  | 'sprint' | 'jump' | 'throw' | 'shoulder' | 'elbow' | 'hip' | 'ankle';
export type HelmLiftingBodyRegion = 'lower' | 'upper' | 'trunk' | 'arm' | 'full_body';
export type HelmLiftingUnit =
  | 'lb' | 'kg' | 'bodyweight' | 'seconds' | 'yards' | 'reps' | 'mph' | 'watts' | 'mps';

export type HelmLiftingProgramPhase =
  | 'fall' | 'winter' | 'preseason' | 'in_season' | 'postseason'
  | 'summer' | 'return_to_play' | 'testing';
export type HelmLiftingProgramGoal =
  | 'strength' | 'power' | 'hypertrophy' | 'speed' | 'maintenance'
  | 'recovery' | 'arm_care' | 'testing';
export type HelmLiftingProgramVisibility = 'staff_only' | 'assigned_players';
export type HelmLiftingProgramStatus = 'draft' | 'active' | 'archived';

export type HelmLiftingDayType =
  | 'lower' | 'upper' | 'full_body' | 'recovery' | 'arm_care'
  | 'conditioning' | 'testing' | 'custom';
export type HelmLiftingSectionType =
  | 'warmup' | 'movement_prep' | 'power' | 'main_strength'
  | 'accessory' | 'arm_care' | 'mobility' | 'conditioning';
export type HelmLiftingPrescriptionType =
  | 'fixed' | 'percent_1rm' | 'rpe' | 'velocity' | 'coach_load' | 'player_select';

export type HelmLiftingAssignmentTargetType = 'team' | 'group' | 'player';
export type HelmLiftingProgramAssignmentStatus = 'draft' | 'published' | 'cancelled';

export type HelmLiftingSessionStatus =
  | 'assigned' | 'started' | 'completed' | 'missed' | 'excused' | 'modified';
export type HelmLiftingSessionReviewStatus = 'none' | 'needs_review' | 'reviewed';
export type HelmLiftingSessionExerciseStatus =
  | 'assigned' | 'completed' | 'skipped' | 'substituted';

export type HelmLiftingSorenessSide = 'left' | 'right' | 'both' | 'center';
export type HelmLiftingBodyweightSource = 'player' | 'coach' | 'import';
export type HelmLiftingAvailabilityStatus =
  | 'available' | 'limited' | 'hold' | 'return_to_play' | 'unavailable';
export type HelmLiftingAvailabilityReason =
  | 'soreness' | 'illness' | 'injury_note' | 'academic' | 'travel' | 'coach_decision' | 'other';
export type HelmLiftingVisibility = 'staff' | 'performance_staff' | 'head_coach_only';

export type HelmLiftingMaxType =
  | 'estimated_1rm' | 'tested_1rm' | 'training_max' | 'velocity_profile';
export type HelmLiftingMaxSource =
  | 'coach_test' | 'player_entry' | 'import' | 'calculated';
export type HelmLiftingPrType = 'load' | 'reps' | 'estimated_1rm' | 'velocity' | 'volume';

export type HelmLiftingImportSource =
  | 'teambuildr' | 'trainheroic' | 'bridge' | 'volt' | 'google_sheets' | 'csv' | 'manual';
export type HelmLiftingImportKind =
  | 'lift_assignment' | 'lift_result' | 'testing' | 'wellness' | 'attendance';
export type HelmLiftingImportStatus =
  | 'staged' | 'validated' | 'committed' | 'rolled_back' | 'failed';
export type HelmLiftingImportConfidence = 'verified' | 'reported' | 'inferred';

export type HelmLiftingReadinessBand =
  | 'green' | 'yellow' | 'orange_lower' | 'orange_upper' | 'red' | 'blue';

// -----------------------------------------------------------------------------
// Exercise library + substitutions
// -----------------------------------------------------------------------------

export interface HelmLiftingExerciseRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  created_by_coach_id: string | null;
  name: string;
  category: HelmLiftingExerciseCategory;
  primary_pattern: HelmLiftingPrimaryPattern | null;
  body_region: HelmLiftingBodyRegion | null;
  equipment: string | null;
  unilateral: boolean;
  sport_constraints: Json;
  sport_tags: string[];
  default_unit: HelmLiftingUnit;
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
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingExerciseInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  created_by_coach_id?: string | null;
  name: string;
  category?: HelmLiftingExerciseCategory;
  primary_pattern?: HelmLiftingPrimaryPattern | null;
  body_region?: HelmLiftingBodyRegion | null;
  equipment?: string | null;
  unilateral?: boolean;
  sport_constraints?: Json;
  sport_tags?: string[];
  default_unit?: HelmLiftingUnit;
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
  legacy_baseball_id?: string | null;
}

export type HelmLiftingExerciseUpdate = Partial<HelmLiftingExerciseInsert> & { updated_at?: string };

export interface HelmLiftingExerciseSubstitutionRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  exercise_id: string;
  substitute_exercise_id: string;
  reason: string | null;
  created_by_coach_id: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingExerciseSubstitutionInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  exercise_id: string;
  substitute_exercise_id: string;
  reason?: string | null;
  created_by_coach_id?: string | null;
  legacy_baseball_id?: string | null;
}

// -----------------------------------------------------------------------------
// Strength groups + members
// -----------------------------------------------------------------------------

export interface HelmLiftingGroupRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id: string | null;
  name: string;
  description: string | null;
  group_type: HelmLiftingGroupType;
  rule_json: Json;
  created_by_coach_id: string | null;
  is_active: boolean;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingGroupInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id?: string | null;
  name: string;
  description?: string | null;
  group_type?: HelmLiftingGroupType;
  rule_json?: Json;
  created_by_coach_id?: string | null;
  is_active?: boolean;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingGroupUpdate = Partial<HelmLiftingGroupInsert> & { updated_at?: string };

export interface HelmLiftingGroupMemberRow {
  id: string;
  group_id: string;
  athlete_id: string;
  source: HelmLiftingGroupMemberSource;
  added_by_coach_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingGroupMemberInsert {
  id?: string;
  group_id: string;
  athlete_id: string;
  source?: HelmLiftingGroupMemberSource;
  added_by_coach_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  legacy_baseball_id?: string | null;
}

// -----------------------------------------------------------------------------
// Program model
// -----------------------------------------------------------------------------

export interface HelmLiftingProgramRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id: string | null;
  name: string;
  description: string | null;
  phase: HelmLiftingProgramPhase;
  goal: HelmLiftingProgramGoal;
  created_by_coach_id: string | null;
  visibility: HelmLiftingProgramVisibility;
  status: HelmLiftingProgramStatus;
  is_template: boolean;
  start_date: string | null;
  end_date: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingProgramInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id?: string | null;
  name: string;
  description?: string | null;
  phase?: HelmLiftingProgramPhase;
  goal?: HelmLiftingProgramGoal;
  created_by_coach_id?: string | null;
  visibility?: HelmLiftingProgramVisibility;
  status?: HelmLiftingProgramStatus;
  is_template?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingProgramUpdate = Partial<HelmLiftingProgramInsert> & { updated_at?: string };

export interface HelmLiftingWeekRow {
  id: string;
  program_id: string;
  week_number: number;
  name: string | null;
  theme: string | null;
  deload: boolean;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingWeekInsert {
  id?: string;
  program_id: string;
  week_number: number;
  name?: string | null;
  theme?: string | null;
  deload?: boolean;
  legacy_baseball_id?: string | null;
}

export interface HelmLiftingDayRow {
  id: string;
  week_id: string;
  day_number: number;
  name: string | null;
  day_type: HelmLiftingDayType;
  sport_context: string | null;
  estimated_minutes: number | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingDayInsert {
  id?: string;
  week_id: string;
  day_number: number;
  name?: string | null;
  day_type?: HelmLiftingDayType;
  sport_context?: string | null;
  estimated_minutes?: number | null;
  legacy_baseball_id?: string | null;
}

export interface HelmLiftingSectionRow {
  id: string;
  lift_day_id: string;
  section_order: number;
  name: string;
  section_type: HelmLiftingSectionType;
  instructions: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingSectionInsert {
  id?: string;
  lift_day_id: string;
  section_order?: number;
  name: string;
  section_type?: HelmLiftingSectionType;
  instructions?: string | null;
  legacy_baseball_id?: string | null;
}

export interface HelmLiftingPrescriptionRow {
  id: string;
  section_id: string;
  exercise_id: string | null;
  order_index: number;
  prescription_type: HelmLiftingPrescriptionType;
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
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingPrescriptionInsert {
  id?: string;
  section_id: string;
  exercise_id?: string | null;
  order_index?: number;
  prescription_type?: HelmLiftingPrescriptionType;
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
  legacy_baseball_id?: string | null;
}

// -----------------------------------------------------------------------------
// Program assignments + materialized sessions
// -----------------------------------------------------------------------------

export interface HelmLiftingProgramAssignmentRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id: string | null;
  program_id: string;
  lift_day_id: string;
  assigned_by_coach_id: string | null;
  assignment_type: HelmLiftingAssignmentTargetType;
  group_id: string | null;
  athlete_id: string | null;
  scheduled_date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: HelmLiftingProgramAssignmentStatus;
  player_visible_at: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingProgramAssignmentInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id?: string | null;
  program_id: string;
  lift_day_id: string;
  assigned_by_coach_id?: string | null;
  assignment_type?: HelmLiftingAssignmentTargetType;
  group_id?: string | null;
  athlete_id?: string | null;
  scheduled_date: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status?: HelmLiftingProgramAssignmentStatus;
  player_visible_at?: string | null;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingProgramAssignmentUpdate =
  Partial<HelmLiftingProgramAssignmentInsert> & { updated_at?: string };

export interface HelmLiftingSessionRow {
  id: string;
  program_assignment_id: string | null;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id: string | null;
  athlete_id: string;
  title: string | null;
  day_type: string | null;
  sport_context: string | null;
  scheduled_date: string;
  estimated_minutes: number | null;
  status: HelmLiftingSessionStatus;
  started_at: string | null;
  completed_at: string | null;
  readiness_checkin_id: string | null;
  coach_review_status: HelmLiftingSessionReviewStatus;
  player_note: string | null;
  coach_note: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingSessionInsert {
  id?: string;
  program_assignment_id?: string | null;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id?: string | null;
  athlete_id: string;
  title?: string | null;
  day_type?: string | null;
  sport_context?: string | null;
  scheduled_date: string;
  estimated_minutes?: number | null;
  status?: HelmLiftingSessionStatus;
  started_at?: string | null;
  completed_at?: string | null;
  readiness_checkin_id?: string | null;
  coach_review_status?: HelmLiftingSessionReviewStatus;
  player_note?: string | null;
  coach_note?: string | null;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingSessionUpdate = Partial<HelmLiftingSessionInsert> & { updated_at?: string };

export interface HelmLiftingSessionExerciseRow {
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
  status: HelmLiftingSessionExerciseStatus;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingSessionExerciseInsert {
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
  status?: HelmLiftingSessionExerciseStatus;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingSessionExerciseUpdate =
  Partial<HelmLiftingSessionExerciseInsert> & { updated_at?: string };

export interface HelmLiftingSetResultRow {
  id: string;
  session_exercise_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
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
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingSetResultInsert {
  id?: string;
  session_exercise_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
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
  legacy_baseball_id?: string | null;
}

// -----------------------------------------------------------------------------
// Readiness family
// -----------------------------------------------------------------------------

export interface HelmLiftingReadinessCheckinRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  checkin_date: string;
  sleep_quality: number | null;
  energy_level: number | null;
  soreness_overall: number | null;
  stress_level: number | null;
  lower_body_status: number | null;
  illness_flag: boolean;
  mood: number | null;
  notes: string | null;
  readiness_score: number | null;
  readiness_band: HelmLiftingReadinessBand | null;
  lift_session_id: string | null;
  visibility: HelmLiftingVisibility;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingReadinessCheckinInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  checkin_date: string;
  sleep_quality?: number | null;
  energy_level?: number | null;
  soreness_overall?: number | null;
  stress_level?: number | null;
  lower_body_status?: number | null;
  illness_flag?: boolean;
  mood?: number | null;
  notes?: string | null;
  readiness_score?: number | null;
  readiness_band?: HelmLiftingReadinessBand | null;
  lift_session_id?: string | null;
  visibility?: HelmLiftingVisibility;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingReadinessCheckinUpdate =
  Partial<HelmLiftingReadinessCheckinInsert> & { updated_at?: string };

export interface HelmLiftingSorenessMapRow {
  id: string;
  checkin_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  body_region: string;
  side: HelmLiftingSorenessSide;
  severity: number;
  note: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingSorenessMapInsert {
  id?: string;
  checkin_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  body_region: string;
  side?: HelmLiftingSorenessSide;
  severity?: number;
  note?: string | null;
  legacy_baseball_id?: string | null;
}

export interface HelmLiftingBodyweightEntryRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  entry_date: string;
  weight_lbs: number;
  source: HelmLiftingBodyweightSource;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingBodyweightEntryInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  entry_date: string;
  weight_lbs: number;
  source?: HelmLiftingBodyweightSource;
  legacy_baseball_id?: string | null;
}

export interface HelmLiftingAvailabilityStatusRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  status: HelmLiftingAvailabilityStatus;
  reason_category: HelmLiftingAvailabilityReason | null;
  note: string | null;
  visibility: HelmLiftingVisibility;
  starts_at: string;
  ends_at: string | null;
  created_by_coach_id: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingAvailabilityStatusInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  status?: HelmLiftingAvailabilityStatus;
  reason_category?: HelmLiftingAvailabilityReason | null;
  note?: string | null;
  visibility?: HelmLiftingVisibility;
  starts_at?: string;
  ends_at?: string | null;
  created_by_coach_id?: string | null;
  legacy_baseball_id?: string | null;
}

// -----------------------------------------------------------------------------
// Progression
// -----------------------------------------------------------------------------

export interface HelmLiftingMaxRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  exercise_id: string;
  max_type: HelmLiftingMaxType;
  value: number;
  unit: string;
  test_date: string | null;
  source: HelmLiftingMaxSource;
  confidence: number | null;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingMaxInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  exercise_id: string;
  max_type?: HelmLiftingMaxType;
  value: number;
  unit?: string;
  test_date?: string | null;
  source?: HelmLiftingMaxSource;
  confidence?: number | null;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingMaxUpdate = Partial<HelmLiftingMaxInsert> & { updated_at?: string };

export interface HelmLiftingPrRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  exercise_id: string;
  pr_type: HelmLiftingPrType;
  value: number;
  unit: string;
  achieved_at: string;
  lift_session_id: string | null;
  verified_by_coach_id: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingPrInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  athlete_id: string;
  exercise_id: string;
  pr_type?: HelmLiftingPrType;
  value: number;
  unit?: string;
  achieved_at?: string;
  lift_session_id?: string | null;
  verified_by_coach_id?: string | null;
  legacy_baseball_id?: string | null;
}

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

export interface HelmLiftingImportRunRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  created_by_coach_id: string | null;
  source: HelmLiftingImportSource;
  import_kind: HelmLiftingImportKind;
  file_name: string | null;
  file_hash: string | null;
  mapping_json: Json;
  units_json: Json;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  status: HelmLiftingImportStatus;
  source_confidence: HelmLiftingImportConfidence;
  committed_at: string | null;
  rolled_back_at: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingImportRunInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  created_by_coach_id?: string | null;
  source?: HelmLiftingImportSource;
  import_kind?: HelmLiftingImportKind;
  file_name?: string | null;
  file_hash?: string | null;
  mapping_json?: Json;
  units_json?: Json;
  total_rows?: number;
  matched_rows?: number;
  unmatched_rows?: number;
  status?: HelmLiftingImportStatus;
  source_confidence?: HelmLiftingImportConfidence;
  committed_at?: string | null;
  rolled_back_at?: string | null;
  legacy_baseball_id?: string | null;
}

export type HelmLiftingImportRunUpdate = Partial<HelmLiftingImportRunInsert> & { updated_at?: string };

export interface HelmLiftingImportRowRow {
  id: string;
  import_run_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  row_number: number;
  raw_json: Json;
  matched_athlete_id: string | null;
  match_status: 'matched' | 'unmatched' | 'ambiguous' | 'skipped';
  validation_error: string | null;
  legacy_baseball_id: string | null;
  created_at: string;
}

export interface HelmLiftingImportRowInsert {
  id?: string;
  import_run_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  row_number: number;
  raw_json?: Json;
  matched_athlete_id?: string | null;
  match_status?: 'matched' | 'unmatched' | 'ambiguous' | 'skipped';
  validation_error?: string | null;
  legacy_baseball_id?: string | null;
}

// -----------------------------------------------------------------------------
// Composed view-models (no DB row — server-assembled)
// -----------------------------------------------------------------------------

/** A materialized session joined with its exercises (player execution surface). */
export interface HelmLiftingSessionWithExercises extends HelmLiftingSessionRow {
  exercises: Array<HelmLiftingSessionExerciseRow & { sets: HelmLiftingSetResultRow[] }>;
}

/** One athlete on the Live Weight Room grid. */
export interface HelmLiftingLiveAthleteRow {
  session_id: string;
  athlete_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  sport: HelmLiftingSport;
  group_names: string[];
  session_status: HelmLiftingSessionStatus;
  readiness_band: HelmLiftingReadinessBand | null;
  availability_status: HelmLiftingAvailabilityStatus | null;
  current_exercise: string | null;
  prescribed_load: number | null;
  actual_load: number | null;
  rpe: number | null;
  last_update: string | null;
  has_load_change: boolean;
  needs_coach: boolean;
  exercises: HelmLiftingSessionExerciseRow[];
  total_exercises: number;
  completed_exercises: number;
}
