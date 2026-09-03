/**
 * Round-graph data invariants — Bridge Control Plane Phase D.4.3
 * (docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md §2 item 3).
 *
 * Same split as `src/lib/admin/qualifier-invariants.ts`, the one live
 * executable-invariant precedent this repo already had: the interesting part
 * — what counts as a violation, and how severe it is — lives here as pure
 * functions over already-fetched counts; the I/O is
 * `src/lib/reliability/invariants/round-graph-data.ts`.
 *
 * The split differs from `qualifier-invariants.ts` in one deliberate way.
 * That module fetches full small tables (~12 qualifiers / ~121 linked
 * rounds) and joins them in memory. `golf_shots`/`golf_rounds` are not
 * small, so "what counts as a violation" is necessarily expressed as the
 * WHERE clause the data layer runs, not a JS predicate over a full table —
 * the pure functions here take the already-filtered counts/samples the data
 * layer produced and turn them into a labeled, severity-scored result, the
 * same role `qualifierRows()`/`integrityRowsFor()` already play in
 * `src/lib/admin/triage/invariant-lattice.ts`.
 *
 * Both checks below are backfill invariants for
 * `memory/incidents/shot_tracking/INC-2026-08-25-atomic-snapshot-hole-mismatch.md`:
 * "A full round payload can include a shot group for a hole that is absent
 * from the payload's hole list... the incomplete graph could be marked
 * completed." Migration `20260825152726_guard_round_snapshot_shot_group_integrity.sql`
 * guards this at WRITE time inside `save_partial_round_atomic`/
 * `submit_round_atomic`. Neither of the checks below re-implements that
 * guard — they answer the question the guard cannot: did any row already in
 * the table violate the same rule, written before the guard shipped or by a
 * path the guard does not cover? Per this phase's own backfill rule
 * ("could a deterministic invariant have caught this?").
 */

export type RoundGraphInvariantSeverity = 'critical' | 'warning';

export interface RoundGraphInvariantResult {
  id: string;
  label: string;
  /** The business rule this enforces, in the incident's own words. */
  rule: string;
  /** Why a violation matters — what breaks for a real user. */
  consequence: string;
  severity: RoundGraphInvariantSeverity;
  violations: number;
  /** A bounded sample of offending ids, for pivoting to the data. */
  sampleIds: string[];
}

/**
 * Every `golf_shots` row must reference a real, persisted hole. The write
 * guard raises `22023` on this shape today; this reports whether any row
 * already in the table (written before the guard, or by a path it does not
 * cover) still violates it.
 */
export function evaluateOrphanedShots(count: number, sampleIds: readonly string[]): RoundGraphInvariantResult {
  return {
    id: 'round-graph-orphaned-shots',
    label: 'Shots reference a persisted hole',
    rule: 'Every golf_shots row must have a non-null hole_id — a shot group naming a hole absent from the round\'s hole snapshot must never persist.',
    consequence: 'An orphaned shot cannot be attributed to a hole in scoring, stats, or CoachHelm analysis, and its presence is the exact precursor state INC-2026-08-25 found: a round graph that looks complete but is missing a hole link.',
    severity: 'critical',
    violations: count,
    sampleIds: [...sampleIds],
  };
}

/**
 * A round marked `completed` must have played at least one hole.
 * `golf_rounds.holes_played` is the stored count `submit_round_atomic`
 * writes; null or zero on a completed round is the general shape of "the
 * incomplete graph could be marked completed" the incident named, not
 * limited to the specific shot/hole mismatch the migration guards.
 */
export function evaluateCompletedRoundsWithoutHoles(count: number, sampleIds: readonly string[]): RoundGraphInvariantResult {
  return {
    id: 'round-graph-completed-without-holes',
    label: 'Completed rounds have played holes',
    rule: 'A golf_rounds row with status = \'completed\' must have holes_played > 0 — a round cannot be complete with zero recorded holes.',
    consequence: 'A completed round with no holes shows an empty scorecard to the player/coach and cannot produce stats or a CoachHelm recap — the same "looks done, is not" failure mode as the orphaned-shot check, at the round level rather than the shot level.',
    severity: 'critical',
    violations: count,
    sampleIds: [...sampleIds],
  };
}
