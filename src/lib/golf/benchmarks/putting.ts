/**
 * Putting benchmarks — make % by distance band against the Tour and the
 * Division-1 average (DASH-12).
 *
 * SOURCE OF TRUTH IS THE DATABASE: `public.golf_pga_standards`, the same table
 * the leak-map loader (`src/app/golf/actions/stats-leak-maps.ts` loadPgaRefs)
 * reads live. `pga_tour_value` is the tour average for the row's tour (the
 * column name is reused for LPGA rows); `div1_avg_value` is the NCAA D1
 * average. The constants below mirror those rows so a pure module (tests, a
 * band with no live reference) agrees with what the leak map prints.
 * KEEP IN SYNC with golf_pga_standards. The men's Tour values are also the
 * `cohort-baselines.ts` putt anchors; a test pins the two together.
 *
 * Only the five bands that have a standard are listed. The 0-3 ft band has no
 * row in golf_pga_standards, so it has no benchmark here either (null), rather
 * than an invented one.
 */

export type PuttingBenchmarkBand = '3_5' | '5_10' | '10_15' | '15_25' | '25_plus';

/** Which tour's standard applies: LPGA for women's teams, PGA otherwise. */
export type PuttingTour = 'pga' | 'lpga';

export interface PuttingBandBenchmark {
  /** Tour average make % (0-100). */
  tour: number;
  /** NCAA Division-1 average make % (0-100). */
  div1: number;
  /** One-line citation for both values. */
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

// Each note quotes the row's own `source` column (season 2024). Values are
// the row's `pga_tour_value` (tour) and `div1_avg_value` (div1).
const TABLE = 'golf_pga_standards season 2024, read 2026-09-25';
const LPGA_DIV1 = 'D1: div1_avg_value; the row states no D1 derivation.';

const PUTTING_STANDARDS: Record<PuttingTour, Record<PuttingBenchmarkBand, PuttingBandBenchmark>> = {
  pga: {
    '3_5': { tour: 90.5, div1: 88.0, sourceNote: `${TABLE} tour=pga: Tour avg of 3+4+5 ft; D1 estimate per Shot Scope 0-HCP "0-6 ft = 92.8%".` },
    '5_10': { tour: 62.2, div1: 50.0, sourceNote: `${TABLE} tour=pga: Tour avg of 5-9 ft; D1 estimate per Shot Scope "6-12 ft = 41-43%".` },
    '10_15': { tour: 35.7, div1: 25.0, sourceNote: `${TABLE} tour=pga: Tour avg of 10 ft (41.3%) + 11-15 ft (30.1%); D1 per Shot Scope 0-HCP "12-18 ft = 25.1%".` },
    '15_25': { tour: 15.4, div1: 12.0, sourceNote: `${TABLE} tour=pga: Tour avg of 15-20 ft (18.3%) + 20-25 ft (12.5%); D1 per Shot Scope 0-HCP "18-24 ft = 14.5%".` },
    '25_plus': { tour: 5.5, div1: 4.0, sourceNote: `${TABLE} tour=pga: Tour 25+ ft = 5.5%; D1 per Shot Scope 0-HCP "30+ ft = 4.3%".` },
  },
  lpga: {
    '3_5': { tour: 86.0, div1: 80.0, sourceNote: `${TABLE} tour=lpga: LPGA ShotLink 2024 3-5 ft ~86%. ${LPGA_DIV1}` },
    '5_10': { tour: 55.0, div1: 44.0, sourceNote: `${TABLE} tour=lpga: LPGA ShotLink 2024 5-10 ft ~55%. ${LPGA_DIV1}` },
    '10_15': { tour: 30.0, div1: 22.0, sourceNote: `${TABLE} tour=lpga: LPGA ShotLink 2024 10-15 ft ~30%. ${LPGA_DIV1}` },
    '15_25': { tour: 12.0, div1: 9.0, sourceNote: `${TABLE} tour=lpga: LPGA ShotLink 2024 15-25 ft ~12%. ${LPGA_DIV1}` },
    '25_plus': { tour: 5.0, div1: 3.8, sourceNote: `${TABLE} tour=lpga: LPGA ShotLink 2024 25+ ft ~5%. ${LPGA_DIV1}` },
  },
};

/**
 * Below this many graded putts a band's make % is shown with its sample but
 * not compared: it matches the display registry's `floor: 10` for the
 * `putts_made_*` metrics (src/lib/golf/metrics/display-registry.ts).
 */
export const PUTTING_BENCHMARK_MIN_SAMPLE = 10;

/** Tour for a team gender, mirroring loadPgaRefs' routing. */
export function puttingTourForGender(gender: string | null | undefined): PuttingTour {
  return gender === 'womens' ? 'lpga' : 'pga';
}

/** The standard for one band, or null for a band with no standard (0-3 ft). */
export function puttingBenchmark(band: string, tour: PuttingTour = 'pga'): PuttingBandBenchmark | null {
  return (PUTTING_STANDARDS[tour] as Record<string, PuttingBandBenchmark | undefined>)[band] ?? null;
}

/** The leak-map band shape this module reads (a subset of `LeakBucket`). */
export interface PuttingBandSample {
  bucket_id: string;
  label: string;
  /** Player make % (0-100), null when there are no graded putts. */
  team_value: number | null;
  /** Live tour reference, when the loader found one. */
  pga_value: number | null;
  div1_value: number | null;
  sample_n: number;
}

export type PuttingBandVerdict = 'above_tour' | 'between' | 'below_div1' | 'small_sample' | 'no_putts';

export interface PuttingBenchmarkRow {
  band: PuttingBenchmarkBand;
  label: string;
  makePct: number | null;
  sampleN: number;
  tour: number;
  div1: number;
  /** Player make % minus the D1 average, in points; null when not compared. */
  gapToDiv1: number | null;
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
    const div1Value = sample?.div1_value ?? standard.div1;
    const sampleN = sample?.sample_n ?? 0;
    const makePct = sampleN > 0 ? (sample?.team_value ?? null) : null;

    let verdict: PuttingBandVerdict;
    let gapToDiv1: number | null = null;
    if (makePct === null) {
      verdict = 'no_putts';
    } else if (sampleN < PUTTING_BENCHMARK_MIN_SAMPLE) {
      verdict = 'small_sample';
    } else {
      gapToDiv1 = Math.round((makePct - div1Value) * 10) / 10;
      verdict = makePct >= tourValue ? 'above_tour' : makePct < div1Value ? 'below_div1' : 'between';
    }

    rows.push({
      band: def.band,
      label: sample?.label ?? def.label,
      makePct,
      sampleN,
      tour: tourValue,
      div1: div1Value,
      gapToDiv1,
      verdict,
    });
  }
  return rows;
}
