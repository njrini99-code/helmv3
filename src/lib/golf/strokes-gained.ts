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
  category: string;           // e.g., "Approach 125-150 yds", "Putting 5-10ft"
  subcategory: string;        // e.g., "approach", "putting", "driving", "scrambling", "scoring"
  label: string;              // Human-readable: "GIR from 125-150 yards"
  detail: string;             // Specific insight: "Hitting 72% GIR (benchmark: 60%)"
  strokeImpact: number;       // Positive = gaining strokes, negative = losing strokes
  playerValue: number;        // The player's actual metric value
  benchmark: number;          // What they're compared against
  unit: string;               // "%", "strokes/round", "per round"
  trend?: 'improving' | 'declining' | 'stable';
  confidence: number;         // 0-1 how reliable this insight is
  recommendation?: string;    // What to do about it (for weaknesses)
}

// Benchmarks for college-level competitive golf
const COLLEGE_BENCHMARKS = {
  // Strokes Gained per round (vs scratch/par)
  sgTee: 0,
  sgApproach: 0,
  sgAroundGreen: 0,
  sgPutting: 0,

  // Putting make percentages
  puttMake0_3: 98,
  puttMake3_5: 75,
  puttMake5_10: 45,
  puttMake10_15: 25,
  puttMake15_20: 15,

  // GIR overall + by par
  girPct: 60,
  girPctPar3: 50,
  girPctPar4: 55,
  girPctPar5: 75,

  // GIR by distance
  girPct50_75: 85,
  girPct75_100: 75,
  girPct100_125: 70,
  girPct125_150: 60,
  girPct150_175: 50,
  girPct175_200: 40,
  girPct200_225: 30,
  girPct225Plus: 20,

  // GIR by lie
  girFromFairway: 68,
  girFromRough: 42,

  // Driving
  fairwayPct: 60,

  // Scrambling
  scramblingPct: 55,
  scramblingFromRough: 50,
  scramblingFromSand: 45,

  // Putting efficiency (strokes to hole out)
  puttEff5_10: 1.5,
  puttEff10_15: 1.8,
  puttEff15_20: 2.0,

  // Three putts
  threePuttsPerRound: 0.8,

  // Scoring
  birdiesPerRound: 3.0,
  doublePlusPerRound: 1.0,

  // Penalties
  penaltiesPerRound: 0.5,

  // Pressure
  qualifyingVsPracticeGap: 1.5,
};

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
}

/**
 * Generates rich, statistically-backed strengths and weaknesses
 * from detailed GolfStats. Analyzes 30+ specific metrics across
 * distance ranges, lies, and shot types.
 *
 * Returns top 3 strengths (positive stroke impact) and
 * top 3 weaknesses (negative stroke impact).
 */
export function generateStatisticalStrengthsWeaknesses(
  stats: GolfStats
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
  addPuttingCandidates(stats, candidates);

  // ─── GIR BY DISTANCE ───────────────────────────────────────
  addGIRCandidates(stats, candidates);

  // ─── GIR BY LIE ────────────────────────────────────────────
  addGIRByLieCandidates(stats, candidates);

  // ─── DRIVING ────────────────────────────────────────────────
  addDrivingCandidates(stats, candidates);

  // ─── SCRAMBLING ─────────────────────────────────────────────
  addScramblingCandidates(stats, candidates);

  // ─── SCORING PATTERNS ───────────────────────────────────────
  addScoringCandidates(stats, candidates);

  // ─── PRESSURE ───────────────────────────────────────────────
  addPressureCandidates(stats, candidates);

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

function toStatisticalSW(c: StrengthWeaknessCandidate): StatisticalStrengthWeakness {
  const isStrength = c.strokeImpact > 0;
  const sign = c.strokeImpact >= 0 ? '+' : '';
  const impactStr = `${sign}${c.strokeImpact.toFixed(1)} strokes/round`;

  let detail: string;
  if (c.unit === '%') {
    detail = `${c.playerValue.toFixed(0)}% (benchmark: ${c.benchmark.toFixed(0)}%) — ${impactStr}`;
  } else if (c.unit === 'strokes/round') {
    detail = `${c.playerValue >= 0 ? '+' : ''}${c.playerValue.toFixed(2)} (benchmark: ${c.benchmark >= 0 ? '+' : ''}${c.benchmark.toFixed(2)}) — ${impactStr}`;
  } else if (c.unit === 'per round') {
    detail = `${c.playerValue.toFixed(1)} per round (benchmark: ${c.benchmark.toFixed(1)}) — ${impactStr}`;
  } else {
    detail = `${c.playerValue.toFixed(1)} ${c.unit} (benchmark: ${c.benchmark.toFixed(1)}) — ${impactStr}`;
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
    benchmark: number;
    rec: string;
  }> = [
    { key: 'tee', label: 'SG: Off the Tee', value: stats.sgTeePerRound, benchmark: COLLEGE_BENCHMARKS.sgTee, rec: 'Focus on tee shot accuracy: fairway hitting drills and club selection.' },
    { key: 'approach', label: 'SG: Approach', value: stats.sgApproachPerRound, benchmark: COLLEGE_BENCHMARKS.sgApproach, rec: 'Work on iron play from various distances and lies.' },
    { key: 'around', label: 'SG: Around the Green', value: stats.sgAroundGreenPerRound, benchmark: COLLEGE_BENCHMARKS.sgAroundGreen, rec: 'Dedicate practice to chipping and pitching within 30 yards.' },
    { key: 'putting', label: 'SG: Putting', value: stats.sgPuttingPerRound, benchmark: COLLEGE_BENCHMARKS.sgPutting, rec: 'Invest in putting practice, especially distance control.' },
  ];

  for (const entry of sgEntries) {
    if (entry.value === null) continue;
    // SG is already in strokes/round - value IS the impact
    candidates.push({
      category: entry.label,
      subcategory: entry.key === 'tee' ? 'driving' : entry.key === 'around' ? 'scrambling' : entry.key,
      label: entry.label,
      playerValue: entry.value,
      benchmark: entry.benchmark,
      unit: 'strokes/round',
      strokeImpact: entry.value - entry.benchmark, // positive = gaining
      confidence: Math.min(1, stats.roundsPlayed / 10),
      recommendation: entry.rec,
    });
  }
}

// ── Putting by Distance ──────────────────────────────────────────────────────

function addPuttingCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  const puttRanges: Array<{
    label: string;
    value: number | null;
    benchmark: number;
    puttsPerRound: number;
  }> = [
    { label: 'Putting 0-3ft', value: stats.puttMakePct0_3, benchmark: COLLEGE_BENCHMARKS.puttMake0_3, puttsPerRound: 4.5 },
    { label: 'Putting 3-5ft', value: stats.puttMakePct3_5, benchmark: COLLEGE_BENCHMARKS.puttMake3_5, puttsPerRound: 2.5 },
    { label: 'Putting 5-10ft', value: stats.puttMakePct5_10, benchmark: COLLEGE_BENCHMARKS.puttMake5_10, puttsPerRound: 3.0 },
    { label: 'Putting 10-15ft', value: stats.puttMakePct10_15, benchmark: COLLEGE_BENCHMARKS.puttMake10_15, puttsPerRound: 2.0 },
    { label: 'Putting 15-20ft', value: stats.puttMakePct15_20, benchmark: COLLEGE_BENCHMARKS.puttMake15_20, puttsPerRound: 1.5 },
  ];

  for (const range of puttRanges) {
    if (range.value === null) continue;
    // Each % point of make rate saves ~0.01 strokes per putt in that range
    const deltaPct = range.value - range.benchmark;
    const strokeImpact = (deltaPct / 100) * range.puttsPerRound;

    candidates.push({
      category: range.label,
      subcategory: 'putting',
      label: range.label + ' make rate',
      playerValue: range.value,
      benchmark: range.benchmark,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 8),
      recommendation: deltaPct < 0
        ? `Practice putts in this range. ${Math.abs(deltaPct).toFixed(0)}% below benchmark.`
        : undefined,
    });
  }

  // Three-putts
  if (stats.threePuttsPerRound !== null) {
    const delta = COLLEGE_BENCHMARKS.threePuttsPerRound - stats.threePuttsPerRound;
    // Each three-putt costs ~1 extra stroke
    const strokeImpact = delta;
    candidates.push({
      category: 'Three-Putt Avoidance',
      subcategory: 'putting',
      label: 'Three-putts per round',
      playerValue: stats.threePuttsPerRound,
      benchmark: COLLEGE_BENCHMARKS.threePuttsPerRound,
      unit: 'per round',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: delta < 0
        ? `Averaging ${stats.threePuttsPerRound.toFixed(1)} three-putts/round. Work on lag putting to get inside 3ft.`
        : undefined,
    });
  }
}

// ── GIR by Distance ──────────────────────────────────────────────────────────

function addGIRCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  const girRanges: Array<{
    label: string;
    value: number | null;
    benchmark: number;
    approachesPerRound: number;
  }> = [
    { label: 'GIR 50-75 yds', value: stats.girPct50_75, benchmark: COLLEGE_BENCHMARKS.girPct50_75, approachesPerRound: 1.5 },
    { label: 'GIR 75-100 yds', value: stats.girPct75_100, benchmark: COLLEGE_BENCHMARKS.girPct75_100, approachesPerRound: 2.0 },
    { label: 'GIR 100-125 yds', value: stats.girPct100_125, benchmark: COLLEGE_BENCHMARKS.girPct100_125, approachesPerRound: 2.5 },
    { label: 'GIR 125-150 yds', value: stats.girPct125_150, benchmark: COLLEGE_BENCHMARKS.girPct125_150, approachesPerRound: 3.0 },
    { label: 'GIR 150-175 yds', value: stats.girPct150_175, benchmark: COLLEGE_BENCHMARKS.girPct150_175, approachesPerRound: 2.5 },
    { label: 'GIR 175-200 yds', value: stats.girPct175_200, benchmark: COLLEGE_BENCHMARKS.girPct175_200, approachesPerRound: 2.0 },
    { label: 'GIR 200-225 yds', value: stats.girPct200_225, benchmark: COLLEGE_BENCHMARKS.girPct200_225, approachesPerRound: 1.0 },
    { label: 'GIR 225+ yds', value: stats.girPct225Plus, benchmark: COLLEGE_BENCHMARKS.girPct225Plus, approachesPerRound: 0.5 },
  ];

  for (const range of girRanges) {
    if (range.value === null) continue;
    // Missing a GIR costs ~0.4 strokes on average (scramble vs birdie putt)
    const deltaPct = range.value - range.benchmark;
    const strokeImpact = (deltaPct / 100) * range.approachesPerRound * 0.4;

    candidates.push({
      category: range.label,
      subcategory: 'approach',
      label: range.label,
      playerValue: range.value,
      benchmark: range.benchmark,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 8),
      recommendation: deltaPct < 0
        ? `Hitting ${range.value.toFixed(0)}% GIR at this distance (${Math.abs(deltaPct).toFixed(0)}% below target). Focus on this distance range in practice.`
        : undefined,
    });
  }
}

// ── GIR by Lie ──────────────────────────────────────────────────────────────

function addGIRByLieCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (stats.girPctFromFairway !== null) {
    const deltaPct = stats.girPctFromFairway - COLLEGE_BENCHMARKS.girFromFairway;
    // Roughly 8 approaches per round from the fairway
    const strokeImpact = (deltaPct / 100) * 8 * 0.4;
    candidates.push({
      category: 'GIR from Fairway',
      subcategory: 'approach',
      label: 'GIR when hitting from fairway',
      playerValue: stats.girPctFromFairway,
      benchmark: COLLEGE_BENCHMARKS.girFromFairway,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Only ${stats.girPctFromFairway.toFixed(0)}% GIR from the fairway. Iron play needs work even from good lies.`
        : undefined,
    });
  }

  if (stats.girPctFromRough !== null) {
    const deltaPct = stats.girPctFromRough - COLLEGE_BENCHMARKS.girFromRough;
    // Roughly 4 approaches per round from the rough
    const strokeImpact = (deltaPct / 100) * 4 * 0.4;
    candidates.push({
      category: 'GIR from Rough',
      subcategory: 'approach',
      label: 'GIR when hitting from rough',
      playerValue: stats.girPctFromRough,
      benchmark: COLLEGE_BENCHMARKS.girFromRough,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Only ${stats.girPctFromRough.toFixed(0)}% GIR from rough (benchmark: ${COLLEGE_BENCHMARKS.girFromRough}%). Practice iron shots from thick lies.`
        : undefined,
    });
  }
}

// ── Driving ──────────────────────────────────────────────────────────────────

function addDrivingCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (stats.fairwayPercentage !== null) {
    const deltaPct = stats.fairwayPercentage - COLLEGE_BENCHMARKS.fairwayPct;
    // ~14 fairway opportunities per round, missing costs ~0.3 strokes (rough vs fairway approach)
    const strokeImpact = (deltaPct / 100) * 14 * 0.3;

    candidates.push({
      category: 'Fairway Accuracy',
      subcategory: 'driving',
      label: 'Fairway hit percentage',
      playerValue: stats.fairwayPercentage,
      benchmark: COLLEGE_BENCHMARKS.fairwayPct,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Hitting ${stats.fairwayPercentage.toFixed(0)}% fairways. Consider club selection off the tee and alignment drills.`
        : undefined,
    });
  }

  // Driving miss pattern (if heavily one-sided)
  if (stats.missLeftPct !== null && stats.missRightPct !== null) {
    const totalMisses = stats.missLeftCount + stats.missRightCount;
    if (totalMisses > 10) {
      const leftPct = stats.missLeftPct;
      const rightPct = stats.missRightPct;
      const dominant = leftPct > rightPct ? 'left' : 'right';
      const dominantPct = Math.max(leftPct, rightPct);

      // Only flag if miss pattern is heavily one-sided (>65%)
      if (dominantPct > 65) {
        candidates.push({
          category: `Tee Shot Miss Pattern`,
          subcategory: 'driving',
          label: `Misses ${dominant} ${dominantPct.toFixed(0)}% of the time`,
          playerValue: dominantPct,
          benchmark: 50, // Balanced is 50/50
          unit: '%',
          // A one-sided miss pattern costs about 0.2-0.3 strokes (harder to play for one shape)
          strokeImpact: -0.2,
          confidence: Math.min(1, totalMisses / 30),
          recommendation: `${dominantPct.toFixed(0)}% of tee shot misses go ${dominant}. Work with coach on swing path and face angle to develop a more balanced shot shape.`,
        });
      }
    }
  }

  // Penalties
  if (stats.penaltiesPerRound !== null) {
    const delta = COLLEGE_BENCHMARKS.penaltiesPerRound - stats.penaltiesPerRound;
    // Each penalty costs ~1 stroke
    const strokeImpact = delta;
    if (Math.abs(delta) > 0.1) {
      candidates.push({
        category: 'Penalty Avoidance',
        subcategory: 'driving',
        label: 'Penalties per round',
        playerValue: stats.penaltiesPerRound,
        benchmark: COLLEGE_BENCHMARKS.penaltiesPerRound,
        unit: 'per round',
        strokeImpact,
        confidence: Math.min(1, stats.roundsPlayed / 6),
        recommendation: delta < 0
          ? `Averaging ${stats.penaltiesPerRound.toFixed(1)} penalties/round. Course management and conservative club choices on tight holes.`
          : undefined,
      });
    }
  }
}

// ── Scrambling ──────────────────────────────────────────────────────────────

function addScramblingCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (stats.scramblingPercentage !== null) {
    const deltaPct = stats.scramblingPercentage - COLLEGE_BENCHMARKS.scramblingPct;
    // ~7 scramble attempts per round (18 holes * ~40% miss GIR), each failed scramble costs ~0.5 strokes
    const scrambleAttempts = Math.max(1, stats.scrambleAttempts / Math.max(1, stats.roundsPlayed));
    const strokeImpact = (deltaPct / 100) * scrambleAttempts * 0.5;

    candidates.push({
      category: 'Overall Scrambling',
      subcategory: 'scrambling',
      label: 'Scrambling percentage',
      playerValue: stats.scramblingPercentage,
      benchmark: COLLEGE_BENCHMARKS.scramblingPct,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Scrambling at ${stats.scramblingPercentage.toFixed(0)}% (target: ${COLLEGE_BENCHMARKS.scramblingPct}%). Focus on up-and-down practice from common miss areas.`
        : undefined,
    });
  }

  // Scrambling from sand
  if (stats.sandSavePercentage !== null && stats.sandSaveAttempts >= 5) {
    const deltaPct = stats.sandSavePercentage - COLLEGE_BENCHMARKS.scramblingFromSand;
    const sandAttempts = stats.sandSaveAttempts / Math.max(1, stats.roundsPlayed);
    const strokeImpact = (deltaPct / 100) * sandAttempts * 0.5;

    candidates.push({
      category: 'Sand Saves',
      subcategory: 'scrambling',
      label: 'Sand save percentage',
      playerValue: stats.sandSavePercentage,
      benchmark: COLLEGE_BENCHMARKS.scramblingFromSand,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.sandSaveAttempts / 15),
      recommendation: deltaPct < 0
        ? `Sand save rate ${stats.sandSavePercentage.toFixed(0)}% (target: ${COLLEGE_BENCHMARKS.scramblingFromSand}%). Prioritize greenside bunker practice.`
        : undefined,
    });
  }
}

// ── Scoring Patterns ────────────────────────────────────────────────────────

function addScoringCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  // Birdie rate
  if (stats.birdiesPerRound !== null) {
    const delta = stats.birdiesPerRound - COLLEGE_BENCHMARKS.birdiesPerRound;
    // Each extra birdie saves 1 stroke
    candidates.push({
      category: 'Birdie Making',
      subcategory: 'scoring',
      label: 'Birdies per round',
      playerValue: stats.birdiesPerRound,
      benchmark: COLLEGE_BENCHMARKS.birdiesPerRound,
      unit: 'per round',
      strokeImpact: delta,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: delta < 0
        ? `Averaging ${stats.birdiesPerRound.toFixed(1)} birdies/round (target: ${COLLEGE_BENCHMARKS.birdiesPerRound}). Attack par 5s and short par 4s more aggressively.`
        : undefined,
    });
  }

  // Double bogey+ rate (big number avoidance)
  if (stats.doublePlusPerRound !== null) {
    const delta = COLLEGE_BENCHMARKS.doublePlusPerRound - stats.doublePlusPerRound;
    // Each double bogey costs ~2 strokes vs par
    const strokeImpact = delta * 2;
    if (Math.abs(strokeImpact) > 0.1) {
      candidates.push({
        category: 'Big Number Avoidance',
        subcategory: 'scoring',
        label: 'Doubles+ per round',
        playerValue: stats.doublePlusPerRound,
        benchmark: COLLEGE_BENCHMARKS.doublePlusPerRound,
        unit: 'per round',
        strokeImpact,
        confidence: Math.min(1, stats.roundsPlayed / 6),
        recommendation: delta < 0
          ? `Averaging ${stats.doublePlusPerRound.toFixed(1)} double bogeys+/round. Focus on course management and avoiding big mistakes.`
          : undefined,
      });
    }
  }

  // Par 5 GIR (scoring opportunities)
  if (stats.girPctPar5 !== null) {
    const deltaPct = stats.girPctPar5 - COLLEGE_BENCHMARKS.girPctPar5;
    // ~4 par 5s per round, GIR on par 5 creates eagle/birdie chances
    const strokeImpact = (deltaPct / 100) * 4 * 0.5;

    candidates.push({
      category: 'Par 5 GIR',
      subcategory: 'scoring',
      label: 'GIR on par 5s',
      playerValue: stats.girPctPar5,
      benchmark: COLLEGE_BENCHMARKS.girPctPar5,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Only ${stats.girPctPar5.toFixed(0)}% GIR on par 5s (target: ${COLLEGE_BENCHMARKS.girPctPar5}%). These are scoring holes — work on long approach play.`
        : undefined,
    });
  }
}

// ── Pressure Performance ────────────────────────────────────────────────────

function addPressureCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (
    stats.qualifyingScoringAvg !== null &&
    stats.practiceScoringAvg !== null &&
    stats.qualifyingRounds >= 3 &&
    stats.practiceRounds >= 3
  ) {
    const gap = stats.qualifyingScoringAvg - stats.practiceScoringAvg;
    // Gap directly translates to strokes lost in competition
    if (Math.abs(gap) > 0.5) {
      candidates.push({
        category: 'Pressure Performance',
        subcategory: 'scoring',
        label: 'Qualifying vs practice scoring gap',
        playerValue: gap,
        benchmark: COLLEGE_BENCHMARKS.qualifyingVsPracticeGap,
        unit: 'strokes',
        strokeImpact: gap > COLLEGE_BENCHMARKS.qualifyingVsPracticeGap ? -(gap - COLLEGE_BENCHMARKS.qualifyingVsPracticeGap) : 0,
        confidence: Math.min(1, Math.min(stats.qualifyingRounds, stats.practiceRounds) / 5),
        recommendation: gap > COLLEGE_BENCHMARKS.qualifyingVsPracticeGap
          ? `Scoring ${gap.toFixed(1)} strokes higher in qualifying than practice. Work on pre-round routines, on-course mental game, and simulating pressure in practice.`
          : undefined,
      });
    }
  }
}

// ============================================
// FORMATTING FUNCTIONS
// ============================================

/**
 * Format strokes gained value for display
 */
export function formatStrokesGained(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

