/**
 * Tour benchmarks for the golf stats screens (owner decision Q-93: "change it
 * all to PGA moving forward").
 *
 * The stats experience compares a player with the Tour and nothing else: the
 * PGA Tour for men's teams, the LPGA Tour for women's teams. There is no
 * college, division or NCAA reference anywhere on these screens.
 *
 * SOURCE OF TRUTH IS THE DATABASE: `public.golf_pga_standards`, `season =
 * '2024'`, column `pga_tour_value` (the column name is reused for the LPGA
 * rows, `tour = 'lpga'`). This module is a cited static mirror so pure code
 * (the Priorities engine, the drills, tests) agrees with what the leak-map
 * loader (`stats-leak-maps.ts` loadPgaRefs) prints. Read-only verified against
 * production 2026-09-30. KEEP IN SYNC with the table; `tour.test.ts` pins every
 * value, and the putt values are also pinned to `cohort-baselines.ts`.
 *
 * Only metrics with a Tour value appear here. There is NO Tour value for 0-3 ft
 * putts, fairway %, overall scrambling %, birdies per round, 3-putts per
 * round, GIR by distance band, GIR from fairway or rough, par-5 GIR, or
 * scrambling by distance. A screen that would compare one of those with a
 * Tour number drops the comparison rather than inventing the number.
 *
 * Client-safe: the only import is a type.
 */

import type { TourKey } from '@/lib/coachhelm/v3/standing/pga-standards';

export type { TourKey };

/** Putt-make bands that have a Tour standard (`putts_made_*_pct`). */
export type TourPuttBand = '3_5' | '5_10' | '10_15' | '15_25' | '25_plus';

export const TOUR_PUTT_BANDS: readonly TourPuttBand[] = ['3_5', '5_10', '10_15', '15_25', '25_plus'];

export interface TourStandard {
  tour: TourKey;
  /** "PGA Tour" or "LPGA Tour". */
  label: string;
  /** Make % (0-100) by putt distance band. */
  putts: Record<TourPuttBand, number>;
  /** Greens in regulation % (`gir_pct`). */
  girPct: number;
  /** Penalty strokes per 18-hole round (`penalty_rate_per_round`). */
  penaltiesPerRound: number;
  /** Up-and-down % by the lie of the miss (`scrambling_pct_*`). */
  scramblingPct: { fairway: number; rough: number; sand: number };
  /** Double-bogey-or-worse per 100 holes (`big_number_rate`). */
  bigNumbersPer100Holes: number;
  /** Average strokes on a par 3 / 4 / 5 (`scoring_par_*`). */
  parScoring: { par3: number; par4: number; par5: number };
  /** Tournament minus practice, strokes (`practice_tournament_delta`). */
  practiceTournamentDelta: number;
  /** Opening hole minus round average, strokes (`opening_hole_delta`). */
  openingHoleDelta: number;
  /** Average approach proximity in feet, all shots, by distance band. */
  approachProximityFt: { '50_125': number; '125_175': number; '175_plus': number };
  /** Strokes gained is zero-sum around the Tour, so every reference is 0. */
  strokesGained: { total: number; ott: number; approach: number; aroundGreen: number; putting: number };
  /** One-line citation for the set. */
  source: string;
}

const SG_ZERO = { total: 0, ott: 0, approach: 0, aroundGreen: 0, putting: 0 } as const;

export const TOUR_STANDARDS: Record<TourKey, TourStandard> = {
  pga: {
    tour: 'pga',
    label: 'PGA Tour',
    putts: { '3_5': 90.5, '5_10': 62.2, '10_15': 35.7, '15_25': 15.4, '25_plus': 5.5 },
    girPct: 66,
    penaltiesPerRound: 0.3,
    scramblingPct: { fairway: 65, rough: 58, sand: 50 },
    bigNumbersPer100Holes: 2.0,
    parScoring: { par3: 3.0, par4: 3.97, par5: 4.55 },
    practiceTournamentDelta: 0.5,
    openingHoleDelta: 0.1,
    approachProximityFt: { '50_125': 18, '125_175': 30, '175_plus': 45 },
    strokesGained: { ...SG_ZERO },
    source:
      'golf_pga_standards season 2024 tour=pga, pga_tour_value (PGA Tour ShotLink; Research doc §2), read 2026-09-30.',
  },
  lpga: {
    tour: 'lpga',
    label: 'LPGA Tour',
    putts: { '3_5': 86.0, '5_10': 55.0, '10_15': 30.0, '15_25': 12.0, '25_plus': 5.0 },
    girPct: 70,
    // `penalty_rate_per_round` and `big_number_rate` are flagged "Estimated LPGA"
    // in the row's own `source` column; the practice/opening deltas reuse the
    // PGA estimate ("No LPGA-specific data").
    penaltiesPerRound: 0.4,
    scramblingPct: { fairway: 62, rough: 55, sand: 45 },
    bigNumbersPer100Holes: 3.0,
    parScoring: { par3: 3.1, par4: 4.05, par5: 4.7 },
    practiceTournamentDelta: 0.5,
    openingHoleDelta: 0.1,
    approachProximityFt: { '50_125': 26, '125_175': 38, '175_plus': 55 },
    strokesGained: { ...SG_ZERO },
    source: 'golf_pga_standards season 2024 tour=lpga, pga_tour_value (LPGA.com / LPGA ShotLink 2024), read 2026-09-30.',
  },
};

/**
 * Tour for a team gender: LPGA for women's teams, PGA otherwise. The same
 * routing `loadPgaRefs` and `getPlayerLeakMaps` (`tour`) apply.
 */
export function tourFor(gender: string | null | undefined): TourKey {
  return gender === 'womens' ? 'lpga' : 'pga';
}

/**
 * User-facing name of the tour: "PGA Tour" / "LPGA Tour". Neutral "the Tour"
 * when the tour is not known, never a guessed PGA Tour.
 */
export function tourLabel(tour: TourKey | null | undefined): string {
  if (tour === 'lpga') return TOUR_STANDARDS.lpga.label;
  if (tour === 'pga') return TOUR_STANDARDS.pga.label;
  return 'the Tour';
}

/**
 * The tour a stats stage should label its references with, from signals the
 * stage already has: the leak map's `tour` first, else the standing rows'
 * `is_womens` flag (set on every row of a women's team). Null when neither is
 * loaded, so labels stay neutral instead of guessing PGA.
 */
export function resolveStageTour(
  leakTour: TourKey | null | undefined,
  standingRows: ReadonlyArray<{ is_womens?: boolean }> | null | undefined,
): TourKey | null {
  if (leakTour === 'pga' || leakTour === 'lpga') return leakTour;
  if (!standingRows || standingRows.length === 0) return null;
  return standingRows.some((row) => row.is_womens === true) ? 'lpga' : 'pga';
}
