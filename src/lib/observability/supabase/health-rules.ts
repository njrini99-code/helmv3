/**
 * Pure connection-saturation and rollback-rate rules over
 * `helm_debug.db_health_samples` history (brief §19, §23).
 *
 * SAME REASONING AS db-health-delta.ts / query-regression.ts: fixture-tested
 * arithmetic, no I/O, no plpgsql. Both functions take history
 * MOST-RECENT-FIRST — the same order `helm_debug_read_db_health_history`
 * already returns it in (`order by sampled_at desc`) and
 * src/lib/admin/database/overview.ts already fetches it in, so no reader
 * needs to re-sort before calling either function.
 *
 * `connections_pct_max` IS A FRACTION, NOT A PERCENTAGE. Verified against
 * db-health-delta.ts's own arithmetic: `connectionsTotal / maxConnections`,
 * unrounded to more than 4 decimal places, stored in a `numeric(5,2)`
 * column and rendered on the Bridge page with `format: { style: 'percent' }`
 * (src/app/admin/database/page.tsx's StatTile). So brief §19's "70%
 * sustained warning / 80% sustained / 90% critical" are 0.70 / 0.80 / 0.90
 * here, never 70/80/90 — a threshold written against the wrong scale would
 * simply never fire, and a fixture test built on the same wrong assumption
 * would pass while masking it.
 *
 * "USE THE SAMPLED max_connections FROM THE ROW" (per this track's own
 * brief) is satisfied by `connectionsPctMax` itself: `db_health_samples`
 * has no `max_connections` column (the snapshot RPC returns it, but
 * `record_db_health_sample` never persists the raw value — only the ratio
 * it already computed against it), so the percentage column IS the carrier
 * of the sampled max_connections; there is no separate column to read and
 * no reason to hardcode the measured-truth doc's snapshot value of 60,
 * which is itself just a point-in-time reading, not a constant.
 */

export type SaturationLevel = 'ok' | 'warning' | 'high' | 'critical';

const SATURATION_WARNING = 0.7;
const SATURATION_HIGH = 0.8;
const SATURATION_CRITICAL = 0.9;

export interface ConnectionSaturationSample {
  sampledAt: string;
  /** Fraction 0..1, or null when the sample never recorded a max (should not
   *  happen once the collector is live, but a reader must not crash on a
   *  malformed row). */
  connectionsPctMax: number | null;
}

export interface ConnectionSaturationResult {
  level: SaturationLevel;
  latestPctMax: number | null;
  /** True when the latest sample AND the one immediately before it are both
   *  >= 80% — brief §19's "sustained" requirement for the 'high' level. A
   *  single 80%+ sample alone stays 'warning', not 'high'. */
  sustainedHigh: boolean;
}

/**
 * `history` must be ordered most-recent-first (index 0 = latest sample).
 * 90%+ is immediate/critical regardless of whether it is sustained — brief
 * §19 gives 90% no "sustained" qualifier, unlike the 70%/80% lines.
 */
export function evaluateConnectionSaturation(
  history: readonly ConnectionSaturationSample[],
): ConnectionSaturationResult {
  const latest = history[0] ?? null;
  const latestPctMax = latest?.connectionsPctMax ?? null;

  if (latestPctMax === null) {
    return { level: 'ok', latestPctMax: null, sustainedHigh: false };
  }

  const previous = history[1] ?? null;
  const previousPctMax = previous?.connectionsPctMax ?? null;
  const sustainedHigh = latestPctMax >= SATURATION_HIGH && previousPctMax !== null && previousPctMax >= SATURATION_HIGH;

  if (latestPctMax >= SATURATION_CRITICAL) {
    return { level: 'critical', latestPctMax, sustainedHigh };
  }
  if (sustainedHigh) {
    return { level: 'high', latestPctMax, sustainedHigh: true };
  }
  if (latestPctMax >= SATURATION_WARNING) {
    return { level: 'warning', latestPctMax, sustainedHigh: false };
  }
  return { level: 'ok', latestPctMax, sustainedHigh: false };
}

export type RollbackBaselineStatus = 'collecting' | 'ready';

export interface RollbackRateSample {
  sampledAt: string;
  /** From db_health_samples.xact_commit_delta / xact_rollback_delta.
   *  `null` on a first-sample or counter-reset window (collectorStatus !==
   *  'ok') — MUST stay null through this whole pipeline, never coerced to
   *  0, or a reset window would read as "zero rollbacks" instead of "no
   *  signal this window". */
  xactCommitDelta: number | null;
  xactRollbackDelta: number | null;
}

export interface RollbackRateResult {
  /** Fraction 0..1, this sample's rollback rate, or null if this sample had
   *  no usable delta (reset/first-sample) or zero total transactions. */
  latestRatePct: number | null;
  /** Fraction 0..1, mean rate over the OLDER half of the usable window, or
   *  null while `baselineStatus` is 'collecting'. */
  baselineRatePct: number | null;
  baselineStatus: RollbackBaselineStatus;
  /** True only once a baseline is 'ready' AND the latest rate is both more
   *  than 2x that baseline AND itself above 5% — brief §23: "no blind
   *  static threshold", so a jump from 0.01% to 0.03% (2x, but negligible)
   *  never flags on the multiplier alone. */
  isRegression: boolean;
}

/** Judgment call, not a measured constant: how many usable (non-null-rate)
 *  samples must exist before a baseline is trustworthy. Brief §49-55 names
 *  the state ('collecting' until meaningful) but not the threshold — this
 *  repo's sibling module (query-regression.ts's BASELINE_MIN_SAMPLES) picks
 *  5 for a 15-minute-cadence collector; this one runs every 5 minutes, so a
 *  comparable ~2-hour minimum history is 24 samples. */
export const ROLLBACK_BASELINE_MIN_SAMPLES = 24;
const ROLLBACK_REGRESSION_MULTIPLIER = 2;
const ROLLBACK_REGRESSION_FLOOR = 0.05;

function computeRate(sample: RollbackRateSample): number | null {
  if (sample.xactCommitDelta === null || sample.xactRollbackDelta === null) return null;
  const total = sample.xactCommitDelta + sample.xactRollbackDelta;
  if (total <= 0) return null; // zero transactions this window — undefined rate, not a zero rate.
  return sample.xactRollbackDelta / total;
}

/**
 * `history` must be ordered most-recent-first (index 0 = latest sample),
 * same convention as `evaluateConnectionSaturation`.
 */
export function evaluateRollbackRate(history: readonly RollbackRateSample[]): RollbackRateResult {
  // Only samples with a usable (non-null, non-zero-total) rate count toward
  // "sufficient samples" — a run of reset/first-sample windows teaches
  // nothing about a real baseline and must not fill the quota.
  const usableRatesMostRecentFirst: number[] = [];
  for (const sample of history) {
    const rate = computeRate(sample);
    if (rate !== null) usableRatesMostRecentFirst.push(rate);
  }

  const latestRatePct = usableRatesMostRecentFirst[0] ?? null;

  if (usableRatesMostRecentFirst.length < ROLLBACK_BASELINE_MIN_SAMPLES) {
    return { latestRatePct, baselineRatePct: null, baselineStatus: 'collecting', isRegression: false };
  }

  // "Baseline from the older half of the window" — the SECOND half of this
  // most-recent-first array, i.e. the chronologically OLDER samples.
  const olderHalf = usableRatesMostRecentFirst.slice(Math.floor(usableRatesMostRecentFirst.length / 2));
  const baselineRatePct = olderHalf.reduce((sum, r) => sum + r, 0) / olderHalf.length;

  const isRegression =
    latestRatePct !== null &&
    baselineRatePct > 0 &&
    latestRatePct > baselineRatePct * ROLLBACK_REGRESSION_MULTIPLIER &&
    latestRatePct > ROLLBACK_REGRESSION_FLOOR;

  return { latestRatePct, baselineRatePct, baselineStatus: 'ready', isRegression };
}
