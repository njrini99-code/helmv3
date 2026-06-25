// =============================================================================
// src/lib/types/baseball-imports.ts
//
// Wave 6 / packet: source-registry (stats-integrations)
//
// HAND-WRITTEN Row/Insert/Update types for the import-lineage tables created in
// 20260624000020_baseball_import_lineage.sql. We cannot regenerate database.ts
// against a live apply (production GolfHelm shares this DB), so these types are
// authored to match the migration DDL EXACTLY and live in this dedicated file.
//
//   * baseball_import_runs        — one row per ingest attempt (file -> rows ->
//                                   commit / rollback) for an auditable, undoable
//                                   stat import.
//   * baseball_player_external_ids — maps an external source's player id to an
//                                   internal baseball_players.id so future imports
//                                   match deterministically.
//
// The re-export into src/lib/types/index.ts is wired by a single integration
// agent later — do NOT edit index.ts here.
// =============================================================================

import type { Json } from '@/lib/types/database';

// -----------------------------------------------------------------------------
// baseball_import_runs
// -----------------------------------------------------------------------------

/**
 * Lifecycle status for an import run. Mirrors the CHECK constraint in
 * 20260624000020_baseball_import_lineage.sql exactly.
 */
export type BaseballImportRunStatus =
  | 'pending'
  | 'parsing'
  | 'matching'
  | 'review'
  | 'committed'
  | 'rolled_back'
  | 'failed';

/**
 * Review routing for a run, driven by the registered source's required_review
 * flag (20260624000460_baseball_import_registry_load_bearing.sql). Distinct from
 * `status`: a run can be status:'review' AND review_state:'pending_review' while
 * its rows are STAGED but not yet written, then move to 'approved' on sign-off.
 */
export type BaseballImportReviewState =
  | 'not_required'
  | 'pending_review'
  | 'approved'
  | 'rejected';

/**
 * Row shape for public.baseball_import_runs.
 * NOTE: the migration does NOT add a generic `mapping_decisions`/`audit_snapshot`
 * column set — it has the columns below. The mapping config + per-row before/after
 * rollback snapshot are persisted on baseball_stat_uploads.mapping_config and
 * baseball_stat_uploads.unmatched_data / a dedicated jsonb the action manages,
 * keeping this lineage table the lean, queryable run header.
 */
export interface BaseballImportRunRow {
  id: string;
  team_id: string;
  source_id: string;
  /**
   * Required human label for the run (NOT NULL per the data contract; backfilled
   * from source_id on legacy rows). Never null on a contract-converged DB.
   */
  source_label: string;
  /**
   * The kind of object this run ingested ('stats' default). Contract-required;
   * scopes the duplicate-file warning per import kind. NOT NULL (default 'stats').
   */
  import_type: string;
  file_name: string | null;
  file_url: string | null;
  /**
   * SHA-256 hex of the raw uploaded bytes, server-recomputed at commit/stage
   * (never a client-asserted hash). Backs the "same file already imported"
   * duplicate short-circuit. Added in 20260624000500. Null on legacy runs.
   */
  file_hash: string | null;
  /** Size of the raw uploaded file in bytes. Added in 20260624000500. */
  file_bytes: number | null;
  status: BaseballImportRunStatus;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  /** Parsed rows that passed validation (contract; NOT NULL, default 0). */
  valid_row_count: number;
  /** Parsed rows that carried a non-fatal warning (contract; NOT NULL, default 0). */
  warning_count: number;
  /** Parsed rows that failed with a hard error (contract; NOT NULL, default 0). */
  error_count: number;
  /**
   * The staff member who started the run. Contract-required NOT NULL on a
   * converged DB; may be null only on a legacy live row that predates the
   * created_by backfill (see 20260624000020 convergence section).
   */
  created_by: string | null;
  created_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
  /** Review routing from the registered source's required_review flag. */
  review_state: BaseballImportReviewState;
  /** The baseball_import_sources registry row whose policy drove this run. */
  source_config_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface BaseballImportRunInsert {
  id?: string;
  team_id: string;
  source_id: string;
  /** Contract-required label; column has a '' default but callers must pass a real value. */
  source_label?: string;
  /** Contract-required; defaults to 'stats' at the DB if omitted. */
  import_type?: string;
  file_name?: string | null;
  file_url?: string | null;
  file_hash?: string | null;
  file_bytes?: number | null;
  status?: BaseballImportRunStatus;
  total_rows?: number;
  matched_rows?: number;
  unmatched_rows?: number;
  valid_row_count?: number;
  warning_count?: number;
  error_count?: number;
  /** Contract-required NOT NULL: the staff member starting the run. */
  created_by: string;
  created_at?: string;
  committed_at?: string | null;
  rolled_back_at?: string | null;
  review_state?: BaseballImportReviewState;
  source_config_id?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface BaseballImportRunUpdate {
  source_label?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  file_hash?: string | null;
  file_bytes?: number | null;
  status?: BaseballImportRunStatus;
  total_rows?: number;
  matched_rows?: number;
  unmatched_rows?: number;
  committed_at?: string | null;
  rolled_back_at?: string | null;
  review_state?: BaseballImportReviewState;
  source_config_id?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

// -----------------------------------------------------------------------------
// baseball_player_external_ids
// -----------------------------------------------------------------------------

// NOTE: baseball-extended.ts is the CANONICAL owner of these external-id types
// (see src/lib/types/index.ts). Keep these in lockstep with that file's shape.
export interface BaseballPlayerExternalIdRow {
  id: string;
  /** Team scope (contract NOT NULL on a converged DB; null only on un-backfilled legacy rows). */
  team_id: string | null;
  player_id: string;
  source_id: string;
  external_id: string;
  /** Human-readable source name shown in the match UI (contract). */
  source_display_name: string | null;
  confidence: number | null;
  /** Whether a coach explicitly confirmed this mapping (contract; NOT NULL, default false). */
  verified: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BaseballPlayerExternalIdInsert {
  id?: string;
  /** Contract-required team scope. */
  team_id: string;
  player_id: string;
  source_id: string;
  external_id: string;
  source_display_name?: string | null;
  confidence?: number | null;
  verified?: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface BaseballPlayerExternalIdUpdate {
  team_id?: string;
  source_id?: string;
  external_id?: string;
  source_display_name?: string | null;
  confidence?: number | null;
  verified?: boolean;
  created_by?: string | null;
  updated_at?: string | null;
}

// -----------------------------------------------------------------------------
// Wizard / action transport shapes (not DB rows; carried client <-> server).
// -----------------------------------------------------------------------------

/** A single source registry entry the wizard can import from. */
export interface BaseballImportSource {
  id: string;
  label: string;
  /** Heuristic header fingerprints used by detection. */
  signatureHeaders: string[];
  description: string;
}

/**
 * The CHOSEN RESOLUTION tier for a row's match, per player_matching_v2.md:
 * "Use exact external ID, exact roster match, normalized name + jersey + class,
 * fuzzy name, and manual review. Store match confidence and chosen resolution."
 *
 * This is the qualitative "how was this resolved" the spec asks to persist
 * ALONGSIDE the numeric confidence — two rows can both be 1.0 confidence but
 * resolved very differently (a deterministic external-id hit vs. a coach's manual
 * assignment), and the tier is what makes that distinction auditable.
 *
 * Ordered most-trusted -> least-trusted:
 *   external_id     — a previously-mapped external id resolved deterministically.
 *   exact_roster    — the source name is an EXACT (normalized) match to exactly
 *                     one roster player (no ambiguity).
 *   name_jersey_class — a normalized name match DISAMBIGUATED or boosted by a
 *                     matching jersey number and/or class (grad year) — the tier
 *                     that resolves two same-last-name players the old code
 *                     collapsed to an ambiguous 0.7.
 *   fuzzy_name      — a name-similarity match with no jersey/class signal.
 *   manual          — a coach explicitly assigned (or cleared) the row.
 *   unmatched       — no resolution; the row is skipped unless a coach acts.
 */
export type BaseballImportMatchTier =
  | 'external_id'
  | 'exact_roster'
  | 'name_jersey_class'
  | 'fuzzy_name'
  | 'manual'
  | 'unmatched';

/**
 * The duplicate verdict for a single source row, computed at PREVIEW time
 * (duplicate_resolution_v2.md: "Import runs must detect existing source rows and
 * SHOW create/update/skip decisions before commit"). Each verdict is keyed by a
 * STABLE source-row identity (external event id + player + grain) — not merely
 * session_date+stat_type — so re-importing the same file twice resolves the same
 * row to the same existing record, and so two distinct lines for one player in
 * one session (e.g. two GameChanger games on the same date) are not collapsed.
 *
 *   new            — no existing record for this row's identity; commit will INSERT.
 *   will_update    — an existing record matches this row's identity AND a
 *                    DIFFERENT source/value; commit will OVERWRITE it (the
 *                    before-values are surfaced so the coach sees what changes).
 *   exact_duplicate — an existing record matches this row's identity AND was
 *                    written by the SAME source with the SAME values; re-import is
 *                    a no-op the coach can safely skip.
 *   unresolved     — the row has no player resolved yet, so no verdict is possible.
 */
export type BaseballImportDuplicateVerdict =
  | 'new'
  | 'will_update'
  | 'exact_duplicate'
  | 'unresolved';

/**
 * Per-row duplicate decision surfaced in the preview BEFORE commit. Carries the
 * existing record's identity + a compact before/after diff so the wizard can show
 * "this row will OVERWRITE an existing GameChanger line for 2026-04-12" with the
 * exact fields that change. Computed by previewImport (read-only) and recomputed
 * server-side at commit so a tampered client decision can never be trusted.
 */
export interface BaseballImportRowDuplicate {
  rowIndex: number;
  /**
   * The player id this verdict was computed AGAINST. The wizard invalidates a
   * verdict (falls back to "new/unknown") when a coach manually re-matches the row
   * to a different player after preview, so a stale verdict can never mislabel a
   * row's commit decision.
   */
  playerId: string | null;
  verdict: BaseballImportDuplicateVerdict;
  /** The existing baseball_player_stats.id this row resolves to, when any. */
  existingStatId: string | null;
  /** The source string already stamped on the existing record (e.g. "import:trackman"). */
  existingSource: string | null;
  /**
   * The fields that DIFFER between the incoming row and the existing record, with
   * both values, so the preview renders a precise before -> after diff (capped to
   * the changed fields; empty when verdict is 'new' or 'exact_duplicate').
   */
  changedFields: Array<{ field: string; before: number | null; after: number | null }>;
}

/** A per-row matching outcome carried through the wizard preview. */
export interface BaseballImportRowMatch {
  /** Stable index into the parsed rows array. */
  rowIndex: number;
  /** The raw player name (or external id) found in the source row. */
  sourceName: string;
  /** Resolved internal player id, or null when unmatched. */
  playerId: string | null;
  /** Resolved internal player display name, or null when unmatched. */
  playerName: string | null;
  /** 0..1 stored match confidence. */
  confidence: number;
  /**
   * The chosen-resolution tier (player_matching_v2.md). Persisted with the run
   * so an auditor sees HOW a row resolved, not just how confident the score was.
   */
  matchTier: BaseballImportMatchTier;
  /** Whether a coach manually overrode the auto-match. */
  isManualMatch: boolean;
  /** What the commit will do for this row. */
  action: BaseballImportRowAction;
}

export type BaseballImportRowAction = 'create' | 'update' | 'skip';

/** Mapping of our canonical stat field -> the detected source column header. */
export type BaseballImportColumnMapping = Record<string, string | null>;

/**
 * The before/after snapshot the commit persists so a rollback can reverse ONLY
 * this run's records without delete-then-reinsert. `before` is null when the
 * row was created by this run (rollback restores the absence via a tombstone
 * marker handled server-side); `after` is the values this run wrote.
 */
export interface BaseballImportRowSnapshot {
  statId: string;
  playerId: string;
  action: BaseballImportRowAction;
  before: Json | null;
  after: Json | null;
}
