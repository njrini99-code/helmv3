// =============================================================================
// baseball-coachhelm.ts
//
// Hand-aligned TypeScript types for the CoachHelm baseball engine attribution
// columns added by:
//   supabase/migrations/20260624000070_baseball_coach_insights_attribution.sql
//
// WHY THIS FILE EXISTS
//   The generated src/lib/types/database.ts is regenerated from the live DB and
//   does NOT reflect the freshly-written-but-not-yet-applied attribution
//   migration (we cannot db:types regen — no live apply, prod GolfHelm shares
//   the DB). This file hand-mirrors the EXACT column names/types the migration
//   adds to `baseball_coach_insights`, so the engine write layer + read paths
//   compile against the new shape today.
//
//   Column names/types here match the SQL byte-for-byte:
//     SQL text        -> string
//     SQL numeric     -> number
//     SQL boolean     -> boolean
//     SQL jsonb       -> Json
//     SQL timestamptz -> string (ISO timestamp)
//     NOT NULL DEFAULT-> required in Row, optional in Insert
//     NULLable        -> `| null`
//
// OWNERSHIP: this file is part of the Wave-10 coachhelm/baseball ownership set.
//   The single re-export wiring into src/lib/types/index.ts is left to the
//   integration agent (we do NOT edit index.ts here).
// =============================================================================

import type {
  CausalityLevel,
  InsightLifecycleState,
  InsightConfidenceFactors,
  Diagnosis,
} from '@/lib/coachhelm/shared/evidence-types';

/** Mirror of the generated `Json` helper for jsonb columns. */
export type BaseballJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: BaseballJson | undefined }
  | BaseballJson[];

// -----------------------------------------------------------------------------
// Source reference — one provenance entry stored in source_refs[].
// -----------------------------------------------------------------------------

/**
 * Visibility of a single source row. The STRICTEST visibility among an
 * insight's source_refs governs whether the subject player may ever see it:
 *
 *  - 'team'        — derived from team-readable data (player may see).
 *  - 'player_only' — derived from the subject player's own data (player may see).
 *  - 'staff_only'  — derived from staff-restricted data (player must NOT see).
 *
 * Mirrors the baseball timeline visibility ladder; an insight built from any
 * staff_only source is itself staff_only (player_visible=false).
 */
export type BaseballSourceVisibility = 'team' | 'player_only' | 'staff_only';

/**
 * One structured provenance entry. Every engine insight cites at least one.
 * Nothing here is fabricated — each ref points at a real table/column the
 * generator read.
 */
export interface BaseballInsightSourceRef {
  /** Source table, e.g. 'baseball_player_stats'. */
  table: string;
  /** Specific column(s) read, e.g. 'strikeouts' (optional). */
  column?: string;
  /** Row id the value came from, when a single row (optional). */
  id?: string;
  /** Observations the cited value is computed over. */
  sample_n?: number;
  /** Confidence the engine has in THIS source's contribution [0,1]. */
  confidence?: number;
  /** Short human label, e.g. 'Last 8 games (box score)'. */
  label?: string;
  /** Strictest-wins visibility of this source. */
  visibility: BaseballSourceVisibility;
}

// -----------------------------------------------------------------------------
// baseball_coach_insights attribution columns (added by 20260624000070).
// -----------------------------------------------------------------------------

/**
 * The columns the attribution migration ADDS to baseball_coach_insights.
 * Compose with the existing BaseballCoachInsight shape (index.ts) for the full
 * row. In Row reads the NOT-NULL-DEFAULT columns are always present; in Insert
 * they are optional (defaulted by the DB).
 */
export interface BaseballCoachInsightAttributionColumns {
  /** jsonb NOT NULL DEFAULT '[]' — array of provenance entries. */
  source_refs: BaseballJson; // BaseballInsightSourceRef[] at the app layer
  /** numeric NULL — normalized [0,1] confidence from calcConfidence. */
  confidence: number | null;
  /** text NOT NULL DEFAULT 'detected' — shared lifecycle ladder. */
  lifecycle_state: InsightLifecycleState;
  /** boolean NOT NULL DEFAULT false — may the subject player read this? */
  player_visible: boolean;
  /** text NULL — generator id that produced the row (e.g. 'two_strike_chase'). */
  generated_by: string | null;
  /** text NULL — stable (team, generator, subject) dedupe key. */
  dedupe_key: string | null;
  /** timestamptz NULL — when the engine last refreshed this row. */
  last_generated_at: string | null;
}

/** Insert shape: every attribution column is optional (DB-defaulted/nullable). */
export type BaseballCoachInsightAttributionInsert =
  Partial<BaseballCoachInsightAttributionColumns>;

// -----------------------------------------------------------------------------
// Engine-side evidence carried on an insight (mirrors golf v3 InsightEvidence,
// baseball subset). Persisted into metadata.evidence so the surface can render
// the diagnosis + confidence reason without re-running the engine.
// -----------------------------------------------------------------------------

/**
 * The evidence bundle the baseball engine attaches to every generated insight.
 * Re-uses the sport-agnostic shared Diagnosis + confidence factors so a
 * baseball two-strike-chase insight carries the exact same audit trail a golf
 * putt-bias insight does.
 */
export interface BaseballInsightEvidence {
  /** Observations the headline value is computed over. */
  sample_n: number;
  /** Target observations for a fully-adequate sample (recalibrated for rosters). */
  target_n: number;
  /** The shared confidence-factor blend inputs. */
  confidence_factors: InsightConfidenceFactors;
  /** Structured, machine-readable root-cause diagnosis. */
  diagnosis: Diagnosis;
  /** How firmly the cause is supported (never render a hypothesis as fact). */
  causality_level: CausalityLevel;
  /** Provenance entries (also persisted to the source_refs column). */
  source_refs: BaseballInsightSourceRef[];
}
