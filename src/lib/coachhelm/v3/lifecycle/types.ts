/**
 * Shapes for CoachHelm Slice 3 (lifecycle). The new evidence fields
 * (`recheck`, `conflict`, `under_review`; 04-output-specs §1.1) are declared
 * here rather than on the shared `InsightEvidence`, because several slices
 * extend that type in parallel; readers narrow with `lifecycleFieldsOf`.
 *
 * The authoritative copy lives on `metadata.coachhelm_lifecycle`, which the
 * insight upsert merges (it keeps prior metadata keys), while `evidence` is
 * replaced wholesale on every generator re-emit. The nightly step mirrors the
 * block back onto `evidence` whenever a re-emit has dropped it.
 */
import type { RecheckRecord } from '@/lib/coachhelm/v3/engine/recent-recheck';

export type { RecheckRecord };

/** `evidence.conflict` (04 §1.1, Example 7; 03 §9 "Contradicted"). */
export interface ConflictRecord {
  with_insight_id: string;
  /**
   * `opposing_direction`: two supported reads on one subject say opposite
   * things (newest wins). `opposing_strategy`: two families pull opposite
   * ways (driver favoured vs penalties after driver); both stay, one item.
   */
  kind: 'opposing_direction' | 'opposing_strategy';
  /** winner/retired for `opposing_direction`; paired for `opposing_strategy`. */
  role: 'winner' | 'retired' | 'paired';
  /** Strokes a round, positive = the strategy read's side; null when either side has no estimate. */
  net_strokes: number | null;
  resolution: 'newest_wins' | 'net_favours_driver' | 'net_favours_layback' | 'net_unknown';
  /** Canonical subject (metric id) for `opposing_direction`; 'driver_vs_penalties' otherwise. */
  subject: string;
  /** Counted link for a strategy pair: penalties after a driver tee shot / all penalties, in the recheck window. */
  link?: { penalties_after_driver: number; penalties: number; rounds_n: number } | null;
  computed_at: string;
}

/** `evidence.under_review` (03 §9 "Under review"). */
export interface UnderReviewRecord {
  reason: 'wrong_cause' | 'not_this_wrong' | 'integrity';
  since: string;
  /** The correction that set it (wrong_cause / not_this_wrong). */
  correction_id?: string | null;
  /** Rounds in the read's window whose hole total does not match the scorecard. */
  round_ids?: string[];
  /** Free label from a wrong-cause correction, when the coach picked one. */
  alternative_cause_label?: string | null;
}

/** `metadata.coachhelm_lifecycle`: the authoritative per-read block. */
export interface ReadLifecycleMeta {
  /** Checkpoints that covered this read (player checkpoints + its family's). */
  checkpoints_seen: number;
  /** When `checkpoints_seen` last moved. */
  last_checkpoint_at?: string | null;
  recheck?: RecheckRecord | null;
  /** Checkpoints at which the recheck said `holds`. */
  checkpoints_held?: number;
  /** `checkpoints_seen` when the read first cleared; archive 2 later. */
  cleared_at_checkpoint?: number | null;
  cleared_at?: string | null;
  reopened_at?: string | null;
  conflict?: ConflictRecord | null;
  conflict_at_checkpoint?: number | null;
  under_review?: UnderReviewRecord | null;
  under_review_at_checkpoint?: number | null;
  /** Flagged rounds already reviewed through a checkpoint (not re-flagged). */
  integrity_reviewed_round_ids?: string[];
  /** `checkpoints_seen` when the read was first seen out of date at a checkpoint. */
  out_of_date_since_checkpoint?: number | null;
}

/** The subset of a v3 evidence object this slice reads. */
export interface LifecycleEvidence {
  metric?: string;
  metric_label?: string;
  unit?: string;
  polarity?: 'higher_better' | 'lower_better';
  your_value?: number;
  your_value_display?: string;
  comparison_value?: number;
  comparison_label?: string;
  sample_n?: number;
  window_end?: string;
  strokes_impact?: number;
  strokes_impact_method?: string;
  source_round_ids?: string[];
  /** Slice 1 (PR #2219) writes this; when present its q gates "supported". */
  support?: { q_adj?: number | null } | null;
  detail?: Record<string, unknown>;
  recheck?: RecheckRecord;
  conflict?: ConflictRecord;
  under_review?: UnderReviewRecord;
  [key: string]: unknown;
}

/** A `golf_coach_insights` row as the lifecycle step loads it. */
export interface LifecycleReadRow {
  id: string;
  player_id: string;
  insight_type: string | null;
  signature: string | null;
  title: string | null;
  lifecycle_state: string | null;
  dismissed: boolean | null;
  evidence: LifecycleEvidence | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

/** A row of `golf_coachhelm_corrections` (Slice 6a, PR #2226), as read here. */
export interface CorrectionRow {
  id: string;
  insight_id: string;
  kind: string;
  reason: string | null;
  alternative_cause_label: string | null;
  created_at: string;
}

export const LIFECYCLE_META_KEY = 'coachhelm_lifecycle' as const;
/** `metadata.archived_by` on every archive this step writes. */
export const LIFECYCLE_ARCHIVED_BY = 'coachhelm-lifecycle' as const;
/** `metadata.resolved_by` on a Contradicted retirement. */
export const CONTRADICTION_RESOLVED_BY = 'engine-contradiction' as const;
export const CONTRADICTION_RETIRED_REASON = 'contradicted' as const;
export const OUT_OF_DATE_ARCHIVE_REASON = 'out_of_date_3_checkpoints' as const;

/** Live (visible to the engine) lifecycle states the step evaluates. */
export const LIVE_STATES: readonly string[] = ['tentative', 'detected', 'matured', 'addressed'];

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Parse `metadata.coachhelm_lifecycle` defensively. */
export function readLifecycleMeta(metadata: Record<string, unknown> | null | undefined): ReadLifecycleMeta {
  const raw = metadata?.[LIFECYCLE_META_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { checkpoints_seen: 0 };
  const m = raw as Record<string, unknown>;
  return {
    ...(m as Partial<ReadLifecycleMeta>),
    checkpoints_seen: num(m.checkpoints_seen) ?? 0,
  };
}

/** The lifecycle fields on an evidence object, if any. */
export function lifecycleFieldsOf(evidence: unknown): Pick<LifecycleEvidence, 'recheck' | 'conflict' | 'under_review'> {
  if (!evidence || typeof evidence !== 'object') return {};
  const e = evidence as LifecycleEvidence;
  return {
    ...(e.recheck ? { recheck: e.recheck } : {}),
    ...(e.conflict ? { conflict: e.conflict } : {}),
    ...(e.under_review ? { under_review: e.under_review } : {}),
  };
}
