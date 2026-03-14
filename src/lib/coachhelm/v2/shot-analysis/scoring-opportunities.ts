/**
 * Scoring Opportunity Conversion
 *
 * Identifies when a player had a realistic scoring opportunity
 * (birdie putt, reachable par 5, etc.) and whether they converted it.
 * Also calculates scrambling and sand save statistics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoringOpportunity {
  holeNumber: number;
  roundId: string;
  type: 'birdie_putt' | 'reachable_par5' | 'short_par4' | 'gir_birdie_chance';
  converted: boolean;         // Did they score birdie or better?
  result: number;             // Actual score relative to par
}

export interface ScrambleAnalysis {
  totalScrambleAttempts: number;
  scrambleSuccesses: number;
  scrambleRate: number;
  sandSaveAttempts: number;
  sandSaveSuccesses: number;
  sandSaveRate: number;
  upAndDownRate: number;
}

// ---------------------------------------------------------------------------
// Hole data type used by analysis functions
// ---------------------------------------------------------------------------

interface HoleData {
  holeNumber: number;
  par: number;
  score: number;
  gir: boolean;
  putts: number;
  drivingDistance?: number;
  roundId?: string;
}

// ---------------------------------------------------------------------------
// Scoring opportunity identification
// ---------------------------------------------------------------------------

/**
 * Identify scoring opportunities from hole-level data.
 *
 * A scoring opportunity exists when:
 * 1. GIR on any hole (birdie putt available)
 * 2. Par 5 reached in 2 (eagle/birdie chance)
 * 3. Short par 4 (< 350 yards driving distance, implying short approach)
 */
export function identifyScoringOpportunities(
  holes: HoleData[],
): ScoringOpportunity[] {
  const opportunities: ScoringOpportunity[] = [];

  for (const hole of holes) {
    const scoreToPar = hole.score - hole.par;
    const converted = scoreToPar < 0; // birdie or better
    const roundId = hole.roundId ?? '';

    // Reachable par 5 — reached in 2 means GIR with putts from eagle range
    // We approximate: par 5 + GIR + 2 putts or fewer = reached green early
    if (hole.par === 5 && hole.gir) {
      opportunities.push({
        holeNumber: hole.holeNumber,
        roundId,
        type: 'reachable_par5',
        converted,
        result: scoreToPar,
      });
    } else if (hole.gir) {
      // GIR = birdie putt chance (skip for par 5s already counted as reachable_par5)
      opportunities.push({
        holeNumber: hole.holeNumber,
        roundId,
        type: 'gir_birdie_chance',
        converted,
        result: scoreToPar,
      });
    }

    // Short par 4 — high driving distance relative to hole length suggests
    // a very short approach; we use driving distance > 280 as proxy for
    // being close enough for a wedge-in on a par 4
    if (
      hole.par === 4 &&
      hole.drivingDistance != null &&
      hole.drivingDistance >= 280
    ) {
      opportunities.push({
        holeNumber: hole.holeNumber,
        roundId,
        type: 'short_par4',
        converted,
        result: scoreToPar,
      });
    }
  }

  return opportunities;
}

// ---------------------------------------------------------------------------
// Conversion rate
// ---------------------------------------------------------------------------

/**
 * Calculate the percentage of scoring opportunities that were converted
 * to birdie or better.
 */
export function calculateConversionRate(
  opportunities: ScoringOpportunity[],
): number {
  if (opportunities.length === 0) return 0;

  const converted = opportunities.filter((o) => o.converted).length;
  return converted / opportunities.length;
}

// ---------------------------------------------------------------------------
// Scramble / up-and-down analysis
// ---------------------------------------------------------------------------

interface ScrambleHoleData {
  gir: boolean;
  par: number;
  score: number;
  sandShot?: boolean;
}

/**
 * Calculate scrambling statistics.
 *
 * Scramble: missed GIR but still made par or better.
 * Sand save: scramble from a bunker (sandShot = true).
 * Up-and-down: same as scramble rate (common alias).
 */
export function calculateScrambleRate(
  holes: ScrambleHoleData[],
): ScrambleAnalysis {
  let totalScrambleAttempts = 0;
  let scrambleSuccesses = 0;
  let sandSaveAttempts = 0;
  let sandSaveSuccesses = 0;

  for (const hole of holes) {
    // Only count missed GIRs
    if (hole.gir) continue;

    totalScrambleAttempts++;
    const madePar = hole.score <= hole.par;

    if (madePar) {
      scrambleSuccesses++;
    }

    // Sand save: missed GIR + played from sand
    if (hole.sandShot) {
      sandSaveAttempts++;
      if (madePar) {
        sandSaveSuccesses++;
      }
    }
  }

  const scrambleRate =
    totalScrambleAttempts > 0
      ? scrambleSuccesses / totalScrambleAttempts
      : 0;

  const sandSaveRate =
    sandSaveAttempts > 0
      ? sandSaveSuccesses / sandSaveAttempts
      : 0;

  return {
    totalScrambleAttempts,
    scrambleSuccesses,
    scrambleRate,
    sandSaveAttempts,
    sandSaveSuccesses,
    sandSaveRate,
    upAndDownRate: scrambleRate, // Alias
  };
}
