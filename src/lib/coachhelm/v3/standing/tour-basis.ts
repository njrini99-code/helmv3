/**
 * Tour-basis comparability for standing rows (addendum A2, read level).
 *
 * WHY THIS EXISTS
 * ---------------
 * `refresh_player_standing_shot_metrics` used to write the three
 * approach-proximity rows from GREEN-FINDING approaches only (`player_value`
 * = average leave of the shots that hit the green), while `pga_value` for the
 * same metric ids is the Tour's proximity over EVERY approach from the band,
 * misses included (seed: 18 / 30 / 45 ft). The two numbers were different
 * quantities. Read on one bar, a player who missed long greens looked like
 * they "beat Tour" from 175+ (production 2026-09-12: on-green averages 22.6
 * ft and 26.7 ft against anchors of 30 and 45) — the misses that hurt them
 * were exactly the shots the player figure dropped.
 *
 * Package 7B / addendum A2 (migration 20260922120000) moved the RPC itself to
 * an all-shot basis (with a lay-up split so a deliberate 175+ yd par-5 layup
 * is not counted as a proximity "miss" either — see the migration). Rather
 * than flip a static per-metric-id table the moment the RPC changed, the rule
 * below reads `basis` off the ACTUAL row: a metric_id in
 * {@link STANDING_TOUR_BASIS_MISMATCH} is comparable only once its row's
 * `basis` says so. This matters because the RPC only upserts a row when a
 * player clears its (now stricter, addendum A2 §5.2) attempts/rounds floor —
 * a player who never gets refreshed, or was refreshed before this migration
 * shipped, keeps a `basis` of `null`/`'on_green'` and stays correctly
 * withheld rather than flipping to "comparable" for every row the instant
 * the metric_id would allow it.
 *
 * When a row IS comparable: the standing loaders stop stamping
 * `pga_omitted: true` / `pga_omitted_reason: 'basis_mismatch'` (the same
 * render path the women's no-anchor omission uses), the goal-suggestion
 * writer can rank the gap, and the goal modal can offer a midpoint-to-Tour
 * target. Team ticks were always fine either way — teammates are measured
 * against each other on whatever basis the row carries.
 *
 * `ApproachMissGenerator` (approach-miss.ts) no longer overrides this at the
 * generator level — it trusts `standing.pga_omitted` as already computed
 * here at load time (see its `standingTourComparable` comment); this module
 * is the one place the basis check lives. Because the snapshot in
 * `evidence.standing` is frozen at write time, `EvidencePanel` re-applies
 * this function on read (passing the frozen `basis` through) so a row
 * persisted before this rule — or before Package 7B — renders the same
 * omission it would get freshly computed today.
 */

import type { PgaOmissionReason } from './types';

/** The two bases `golf_player_standing.player_value` can be measured on. */
export type StandingBasis = 'on_green' | 'all_shot';

/**
 * The fields the rule reads and writes. `PlayerStanding` (live loader rows)
 * and `EvidenceStanding` (the snapshot frozen into `evidence.standing` at
 * write time) both satisfy this structurally, so the same function guards a
 * live tile and a card rendering a row persisted before the rule existed.
 */
export interface TourBasisStanding {
  metric_id: string;
  pga_omitted?: boolean;
  pga_omitted_reason?: PgaOmissionReason;
  /** Package 7B. Absent/null on a row this migration hasn't (re)written. */
  basis?: StandingBasis | null;
}

/**
 * Registry ids whose `golf_player_standing.player_value` CAN be measured on a
 * different basis than their `pga_value`, depending on the row's `basis`
 * field — keep in sync with the RPC
 * (`supabase/migrations/20260922120000_v3_standing_shot_metrics_all_shot_proximity.sql`).
 */
export const STANDING_TOUR_BASIS_MISMATCH: ReadonlySet<string> = new Set([
  'approach_proximity_50_125ft',
  'approach_proximity_125_175ft',
  'approach_proximity_175_plus_ft',
]);

/**
 * True when the row's Tour marker measures the same quantity as
 * `player_value`. For a metric outside {@link STANDING_TOUR_BASIS_MISMATCH}
 * this is always true (basis is irrelevant there). For one of the three
 * approach-proximity ids, comparable ONLY when `basis === 'all_shot'` —
 * `undefined`/`null`/`'on_green'` all withhold, so a not-yet-refreshed row
 * fails closed rather than silently becoming comparable.
 */
export function isStandingTourComparable(
  metricId: string,
  basis?: StandingBasis | null,
): boolean {
  if (!STANDING_TOUR_BASIS_MISMATCH.has(metricId)) return true;
  return basis === 'all_shot';
}

/**
 * Stamp the omission on a standing row whose Tour marker is not comparable.
 * Pure — returns the row untouched (same reference) for every other metric
 * or an already-comparable (`basis: 'all_shot'`) row, and never un-omits a
 * row the gender anchor already omitted.
 *
 * Generic so persisted snapshots get the same treatment as live rows: a
 * frozen `evidence.standing` block written before this rule (or before
 * Package 7B) carries no `basis` and renders the same omission a fresh
 * on-green row would.
 */
export function applyTourBasis<T extends TourBasisStanding>(standing: T): T {
  if (isStandingTourComparable(standing.metric_id, standing.basis)) return standing;
  if (standing.pga_omitted) return standing;
  return {
    ...standing,
    pga_omitted: true,
    pga_omitted_reason: 'basis_mismatch',
  };
}
