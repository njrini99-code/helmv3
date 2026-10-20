/**
 * Leak-map bucket aggregation (pure) — putt make % by distance and approach
 * proximity by distance, for `src/app/golf/actions/stats-leak-maps.ts`.
 *
 * Kept out of the `'use server'` file, which may only export async functions,
 * so the bucket rules are unit-testable on their own.
 *
 * Audit rows 9 and 32 (2026-09-28):
 *   - Approach proximity used to average only the approaches that FOUND the
 *     green (5,749 of 10,951 shots) and was plotted against Tour proximity,
 *     which counts every approach. A team that missed more greens looked
 *     better — it "beat the PGA Tour" from 125-175 and 175+ yd. Proximity is
 *     now unconditional (`basis: 'all_shot'`), matching the standing RPC
 *     (migration 20260922120000) and the Tour reference; the green-hit rate
 *     rides along so the two stay readable together.
 *   - A band with 1-3 putts printed a make %. Below {@link LEAK_BUCKET_MIN_N}
 *     the value is withheld (null, `below_floor: true`); `sample_n` still
 *     reports what was there. Reported values carry a 95% interval.
 *
 * Owner decision Q-93 (2026-09-30): the putt make % has ONE definition, in
 * `src/lib/golf/putt-make.ts`, shared with the stats calculator and Clubhouse:
 * start distance = distance_to_hole_before (feet, clamped), made = result 'hole'
 * OR putt_made true (a null putt_made on a holed putt is a make), no start
 * distance = not banded, bands cut (lo, hi]. This module only maps the shared
 * fine bands onto the six reporting bands below. The Tour reference is the only
 * benchmark a bucket carries (no Division 1 value).
 */

import { classifyParFiveLongApproach } from '@/lib/coachhelm/v3/metrics/layup-intent';
import { tCritical95, wilsonInterval } from '@/lib/coachhelm/v3/stats/intervals';
import { round } from '@/lib/golf/stat-formulas';
import {
  PUTT_REPORT_BAND_OF,
  bandedPutt,
  puttMakeBandFor,
  type PuttMakeInput,
} from '@/lib/golf/putt-make';
import type { LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

/** Minimum attempts before a bucket's value is shown. Same floor as the
 *  putting benchmark sheet (PUTTING_BENCHMARK_MIN_SAMPLE) and the standing
 *  RPC's all-shot proximity floor (MIN_ATTEMPTS). */
export const LEAK_BUCKET_MIN_N = 10;

/**
 * Putt-make% reporting bands, low → high feet. The 0-3 ft band has no PGA
 * standard. `min`/`max` describe each band (upper edge inclusive); the edges
 * that actually bucket a putt live in `@/lib/golf/putt-make` (PUTT_MAKE_BANDS,
 * PUTT_REPORT_BAND_OF), shared with the calculator.
 */
export const PUTT_BANDS: ReadonlyArray<{
  bucket_id: string;
  label: string;
  metric_id: string | null;
  min: number;
  /** upper edge, INCLUSIVE for putts (see `puttBandFor`); null = open-ended (25+). */
  max: number | null;
}> = [
  { bucket_id: '0_3', label: '0-3 ft', metric_id: null, min: 0, max: 3 },
  { bucket_id: '3_5', label: '3-5 ft', metric_id: 'putts_made_3_5ft_pct', min: 3, max: 5 },
  { bucket_id: '5_10', label: '5-10 ft', metric_id: 'putts_made_5_10ft_pct', min: 5, max: 10 },
  { bucket_id: '10_15', label: '10-15 ft', metric_id: 'putts_made_10_15ft_pct', min: 10, max: 15 },
  { bucket_id: '15_25', label: '15-25 ft', metric_id: 'putts_made_15_25ft_pct', min: 15, max: 25 },
  { bucket_id: '25_plus', label: '25+ ft', metric_id: 'putts_made_25_plus_ft_pct', min: 25, max: null },
];

/** Approach-proximity bands bucketed on the before-distance in yards. */
export const APPROACH_BANDS: ReadonlyArray<{
  bucket_id: string;
  label: string;
  metric_id: string;
  min: number;
  max: number | null;
}> = [
  { bucket_id: '50_125', label: '50-125 yd', metric_id: 'approach_proximity_50_125ft', min: 50, max: 125 },
  { bucket_id: '125_175', label: '125-175 yd', metric_id: 'approach_proximity_125_175ft', min: 125, max: 175 },
  { bucket_id: '175_plus', label: '175+ yd', metric_id: 'approach_proximity_175_plus_ft', min: 175, max: null },
];

/**
 * An ON-GREEN finish farther than this (feet) is a mis-entry: no green is 50
 * yards deep. Off-green misses are NOT capped — a long miss is exactly the
 * shot an all-shot proximity has to count.
 */
const ON_GREEN_CEILING_FT = 150;

export interface PgaRef {
  pga_tour_value: number | null;
  /**
   * @deprecated Nothing reads it: the leak map is Tour-only. Kept optional so
   * callers that still build `{ pga_tour_value, div1_avg_value: null }` compile.
   */
  div1_avg_value?: number | null;
}

/** A putting shot row for the make %: the shared definition's inputs. */
export type PuttShotRow = PuttMakeInput;

export interface ApproachShotRow {
  distance_to_hole_before: number | null;
  distance_unit_before?: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  result: string | null;
  lie_after?: string | null;
  /** Hole par (golf_holes via hole_id); null when unresolvable. */
  par?: number | null;
}

/** Find the band for a value: [min, max) with the last band open-ended. */
function bandFor<T extends { min: number; max: number | null }>(
  bands: ReadonlyArray<T>,
  value: number,
): T | null {
  for (const band of bands) {
    if (value < band.min) continue;
    if (band.max === null || value < band.max) return band;
  }
  return null;
}

/**
 * Putt reporting band for a distance in feet, UPPER-inclusive: "3-5 ft" is
 * (3, 5], and 0-3 ft takes everything up to 3. Same edges as the cache writer
 * (`putt_make_pct_3_5ft`: feet > 3 AND feet <= 5) and the calculator's
 * `getPuttDistanceBucket` (one set of edges: `@/lib/golf/putt-make`).
 */
export function puttBandFor(feet: number): (typeof PUTT_BANDS)[number] | null {
  const id = PUTT_REPORT_BAND_OF[puttMakeBandFor(feet)];
  return PUTT_BANDS.find((band) => band.bucket_id === id) ?? null;
}

export function aggregatePuttBuckets(
  rows: readonly PuttShotRow[],
  refs: ReadonlyMap<string, PgaRef>,
): LeakBucket[] {
  const made = new Map<string, number>();
  const gradeable = new Map<string, number>();
  for (const row of rows) {
    // The shared definition: start distance from distance_to_hole_before (a putt
    // with none is not banded), made = result 'hole' OR putt_made true. A putt
    // with no holed signal is an attempt that missed, never a dropped row.
    const banded = bandedPutt(row);
    if (!banded) continue;
    const bucketId = PUTT_REPORT_BAND_OF[banded.band];
    gradeable.set(bucketId, (gradeable.get(bucketId) ?? 0) + 1);
    if (banded.made) made.set(bucketId, (made.get(bucketId) ?? 0) + 1);
  }
  return PUTT_BANDS.map((band) => {
    const n = gradeable.get(band.bucket_id) ?? 0;
    const k = made.get(band.bucket_id) ?? 0;
    const ref = band.metric_id ? refs.get(band.metric_id) : undefined;
    const report = n >= LEAK_BUCKET_MIN_N;
    const ci = report ? wilsonInterval(k, n) : null;
    return {
      metric_id: band.metric_id,
      bucket_id: band.bucket_id,
      label: band.label,
      team_value: report ? round((100 * k) / n, 1) : null,
      pga_value: ref?.pga_tour_value ?? null,
      sample_n: n,
      min_n: LEAK_BUCKET_MIN_N,
      below_floor: n > 0 && !report,
      ci_low: ci ? round(ci.low, 1) : null,
      ci_high: ci ? round(ci.high, 1) : null,
    };
  });
}

function isOnGreen(row: ApproachShotRow): boolean {
  const r = (row.result ?? '').toLowerCase();
  return r === 'green' || r === 'hole' || r === 'gir' || (row.lie_after ?? '').toLowerCase() === 'green';
}

export function aggregateApproachBuckets(
  rows: readonly ApproachShotRow[],
  refs: ReadonlyMap<string, PgaRef>,
): LeakBucket[] {
  const leaves = new Map<string, number[]>();
  const greens = new Map<string, number>();
  const layups = new Map<string, number>();
  for (const row of rows) {
    const beforeRaw = row.distance_to_hole_before;
    const afterRaw = row.distance_to_hole_after;
    if (beforeRaw === null || Number.isNaN(beforeRaw)) continue;
    if (afterRaw === null || Number.isNaN(afterRaw)) continue;
    // Units mirror the standing RPC: before defaults to yards, after to feet.
    const beforeYd = (row.distance_unit_before ?? 'yards').toLowerCase() === 'feet' ? beforeRaw / 3 : beforeRaw;
    const afterFt = (row.distance_unit_after ?? 'feet').toLowerCase() === 'yards' ? afterRaw * 3 : afterRaw;
    const band = bandFor(APPROACH_BANDS, beforeYd);
    if (!band) continue;
    const onGreen = isOnGreen(row);
    if (afterFt < 0) continue;
    if (onGreen && afterFt > ON_GREEN_CEILING_FT) continue;
    if (band.bucket_id === '175_plus') {
      const intent = classifyParFiveLongApproach({ par: row.par ?? null, onGreen, leaveFeet: afterFt });
      if (intent === 'layup') {
        layups.set(band.bucket_id, (layups.get(band.bucket_id) ?? 0) + 1);
        continue;
      }
    }
    const list = leaves.get(band.bucket_id) ?? [];
    list.push(afterFt);
    leaves.set(band.bucket_id, list);
    if (onGreen) greens.set(band.bucket_id, (greens.get(band.bucket_id) ?? 0) + 1);
  }
  return APPROACH_BANDS.map((band) => {
    const xs = leaves.get(band.bucket_id) ?? [];
    const n = xs.length;
    const ref = refs.get(band.metric_id);
    const report = n >= LEAK_BUCKET_MIN_N;
    let mean: number | null = null;
    let ciLow: number | null = null;
    let ciHigh: number | null = null;
    if (report) {
      const m = xs.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1));
      const half = tCritical95(n - 1) * (sd / Math.sqrt(n));
      mean = round(m, 1);
      ciLow = round(Math.max(0, m - half), 1);
      ciHigh = round(m + half, 1);
    }
    return {
      metric_id: band.metric_id,
      bucket_id: band.bucket_id,
      label: band.label,
      team_value: mean,
      pga_value: ref?.pga_tour_value ?? null,
      sample_n: n,
      min_n: LEAK_BUCKET_MIN_N,
      below_floor: n > 0 && !report,
      ci_low: ciLow,
      ci_high: ciHigh,
      basis: 'all_shot' as const,
      green_hit_pct: n > 0 ? round((100 * (greens.get(band.bucket_id) ?? 0)) / n, 1) : null,
      excluded_layups: layups.get(band.bucket_id) ?? 0,
    };
  });
}
