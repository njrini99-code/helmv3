// =============================================================================
// src/lib/types/baseball-signals.ts
//
// Hand-written TypeScript types for the Signal Inbox + Action Conversion Engine
// added by:
//   supabase/migrations/20260624000092_baseball_signals_and_actions.sql
//
// WHY THIS FILE EXISTS
//   The generated src/lib/types/database.ts is regenerated from the live DB and
//   does NOT reflect the freshly-written-but-not-yet-applied signals/actions
//   migration (we cannot db:types regen — no live apply; prod GolfHelm shares
//   the DB). This file hand-mirrors the EXACT column names/types the migration
//   adds, so the signals read model + actions write layer compile today.
//
//   Column names/types here match the SQL byte-for-byte:
//     SQL text        -> string
//     SQL numeric     -> number
//     SQL integer     -> number
//     SQL boolean     -> boolean
//     SQL jsonb       -> BaseballJson
//     SQL timestamptz -> string (ISO timestamp)
//     SQL date        -> string (ISO date YYYY-MM-DD)
//     NOT NULL DEFAULT-> required in Row, optional in Insert
//     NULLable        -> `| null`
//
// OWNERSHIP: this file belongs to the signal-inbox packet. It does NOT touch
// baseball-coachhelm.ts (engine task) or src/lib/types/index.ts (integration
// agent wires the single re-export).
// =============================================================================

import type { BaseballJson } from '@/lib/types/baseball-coachhelm';
import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

export type { BaseballJson };

// -----------------------------------------------------------------------------
// Enums (string-CHECK unions — match the migration's CHECK constraints exactly)
// -----------------------------------------------------------------------------

/** Severity bucket — V10 Signal Stack grouping. */
export type BaseballSignalSeverity = 'critical' | 'warning' | 'info';

/**
 * Triage lifecycle. `sample_too_small` is FIRST-CLASS (V10 §Signals): a
 * source-starved signal is never shown as authoritative.
 */
export type BaseballSignalDisposition =
  | 'new'
  | 'acknowledged'
  | 'sample_too_small'
  | 'converted'
  | 'dismissed'
  | 'resolved'
  | 'expired';

/** Visibility ladder — mirrors the timeline. Strictest wins. */
export type BaseballSignalVisibility = 'team' | 'player_only' | 'staff_only';

/** Provenance kind of the signal itself (maps to source-record SourceKind). */
export type BaseballSignalSourceKind =
  | 'manual'
  | 'csv_import'
  | 'integration'
  | 'ai'
  | 'system'
  | 'unknown';

/** Useful / not-useful / wrong feedback (V10 §Interactions). */
export type BaseballSignalFeedback = 'useful' | 'not_useful' | 'wrong';

/**
 * Signal categories — V10 §Signals category list (recalibrated for baseball;
 * no golf labels). The recommended-action type a signal converts into is the
 * narrower {@link BaseballActionType} + 'none'.
 */
export type BaseballSignalCategory =
  | 'hitting'
  | 'pitching'
  | 'catching'
  | 'defense'
  | 'baserunning'
  | 'strength'
  | 'readiness'
  | 'workload'
  | 'practice'
  | 'academics'
  | 'operations'
  | 'recruiting'
  | 'import_quality'
  | 'video_evidence'
  | 'roster';

/** Subsystem an action targets — V9 Action Conversion Map. */
export type BaseballActionType =
  | 'practice_block'
  | 'player_task'
  | 'video_request'
  | 'lift_modification'
  | 'meeting_item'
  | 'message'
  | 'player_note'
  | 'import_review';

/** Recommended-action type on a signal = an action type OR explicit 'none'. */
export type BaseballRecommendedActionType = BaseballActionType | 'none';

/** Action lifecycle. */
export type BaseballActionStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled';

// -----------------------------------------------------------------------------
// Structured source ref stored in source_refs[] (jsonb at the DB layer)
// -----------------------------------------------------------------------------

/**
 * One provenance entry persisted in baseball_signals.source_refs /
 * baseball_actions.source_refs. Shape-compatible with
 * BaseballInsightSourceRef so an insight's refs round-trip onto a signal that
 * cites it. NEVER fabricated — each points at a real table the generator read.
 */
export interface BaseballSignalSourceRef {
  /** Source table, e.g. 'baseball_player_stats' | 'baseball_import_runs'. */
  source_table: string;
  /** Specific column(s) read (optional). */
  column?: string;
  /** Row id the value came from, when a single row (optional). */
  source_id?: string | null;
  /** Observations the cited value is computed over. */
  sample_n?: number;
  /** Confidence the engine has in THIS source's contribution [0,1]. */
  confidence?: number | null;
  /** Short human label, e.g. 'Last 8 games (box score)'. */
  label?: string;
  /** Strictest-wins visibility of this source. */
  visibility?: BaseballSignalVisibility;
}

// -----------------------------------------------------------------------------
// baseball_signals row / insert
// -----------------------------------------------------------------------------

export interface BaseballSignal {
  id: string;
  team_id: string;
  player_id: string | null;
  event_id: string | null;
  signal_type: string;
  category: string;
  severity: BaseballSignalSeverity;
  title: string;
  why_it_matters: string | null;
  evidence: string | null;
  /** jsonb — at the app layer a BaseballSignalSourceRef[]. */
  source_refs: BaseballJson;
  confidence: number | null;
  sample_n: number | null;
  recommended_action_label: string | null;
  recommended_action_type: BaseballRecommendedActionType | null;
  recommended_owner_role: string | null;
  owner_coach_id: string | null;
  disposition: BaseballSignalDisposition;
  visibility: BaseballSignalVisibility;
  generated_by: string | null;
  source_kind: BaseballSignalSourceKind;
  feedback: BaseballSignalFeedback | null;
  dedupe_key: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballSignalInsert {
  id?: string;
  team_id: string;
  player_id?: string | null;
  event_id?: string | null;
  signal_type: string;
  category?: string;
  severity?: BaseballSignalSeverity;
  title: string;
  why_it_matters?: string | null;
  evidence?: string | null;
  source_refs?: BaseballJson;
  confidence?: number | null;
  sample_n?: number | null;
  recommended_action_label?: string | null;
  recommended_action_type?: BaseballRecommendedActionType | null;
  recommended_owner_role?: string | null;
  owner_coach_id?: string | null;
  disposition?: BaseballSignalDisposition;
  visibility?: BaseballSignalVisibility;
  generated_by?: string | null;
  source_kind?: BaseballSignalSourceKind;
  feedback?: BaseballSignalFeedback | null;
  dedupe_key?: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  expires_at?: string | null;
  created_by?: string | null;
}

export type BaseballSignalUpdate = Partial<Omit<BaseballSignalInsert, 'team_id'>>;

// -----------------------------------------------------------------------------
// baseball_actions row / insert
// -----------------------------------------------------------------------------

export interface BaseballAction {
  id: string;
  team_id: string;
  signal_id: string | null;
  player_id: string | null;
  event_id: string | null;
  action_type: BaseballActionType;
  title: string;
  detail: string | null;
  target_table: string | null;
  target_id: string | null;
  owner_coach_id: string | null;
  assignee_coach_id: string | null;
  assignee_player_id: string | null;
  due_date: string | null;
  status: BaseballActionStatus;
  source_refs: BaseballJson;
  confidence: number | null;
  visibility: BaseballSignalVisibility;
  outcome: string | null;
  outcome_recorded_at: string | null;
  // V10 outcome ledger (migration 20260624000210) — source → signal → action →
  // did-it-move. Seeded at conversion (metric + baseline), filled by the sweep.
  outcome_metric: string | null;
  outcome_baseline_value: number | null;
  outcome_observed_value: number | null;
  outcome_sample_n: number | null;
  outcome_movement: number | null;
  outcome_verdict: BaseballActionOutcomeVerdict | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballActionInsert {
  id?: string;
  team_id: string;
  signal_id?: string | null;
  player_id?: string | null;
  event_id?: string | null;
  action_type: BaseballActionType;
  title: string;
  detail?: string | null;
  target_table?: string | null;
  target_id?: string | null;
  owner_coach_id?: string | null;
  assignee_coach_id?: string | null;
  assignee_player_id?: string | null;
  due_date?: string | null;
  status?: BaseballActionStatus;
  source_refs?: BaseballJson;
  confidence?: number | null;
  visibility?: BaseballSignalVisibility;
  outcome?: string | null;
  outcome_recorded_at?: string | null;
  // V10 outcome ledger seed (migration 20260624000210). Seeded at conversion so
  // the outcome sweep can later measure whether the targeted metric moved.
  outcome_metric?: string | null;
  outcome_baseline_value?: number | null;
  outcome_observed_value?: number | null;
  outcome_sample_n?: number | null;
  outcome_movement?: number | null;
  outcome_verdict?: BaseballActionOutcomeVerdict | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  completed_at?: string | null;
  created_by?: string | null;
}

export type BaseballActionUpdate = Partial<Omit<BaseballActionInsert, 'team_id'>>;

// -----------------------------------------------------------------------------
// Action-conversion materialization targets
//   migration: 20260624000230_baseball_signal_action_materialization.sql
//
// These are the subsystem objects a conversion CREATES (the cross-subsystem
// wiring — V9 Action Conversion Map / V10 "Staff action queue replaces vague
// meeting output"). The action ledger row points at one of these via
// baseball_actions.target_table + target_id, and each object points back at the
// originating signal via source_signal_id (round-trip).
// -----------------------------------------------------------------------------

/** Decision Room agenda item lifecycle. */
export type BaseballMeetingItemStatus =
  | 'open'
  | 'discussed'
  | 'resolved'
  | 'archived';

/** baseball_meeting_items row — the Decision Room agenda backlog object. */
export interface BaseballMeetingItem {
  id: string;
  team_id: string;
  source_signal_id: string | null;
  source_action_id: string | null;
  player_id: string | null;
  title: string;
  detail: string | null;
  source_refs: BaseballJson;
  owner_coach_id: string | null;
  status: BaseballMeetingItemStatus;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  discussed_at: string | null;
  discussed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballMeetingItemInsert {
  id?: string;
  team_id: string;
  source_signal_id?: string | null;
  source_action_id?: string | null;
  player_id?: string | null;
  title: string;
  detail?: string | null;
  source_refs?: BaseballJson;
  owner_coach_id?: string | null;
  status?: BaseballMeetingItemStatus;
  resolution?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_by?: string | null;
}

/** baseball_coach_player_notes row — a staff-authored note ON a player. */
export interface BaseballCoachPlayerNote {
  id: string;
  team_id: string;
  player_id: string;
  source_signal_id: string | null;
  source_action_id: string | null;
  title: string | null;
  body: string;
  source_refs: BaseballJson;
  visibility: BaseballSignalVisibility;
  author_coach_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballCoachPlayerNoteInsert {
  id?: string;
  team_id: string;
  player_id: string;
  source_signal_id?: string | null;
  source_action_id?: string | null;
  title?: string | null;
  body: string;
  source_refs?: BaseballJson;
  visibility?: BaseballSignalVisibility;
  author_coach_id?: string | null;
  created_by?: string | null;
}

// -----------------------------------------------------------------------------
// Decision Ledger (V10 Packet 10 "Decision Ledger" / V5 System 5 staff meeting).
// An append-only record of decisions MADE in the Staff Decision Room: a signal
// or meeting item was discussed, resolved, raised, reopened, or converted to a
// task/note/practice block. Each entry is source-linked + carries the
// originating signal's provenance forward. Hand-written to mirror
// supabase/migrations/20260624000310_baseball_decision_log.sql (no DB applied).
// -----------------------------------------------------------------------------

/** The decision a staff member recorded in the room. */
export type BaseballDecisionKind =
  | 'discussed'
  | 'resolved'
  | 'converted_task'
  | 'converted_note'
  | 'converted_practice'
  | 'raised'
  | 'reopened'
  | 'note';

/** baseball_decision_log row — one decision made in the Decision Room. */
export interface BaseballDecisionLogEntry {
  id: string;
  team_id: string;
  decision_kind: BaseballDecisionKind;
  title: string;
  detail: string | null;
  /** What the decision is about, e.g. 'baseball_meeting_items' | 'baseball_signals'. */
  subject_table: string | null;
  subject_id: string | null;
  source_signal_id: string | null;
  action_id: string | null;
  player_id: string | null;
  source_refs: BaseballJson;
  decided_by: string;
  created_at: string;
}

export interface BaseballDecisionLogInsert {
  id?: string;
  team_id: string;
  decision_kind: BaseballDecisionKind;
  title: string;
  detail?: string | null;
  subject_table?: string | null;
  subject_id?: string | null;
  source_signal_id?: string | null;
  action_id?: string | null;
  player_id?: string | null;
  source_refs?: BaseballJson;
  decided_by: string;
}

/** Open meeting-item statuses (still on the Decision Room agenda). */
export const OPEN_MEETING_ITEM_STATUSES: readonly BaseballMeetingItemStatus[] = [
  'open',
  'discussed',
] as const;

// -----------------------------------------------------------------------------
// Helpers shared by read model + UI (pure; safe on server + client)
// -----------------------------------------------------------------------------

/**
 * Parse the jsonb source_refs column into a typed array, tolerating legacy
 * shapes. Never throws — returns [] when the value is not an array.
 */
export function parseSignalSourceRefs(
  raw: BaseballJson | null | undefined,
): BaseballSignalSourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: BaseballSignalSourceRef[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const e = entry as Record<string, unknown>;
      const table =
        typeof e.source_table === 'string'
          ? e.source_table
          : typeof e.table === 'string'
            ? (e.table as string)
            : null;
      if (!table) continue;
      out.push({
        source_table: table,
        column: typeof e.column === 'string' ? e.column : undefined,
        source_id:
          typeof e.source_id === 'string'
            ? e.source_id
            : typeof e.id === 'string'
              ? (e.id as string)
              : null,
        sample_n: typeof e.sample_n === 'number' ? e.sample_n : undefined,
        confidence: typeof e.confidence === 'number' ? e.confidence : null,
        label: typeof e.label === 'string' ? e.label : undefined,
        visibility:
          e.visibility === 'team' ||
          e.visibility === 'player_only' ||
          e.visibility === 'staff_only'
            ? (e.visibility as BaseballSignalVisibility)
            : undefined,
      });
    }
  }
  return out;
}

/** Dispositions that count as "open" (still on the triage board). */
export const OPEN_SIGNAL_DISPOSITIONS: readonly BaseballSignalDisposition[] = [
  'new',
  'acknowledged',
  'sample_too_small',
] as const;

/** Statuses that count as "active" (still actionable work). */
export const ACTIVE_ACTION_STATUSES: readonly BaseballActionStatus[] = [
  'open',
  'in_progress',
  'blocked',
] as const;
