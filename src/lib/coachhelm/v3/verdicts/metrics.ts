/**
 * Which focus-area metrics can carry a criterion and a verdict, and where the
 * post-assignment counts come from (04 §1.3, 03 §4.2-§4.3).
 *
 * Only make-rate style metrics are listed: the verdict is a one-sided 90%
 * bound on a proportion, so the engine needs the made and attempted COUNTS
 * after the assignment, from the same source the read used:
 *
 * - putt bands: `golf_shots` putts, banded on `distance_to_hole_before` with
 *   the half-open (lo, hi] edges of `update_player_putt_make_pct`
 *   (supabase/migrations/20260928120000), made = `result = 'hole'` or
 *   `putt_made`; the putt-distance generator reads that cache.
 * - per-round counts: `golf_round_stats_cache` numerator and denominator
 *   columns, pooled over the window (the same pooling
 *   `focus-areas/catalog.ts` `aggregateFocusMetric` does for progress).
 *
 * Everything else (proximity in feet, per-round rates, scoring averages,
 * custom text) has no verdict yet: no criterion is stamped and the row's
 * `verdict` stays null. Floors are 04 §2 (say / Clear = 2 × say).
 *
 * Pure data.
 */
import { KAPPA } from '@/lib/coachhelm/v3/support/shrink';

export type RoundCacheCountColumn =
  | 'fairways_hit'
  | 'fairways_total'
  | 'greens_hit'
  | 'greens_total'
  | 'scrambles_converted'
  | 'scramble_attempts'
  | 'sand_saves'
  | 'sand_attempts';

export type VerdictCountSource =
  | {
      kind: 'putt_band';
      /** Exclusive lower edge, feet. */
      minFeetExclusive: number;
      /** Inclusive upper edge, feet; null = no upper edge. */
      maxFeetInclusive: number | null;
    }
  | { kind: 'round_cache'; made: RoundCacheCountColumn; attempts: RoundCacheCountColumn };

export interface VerdictMetricDef {
  metric: string;
  /** Plain words for the verdict line ("3–5 ft putts"). */
  label: string;
  direction: 'higher' | 'lower';
  unit: 'pct';
  /** What one attempt is, for copy ("putts", "greens"). */
  attemptNoun: string;
  /** κ for the shrunk baseline. */
  kappa: number;
  /** 04 §2 floor for saying anything, in attempts. */
  sayFloor: number;
  /** 04 §2 Clear floor (2 × say), in attempts: the longest default horizon. */
  clearFloor: number;
  source: VerdictCountSource;
}

const PUTT_FLOORS = { sayFloor: 20, clearFloor: 40 } as const;

function puttBand(metric: string, label: string, lo: number, hi: number | null): VerdictMetricDef {
  return {
    metric,
    label,
    direction: 'higher',
    unit: 'pct',
    attemptNoun: 'putts',
    kappa: KAPPA.attempts,
    ...PUTT_FLOORS,
    source: { kind: 'putt_band', minFeetExclusive: lo, maxFeetInclusive: hi },
  };
}

const DEFS: readonly VerdictMetricDef[] = [
  puttBand('putts_made_3_5ft_pct', '3–5 ft putts', 3, 5),
  puttBand('putts_made_5_10ft_pct', '5–10 ft putts', 5, 10),
  puttBand('putts_made_10_15ft_pct', '10–15 ft putts', 10, 15),
  puttBand('putts_made_15_25ft_pct', '15–25 ft putts', 15, 25),
  puttBand('putts_made_25_plus_ft_pct', '25+ ft putts', 25, null),
  {
    metric: 'fairways_hit_pct',
    label: 'Fairways hit',
    direction: 'higher',
    unit: 'pct',
    attemptNoun: 'fairways',
    kappa: KAPPA.attempts,
    sayFloor: 20,
    clearFloor: 40,
    source: { kind: 'round_cache', made: 'fairways_hit', attempts: 'fairways_total' },
  },
  {
    metric: 'gir_pct',
    label: 'Greens in regulation',
    direction: 'higher',
    unit: 'pct',
    attemptNoun: 'greens',
    kappa: KAPPA.attempts,
    sayFloor: 20,
    clearFloor: 40,
    source: { kind: 'round_cache', made: 'greens_hit', attempts: 'greens_total' },
  },
  {
    metric: 'scrambling_pct',
    label: 'Scrambling',
    direction: 'higher',
    unit: 'pct',
    attemptNoun: 'chances',
    kappa: KAPPA.attempts,
    // 04 §2 around-green floor.
    sayFloor: 15,
    clearFloor: 30,
    source: { kind: 'round_cache', made: 'scrambles_converted', attempts: 'scramble_attempts' },
  },
  ...(['sand_save_pct', 'scrambling_pct_sand'] as const).map(
    (metric): VerdictMetricDef => ({
      metric,
      label: 'Sand saves',
      direction: 'higher',
      unit: 'pct',
      attemptNoun: 'bunker holes',
      kappa: KAPPA.attempts,
      // 04 §2 sand floor. The scrambling generator's sand-save numerator is
      // the golf_holes.sand_save flag the stats cache counts.
      sayFloor: 12,
      clearFloor: 24,
      source: { kind: 'round_cache', made: 'sand_saves', attempts: 'sand_attempts' },
    }),
  ),
];

const BY_METRIC = new Map(DEFS.map((d) => [d.metric, d]));

/** The verdict settings for a canonical focus-area metric, or null when none exists. */
export function verdictMetricFor(metric: string | null | undefined): VerdictMetricDef | null {
  if (!metric) return null;
  return BY_METRIC.get(metric.trim()) ?? null;
}

/** Every metric that can carry a verdict, for reports and tests. */
export const VERDICT_METRICS: readonly string[] = DEFS.map((d) => d.metric);
