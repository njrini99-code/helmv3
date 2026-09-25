/**
 * ============================================================================
 * standingAttemptRates — the player's OWN per-round attempt rates for the
 * Standing panel's counterfactual line (DC-ATTEMPT-1)
 * ----------------------------------------------------------------------------
 * `computeCounterfactual` sizes an attempt-rate metric (putt make % by band,
 * sand save %, par-type scoring) off `player_attempts_per_round` when it gets
 * one, and otherwise falls back to the global `stroke_impact_per_unit`, which
 * assumed Tour-like volume and overstates a college player's putting line by
 * more than 2x (reconciliation 2026-09-25: 2.3 vs 0.9 strokes/round on 3-5 ft).
 *
 * Sources, each the same one the insight engine uses for the same metric:
 *   - putt bands: band attempts ÷ rounds_played from the stats-cache row the
 *     standing value itself is refreshed from (PuttDistanceGenerator).
 *   - sand save: sand_attempts ÷ rounds_played from that row (the resolver
 *     `lookup-tables.ts` names for `sand_attempts_per_round`).
 *   - par-type scoring: the fixed hole counts ParTypeGenerator passes.
 *
 * Metrics that declare an `attempt_metric` but have no rate here (gir_pct,
 * scrambling from rough / fairway) get NO line in the panel: the legacy
 * constant would overstate them, and no player-own rate exists on this path.
 * ========================================================================== */

import { getCounterfactualConfig } from '@/lib/coachhelm/v3/counterfactual/lookup-tables';

/** The stats-cache columns this helper reads. All nullable, as in the table. */
export interface StandingAttemptSource {
  rounds_played: number | null;
  putt_attempts_3_5ft?: number | null;
  putt_attempts_5_10ft?: number | null;
  putt_attempts_10_15ft?: number | null;
  putt_attempts_15_25ft?: number | null;
  putt_attempts_25_plus_ft?: number | null;
  sand_attempts?: number | null;
}

const PUTT_BAND_COLUMN: Record<string, keyof StandingAttemptSource> = {
  putts_made_3_5ft_pct: 'putt_attempts_3_5ft',
  putts_made_5_10ft_pct: 'putt_attempts_5_10ft',
  putts_made_10_15ft_pct: 'putt_attempts_10_15ft',
  putts_made_15_25ft_pct: 'putt_attempts_15_25ft',
  putts_made_25_plus_ft_pct: 'putt_attempts_25_plus_ft',
};

/** ParTypeGenerator's PAR_HOLES_PER_ROUND (4 par-3s, 10 par-4s, 4 par-5s). */
const PAR_HOLES_PER_ROUND: Record<string, number> = {
  scoring_par_3: 4,
  scoring_par_4: 10,
  scoring_par_5: 4,
};

function usableRate(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Metric id → the player's attempts per round. Only finite, positive rates
 * are returned; a metric absent from the map has no known rate.
 */
export function resolveStandingAttemptRates(
  source: StandingAttemptSource | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = { ...PAR_HOLES_PER_ROUND };
  const rounds = source?.rounds_played ?? null;
  if (!source || !usableRate(rounds)) return out;

  for (const [metricId, column] of Object.entries(PUTT_BAND_COLUMN)) {
    const attempts = source[column];
    if (typeof attempts === 'number' && Number.isFinite(attempts) && attempts > 0) {
      out[metricId] = attempts / rounds;
    }
  }
  const sand = source.sand_attempts;
  if (typeof sand === 'number' && Number.isFinite(sand) && sand > 0) {
    out.scrambling_pct_sand = sand / rounds;
  }
  return out;
}

/**
 * The rate to hand `computeCounterfactual` for one metric:
 *   - `{ ok: true, rate: undefined }` for a metric sized without attempts
 *     (SG, proximity, deltas): the constant path is its real contract.
 *   - `{ ok: true, rate }` for an attempt-rate metric with a known rate.
 *   - `{ ok: false }` for an attempt-rate metric with no known rate: the
 *     caller shows no strokes line rather than the legacy overstated one.
 * Never returns a 0 / NaN rate (compute would silently take the legacy path).
 */
export function attemptRateFor(
  metricId: string,
  rates: Record<string, number> | null | undefined,
): { ok: true; rate: number | undefined } | { ok: false } {
  const cfg = getCounterfactualConfig(metricId);
  if (!cfg?.attempt_metric) return { ok: true, rate: undefined };
  const rate = rates?.[metricId];
  return usableRate(rate) ? { ok: true, rate } : { ok: false };
}
