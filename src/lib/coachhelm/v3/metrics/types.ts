/**
 * Shared metric-result shape for the v3 pure metrics packages
 * (repair-plan addendum §13, work packages A2/A3+).
 *
 * Originated in A3's `par-opportunities.ts` as the narrower, merged-A1-type
 * adaptation of the addendum's §4.3 design-contract `MetricResult`; promoted
 * here so A2 (`distance-profile.ts`) and any later metrics package share one
 * shape instead of each exporting its own. A2 predates this file with its
 * own `id`/`band`/`playerId`-shaped `MetricResult` — reconciling that onto
 * this shape is A2's job when it rebases past A3, not this file's.
 */

import type { AnalysisScope } from '../context/types';

/** How confidently a row's `value` can be stated. Mirrors the addendum's
 *  `MetricStatus` design contract (§4.3) — `'insufficient'` still carries a
 *  computed `value` (never hidden), it only flags a small denominator, the
 *  same "state it, don't hide it" pattern `ParTypeGenerator.composeContent`
 *  already uses for `holes_scored < 5`. */
export type MetricStatus = 'supported' | 'descriptive_only' | 'insufficient' | 'invalid';

/** One named floor an `'insufficient'` row's OWN gating population failed to
 *  clear, in that population's real numbers. Exists so a consuming surface
 *  never has to reverse-engineer which floor failed from `eligibleCount`/
 *  `distinctRounds` — those two fields describe whatever population a
 *  SPECIFIC row narrows to, which for some rows (a proximity or coverage
 *  metric narrowed to green-finding or missed shots) is narrower than the
 *  population a compound floor actually gates. Reading them as a stand-in
 *  for "the failing floor" can name a floor the row cleared while hiding
 *  the one it didn't (#2008 review, MUST 1 — a proximity row could clear
 *  its own greens-hit count while still failing the wider attempts floor
 *  that actually produced `'insufficient'`). */
export interface SupportFloorGap {
  /** Which floor, e.g. `'rounds'` / `'attempts'` / `'greens'` — a package's
   *  own vocabulary, not a fixed enum, since different packages' compound
   *  floors name different things. */
  floor: string;
  current: number;
  required: number;
}

/** Mirrors `TeeStrategyShot.distance_method` (`engine/shot-source.ts`) — see
 *  its module doc comment's "RECORDED TRAVEL DISTANCE vs. DERIVED PROGRESS"
 *  section. `'derived_progress'` is hole yardage minus remaining distance
 *  (an estimate of progress toward the hole, never a carry/travel distance)
 *  — a metric package that ever mixes the two must say which one produced
 *  a given row rather than let them silently blend into one average. */
export type DistanceMethod = 'recorded' | 'derived_progress';

/**
 * One computed metric row. Adapted from the addendum's §4.3 design-contract
 * `MetricResult` to the ALREADY-MERGED A1 types (snake_case `AnalysisScope`,
 * no `sourceRevision`/`policyRevision` — those don't exist yet). Deliberately
 * narrower than the full design contract: no `interval` (no CI estimation
 * shipped yet) and no `sourceShotIds` (no per-shot provenance consumer yet)
 * — add both when a package actually needs them, rather than shipping
 * fields nothing populates or reads.
 */
export interface MetricResult {
  scope: AnalysisScope;
  /** Grouping key for this row — e.g. `{ par: 5, length_group: 'long' }` or
   *  `{ course_hole_key: 'course-a:7', hole_number: 7, par: 5 }`. Values are
   *  `string | number` only; never a fabricated identity for an unknown one
   *  (an unidentified hole simply gets no row in a specific-identity family). */
  dimensions: Record<string, string | number>;
  metricId: string;
  unit: 'percent' | 'feet' | 'yards' | 'strokes' | 'count';
  value: number | null;
  numerator: number | null;
  denominator: number;
  eligibleCount: number;
  observedCount: number;
  distinctRounds: number;
  status: MetricStatus;
  /** Named reasons a candidate was excluded from this row's denominator,
   *  e.g. `{ incomplete_sequence: 2 }`. Never silently dropped. */
  exclusions: Record<string, number>;
  /**
   * Optional — set only by a metric whose input can be either a recorded
   * travel distance or a derived progress-toward-hole estimate (A2's
   * distance/proximity metrics). Absent entirely for a metric package (like
   * A3's) that never touches a derived distance, rather than defaulting
   * every row to `'recorded'` and implying a claim this field was never
   * meant to make for that package.
   */
  distanceMethod?: DistanceMethod;
  /**
   * Optional — set by a metric package whose support floor is compound
   * (more than one condition can independently fail) whenever `status` is
   * `'insufficient'`, naming EVERY floor this row's own gating population
   * failed to clear. See `SupportFloorGap`'s doc comment for why this
   * exists instead of leaving a caller to infer it from `eligibleCount`/
   * `distinctRounds`. Absent for a package with a single, non-compound
   * floor, where `status` alone already says everything a caller needs, and
   * absent (not an empty array) whenever `status !== 'insufficient'`.
   */
  failedFloors?: readonly SupportFloorGap[];
}
