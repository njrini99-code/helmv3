// =============================================================================
// src/lib/types/baseball-lifting.ts
//
// Wave 9 / performance-lifting packet.
//
// HAND-WRITTEN Row/Insert/Update types for the four Performance / Lifting tables
// added by:
//   supabase/migrations/20260624000061_baseball_lifting_performance.sql
//
// We cannot regenerate database.ts (no live apply in this environment), so these
// mirror the migration DDL exactly. A single integration agent re-exports these
// from the type barrel later — do NOT edit src/lib/types/index.ts here.
//
//   - baseball_exercises
//   - baseball_lift_assignments
//   - baseball_lift_results
//   - baseball_readiness_checkins
//
// Convention matches the generated supabase rows: every column present on Row;
// Insert makes DB-defaulted / nullable columns optional; Update makes all
// columns optional.
// =============================================================================

import type { Json } from '@/lib/types';

// -----------------------------------------------------------------------------
// String-enum vocabularies (mirror the CHECK constraints in the migration)
// -----------------------------------------------------------------------------

/** baseball_lift_assignments.status */
export type BaseballLiftAssignmentStatus =
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'archived';

/** baseball_lift_results.source — lineage of the row. */
export type BaseballLiftResultSource = 'manual' | 'import' | 'system';

/** baseball_readiness_checkins.arm_status — health-ADJACENT, not a diagnosis. */
export type BaseballReadinessArmStatus =
  | 'fresh'
  | 'normal'
  | 'tight'
  | 'sore'
  | 'pain';

// -----------------------------------------------------------------------------
// baseball_exercises
// -----------------------------------------------------------------------------

export interface BaseballExerciseRow {
  id: string;
  /** NULL for global library rows; required for team rows. */
  team_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  is_global: boolean;
  created_by_coach_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballExerciseInsert {
  id?: string;
  team_id?: string | null;
  name: string;
  category?: string | null;
  description?: string | null;
  is_global?: boolean;
  created_by_coach_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BaseballExerciseUpdate {
  id?: string;
  team_id?: string | null;
  name?: string;
  category?: string | null;
  description?: string | null;
  is_global?: boolean;
  created_by_coach_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

// -----------------------------------------------------------------------------
// baseball_lift_assignments
// -----------------------------------------------------------------------------

/**
 * Structured prescription stored in the `prescription` jsonb column. All fields
 * optional — the migration column has no per-key shape, this is the app-side
 * contract the actions write/read.
 */
export interface BaseballLiftPrescription {
  sets?: number;
  reps?: number;
  weight?: number;
  intensity_pct?: number;
  rest_seconds?: number;
  tempo?: string;
  notes?: string;
  [key: string]: Json | undefined;
}

export interface BaseballLiftAssignmentRow {
  id: string;
  team_id: string;
  /** NULL when the assignment targets a group via group_scope. */
  player_id: string | null;
  /** Array of player ids when assigning to a scoped group. */
  group_scope: string[] | null;
  assigned_by_coach_id: string | null;
  exercise_id: string | null;
  title: string | null;
  due_date: string | null;
  prescription: Json;
  status: BaseballLiftAssignmentStatus;
  created_at: string;
  updated_at: string;
}

export interface BaseballLiftAssignmentInsert {
  id?: string;
  team_id: string;
  player_id?: string | null;
  group_scope?: string[] | null;
  assigned_by_coach_id?: string | null;
  exercise_id?: string | null;
  title?: string | null;
  due_date?: string | null;
  prescription?: Json;
  status?: BaseballLiftAssignmentStatus;
  created_at?: string;
  updated_at?: string;
}

export interface BaseballLiftAssignmentUpdate {
  id?: string;
  team_id?: string;
  player_id?: string | null;
  group_scope?: string[] | null;
  assigned_by_coach_id?: string | null;
  exercise_id?: string | null;
  title?: string | null;
  due_date?: string | null;
  prescription?: Json;
  status?: BaseballLiftAssignmentStatus;
  created_at?: string;
  updated_at?: string;
}

// -----------------------------------------------------------------------------
// baseball_lift_results
// -----------------------------------------------------------------------------

export interface BaseballLiftResultRow {
  id: string;
  team_id: string;
  player_id: string;
  assignment_id: string | null;
  exercise_id: string | null;
  performed_at: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  notes: string | null;
  source: BaseballLiftResultSource;
  import_run_id: string | null;
  created_at: string;
}

export interface BaseballLiftResultInsert {
  id?: string;
  team_id: string;
  player_id: string;
  assignment_id?: string | null;
  exercise_id?: string | null;
  performed_at?: string;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  notes?: string | null;
  source?: BaseballLiftResultSource;
  import_run_id?: string | null;
  created_at?: string;
}

export interface BaseballLiftResultUpdate {
  id?: string;
  team_id?: string;
  player_id?: string;
  assignment_id?: string | null;
  exercise_id?: string | null;
  performed_at?: string;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  notes?: string | null;
  source?: BaseballLiftResultSource;
  import_run_id?: string | null;
  created_at?: string;
}

// -----------------------------------------------------------------------------
// baseball_readiness_checkins
// -----------------------------------------------------------------------------

export interface BaseballReadinessCheckinRow {
  id: string;
  team_id: string;
  player_id: string;
  check_date: string;
  sleep_hours: number | null;
  /** 1 (low) .. 5 (high) */
  energy_level: number | null;
  /** 1 (none) .. 5 (severe) */
  soreness_level: number | null;
  arm_status: BaseballReadinessArmStatus | null;
  mood: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballReadinessCheckinInsert {
  id?: string;
  team_id: string;
  player_id: string;
  check_date: string;
  sleep_hours?: number | null;
  energy_level?: number | null;
  soreness_level?: number | null;
  arm_status?: BaseballReadinessArmStatus | null;
  mood?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BaseballReadinessCheckinUpdate {
  id?: string;
  team_id?: string;
  player_id?: string;
  check_date?: string;
  sleep_hours?: number | null;
  energy_level?: number | null;
  soreness_level?: number | null;
  arm_status?: BaseballReadinessArmStatus | null;
  mood?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

// -----------------------------------------------------------------------------
// Composed / view-model helpers used by the performance UI (no DB row).
// -----------------------------------------------------------------------------

/** An assignment joined with its exercise + the player's latest result. */
export interface BaseballLiftAssignmentWithDetail extends BaseballLiftAssignmentRow {
  exercise: Pick<BaseballExerciseRow, 'id' | 'name' | 'category'> | null;
  latest_result: BaseballLiftResultRow | null;
}

/** A roster player's readiness summary for the strength-coach dashboard. */
export interface BaseballReadinessSummary {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  latest_checkin: BaseballReadinessCheckinRow | null;
}
