/**
 * Strokes Gained Calculation Engine
 *
 * Strokes Gained measures performance relative to a scratch golfer baseline.
 * Formula: SG = Expected strokes (before shot) - Expected strokes (after shot) - 1
 *
 * Categories:
 * - SG: Off the Tee - Tee shots on par 4s and 5s
 * - SG: Approach - Shots from fairway/rough intended to reach green (not from green)
 * - SG: Around the Green - Shots within 30 yards not on green
 * - SG: Putting - All putts
 */

import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { getBenchmarkData, type BenchmarkLevel } from './sg-benchmarks';
import { PUTTING_BENCHMARK_MIN_SAMPLE } from './benchmarks/putting';
import { TOUR_STANDARDS, type TourKey, type TourPuttBand } from './benchmarks/tour';

// ============================================
// LOCAL TYPE DEFINITIONS
// ============================================

/**
 * Lie types for strokes gained calculation
 */
export type LieType = 'tee' | 'fairway' | 'rough' | 'sand' | 'green';

/**
 * Baseline data structure for expected strokes from each lie type
 * Key is distance (yards for non-green, feet for green), value is expected strokes
 */
export type BaselineData = Record<LieType, Record<number, number>>;

// ============================================
// PGA TOUR BASELINE DATA
// ============================================

/**
 * Expected strokes to hole out from various lies and distances.
 *
 * Broadie "Every Shot Counts" / PGA Tour ShotLink expected-strokes-to-hole
 * benchmark (2004-2012), the canonical source cited in
 * docs/v3-research-golf-domain.md. Anchors only: getExpectedStrokes()
 * interpolates linearly between them, so values are exact at published points
 * and smooth in between. MUST stay in lockstep with the DB function
 * public.sg_expected_strokes() — see migration
 * 20260606140000_fix_sg_expected_strokes_baseline_calibration.sql.
 *
 * The prior table was internally inconsistent (tee too high + no data below
 * 260 yd so par-3/short tee shots floored at 3.62; fairway/rough ~0.3-0.5 low;
 * green too low in the makeable range), which produced phantom off-the-tee
 * gains that cancelled phantom putting losses and masked the corruption.
 *
 * Distance for tee/fairway/rough/sand is in YARDS; green is in FEET.
 */
const PGA_BASELINE_DATA: BaselineData = {
  tee: {
    // par-5 / par-4 driving range
    600: 4.85, 540: 4.65, 400: 3.99, 300: 3.71, 240: 3.25,
    // par-3 / short tee shots (extended below 200 so they aren't floored)
    200: 3.12, 150: 2.95, 120: 2.88, 100: 2.82, 80: 2.78,
  },
  fairway: {
    540: 4.78, 400: 4.11, 300: 3.78, 240: 3.45, 200: 3.19,
    180: 3.08, 140: 2.91, 100: 2.80, 80: 2.75, 20: 2.40,
  },
  rough: {
    540: 4.97, 400: 4.30, 300: 3.90, 240: 3.64, 200: 3.42,
    100: 3.02, 20: 2.59,
  },
  sand: {
    540: 5.36, 400: 4.69, 300: 4.04, 240: 3.84, 200: 3.55,
    100: 3.23, 20: 2.53,
  },
  green: {
    // Putting distances in FEET (Broadie Tour expected putts)
    90: 2.40, 60: 2.21, 50: 2.14, 40: 2.06, 30: 1.98,
    20: 1.87, 15: 1.78, 10: 1.61, 9: 1.56, 8: 1.50,
    7: 1.42, 6: 1.34, 5: 1.23, 4: 1.13, 3: 1.04,
    2: 1.00, 1: 1.00, 0: 0,
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get expected strokes from a given lie and distance
 * Uses linear interpolation between known data points
 *
 * @param lie - The lie type (tee, fairway, rough, sand, green)
 * @param distanceYards - Distance to hole in yards
 * @param isOnGreen - Whether the shot is on the green
 * @param benchmarkLevel - Which benchmark set to use (default: pga_tour for backward compat)
 */
export function getExpectedStrokes(
  lie: LieType,
  distanceYards: number,
  isOnGreen: boolean = false,
  benchmarkLevel?: BenchmarkLevel
): number {
  const benchmarkData = benchmarkLevel
    ? getBenchmarkData(benchmarkLevel)
    : PGA_BASELINE_DATA;
  const baseline = benchmarkData[lie];
  if (!baseline) return 3.0; // Default fallback

  // For putting, convert yards to feet
  const distance = isOnGreen || lie === 'green'
    ? Math.round(distanceYards * 3) // Convert yards to feet
    : distanceYards;

  // Get sorted distances from baseline
  const distances = Object.keys(baseline)
    .map(Number)
    .sort((a, b) => b - a); // Sort descending

  // Handle empty baseline
  if (distances.length === 0) {
    return 3.0;
  }

  const maxDist = distances[0]!;
  const minDist = distances[distances.length - 1]!;

  // If distance is beyond max, extrapolate
  if (distance >= maxDist) {
    return baseline[maxDist] ?? 3.0;
  }

  // If distance is below min, use minimum
  if (distance <= minDist) {
    return baseline[minDist] ?? 3.0;
  }

  // Find surrounding data points and interpolate
  for (let i = 0; i < distances.length - 1; i++) {
    const upperDist = distances[i]!;
    const lowerDist = distances[i + 1]!;
    if (distance <= upperDist && distance >= lowerDist) {
      const upperStrokes = baseline[upperDist] ?? 3.0;
      const lowerStrokes = baseline[lowerDist] ?? 3.0;

      // Linear interpolation
      const ratio = (distance - lowerDist) / (upperDist - lowerDist);
      return lowerStrokes + ratio * (upperStrokes - lowerStrokes);
    }
  }

  // Fallback - shouldn't reach here
  return baseline[minDist] ?? 3.0;
}


// ============================================
// STATISTICAL STRENGTHS & WEAKNESSES
// ============================================

/**
 * Rich statistical strength/weakness with stroke impact,
 * evidence, and shot-type/distance specificity.
 */
export interface StatisticalStrengthWeakness {
  category: string;           // e.g., "Putting 5-10ft", "SG: Approach"
  subcategory: string;        // e.g., "approach", "putting", "driving", "scrambling", "scoring"
  label: string;              // Human-readable: "Putting 5-10ft make rate"
  detail: string;             // Specific insight: "45% (PGA Tour: 62%), -0.9 strokes/round"
  strokeImpact: number;       // Positive = gaining strokes, negative = losing strokes
  playerValue: number;        // The player's actual metric value
  benchmark: number;          // What they're compared against (the Tour value)
  unit: string;               // "%", "strokes/round", "per round"
  trend?: 'improving' | 'declining' | 'stable';
  confidence: number;         // 0-1 how reliable this insight is
  recommendation?: string;    // What to do about it (for weaknesses)
}

// TOUR-ONLY GRADING (owner decision Q-93, 2026-09-30: "change it all to PGA
// moving forward"). Every non-SG item below compares the player with the Tour
// value from `golf_pga_standards` (`./benchmarks/tour.ts`): the PGA Tour for a
// men's team, the LPGA Tour for a women's team. The old `COLLEGE_BENCHMARKS`
// table (D1-style targets) is gone.
//
// WHAT AN "EST. STROKES" VALUE IS. `strokeImpact` = (gap to the Tour, on the
// Tour's own band and basis) x (the player's OWN event count per 18 holes,
// from the stats counts) x (a per-event cost that is a definitional lower
// bound). The per-event costs are the `STROKES_PER_*` constants below: a holed
// putt versus a miss saves at least the next putt, a penalty is one stroke, a
// failed save is par-or-better versus bogey-or-worse, a double-or-worse is at
// least one stroke worse than the bogey it would most plausibly have been.
// They are floors, not measurements, so the figure is an estimate; the spine
// prints it with an "est." suffix (`buildPriorities`). No volume is guessed:
// the old hard-coded putts-per-round and approaches-per-round constants are
// gone.
//
// ITEMS DROPPED, NOT APPROXIMATED, because the Tour has no value on the same
// basis: 0-3 ft putts, 15-20 ft putts (an exact Tour 15-25 ft band needs a
// 20-25 ft count that GolfStats does not expose), 3-putts per round, GIR by
// distance band, GIR from fairway / rough, par-5 GIR, fairway %, overall
// scrambling %, birdies per round, and the tee-shot miss pattern (its -0.2
// impact was an invented constant). The qualifying-vs-practice gap is also
// gone: GolfStats holds a raw-score average over qualifier rounds only, while
// the Tour value (`practice_tournament_delta`) is a to-par delta over
// tournament and qualifier rounds; the Standing drill already shows that gap
// on the right basis.
//
// STROKES GAINED (2026-07-25). There are deliberately no `sgTee` /
// `sgApproach` / `sgAroundGreen` / `sgPutting` Tour constants here (they would
// be `0`). Graded against the Tour's zero, every SG category was a "weakness"
// for essentially every college player (SG Approach negative for 30/30
// players, SG Putting for 29/30 in `golf_player_stats_cache`), which buried
// each player's genuine weak link. SG categories are graded **self-relatively**
// in `addSGCandidates`: each against the player's own average category SG.
// That is not a division benchmark, and it is automatically level- and
// gender-neutral because a lower overall level shifts all four categories
// together.

/** Floors for the cost of one event, in strokes. See the note above. */
const STROKES_PER_PUTT_MADE = 1;
const STROKES_PER_PENALTY = 1;
const STROKES_PER_FAILED_SAVE = 1;
const STROKES_PER_BIG_NUMBER = 1;

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

interface StrengthWeaknessCandidate {
  category: string;
  subcategory: string;
  label: string;
  playerValue: number;
  benchmark: number;
  unit: string;
  /** Estimated strokes gained/lost per round from this metric */
  strokeImpact: number;
  /** How much data backs this up (0-1) */
  confidence: number;
  recommendation?: string;
  /**
   * What `benchmark` represents. SG categories are graded against the player's
   * own category average, so calling that a "benchmark" in user-facing copy
   * would be misleading; the Tour items name the tour ("PGA Tour" / "LPGA
   * Tour"). Defaults to "benchmark" when omitted.
   */
  benchmarkLabel?: string;
}

/**
 * Generates strengths and weaknesses from detailed GolfStats: the four
 * strokes-gained categories (self-relative) plus the items that have a Tour
 * value (putting 3-15 ft, penalties, sand saves, big numbers).
 *
 * `tour` picks the Tour the player is compared with: 'lpga' for a women's team,
 * 'pga' otherwise (`tourFor(team.gender)`). It is required: GolfStats carries
 * no gender, so a default would silently grade a women's player against the
 * PGA Tour.
 *
 * Returns top 3 strengths (positive stroke impact) and
 * top 3 weaknesses (negative stroke impact).
 */
export function generateStatisticalStrengthsWeaknesses(
  stats: GolfStats,
  tour: TourKey,
): {
  strengths: StatisticalStrengthWeakness[];
  weaknesses: StatisticalStrengthWeakness[];
} {
  if (stats.roundsPlayed < 3) {
    return { strengths: [], weaknesses: [] };
  }

  const candidates: StrengthWeaknessCandidate[] = [];

  // ─── STROKES GAINED (broadest impact) ───────────────────────
  addSGCandidates(stats, candidates);

  // ─── PUTTING BY DISTANCE ────────────────────────────────────
  addPuttingCandidates(stats, tour, candidates);

  // ─── PENALTIES ──────────────────────────────────────────────
  addPenaltyCandidates(stats, tour, candidates);

  // ─── SAND SAVES ─────────────────────────────────────────────
  addSandSaveCandidates(stats, tour, candidates);

  // ─── BIG NUMBERS ────────────────────────────────────────────
  addBigNumberCandidates(stats, tour, candidates);

  // Split into strengths (positive impact) and weaknesses (negative impact)
  const strengths = candidates
    .filter(c => c.strokeImpact > 0.05)
    .sort((a, b) => b.strokeImpact - a.strokeImpact)
    .slice(0, 3)
    .map(toStatisticalSW);

  const weaknesses = candidates
    .filter(c => c.strokeImpact < -0.05)
    .sort((a, b) => a.strokeImpact - b.strokeImpact)
    .slice(0, 3)
    .map(toStatisticalSW);

  return { strengths, weaknesses };
}

/** One decimal when the value is a whole tenth (0.3), two otherwise (0.36). */
function perRoundText(value: number): string {
  return Number.isInteger(Math.round(value * 100) / 10) ? value.toFixed(1) : value.toFixed(2);
}

function toStatisticalSW(c: StrengthWeaknessCandidate): StatisticalStrengthWeakness {
  const isStrength = c.strokeImpact > 0;
  const sign = c.strokeImpact >= 0 ? '+' : '';
  const impactStr = `${sign}${c.strokeImpact.toFixed(1)} strokes/round`;

  const benchLabel = c.benchmarkLabel ?? 'benchmark';

  let detail: string;
  if (c.unit === '%') {
    detail = `${c.playerValue.toFixed(0)}% (${benchLabel}: ${c.benchmark.toFixed(0)}%), ${impactStr}`;
  } else if (c.unit === 'strokes/round') {
    detail = `${c.playerValue >= 0 ? '+' : ''}${c.playerValue.toFixed(2)} (${benchLabel}: ${c.benchmark >= 0 ? '+' : ''}${c.benchmark.toFixed(2)}), ${impactStr}`;
  } else if (c.unit === 'per round') {
    detail = `${perRoundText(c.playerValue)} per round (${benchLabel}: ${perRoundText(c.benchmark)}), ${impactStr}`;
  } else {
    detail = `${c.playerValue.toFixed(1)} ${c.unit} (${benchLabel}: ${c.benchmark.toFixed(1)}), ${impactStr}`;
  }

  return {
    category: c.category,
    subcategory: c.subcategory,
    label: c.label,
    detail,
    strokeImpact: c.strokeImpact,
    playerValue: c.playerValue,
    benchmark: c.benchmark,
    unit: c.unit,
    confidence: c.confidence,
    recommendation: isStrength ? undefined : c.recommendation,
  };
}

// ── Strokes Gained ──────────────────────────────────────────────────────────

function addSGCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  const sgEntries: Array<{
    key: string;
    label: string;
    value: number | null;
    rec: string;
  }> = [
    { key: 'tee', label: 'SG: Off the Tee', value: finite(stats.sgTeePerRound), rec: 'Focus on tee shot accuracy: fairway hitting drills and club selection.' },
    { key: 'approach', label: 'SG: Approach', value: finite(stats.sgApproachPerRound), rec: 'Work on iron play from various distances and lies.' },
    { key: 'around', label: 'SG: Around the Green', value: finite(stats.sgAroundGreenPerRound), rec: 'Dedicate practice to chipping and pitching within 30 yards.' },
    { key: 'putting', label: 'SG: Putting', value: finite(stats.sgPuttingPerRound), rec: 'Invest in putting practice, especially distance control.' },
  ];

  // Self-relative baseline (see the SG note above): each category is graded
  // against the player's OWN average category SG rather than the Tour's zero.
  // A category below the player's own mean is a genuine weak link; one above
  // it is a genuine strength. Because a lower overall level shifts all four
  // categories together, this needs no level or gender adjustment.
  const present = sgEntries.filter(
    (e): e is typeof e & { value: number } => e.value !== null,
  );

  // With fewer than two categories there is nothing to be relative TO — one
  // category would trivially equal its own mean and score zero impact.
  if (present.length < 2) return;

  const ownMean = present.reduce((sum, e) => sum + e.value, 0) / present.length;

  for (const entry of present) {
    candidates.push({
      category: entry.label,
      subcategory: entry.key === 'tee' ? 'driving' : entry.key === 'around' ? 'scrambling' : entry.key,
      label: entry.label,
      playerValue: entry.value,
      benchmark: ownMean,
      benchmarkLabel: 'your category average',
      unit: 'strokes/round',
      strokeImpact: entry.value - ownMean, // positive = ahead of own average
      confidence: Math.min(1, stats.roundsPlayed / 10),
      recommendation: entry.rec,
    });
  }
}

// ── Putting by Distance ──────────────────────────────────────────────────────

/** The putting distance bands with an exact Tour band (`putts_made_*_pct`). */
const TOUR_PUTT_BAND_FIELDS = [
  { band: '3_5', label: '3-5ft', pct: 'puttMakePct3_5', count: 'puttMakeCount3_5' },
  { band: '5_10', label: '5-10ft', pct: 'puttMakePct5_10', count: 'puttMakeCount5_10' },
  { band: '10_15', label: '10-15ft', pct: 'puttMakePct10_15', count: 'puttMakeCount10_15' },
] as const satisfies ReadonlyArray<{
  band: TourPuttBand;
  label: string;
  pct: keyof GolfStats;
  count: keyof GolfStats;
}>;

/** The distance range `puttingStrokesVsTour` covers, for the copy that quotes it. */
export const PUTTING_VS_TOUR_RANGE = '3 to 15 ft';

interface PuttingBandImpact {
  label: string;
  makePct: number;
  tourPct: number;
  /** Estimated strokes per round, negative = behind the Tour. */
  strokeImpact: number;
}

/**
 * Estimated strokes per round each gradable putting band gains or loses
 * against the Tour: (make % - Tour make %) x the player's putts in that band
 * per 18 holes x one stroke per holed putt. A band needs
 * PUTTING_BENCHMARK_MIN_SAMPLE putts, the same floor the benchmark sheet uses.
 */
function puttingBandImpacts(stats: GolfStats, tour: TourKey): PuttingBandImpact[] {
  const holes = finite(stats.holesPlayed);
  if (holes === null || holes <= 0) return [];
  const tourPutts = TOUR_STANDARDS[tour].putts;

  const impacts: PuttingBandImpact[] = [];
  for (const def of TOUR_PUTT_BAND_FIELDS) {
    const makePct = finite(stats[def.pct]);
    const putts = finite(stats[def.count]);
    if (makePct === null || putts === null || putts < PUTTING_BENCHMARK_MIN_SAMPLE) continue;
    const tourPct = tourPutts[def.band];
    const puttsPer18 = (putts / holes) * 18;
    impacts.push({
      label: def.label,
      makePct,
      tourPct,
      strokeImpact: ((makePct - tourPct) / 100) * puttsPer18 * STROKES_PER_PUTT_MADE,
    });
  }
  return impacts;
}

/**
 * Net estimated strokes per round putting gains (positive) or costs (negative)
 * against the Tour across the 3-15 ft bands that have a Tour value and enough
 * putts; null when no band qualifies. Drives the Putting drill's cost line.
 */
export function puttingStrokesVsTour(
  stats: GolfStats,
  tour: TourKey,
): { strokes: number; bands: number } | null {
  const impacts = puttingBandImpacts(stats, tour);
  if (impacts.length === 0) return null;
  return { strokes: impacts.reduce((sum, i) => sum + i.strokeImpact, 0), bands: impacts.length };
}

function addPuttingCandidates(
  stats: GolfStats,
  tour: TourKey,
  candidates: StrengthWeaknessCandidate[],
): void {
  const tourName = TOUR_STANDARDS[tour].label;
  for (const impact of puttingBandImpacts(stats, tour)) {
    const deltaPct = impact.makePct - impact.tourPct;
    candidates.push({
      category: `Putting ${impact.label}`,
      subcategory: 'putting',
      label: `Putting ${impact.label} make rate`,
      playerValue: impact.makePct,
      benchmark: impact.tourPct,
      benchmarkLabel: tourName,
      unit: '%',
      strokeImpact: impact.strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 8),
      recommendation: deltaPct < 0
        ? `Practice putts in this range. ${Math.abs(deltaPct).toFixed(0)} points below the ${tourName} make rate.`
        : undefined,
    });
  }
}

// ── Penalties ────────────────────────────────────────────────────────────────

function addPenaltyCandidates(
  stats: GolfStats,
  tour: TourKey,
  candidates: StrengthWeaknessCandidate[],
): void {
  const perRound = finite(stats.penaltiesPerRound);
  if (perRound === null) return;
  const { label: tourName, penaltiesPerRound: tourRate } = TOUR_STANDARDS[tour];
  const delta = tourRate - perRound;
  if (Math.abs(delta) <= 0.1) return;

  candidates.push({
    category: 'Penalty Avoidance',
    subcategory: 'driving',
    label: 'Penalties per round',
    playerValue: perRound,
    benchmark: tourRate,
    benchmarkLabel: tourName,
    unit: 'per round',
    strokeImpact: delta * STROKES_PER_PENALTY,
    confidence: Math.min(1, stats.roundsPlayed / 6),
    recommendation: delta < 0
      ? `Averaging ${perRound.toFixed(1)} penalties/round, against ${tourRate.toFixed(1)} on the ${tourName}. Course management and conservative club choices on tight holes.`
      : undefined,
  });
}

// ── Sand saves ───────────────────────────────────────────────────────────────

function addSandSaveCandidates(
  stats: GolfStats,
  tour: TourKey,
  candidates: StrengthWeaknessCandidate[],
): void {
  const savePct = finite(stats.sandSavePercentage);
  const attempts = finite(stats.sandSaveAttempts);
  const holes = finite(stats.holesPlayed);
  if (savePct === null || attempts === null || attempts < 5 || holes === null || holes <= 0) return;

  const { label: tourName, scramblingPct } = TOUR_STANDARDS[tour];
  const tourPct = scramblingPct.sand;
  const deltaPct = savePct - tourPct;
  const attemptsPer18 = (attempts / holes) * 18;

  candidates.push({
    category: 'Sand Saves',
    subcategory: 'scrambling',
    label: 'Sand save percentage',
    playerValue: savePct,
    benchmark: tourPct,
    benchmarkLabel: tourName,
    unit: '%',
    strokeImpact: (deltaPct / 100) * attemptsPer18 * STROKES_PER_FAILED_SAVE,
    confidence: Math.min(1, attempts / 15),
    recommendation: deltaPct < 0
      ? `Sand save rate ${savePct.toFixed(0)}%, against ${tourPct}% on the ${tourName}. Prioritize greenside bunker practice.`
      : undefined,
  });
}

// ── Big numbers ──────────────────────────────────────────────────────────────

function addBigNumberCandidates(
  stats: GolfStats,
  tour: TourKey,
  candidates: StrengthWeaknessCandidate[],
): void {
  // Holes, not rounds: `doublePlusPerRound` divides by the round count, which
  // overstates the rate whenever a 9-hole round is in the mix, and the Tour
  // value is per 100 holes.
  const doubles = finite(stats.totalDoublePlus);
  const holes = finite(stats.holesPlayed);
  if (doubles === null || holes === null || holes <= 0) return;

  const { label: tourName, bigNumbersPer100Holes } = TOUR_STANDARDS[tour];
  const perRound = (doubles / holes) * 18;
  const tourPerRound = (bigNumbersPer100Holes / 100) * 18;
  const delta = tourPerRound - perRound;
  const strokeImpact = delta * STROKES_PER_BIG_NUMBER;
  if (Math.abs(strokeImpact) <= 0.1) return;

  candidates.push({
    category: 'Big Number Avoidance',
    subcategory: 'scoring',
    label: 'Doubles+ per round',
    playerValue: perRound,
    benchmark: tourPerRound,
    benchmarkLabel: tourName,
    unit: 'per round',
    strokeImpact,
    confidence: Math.min(1, stats.roundsPlayed / 6),
    recommendation: delta < 0
      ? `Averaging ${perRound.toFixed(1)} double bogeys or worse per 18 holes, against ${tourPerRound.toFixed(1)} on the ${tourName}. Focus on course management and avoiding big mistakes.`
      : undefined,
  });
}
