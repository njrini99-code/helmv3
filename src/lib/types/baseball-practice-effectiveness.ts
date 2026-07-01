// =============================================================================
// src/lib/types/baseball-practice-effectiveness.ts
//
// Packet: practice-effectiveness (BaseballHelm CoachHelm Engine)
//
// HAND-WRITTEN Row/Insert/Update types for the practice-effectiveness tables
// created by supabase/migrations/20260624000094_baseball_practice_effectiveness.sql.
// We cannot db:types regen in this environment (no live apply; prod GolfHelm
// shares the DB), so these mirror the migration DDL byte-for-byte and are the
// single source of truth for the feature until a re-export is wired into the
// generated types by the integration agent. Do NOT edit src/lib/types/index.ts
// or baseball-extended.ts here (file-ownership rule).
//
// SQL -> TS mapping:
//   text            -> string
//   numeric         -> number
//   integer         -> number
//   boolean         -> boolean
//   uuid[]          -> string[]
//   jsonb           -> BaseballJson
//   timestamptz     -> string (ISO)
//   NOT NULL DEFAULT-> required in Row, optional in Insert
//   NULLable        -> `| null`
// =============================================================================

import type { BaseballJson } from '@/lib/types/baseball-coachhelm';

// ---- Enums (mirror the CHECK constraints in the migration) -----------------

/** baseball_practice_block_objectives.completion_status */
export type BaseballObjectiveCompletionStatus =
  | 'planned'
  | 'completed'
  | 'partial'
  | 'skipped';

/** baseball_practice_block_objectives.source_type */
export type BaseballObjectiveSourceType =
  | 'manual'
  | 'csv_import'
  | 'integration'
  | 'system';

/**
 * baseball_practice_effectiveness_reviews.direction — the OBSERVED movement,
 * resolved through the metric registry's improvement sign (never inferred from a
 * raw delta). 'too_early' = an after-window exists but is too soon to read;
 * 'insufficient_sample' = not enough observations; 'not_tracked' = the focus has
 * no consistently-tracked metric. A review NEVER carries a "proven"/"high" word.
 */
export type BaseballEffectivenessDirection =
  | 'improved'
  | 'stable'
  | 'worse'
  | 'insufficient_sample'
  | 'too_early'
  | 'not_tracked';

/** The scope the AFTER metric was measured on (labeled, never silently mixed). */
export type BaseballEffectivenessAfterScope =
  | 'official_game'
  | 'scrimmage'
  | 'practice'
  | 'mixed'
  | 'unknown';

/**
 * The honesty TIER stored alongside numeric confidence. A practice-effectiveness
 * review is, by design, NEVER allowed to claim proof — the strongest honest
 * statement is 'correlated_not_proven'.
 *   - 'too_early'             — too soon after practice to read transfer.
 *   - 'not_enough_sample'     — before/after sample too thin to trust.
 *   - 'correlated_not_proven' — a real, sample-backed association; NOT causation.
 *   - 'no_signal'             — measured, but no meaningful movement either way.
 */
export type BaseballEffectivenessConfidenceTier =
  | 'too_early'
  | 'not_enough_sample'
  | 'correlated_not_proven'
  | 'no_signal';

/** baseball_practice_effectiveness_reviews.visibility */
export type BaseballEffectivenessVisibility =
  | 'staff_only'
  | 'player_visible'
  | 'restricted';

/** baseball_practice_effectiveness_reviews.disposition */
export type BaseballEffectivenessDisposition =
  | 'new'
  | 'dismissed'
  | 'resolved'
  | 'converted_to_task';

/**
 * baseball_practice_effectiveness_reviews.verdict — the coach's ORTHOGONAL
 * outcome call, set only when the coach resolves a review (disposition is
 * the workflow state; verdict is what they concluded). Null until resolved.
 */
export type BaseballEffectivenessVerdict =
  | 'worked'
  | 'needs_more_time'
  | 'not_enough_data';

// ---- baseball_practice_block_objectives ------------------------------------

export interface BaseballPracticeBlockObjectiveRow {
  id: string;
  team_id: string;
  practice_id: string;
  block_id: string | null;
  focus_area: string;
  objective: string | null;
  target_metric: string | null;
  player_ids: string[];
  completion_status: BaseballObjectiveCompletionStatus;
  reps_planned: number | null;
  reps_completed: number | null;
  reps_graded_correct: number | null;
  notes: string | null;
  video_url: string | null;
  source_type: BaseballObjectiveSourceType;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BaseballPracticeBlockObjectiveInsert {
  id?: string;
  team_id: string;
  practice_id: string;
  block_id?: string | null;
  focus_area: string;
  objective?: string | null;
  target_metric?: string | null;
  player_ids?: string[];
  completion_status?: BaseballObjectiveCompletionStatus;
  reps_planned?: number | null;
  reps_completed?: number | null;
  reps_graded_correct?: number | null;
  notes?: string | null;
  video_url?: string | null;
  source_type?: BaseballObjectiveSourceType;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface BaseballPracticeBlockObjectiveUpdate {
  id?: string;
  team_id?: string;
  practice_id?: string;
  block_id?: string | null;
  focus_area?: string;
  objective?: string | null;
  target_metric?: string | null;
  player_ids?: string[];
  completion_status?: BaseballObjectiveCompletionStatus;
  reps_planned?: number | null;
  reps_completed?: number | null;
  reps_graded_correct?: number | null;
  notes?: string | null;
  video_url?: string | null;
  source_type?: BaseballObjectiveSourceType;
  updated_at?: string | null;
}

// ---- baseball_practice_effectiveness_reviews -------------------------------

export interface BaseballEffectivenessReviewRow {
  id: string;
  team_id: string;
  practice_id: string;
  objective_id: string | null;
  focus_area: string;
  metric_id: string | null;
  player_ids: string[];
  linked_signal_ids: string[];
  metric_before: number | null;
  metric_after: number | null;
  sample_before: number;
  sample_after: number;
  window_before_days: number;
  window_after_days: number;
  direction: BaseballEffectivenessDirection;
  after_scope: BaseballEffectivenessAfterScope;
  confidence: number | null;
  confidence_tier: BaseballEffectivenessConfidenceTier;
  /** Array of EffectivenessConfounder at the app layer. */
  confounders: BaseballJson;
  conclusion: string;
  /** RecommendedAction shape ({ label, type, owner_role }) at the app layer. */
  recommended_next_action: BaseballJson | null;
  /** BaseballInsightSourceRef[] at the app layer. */
  source_refs: BaseballJson;
  visibility: BaseballEffectivenessVisibility;
  disposition: BaseballEffectivenessDisposition;
  /** Coach's outcome verdict, set only once resolved; null otherwise. */
  verdict: BaseballEffectivenessVerdict | null;
  generated_by: string | null;
  generated_by_model: string | null;
  generated_at: string;
  expires_at: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BaseballEffectivenessReviewInsert {
  id?: string;
  team_id: string;
  practice_id: string;
  objective_id?: string | null;
  focus_area: string;
  metric_id?: string | null;
  player_ids?: string[];
  linked_signal_ids?: string[];
  metric_before?: number | null;
  metric_after?: number | null;
  sample_before?: number;
  sample_after?: number;
  window_before_days?: number;
  window_after_days?: number;
  direction?: BaseballEffectivenessDirection;
  after_scope?: BaseballEffectivenessAfterScope;
  confidence?: number | null;
  confidence_tier?: BaseballEffectivenessConfidenceTier;
  confounders?: BaseballJson;
  conclusion: string;
  recommended_next_action?: BaseballJson | null;
  source_refs?: BaseballJson;
  visibility?: BaseballEffectivenessVisibility;
  disposition?: BaseballEffectivenessDisposition;
  verdict?: BaseballEffectivenessVerdict | null;
  generated_by?: string | null;
  generated_by_model?: string | null;
  generated_at?: string;
  expires_at?: string | null;
  dedupe_key?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface BaseballEffectivenessReviewUpdate {
  disposition?: BaseballEffectivenessDisposition;
  verdict?: BaseballEffectivenessVerdict | null;
  visibility?: BaseballEffectivenessVisibility;
  conclusion?: string;
  recommended_next_action?: BaseballJson | null;
  updated_at?: string | null;
}

// ---- App-layer structured shapes carried in jsonb columns ------------------

/**
 * One machine-coded confounder + human reason. The engine never claims the
 * practice caused the movement; it records what ELSE could explain it. Codes
 * map 1:1 onto the V7 "CoachHelm cannot know" list.
 */
export type EffectivenessConfounderCode =
  | 'small_sample'
  | 'no_before_window'
  | 'no_after_window'
  | 'too_early'
  | 'attendance_gap' // player did not attend / was limited
  | 'opponent_or_context_changed'
  | 'metric_inconsistent' // metric not tracked consistently
  | 'mixed_scope' // before/after pulled from different scopes
  | 'source_missing';

export interface EffectivenessConfounder {
  code: EffectivenessConfounderCode;
  reason: string;
}

/** The recommended-next-action shape stored in recommended_next_action jsonb. */
export interface EffectivenessRecommendedAction {
  /** Human label, e.g. "Repeat the two-strike station next practice". */
  label: string;
  /**
   * The V7 follow-up taxonomy mapped onto the binding AI action types
   * (task|note|practice_adjustment|meeting_topic|none).
   *   repeat / progress / regress / change_setup / add_video -> practice_adjustment
   *   move_to_individual_task                                 -> task
   *   cut_from_next_practice                                  -> practice_adjustment
   */
  type: 'task' | 'note' | 'practice_adjustment' | 'meeting_topic' | 'none';
  /** The V7 follow-up verb (kept distinct so the UI can label it precisely). */
  follow_up:
    | 'repeat'
    | 'progress'
    | 'regress'
    | 'move_to_individual_task'
    | 'cut_from_next_practice'
    | 'add_video_review'
    | 'change_station_setup'
    | 'keep_monitoring';
  owner_role: string;
}

/** A review enriched with the practice title for the dashboard read. */
export interface BaseballEffectivenessReviewWithContext
  extends BaseballEffectivenessReviewRow {
  practice_title: string | null;
  practice_status: string | null;
}
