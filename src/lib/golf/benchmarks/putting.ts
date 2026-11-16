/**
 * Putting benchmarks — make % by distance band against the Tour (DASH-12).
 *
 * Tour only (owner decision Q-93): the PGA Tour for men's teams, the LPGA Tour
 * for women's teams. There is no college or division reference.
 *
 * SOURCE OF TRUTH IS THE DATABASE: `public.golf_pga_standards`, the same table
 * the leak-map loader (`src/app/golf/actions/stats-leak-maps.ts` loadPgaRefs)
 * reads live. `pga_tour_value` is the tour average for the row's tour (the
 * column name is reused for LPGA rows). The numbers live in the shared mirror
 * `./tour.ts`; this module adds the per-band citations and the row grading.
 * The men's Tour values are also the `cohort-baselines.ts` putt anchors; a
 * test pins the two together.
 *
 * Only the five bands that have a standard are listed. The 0-3 ft band has no
 * row in golf_pga_standards, so it has no benchmark here either (null), rather
 * than an invented one.
 */

import { TOUR_STANDARDS, tourFor, type TourKey, type TourPuttBand } from './tour';

export type PuttingBenchmarkBand = TourPuttBand;

/** Which tour's standard applies: LPGA for women's teams, PGA otherwise. */
export type PuttingTour = TourKey;

export interface PuttingBandBenchmark {
  /** Tour average make % (0-100). */
  tour: number;
  /** One-line citation for the value. */
  sourceNote: string;
}

export interface PuttingBandDefinition {
  band: PuttingBenchmarkBand;
  /** `golf_pga_standards.metric_id` / display-registry id for the band. */
  metricId: string;
  label: string;
}

/** Bands in distance order; ids match the leak map's `bucket_id`. */
export const PUTTING_BENCHMARK_BANDS: readonly PuttingBandDefinition[] = [
  { band: '3_5', metricId: 'putts_made_3_5ft_pct', label: '3-5 ft' },
  { band: '5_10', metricId: 'putts_made_5_10ft_pct', label: '5-10 ft' },
  { band: '10_15', metricId: 'putts_made_10_15ft_pct', label: '10-15 ft' },
  { band: '15_25', metricId: 'putts_made_15_25ft_pct', label: '15-25 ft' },
  { band: '25_plus', metricId: 'putts_made_25_plus_ft_pct', label: '25+ ft' },
];

// Each note quotes the row's own `source` column (season 2024); the value is
// the row's `pga_tour_value`.
const TABLE = 'golf_pga_standards season 2024, read 2026-09-30';

const BAND_SOURCE: Record<TourKey, Record<PuttingBenchmarkBand, string>> = {
  pga: {
    '3_5': `${TABLE} tour=pga: Tour avg of 3+4+5 ft.`,
    '5_10': `${TABLE} tour=pga: Tour avg of 5-9 ft.`,
    '10_15': `${TABLE} tour=pga: Tour avg of 10 ft (41.3%) + 11-15 ft (30.1%).`,
    '15_25': `${TABLE} tour=pga: Tour avg of 15-20 ft (18.3%) + 20-25 ft (12.5%).`,
    '25_plus': `${TABLE} tour=pga: Tour 25+ ft = 5.5%.`,
  },
  lpga: {
    '3_5': `${TABLE} tour=lpga: LPGA ShotLink 2024 3-5 ft ~86%.`,
    '5_10': `${TABLE} tour=lpga: LPGA ShotLink 2024 5-10 ft ~55%.`,
    '10_15': `${TABLE} tour=lpga: LPGA ShotLink 2024 10-15 ft ~30%.`,
    '15_25': `${TABLE} tour=lpga: LPGA ShotLink 2024 15-25 ft ~12%.`,
    '25_plus': `${TABLE} tour=lpga: LPGA ShotLink 2024 25+ ft ~5%.`,
  },
};

/**
 * Below this many graded putts a band's make % is shown with its sample but
 * not compared: it matches the display registry's `floor: 10` for the
 * `putts_made_*` metrics (src/lib/golf/metrics/display-registry.ts).
 */
export const PUTTING_BENCHMARK_MIN_SAMPLE = 10;

/** Tour for a team gender, mirroring loadPgaRefs' routing (see `tourFor`). */
export function puttingTourForGender(gender: string | null | undefined): PuttingTour {
  return tourFor(gender);
}

/** The standard for one band, or null for a band with no standard (0-3 ft). */
export function puttingBenchmark(band: string, tour: PuttingTour = 'pga'): PuttingBandBenchmark | null {
  const value = (TOUR_STANDARDS[tour].putts as Record<string, number | undefined>)[band];
  if (value === undefined) return null;
  return { tour: value, sourceNote: BAND_SOURCE[tour][band as PuttingBenchmarkBand] };
}

/** The leak-map band shape this module reads (a subset of `LeakBucket`). */
export interface PuttingBandSample {
  bucket_id: string;
  label: string;
  /** Player make % (0-100), null when there are no graded putts. */
  team_value: number | null;
  /** Live tour reference, when the loader found one. */
  pga_value: number | null;
  sample_n: number;
}

/**
 * Tour-relative verdict. `above_tour` means at or above the Tour's make rate;
 * `below_tour` means under it (the row carries the gap in points).
 */
export type PuttingBandVerdict = 'above_tour' | 'below_tour' | 'small_sample' | 'no_putts';

export interface PuttingBenchmarkRow {
  band: PuttingBenchmarkBand;
  label: string;
  makePct: number | null;
  sampleN: number;
  tour: number;
  /** Player make % minus the Tour value, in points; null when not compared. */
  gapToTour: number | null;
  verdict: PuttingBandVerdict;
}

/**
 * One row per benchmarked band, in distance order. Live references on the
 * sample win over the mirrored constants (they are the same table, read
 * now). Bands with no standard (0-3 ft) are dropped. A band is only compared
 * once it has PUTTING_BENCHMARK_MIN_SAMPLE graded putts.
 */
export function buildPuttingBenchmarkRows(
  samples: readonly PuttingBandSample[],
  tour: PuttingTour = 'pga',
): PuttingBenchmarkRow[] {
  const byBand = new Map(samples.map((s) => [s.bucket_id, s]));
  const rows: PuttingBenchmarkRow[] = [];
  for (const def of PUTTING_BENCHMARK_BANDS) {
    const standard = puttingBenchmark(def.band, tour);
    if (!standard) continue;
    const sample = byBand.get(def.band);
    const tourValue = sample?.pga_value ?? standard.tour;
    const sampleN = sample?.sample_n ?? 0;
    const makePct = sampleN > 0 ? (sample?.team_value ?? null) : null;

    let verdict: PuttingBandVerdict;
    let gapToTour: number | null = null;
    if (sampleN === 0) {
      verdict = 'no_putts';
    } else if (makePct === null || sampleN < PUTTING_BENCHMARK_MIN_SAMPLE) {
      // The leak map withholds a band's make % below its floor (audit rows
      // 9/32): putts exist, there are just too few to rate.
      verdict = 'small_sample';
    } else {
      gapToTour = Math.round((makePct - tourValue) * 10) / 10;
      verdict = makePct >= tourValue ? 'above_tour' : 'below_tour';
    }

    rows.push({
      band: def.band,
      label: sample?.label ?? def.label,
      makePct,
      sampleN,
      tour: tourValue,
      gapToTour,
      verdict,
    });
  }
  return rows;
}

/**
 * The per-distance make rates three PGA rows were averaged from, as each row's
 * own `source` text gives them (golf_pga_standards season 2024, tour=pga):
 * 3-5 ft is the plain mean of 3, 4 and 5 ft, 10-15 ft of 10 ft and 11-15 ft,
 * 15-25 ft of 15-20 ft and 20-25 ft. Each point covers distances up to `upTo`
 * feet (the nearest foot for the single-foot rates). 5-10 ft and 25+ ft cite no
 * breakdown, and the LPGA rows cite none, so those bands keep their row's value.
 */
const TOUR_PUTT_RATE_POINTS: Readonly<Record<string, readonly { upTo: number; rate: number }[]>> = {
  putts_made_3_5ft_pct: [
    { upTo: 3.5, rate: 99.4 },
    { upTo: 4.5, rate: 91.4 },
    { upTo: Infinity, rate: 80.7 },
  ],
  putts_made_10_15ft_pct: [
    { upTo: 10.5, rate: 41.3 },
    { upTo: Infinity, rate: 30.1 },
  ],
  putts_made_15_25ft_pct: [
    { upTo: 20, rate: 18.3 },
    { upTo: Infinity, rate: 12.5 },
  ],
};

/**
 * The Tour's make rate for a band, weighted by where these putts were from
 * (SC-08): each putt counts the Tour's rate at its own distance, so a band of
 * 4- and 5-footers is not graded against a plain mean that includes 3 ft.
 * `rowValue` is the band's live `pga_tour_value`. The points are used only
 * while that value is still their plain mean (the row they were cited from);
 * an LPGA row, a row updated since, a band with no breakdown or a band with no
 * putts answers `rowValue` unchanged.
 */
export function puttBandTourRate(metricId: string, rowValue: number, feet: readonly number[]): number {
  const points = TOUR_PUTT_RATE_POINTS[metricId];
  if (!points || feet.length === 0) return rowValue;
  const mean = points.reduce((sum, p) => sum + p.rate, 0) / points.length;
  if (Math.abs(mean - rowValue) > 0.05) return rowValue;
  const rateAt = (d: number) => (points.find((p) => d <= p.upTo) ?? points[points.length - 1]!).rate;
  return feet.reduce((sum, d) => sum + rateAt(d), 0) / feet.length;
}
