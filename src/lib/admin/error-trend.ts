/**
 * Error-rate trend helpers for the Errors tab — pure, so the page's one
 * "worse than last time" claim is unit-tested without a database.
 *
 * Two things live here, and both exist because every other number on the
 * Bridge answers "now" and none answered "compared to what":
 *
 *   `sumHourlyBuckets`  — folds the per-fingerprint 24h histograms
 *                          `computeAppHourlyBuckets` already builds into ONE
 *                          hourly series, so the hourly chart still draws
 *                          when Sentry's series is unavailable. App rows are
 *                          one witness rather than two, and the chart says
 *                          so; a blank chart under a missing token was
 *                          hiding a trend the Bridge already had.
 *
 *   `describeWindowDelta` — the current window's row count against the
 *                          equal window before it. A percentage of a
 *                          COUNT, never of a confidence — and `null` in
 *                          means "unreadable" out, never a fabricated 0%.
 */

export const HOUR_MS = 3_600_000;

export interface HourlyPoint {
  /** Epoch ms of the bucket's START. */
  timestamp: number;
  accepted: number;
  total: number;
}

/**
 * One hourly series from many per-fingerprint ones.
 *
 * `nowMs` must be the SAME clock the buckets were computed against — the
 * bucket index only turns back into a wall-clock hour relative to the
 * window end the builder used. `fetchErrorsTab` carries that instant out as
 * `appHourlyComputedAt` for exactly this call.
 *
 * Returns `[]` when there are no buckets at all, so the caller can fall
 * through to its own empty state rather than draw a flat line that claims
 * "zero errors every hour" for a window nobody measured.
 */
export function sumHourlyBuckets(
  buckets: Readonly<Record<string, readonly number[]>>,
  nowMs: number,
): HourlyPoint[] {
  const series = Object.values(buckets);
  if (series.length === 0) return [];
  const length = Math.max(...series.map((s) => s.length));
  if (length === 0) return [];
  const windowStart = nowMs - length * HOUR_MS;
  const points: HourlyPoint[] = [];
  for (let idx = 0; idx < length; idx += 1) {
    const total = series.reduce((sum, s) => sum + (s[idx] ?? 0), 0);
    points.push({ timestamp: windowStart + idx * HOUR_MS, accepted: total, total });
  }
  return points;
}

export type DeltaDirection = 'up' | 'down' | 'flat' | 'unknown';

export interface WindowDelta {
  current: number | null;
  previous: number | null;
  /** Rounded whole percent. Null when unreadable, or when the prior window was 0 (no base to divide by). */
  deltaPct: number | null;
  direction: DeltaDirection;
  /** One line, ready to render — states both numbers so the percent is never the only channel. */
  label: string;
}

/**
 * Current-vs-prior in words and one number.
 *
 * `up` is the bad direction for an error count and the caller tones it that
 * way; this function does not pick a colour. A prior window of zero yields
 * no percentage at all — "+∞%" is not a claim, and "+100%" would be a lie —
 * so the label says "vs 0" and leaves it at that.
 */
export function describeWindowDelta(
  current: number | null,
  previous: number | null,
  windowHours: number,
): WindowDelta {
  if (current === null || previous === null) {
    return {
      current,
      previous,
      deltaPct: null,
      direction: 'unknown',
      label:
        current === null
          ? 'Current-window row count could not be read.'
          : `${current} error rows this window; the prior ${windowHours}h could not be read.`,
    };
  }

  if (previous === 0) {
    return {
      current,
      previous,
      deltaPct: null,
      direction: current === 0 ? 'flat' : 'up',
      label:
        current === 0
          ? `No error rows in this window or the prior ${windowHours}h.`
          : `${current} error rows this window vs 0 in the prior ${windowHours}h.`,
    };
  }

  const deltaPct = Math.round(((current - previous) / previous) * 100);
  const direction: DeltaDirection = deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat';
  const signed = deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`;
  return {
    current,
    previous,
    deltaPct,
    direction,
    label: `${current} error rows this window vs ${previous} in the prior ${windowHours}h (${signed}).`,
  };
}
