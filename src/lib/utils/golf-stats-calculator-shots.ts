/**
 * Golf Stats Calculator - Shot-Based (Pure)
 *
 * Calculates ALL stats from raw shot data ONLY.
 * The golf_shots table is the single source of truth.
 *
 * This replaces the hole-based calculator (golf-stats-calculator.ts)
 * with a pure shot-based approach that derives everything from individual shots.
 */

// ============================================================================
// TYPES - Raw Data from Database
// ============================================================================

export interface RawShot {
  id: string;
  round_id: string;
  hole_id?: string | null;
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  club_used?: string | null;
  club_type: string | null;
  lie_before: string | null;
  lie_after?: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before?: string | null;
  result: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after?: string | null;
  shot_distance?: number | null;
  miss_direction: string | null;
  putt_break: string | null;
  putt_distance_feet?: number | null;
  putt_slope?: string | null;
  is_penalty?: boolean | null;
  penalty_type?: string | null;
  penalty_strokes?: number | null;
}

export interface HoleInfo {
  id?: string;
  round_id: string;
  hole_number: number;
  par: number;
  yardage: number | null;
}

export interface RoundInfo {
  id: string;
  round_date: string;
  course_name: string | null;
  round_type: 'practice' | 'qualifying' | 'tournament' | null;
  course_par?: number | null;
  holes_played?: number | null;
}

// ============================================================================
// TYPES - Calculated Stats Output
// ============================================================================

export interface GolfStats {
  // General
  roundsPlayed: number;
  holesPlayed: number;

  // Scoring
  scoringAverage: number | null;
  avgScoreToPar: number | null;
  bestRound: number | null;
  worstRound: number | null;
  totalBirdies: number;
  totalEagles: number;
  totalPars: number;
  totalBogeys: number;
  totalDoublePlus: number;
  birdiesPerRound: number | null;
  eaglesPerRound: number | null;
  parsPerRound: number | null;
  bogeysPerRound: number | null;
  doublePlusPerRound: number | null;

  // Scoring by round type
  practiceScoringAvg: number | null;
  practiceRounds: number;
  qualifyingScoringAvg: number | null;
  qualifyingRounds: number;
  tournamentScoringAvg: number | null;
  tournamentRounds: number;

  // Streaks
  mostBirdiesRound: number;
  mostBirdiesRow: number;
  mostParsRow: number;
  currentNo3PuttStreak: number;
  longestNo3PuttStreak: number;
  longestHoleOut: number | null;

  // Driving
  drivingDistanceAvg: number | null;
  drivingDistanceDriverOnly: number | null;
  fairwaysHit: number;
  fairwayOpportunities: number;
  fairwayPercentage: number | null;
  fairwayPctPar4: number | null;
  fairwayPctPar5: number | null;
  fairwayPctDriver: number | null;
  fairwayPctNonDriver: number | null;
  fairwaysHitPerRound: number | null;
  missLeftCount: number;
  missRightCount: number;
  missLeftPct: number | null;
  missRightPct: number | null;

  // GIR
  girTotal: number;
  girOpportunities: number;
  girPercentage: number | null;
  girPerRound: number | null;
  girPctPar3: number | null;
  girPctPar4: number | null;
  girPctPar5: number | null;

  // GIR by distance
  girPct50_75: number | null;
  girPct75_100: number | null;
  girPct100_125: number | null;
  girPct125_150: number | null;
  girPct150_175: number | null;
  girPct175_200: number | null;
  girPct200_225: number | null;
  girPct225Plus: number | null;

  // GIR by lie
  girPctFromFairway: number | null;
  girPctFromRough: number | null;
  girPctFromSand: number | null;

  // Approach miss direction (when missing green)
  approachMissShortPct: number | null;
  approachMissLongPct: number | null;
  approachMissLeftPct: number | null;
  approachMissRightPct: number | null;
  approachMissShortLeftPct: number | null;
  approachMissShortRightPct: number | null;
  approachMissLongLeftPct: number | null;
  approachMissLongRightPct: number | null;
  approachMissTotal: number;

  // Putting
  totalPutts: number;
  puttsPerRound: number | null;
  puttsPerHole: number | null;
  puttsPerGir: number | null;
  threePuttsTotal: number;
  threePuttsPerRound: number | null;
  onePuttsTotal: number;

  // Putting make %
  puttMakePct0_3: number | null;
  puttMakePct3_5: number | null;
  puttMakePct5_10: number | null;
  puttMakePct10_15: number | null;
  puttMakePct15_20: number | null;
  puttMakePct20_25: number | null;
  puttMakePct25_30: number | null;
  puttMakePct30_35: number | null;
  puttMakePct35Plus: number | null;

  // Putting proximity (average distance left after first putt)
  puttProximity0_5: number | null;
  puttProximity5_10: number | null;
  puttProximity10_15: number | null;
  puttProximity15_20: number | null;
  puttProximity20Plus: number | null;

  // Putting efficiency (strokes to hole out)
  puttEff0_5: number | null;
  puttEff5_10: number | null;
  puttEff10_15: number | null;
  puttEff15_20: number | null;
  puttEff20_25: number | null;
  puttEff25_30: number | null;
  puttEff30_35: number | null;
  puttEff35Plus: number | null;

  // Putting miss direction
  puttMissLeftPct: number | null;
  puttMissRightPct: number | null;
  puttMissShortPct: number | null;
  puttMissLongPct: number | null;
  puttMissLowPct: number | null;   // Didn't break enough (amateur miss)
  puttMissHighPct: number | null;  // Broke too much (pro miss)

  // Putting stats by break type
  puttingByBreak: {
    left_to_right: PuttingBreakStats;
    straight: PuttingBreakStats;
    right_to_left: PuttingBreakStats;
    multiple: PuttingBreakStats;
  };

  // Approach
  approachProximityAvg: number | null;  // ALL approach shots
  approachProximityWhenHitGreen: number | null;  // Only when result was green
  approachProximityWhenMissedGreen: number | null;  // When missed green
  approachProximityPar3: number | null;
  approachProximityPar4: number | null;
  approachProximityPar5: number | null;
  approachProximityFairway: number | null;
  approachProximityRough: number | null;
  approachProximitySand: number | null;

  // Approach proximity by distance
  approachProx30_75: number | null;
  approachProx75_100: number | null;
  approachProx100_125: number | null;
  approachProx125_150: number | null;
  approachProx150_175: number | null;
  approachProx175_200: number | null;
  approachProx200_225: number | null;
  approachProx225Plus: number | null;

  // Approach efficiency (strokes to hole out from approach distance)
  approachEff30_75: { fairway: number | null; rough: number | null; sand: number | null };
  approachEff75_100: { fairway: number | null; rough: number | null; sand: number | null };
  approachEff100_125: { fairway: number | null; rough: number | null; sand: number | null };
  approachEff125_150: { fairway: number | null; rough: number | null; sand: number | null };
  approachEff150_175: { fairway: number | null; rough: number | null; sand: number | null };
  approachEff175_200: { fairway: number | null; rough: number | null; sand: number | null };
  approachEff200_225: { fairway: number | null; rough: number | null; sand: number | null };
  approachEff225Plus: { fairway: number | null; rough: number | null; sand: number | null };

  // Scrambling
  scrambleAttempts: number;
  scramblesMade: number;
  scramblingPercentage: number | null;
  scramblingPctFairway: number | null;
  scramblingPctRough: number | null;
  scramblingPctSand: number | null;
  scramblingPct0_10: number | null;
  scramblingPct10_20: number | null;
  scramblingPct20_30: number | null;

  // Around the green
  atgEfficiencyAvg: number | null;
  atgEfficiency0_10: number | null;
  atgEfficiency10_20: number | null;
  atgEfficiency20_30: number | null;
  atgEffFairway: number | null;
  atgEffRough: number | null;
  atgEffSand: number | null;

  // ATG efficiency by distance + lie
  atgEffByDistanceLie: {
    [key: string]: {
      fairway: number | null;
      rough: number | null;
      sand: number | null;
    };
  };

  // Sand saves
  sandSaveAttempts: number;
  sandSavesMade: number;
  sandSavePercentage: number | null;

  // Penalties
  totalPenalties: number;
  penaltiesPerRound: number | null;

  // Strokes Gained (vs PGA Tour averages)
  strokesGainedTotal: number | null;
  strokesGainedTee: number | null;       // SG: Off the Tee
  strokesGainedApproach: number | null;  // SG: Approach the Green
  strokesGainedAroundGreen: number | null; // SG: Around the Green
  strokesGainedPutting: number | null;   // SG: Putting

  // Per round averages
  sgTeePerRound: number | null;
  sgApproachPerRound: number | null;
  sgAroundGreenPerRound: number | null;
  sgPuttingPerRound: number | null;
  sgTotalPerRound: number | null;
}

// Putting stats by break type interface
export interface PuttingBreakStats {
  totalPutts: number;

  // Make % by distance
  makePct0_3: number | null;
  makePct3_5: number | null;
  makePct5_10: number | null;
  makePct10_15: number | null;
  makePct15_20: number | null;
  makePct20_25: number | null;
  makePct25_30: number | null;
  makePct30_35: number | null;
  makePct35Plus: number | null;

  // Overall make %
  overallMakePct: number | null;

  // Miss direction %
  missShortPct: number | null;
  missLowPct: number | null;
  missHighPct: number | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeToYards(distance: number | null | undefined, unit: string | null | undefined): number {
  if (distance == null) return 0;
  return unit === 'feet' ? distance / 3 : distance;
}

function normalizeToFeet(distance: number | null | undefined, unit: string | null | undefined): number {
  if (distance == null) return 0;
  return unit === 'yards' ? distance * 3 : distance;
}

function safePercent(made: number, attempts: number): number | null {
  if (attempts === 0) return null;
  return Math.round((made / attempts) * 1000) / 10;
}

function safeAverage(total: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round((total / count) * 100) / 100;
}

function getPuttDistanceBucket(distance: number): string {
  if (distance <= 3) return '0_3';
  if (distance <= 5) return '3_5';
  if (distance <= 10) return '5_10';
  if (distance <= 15) return '10_15';
  if (distance <= 20) return '15_20';
  if (distance <= 25) return '20_25';
  if (distance <= 30) return '25_30';
  if (distance <= 35) return '30_35';
  return '35_plus';
}

function getApproachDistanceBucket(distance: number): string {
  if (distance <= 75) return '30_75';
  if (distance <= 100) return '75_100';
  if (distance <= 125) return '100_125';
  if (distance <= 150) return '125_150';
  if (distance <= 175) return '150_175';
  if (distance <= 200) return '175_200';
  if (distance <= 225) return '200_225';
  return '225_plus';
}

function getAtgDistanceBucket(distance: number): string {
  if (distance <= 10) return '0_10';
  if (distance <= 20) return '10_20';
  return '20_30';
}

// ============================================================================
// STROKES GAINED - PGA TOUR BENCHMARKS
// ============================================================================

// PGA Tour benchmark data - average strokes to hole out from each position
// Source: PGA Tour Strokes Gained methodology

const STROKES_GAINED_BENCHMARKS = {
  // From tee (by distance in yards)
  tee: {
    400: 4.08, 425: 4.17, 450: 4.27, 475: 4.37, 500: 4.47,
    525: 4.57, 550: 4.68, 575: 4.79, 600: 4.91,
  },

  // From fairway (by distance in yards)
  fairway: {
    50: 2.59, 75: 2.70, 100: 2.80, 125: 2.90, 150: 2.99,
    175: 3.08, 200: 3.19, 225: 3.32, 250: 3.45, 275: 3.58,
  },

  // From rough (by distance in yards)
  rough: {
    50: 2.76, 75: 2.86, 100: 2.95, 125: 3.05, 150: 3.15,
    175: 3.26, 200: 3.39, 225: 3.53, 250: 3.68, 275: 3.84,
  },

  // From sand (by distance in yards)
  sand: {
    20: 2.53, 30: 2.60, 40: 2.73, 50: 2.90, 75: 3.20,
    100: 3.40, 125: 3.60, 150: 3.80,
  },

  // From green (putting, by distance in feet)
  green: {
    1: 1.00, 2: 1.01, 3: 1.04, 4: 1.13, 5: 1.23,
    6: 1.34, 7: 1.42, 8: 1.50, 9: 1.56, 10: 1.61,
    15: 1.78, 20: 1.87, 25: 1.94, 30: 1.99, 40: 2.06,
    50: 2.12, 60: 2.18,
  },

  // Recovery (from trouble)
  recovery: 3.50,
};

// Helper to get expected strokes from position
function getExpectedStrokes(lie: string | null, distanceYards: number, distanceFeet?: number): number {
  if (!lie) return 0;
  if (lie === 'green' && distanceFeet !== undefined) {
    // Putting - use feet
    const distances = Object.keys(STROKES_GAINED_BENCHMARKS.green).map(Number).sort((a, b) => a - b);
    const closest = distances.reduce((prev, curr) =>
      Math.abs(curr - distanceFeet) < Math.abs(prev - distanceFeet) ? curr : prev
    );
    return STROKES_GAINED_BENCHMARKS.green[closest as keyof typeof STROKES_GAINED_BENCHMARKS.green] || 2.0;
  }

  const benchmarkTable = STROKES_GAINED_BENCHMARKS[lie as keyof typeof STROKES_GAINED_BENCHMARKS];
  if (!benchmarkTable || typeof benchmarkTable !== 'object') {
    return STROKES_GAINED_BENCHMARKS.recovery;
  }

  const distances = Object.keys(benchmarkTable).map(Number).sort((a, b) => a - b);
  const closest = distances.reduce((prev, curr) =>
    Math.abs(curr - distanceYards) < Math.abs(prev - distanceYards) ? curr : prev
  );
  return (benchmarkTable as Record<number, number>)[closest] || 3.5;
}

// Calculate Strokes Gained for a shot
function calculateStrokesGainedForShot(shot: RawShot): number {
  // Strokes Gained = Expected strokes BEFORE - (1 + Expected strokes AFTER)

  const lieBefore = shot.lie_before;
  const distBefore = normalizeToYards(shot.distance_to_hole_before, shot.distance_unit_before);
  const distBeforeFeet = normalizeToFeet(shot.distance_to_hole_before, shot.distance_unit_before);

  const lieAfter = shot.result === 'green' ? 'green' : shot.result;
  const distAfter = normalizeToYards(shot.distance_to_hole_after, shot.distance_unit_after);
  const distAfterFeet = normalizeToFeet(shot.distance_to_hole_after, shot.distance_unit_after);

  // Get expected strokes before
  const expectedBefore = lieBefore === 'green'
    ? getExpectedStrokes('green', 0, distBeforeFeet)
    : getExpectedStrokes(lieBefore, distBefore);

  // Get expected strokes after (0 if holed)
  let expectedAfter = 0;
  if (shot.result !== 'hole') {
    expectedAfter = lieAfter === 'green'
      ? getExpectedStrokes('green', 0, distAfterFeet)
      : getExpectedStrokes(lieAfter, distAfter);
  }

  // Strokes Gained = what was expected - what it cost (1 stroke + remaining expected)
  return expectedBefore - (1 + expectedAfter);
}

// Categorize SG by shot type
function getStrokesGainedCategory(shot: RawShot): 'tee' | 'approach' | 'around_green' | 'putting' {
  if (shot.shot_type === 'putting') return 'putting';
  if (shot.shot_type === 'tee') return 'tee';
  if (shot.shot_type === 'around_green') return 'around_green';
  return 'approach';
}

// ============================================================================
// SHOT-BASED HOLE CALCULATOR
// ============================================================================

interface CalculatedHoleStats {
  holeNumber: number;
  par: number;
  score: number;
  putts: number;
  fairwayHit: boolean | null;
  usedDriver: boolean | null;
  drivingDistance: number | null;
  driveMissDirection: string | null;
  greenInRegulation: boolean;
  approachDistance: number | null;
  approachLie: string | null;
  approachProximity: number | null;
  approachMissDirection: string | null; // Where approach missed when not GIR
  firstPuttDistance: number | null;
  firstPuttLeave: number | null;
  firstPuttBreak: string | null;
  firstPuttSlope: string | null;
  scrambleAttempt: boolean;
  scrambleMade: boolean;
  sandSaveAttempt: boolean;
  sandSaveMade: boolean;
  penalties: number;
  threePutts: boolean;
  shots: RawShot[];
}

/**
 * Calculate hole statistics from raw shots
 * This is where all hole-level stats are DERIVED from individual shots
 */
function calculateHoleStatsFromShots(shots: RawShot[], par: number): CalculatedHoleStats {
  // Sort shots by shot number
  const sortedShots = [...shots].sort((a, b) => a.shot_number - b.shot_number);

  // Score = number of shots
  const score = sortedShots.length;

  // Putts = shots where shot_type is 'putting'
  const puttingShots = sortedShots.filter(s => s.shot_type === 'putting');
  const putts = puttingShots.length;

  // Tee shot analysis
  const teeShot = sortedShots.find(s => s.shot_type === 'tee');
  const fairwayHit = teeShot ? teeShot.result === 'fairway' : null;
  const usedDriver = teeShot ? teeShot.club_type === 'driver' : null;
  const drivingDistance = teeShot
    ? normalizeToYards(teeShot.shot_distance, teeShot.distance_unit_before)
    : null;
  const driveMissDirection = teeShot && teeShot.result !== 'fairway'
    ? teeShot.miss_direction
    : null;

  // GIR = shot that lands on green has shot_number <= par - 2
  const shotToGreen = sortedShots.find(s => s.result === 'green');
  const greenInRegulation = shotToGreen
    ? shotToGreen.shot_number <= (par - 2)
    : false;

  // Approach distance and lie - use the shot that landed on green when it IS an approach/ATG shot
  const approachDistance = shotToGreen && (shotToGreen.shot_type === 'approach' || shotToGreen.shot_type === 'around_green')
    ? normalizeToYards(shotToGreen.distance_to_hole_before, shotToGreen.distance_unit_before)
    : null;

  const approachLie = shotToGreen && (shotToGreen.shot_type === 'approach' || shotToGreen.shot_type === 'around_green')
    ? shotToGreen.lie_before
    : null;

  const approachProximity = shotToGreen && shotToGreen.result === 'green'
    ? normalizeToFeet(shotToGreen.distance_to_hole_after, shotToGreen.distance_unit_after)
    : null;

  // Approach miss direction - when NOT GIR, find the approach/around-green shot that missed
  // This is the last approach/around-green shot that didn't land on green
  const approachMissDirection = !greenInRegulation
    ? (() => {
        // Find approach/around-green shots that missed the green
        const missedApproachShots = sortedShots.filter(
          s => (s.shot_type === 'approach' || s.shot_type === 'around_green') &&
               s.result !== 'green' && s.result !== 'hole'
        );
        // Get the last one (closest to finally getting on the green)
        const lastMissedApproach = missedApproachShots[missedApproachShots.length - 1];
        return lastMissedApproach?.miss_direction || null;
      })()
    : null;

  // First putt analysis
  const firstPutt = puttingShots[0];
  const firstPuttDistance = firstPutt
    ? normalizeToFeet(firstPutt.distance_to_hole_before, firstPutt.distance_unit_before)
    : null;
  const firstPuttLeave = firstPutt && firstPutt.result !== 'hole'
    ? normalizeToFeet(firstPutt.distance_to_hole_after, firstPutt.distance_unit_after)
    : null;
  const firstPuttBreak = firstPutt ? (firstPutt.putt_break ?? null) : null;
  const firstPuttSlope = firstPutt ? (firstPutt.putt_slope ?? null) : null;

  // Scrambling = missed GIR but made par or better
  const scrambleAttempt = !greenInRegulation;
  const scrambleMade = scrambleAttempt && (score <= par);

  // Sand save = missed GIR from sand, made par or better
  const lastShotBeforeGreen = sortedShots
    .filter(s => s.result !== 'green' && s.shot_number < (shotToGreen?.shot_number || 999))
    .sort((a, b) => b.shot_number - a.shot_number)[0];

  const sandSaveAttempt = !greenInRegulation && lastShotBeforeGreen?.lie_before === 'sand';
  const sandSaveMade = sandSaveAttempt && (score <= par);

  // Penalties
  const penalties = sortedShots.filter(s => s.is_penalty).length;

  // 3-putts
  const threePutts = putts >= 3;

  return {
    holeNumber: shots[0]?.hole_number || 0,
    par,
    score,
    putts,
    fairwayHit,
    usedDriver,
    drivingDistance,
    driveMissDirection,
    greenInRegulation,
    approachDistance,
    approachLie,
    approachProximity,
    approachMissDirection,
    firstPuttDistance,
    firstPuttLeave,
    firstPuttBreak,
    firstPuttSlope,
    scrambleAttempt,
    scrambleMade,
    sandSaveAttempt,
    sandSaveMade,
    penalties,
    threePutts,
    shots: sortedShots,
  };
}

// ============================================================================
// MAIN CALCULATOR - Calculate stats from raw shots
// ============================================================================

export function calculateStatsFromShots(
  shots: RawShot[],
  holes: HoleInfo[],
  rounds: RoundInfo[]
): GolfStats {
  // Group shots by round
  const shotsByRound = new Map<string, RawShot[]>();
  for (const shot of shots) {
    if (!shotsByRound.has(shot.round_id)) {
      shotsByRound.set(shot.round_id, []);
    }
    shotsByRound.get(shot.round_id)!.push(shot);
  }

  // Group holes by round
  const holesByRound = new Map<string, HoleInfo[]>();
  for (const hole of holes) {
    if (!holesByRound.has(hole.round_id)) {
      holesByRound.set(hole.round_id, []);
    }
    holesByRound.get(hole.round_id)!.push(hole);
  }

  // Calculate hole stats from shots for each round
  interface RoundWithHoleStats {
    roundInfo: RoundInfo;
    holes: CalculatedHoleStats[];
    totalScore: number;
  }

  const roundsWithStats: RoundWithHoleStats[] = [];

  for (const round of rounds) {
    const roundShots = shotsByRound.get(round.id) || [];
    const roundHoles = holesByRound.get(round.id) || [];

    // Group shots by hole number
    const shotsByHole = new Map<number, RawShot[]>();
    for (const shot of roundShots) {
      if (!shotsByHole.has(shot.hole_number)) {
        shotsByHole.set(shot.hole_number, []);
      }
      shotsByHole.get(shot.hole_number)!.push(shot);
    }

    // Calculate stats for each hole
    const holeStats: CalculatedHoleStats[] = [];
    for (const hole of roundHoles) {
      const holeShots = shotsByHole.get(hole.hole_number) || [];
      if (holeShots.length > 0) {
        const stats = calculateHoleStatsFromShots(holeShots, hole.par);
        holeStats.push(stats);
      }
    }

    const totalScore = holeStats.reduce((sum, h) => sum + h.score, 0);

    roundsWithStats.push({
      roundInfo: round,
      holes: holeStats,
      totalScore,
    });
  }

  // Now aggregate stats across all rounds
  return aggregateRoundStats(roundsWithStats);
}

// ============================================================================
// AGGREGATE STATS ACROSS ROUNDS
// ============================================================================

function aggregateRoundStats(rounds: Array<{
  roundInfo: RoundInfo;
  holes: CalculatedHoleStats[];
  totalScore: number;
}>): GolfStats {
  const stats: GolfStats = {
    roundsPlayed: rounds.length,
    holesPlayed: 0,
    scoringAverage: null,
    avgScoreToPar: null,
    bestRound: null,
    worstRound: null,
    totalBirdies: 0,
    totalEagles: 0,
    totalPars: 0,
    totalBogeys: 0,
    totalDoublePlus: 0,
    birdiesPerRound: null,
    eaglesPerRound: null,
    parsPerRound: null,
    bogeysPerRound: null,
    doublePlusPerRound: null,
    practiceScoringAvg: null,
    practiceRounds: 0,
    qualifyingScoringAvg: null,
    qualifyingRounds: 0,
    tournamentScoringAvg: null,
    tournamentRounds: 0,
    mostBirdiesRound: 0,
    mostBirdiesRow: 0,
    mostParsRow: 0,
    currentNo3PuttStreak: 0,
    longestNo3PuttStreak: 0,
    longestHoleOut: null,
    drivingDistanceAvg: null,
    drivingDistanceDriverOnly: null,
    fairwaysHit: 0,
    fairwayOpportunities: 0,
    fairwayPercentage: null,
    fairwayPctPar4: null,
    fairwayPctPar5: null,
    fairwayPctDriver: null,
    fairwayPctNonDriver: null,
    fairwaysHitPerRound: null,
    missLeftCount: 0,
    missRightCount: 0,
    missLeftPct: null,
    missRightPct: null,
    girTotal: 0,
    girOpportunities: 0,
    girPercentage: null,
    girPerRound: null,
    girPctPar3: null,
    girPctPar4: null,
    girPctPar5: null,
    girPct50_75: null,
    girPct75_100: null,
    girPct100_125: null,
    girPct125_150: null,
    girPct150_175: null,
    girPct175_200: null,
    girPct200_225: null,
    girPct225Plus: null,
    girPctFromFairway: null,
    girPctFromRough: null,
    girPctFromSand: null,
    approachMissShortPct: null,
    approachMissLongPct: null,
    approachMissLeftPct: null,
    approachMissRightPct: null,
    approachMissShortLeftPct: null,
    approachMissShortRightPct: null,
    approachMissLongLeftPct: null,
    approachMissLongRightPct: null,
    approachMissTotal: 0,
    totalPutts: 0,
    puttsPerRound: null,
    puttsPerHole: null,
    puttsPerGir: null,
    threePuttsTotal: 0,
    threePuttsPerRound: null,
    onePuttsTotal: 0,
    puttMakePct0_3: null,
    puttMakePct3_5: null,
    puttMakePct5_10: null,
    puttMakePct10_15: null,
    puttMakePct15_20: null,
    puttMakePct20_25: null,
    puttMakePct25_30: null,
    puttMakePct30_35: null,
    puttMakePct35Plus: null,
    puttProximity0_5: null,
    puttProximity5_10: null,
    puttProximity10_15: null,
    puttProximity15_20: null,
    puttProximity20Plus: null,
    puttEff0_5: null,
    puttEff5_10: null,
    puttEff10_15: null,
    puttEff15_20: null,
    puttEff20_25: null,
    puttEff25_30: null,
    puttEff30_35: null,
    puttEff35Plus: null,
    puttMissLeftPct: null,
    puttMissRightPct: null,
    puttMissShortPct: null,
    puttMissLongPct: null,
    puttMissLowPct: null,
    puttMissHighPct: null,
    puttingByBreak: {
      left_to_right: {
        totalPutts: 0,
        makePct0_3: null,
        makePct3_5: null,
        makePct5_10: null,
        makePct10_15: null,
        makePct15_20: null,
        makePct20_25: null,
        makePct25_30: null,
        makePct30_35: null,
        makePct35Plus: null,
        overallMakePct: null,
        missShortPct: null,
        missLowPct: null,
        missHighPct: null,
      },
      straight: {
        totalPutts: 0,
        makePct0_3: null,
        makePct3_5: null,
        makePct5_10: null,
        makePct10_15: null,
        makePct15_20: null,
        makePct20_25: null,
        makePct25_30: null,
        makePct30_35: null,
        makePct35Plus: null,
        overallMakePct: null,
        missShortPct: null,
        missLowPct: null,
        missHighPct: null,
      },
      right_to_left: {
        totalPutts: 0,
        makePct0_3: null,
        makePct3_5: null,
        makePct5_10: null,
        makePct10_15: null,
        makePct15_20: null,
        makePct20_25: null,
        makePct25_30: null,
        makePct30_35: null,
        makePct35Plus: null,
        overallMakePct: null,
        missShortPct: null,
        missLowPct: null,
        missHighPct: null,
      },
      multiple: {
        totalPutts: 0,
        makePct0_3: null,
        makePct3_5: null,
        makePct5_10: null,
        makePct10_15: null,
        makePct15_20: null,
        makePct20_25: null,
        makePct25_30: null,
        makePct30_35: null,
        makePct35Plus: null,
        overallMakePct: null,
        missShortPct: null,
        missLowPct: null,
        missHighPct: null,
      },
    },
    approachProximityAvg: null,
    approachProximityWhenHitGreen: null,
    approachProximityWhenMissedGreen: null,
    approachProximityPar3: null,
    approachProximityPar4: null,
    approachProximityPar5: null,
    approachProximityFairway: null,
    approachProximityRough: null,
    approachProximitySand: null,
    approachProx30_75: null,
    approachProx75_100: null,
    approachProx100_125: null,
    approachProx125_150: null,
    approachProx150_175: null,
    approachProx175_200: null,
    approachProx200_225: null,
    approachProx225Plus: null,
    approachEff30_75: { fairway: null, rough: null, sand: null },
    approachEff75_100: { fairway: null, rough: null, sand: null },
    approachEff100_125: { fairway: null, rough: null, sand: null },
    approachEff125_150: { fairway: null, rough: null, sand: null },
    approachEff150_175: { fairway: null, rough: null, sand: null },
    approachEff175_200: { fairway: null, rough: null, sand: null },
    approachEff200_225: { fairway: null, rough: null, sand: null },
    approachEff225Plus: { fairway: null, rough: null, sand: null },
    scrambleAttempts: 0,
    scramblesMade: 0,
    scramblingPercentage: null,
    scramblingPctFairway: null,
    scramblingPctRough: null,
    scramblingPctSand: null,
    scramblingPct0_10: null,
    scramblingPct10_20: null,
    scramblingPct20_30: null,
    atgEfficiencyAvg: null,
    atgEfficiency0_10: null,
    atgEfficiency10_20: null,
    atgEfficiency20_30: null,
    atgEffFairway: null,
    atgEffRough: null,
    atgEffSand: null,
    atgEffByDistanceLie: {
      '0_10': { fairway: null, rough: null, sand: null },
      '10_20': { fairway: null, rough: null, sand: null },
      '20_30': { fairway: null, rough: null, sand: null },
    },
    sandSaveAttempts: 0,
    sandSavesMade: 0,
    sandSavePercentage: null,
    totalPenalties: 0,
    penaltiesPerRound: null,
    strokesGainedTotal: null,
    strokesGainedTee: null,
    strokesGainedApproach: null,
    strokesGainedAroundGreen: null,
    strokesGainedPutting: null,
    sgTeePerRound: null,
    sgApproachPerRound: null,
    sgAroundGreenPerRound: null,
    sgPuttingPerRound: null,
    sgTotalPerRound: null,
  };

  // Accumulators
  let totalScore = 0;
  let totalPar = 0;
  let practiceScore = 0;
  let qualifyingScore = 0;
  let tournamentScore = 0;

  const drivingDistances: number[] = [];
  const drivingDistancesDriverOnly: number[] = [];
  const fairwaysPar4 = { hit: 0, total: 0 };
  const fairwaysPar5 = { hit: 0, total: 0 };
  const fairwaysDriver = { hit: 0, total: 0 };
  const fairwaysNonDriver = { hit: 0, total: 0 };

  const girPar3 = { made: 0, total: 0 };
  const girPar4 = { made: 0, total: 0 };
  const girPar5 = { made: 0, total: 0 };
  let puttsOnGir = 0;

  // GIR by distance and lie
  const girByDistance: Record<string, { made: number; total: number }> = {};
  const girByLie = {
    fairway: { made: 0, total: 0 },
    rough: { made: 0, total: 0 },
    sand: { made: 0, total: 0 },
  };

  // Putting stats by break type
  const puttStatsByBreak: Record<string, {
    make: Record<string, { made: number; total: number }>;
    missShort: number;
    missLow: number;
    missHigh: number;
    missTotal: number;
  }> = {
    left_to_right: { make: {}, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
    straight: { make: {}, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
    right_to_left: { make: {}, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
    multiple: { make: {}, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
  };

  // Strokes Gained accumulators
  let sgTee = 0;
  let sgApproach = 0;
  let sgAroundGreen = 0;
  let sgPutting = 0;

  const puttMake: Record<string, { made: number; total: number }> = {};
  const puttProximity: Record<string, number[]> = {};
  const puttEff: Record<string, number[]> = {};

  let puttMissLeft = 0;
  let puttMissRight = 0;
  let puttMissShort = 0;
  let puttMissLong = 0;
  let puttMissLow = 0;  // New: Didn't break enough
  let puttMissHigh = 0;  // New: Broke too much
  let puttMissTotal = 0;

  // Approach miss direction counters
  let approachMissShort = 0;
  let approachMissLong = 0;
  let approachMissLeft = 0;
  let approachMissRight = 0;
  let approachMissShortLeft = 0;
  let approachMissShortRight = 0;
  let approachMissLongLeft = 0;
  let approachMissLongRight = 0;
  let approachMissTotal = 0;

  const approachProximities: number[] = [];
  const greenHitProximities: number[] = [];  // Proximity when hit green
  const greenMissProximities: number[] = [];  // Proximity when missed green
  const approachProxPar3: number[] = [];
  const approachProxPar4: number[] = [];
  const approachProxPar5: number[] = [];
  const approachProxFairway: number[] = [];
  const approachProxRough: number[] = [];
  const approachProxSand: number[] = [];

  const approachProxByDistance: Record<string, number[]> = {};
  const approachEffByDistanceLie: Record<string, Record<string, number[]>> = {};

  const scrambleFairway = { made: 0, total: 0 };
  const scrambleRough = { made: 0, total: 0 };
  const scrambleSand = { made: 0, total: 0 };
  const scramble0_10 = { made: 0, total: 0 };
  const scramble10_20 = { made: 0, total: 0 };
  const scramble20_30 = { made: 0, total: 0 };

  const atgEff0_10: number[] = [];
  const atgEff10_20: number[] = [];
  const atgEff20_30: number[] = [];
  const atgEffFairway: number[] = [];
  const atgEffRough: number[] = [];
  const atgEffSand: number[] = [];

  const atgEffByDistanceLie: Record<string, Record<string, number[]>> = {
    '0_10': { fairway: [], rough: [], sand: [] },
    '10_20': { fairway: [], rough: [], sand: [] },
    '20_30': { fairway: [], rough: [], sand: [] },
  };

  let currentBirdieStreak = 0;
  let currentParStreak = 0;
  let current3PuttStreak = 0;

  // Process each round
  for (const round of rounds) {
    const roundBirdies = round.holes.filter(h => (h.score - h.par) === -1).length;

    totalScore += round.totalScore;
    stats.holesPlayed += round.holes.length;

    // Best/worst round
    if (stats.bestRound === null || round.totalScore < stats.bestRound) {
      stats.bestRound = round.totalScore;
    }
    if (stats.worstRound === null || round.totalScore > stats.worstRound) {
      stats.worstRound = round.totalScore;
    }

    // Most birdies
    if (roundBirdies > stats.mostBirdiesRound) {
      stats.mostBirdiesRound = roundBirdies;
    }

    // Round type scoring
    if (round.roundInfo.round_type === 'practice') {
      practiceScore += round.totalScore;
      stats.practiceRounds++;
    } else if (round.roundInfo.round_type === 'qualifying') {
      qualifyingScore += round.totalScore;
      stats.qualifyingRounds++;
    } else if (round.roundInfo.round_type === 'tournament') {
      tournamentScore += round.totalScore;
      stats.tournamentRounds++;
    }

    // Process each hole
    for (const hole of round.holes) {
      const scoreToPar = hole.score - hole.par;
      totalPar += hole.par;

      // Scoring counts
      if (scoreToPar <= -2) stats.totalEagles++;
      else if (scoreToPar === -1) stats.totalBirdies++;
      else if (scoreToPar === 0) stats.totalPars++;
      else if (scoreToPar === 1) stats.totalBogeys++;
      else stats.totalDoublePlus++;

      // Streaks
      if (scoreToPar === -1) {
        currentBirdieStreak++;
        if (currentBirdieStreak > stats.mostBirdiesRow) {
          stats.mostBirdiesRow = currentBirdieStreak;
        }
      } else {
        currentBirdieStreak = 0;
      }

      if (scoreToPar === 0) {
        currentParStreak++;
        if (currentParStreak > stats.mostParsRow) {
          stats.mostParsRow = currentParStreak;
        }
      } else {
        currentParStreak = 0;
      }

      if (!hole.threePutts) {
        current3PuttStreak++;
        if (current3PuttStreak > stats.longestNo3PuttStreak) {
          stats.longestNo3PuttStreak = current3PuttStreak;
        }
      } else {
        current3PuttStreak = 0;
      }

      // Driving
      if (hole.drivingDistance !== null) {
        drivingDistances.push(hole.drivingDistance);
        if (hole.usedDriver) {
          drivingDistancesDriverOnly.push(hole.drivingDistance);
        }
      }

      // Fairway stats - only count par 4s and par 5s (par 3s have no fairway to hit)
      if (hole.fairwayHit !== null && hole.par !== 3) {
        stats.fairwayOpportunities++;
        if (hole.fairwayHit) stats.fairwaysHit++;

        if (hole.par === 4) {
          fairwaysPar4.total++;
          if (hole.fairwayHit) fairwaysPar4.hit++;
        } else if (hole.par === 5) {
          fairwaysPar5.total++;
          if (hole.fairwayHit) fairwaysPar5.hit++;
        }

        if (hole.usedDriver) {
          fairwaysDriver.total++;
          if (hole.fairwayHit) fairwaysDriver.hit++;
        } else {
          fairwaysNonDriver.total++;
          if (hole.fairwayHit) fairwaysNonDriver.hit++;
        }

        if (!hole.fairwayHit && hole.driveMissDirection) {
          if (hole.driveMissDirection.includes('left')) stats.missLeftCount++;
          if (hole.driveMissDirection.includes('right')) stats.missRightCount++;
        }
      }

      // GIR
      stats.girOpportunities++;
      if (hole.greenInRegulation) {
        stats.girTotal++;
        puttsOnGir += hole.putts;
      }

      if (hole.par === 3) {
        girPar3.total++;
        if (hole.greenInRegulation) girPar3.made++;
      } else if (hole.par === 4) {
        girPar4.total++;
        if (hole.greenInRegulation) girPar4.made++;
      } else if (hole.par === 5) {
        girPar5.total++;
        if (hole.greenInRegulation) girPar5.made++;
      }

      // GIR by approach distance
      if (hole.approachDistance !== null) {
        const distYards = normalizeToYards(hole.approachDistance, 'yards');
        let bucket = '';
        if (distYards >= 50 && distYards < 75) bucket = '50_75';
        else if (distYards >= 75 && distYards < 100) bucket = '75_100';
        else if (distYards >= 100 && distYards < 125) bucket = '100_125';
        else if (distYards >= 125 && distYards < 150) bucket = '125_150';
        else if (distYards >= 150 && distYards < 175) bucket = '150_175';
        else if (distYards >= 175 && distYards < 200) bucket = '175_200';
        else if (distYards >= 200 && distYards < 225) bucket = '200_225';
        else if (distYards >= 225) bucket = '225_plus';

        if (bucket) {
          if (!girByDistance[bucket]) {
            girByDistance[bucket] = { made: 0, total: 0 };
          }
          girByDistance[bucket]!.total++;
          if (hole.greenInRegulation) {
            girByDistance[bucket]!.made++;
          }
        }
      }

      // GIR by approach lie
      if (hole.approachLie && (hole.approachLie === 'fairway' || hole.approachLie === 'rough' || hole.approachLie === 'sand')) {
        girByLie[hole.approachLie].total++;
        if (hole.greenInRegulation) {
          girByLie[hole.approachLie].made++;
        }
      }

      // Approach miss direction - track where misses go when NOT GIR
      if (!hole.greenInRegulation && hole.approachMissDirection) {
        approachMissTotal++;
        const missDir = hole.approachMissDirection.toLowerCase();
        // Track compound directions (e.g., 'short_left', 'long_right')
        if (missDir === 'short_left') approachMissShortLeft++;
        else if (missDir === 'short_right') approachMissShortRight++;
        else if (missDir === 'long_left') approachMissLongLeft++;
        else if (missDir === 'long_right') approachMissLongRight++;
        else if (missDir === 'short') approachMissShort++;
        else if (missDir === 'long') approachMissLong++;
        else if (missDir === 'left') approachMissLeft++;
        else if (missDir === 'right') approachMissRight++;
      }

      // Putts
      stats.totalPutts += hole.putts;
      if (hole.threePutts) stats.threePuttsTotal++;
      if (hole.putts === 1) stats.onePuttsTotal++;

      // First putt stats
      if (hole.firstPuttDistance !== null) {
        const bucket = getPuttDistanceBucket(hole.firstPuttDistance);

        // Make %
        if (!puttMake[bucket]) puttMake[bucket] = { made: 0, total: 0 };
        puttMake[bucket].total++;
        if (hole.putts === 1) puttMake[bucket].made++;

        // Proximity (leave distance)
        if (hole.firstPuttLeave !== null) {
          const proximityBucket = hole.firstPuttDistance <= 5 ? '0_5' :
                                  hole.firstPuttDistance <= 10 ? '5_10' :
                                  hole.firstPuttDistance <= 15 ? '10_15' :
                                  hole.firstPuttDistance <= 20 ? '15_20' : '20_plus';
          if (!puttProximity[proximityBucket]) puttProximity[proximityBucket] = [];
          puttProximity[proximityBucket].push(hole.firstPuttLeave);
        }

        // Efficiency (total putts from distance)
        if (!puttEff[bucket]) puttEff[bucket] = [];
        puttEff[bucket].push(hole.putts);

        // Miss direction
        if (hole.putts > 1 && hole.firstPuttLeave && hole.firstPuttLeave > 0) {
          puttMissTotal++;
          // Determine miss direction from shots
          const firstPuttShot = hole.shots.find(s => s.shot_type === 'putting');
          if (firstPuttShot?.miss_direction) {
            if (firstPuttShot.miss_direction.includes('left')) puttMissLeft++;
            if (firstPuttShot.miss_direction.includes('right')) puttMissRight++;
            if (firstPuttShot.miss_direction.includes('short')) puttMissShort++;
            if (firstPuttShot.miss_direction.includes('long')) puttMissLong++;
            // Miss direction values for putting (use includes for compound tags like 'low_short')
            if (firstPuttShot.miss_direction.includes('low')) puttMissLow++;
            if (firstPuttShot.miss_direction.includes('high')) puttMissHigh++;
          }
        }

        // Putting stats by break type
        const firstPuttShot = hole.shots.find(s => s.shot_type === 'putting');
        if (firstPuttShot?.putt_break && (firstPuttShot.putt_break === 'left_to_right' ||
            firstPuttShot.putt_break === 'right_to_left' || firstPuttShot.putt_break === 'straight' ||
            firstPuttShot.putt_break === 'multiple')) {
          const breakType = firstPuttShot.putt_break;

          if (!puttStatsByBreak[breakType]) {
            puttStatsByBreak[breakType] = { make: {}, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 };
          }

          // Make % by distance for this break type
          if (!puttStatsByBreak[breakType].make[bucket]) {
            puttStatsByBreak[breakType].make[bucket] = { made: 0, total: 0 };
          }
          puttStatsByBreak[breakType].make[bucket].total++;
          if (hole.putts === 1) {
            puttStatsByBreak[breakType].make[bucket].made++;
          }

          // Miss direction for this break type (use includes for compound tags like 'low_short')
          if (hole.putts > 1 && firstPuttShot.miss_direction) {
            puttStatsByBreak[breakType].missTotal++;
            if (firstPuttShot.miss_direction.includes('short')) puttStatsByBreak[breakType].missShort++;
            if (firstPuttShot.miss_direction.includes('low')) puttStatsByBreak[breakType].missLow++;
            if (firstPuttShot.miss_direction.includes('high')) puttStatsByBreak[breakType].missHigh++;
          }
        }
      }

      // Approach proximity (ALL approach shots, split by hit/miss)
      if (hole.approachProximity !== null) {
        approachProximities.push(hole.approachProximity);

        // Split proximity by green hit vs miss
        if (hole.greenInRegulation) {
          greenHitProximities.push(hole.approachProximity);
        } else {
          greenMissProximities.push(hole.approachProximity);
        }

        if (hole.par === 3) approachProxPar3.push(hole.approachProximity);
        else if (hole.par === 4) approachProxPar4.push(hole.approachProximity);
        else if (hole.par === 5) approachProxPar5.push(hole.approachProximity);

        if (hole.approachLie === 'fairway') approachProxFairway.push(hole.approachProximity);
        else if (hole.approachLie === 'rough') approachProxRough.push(hole.approachProximity);
        else if (hole.approachLie === 'sand') approachProxSand.push(hole.approachProximity);

        if (hole.approachDistance !== null) {
          const bucket = getApproachDistanceBucket(hole.approachDistance);
          if (!approachProxByDistance[bucket]) approachProxByDistance[bucket] = [];
          approachProxByDistance[bucket].push(hole.approachProximity);

          // Approach efficiency (strokes to hole out)
          const shotsAfterApproach = hole.shots.filter(s =>
            s.shot_type === 'around_green' || s.shot_type === 'putting'
          ).length;

          if (!approachEffByDistanceLie[bucket]) {
            approachEffByDistanceLie[bucket] = { fairway: [], rough: [], sand: [] };
          }
          const lie = (hole.approachLie || 'other') as string;
          if (lie === 'fairway' || lie === 'rough' || lie === 'sand') {
            const bucketData = approachEffByDistanceLie[bucket];
            if (bucketData && bucketData[lie]) {
              bucketData[lie].push(shotsAfterApproach);
            }
          }
        }
      }

      // Scrambling
      if (hole.scrambleAttempt) {
        stats.scrambleAttempts++;
        if (hole.scrambleMade) stats.scramblesMade++;

        if (hole.approachLie === 'fairway') {
          scrambleFairway.total++;
          if (hole.scrambleMade) scrambleFairway.made++;
        } else if (hole.approachLie === 'rough') {
          scrambleRough.total++;
          if (hole.scrambleMade) scrambleRough.made++;
        } else if (hole.approachLie === 'sand') {
          scrambleSand.total++;
          if (hole.scrambleMade) scrambleSand.made++;
        }

        if (hole.approachDistance !== null) {
          const distYards = normalizeToYards(hole.approachDistance, 'yards');
          if (distYards <= 10) {
            scramble0_10.total++;
            if (hole.scrambleMade) scramble0_10.made++;
          } else if (distYards <= 20) {
            scramble10_20.total++;
            if (hole.scrambleMade) scramble10_20.made++;
          } else {
            scramble20_30.total++;
            if (hole.scrambleMade) scramble20_30.made++;
          }
        }
      }

      // Around the green efficiency
      if (hole.approachDistance !== null && hole.approachDistance <= 30) {
        const shotsToHoleOut = hole.shots.filter(s =>
          s.shot_type === 'around_green' || s.shot_type === 'putting'
        ).length;

        const bucket = getAtgDistanceBucket(hole.approachDistance);
        if (bucket === '0_10') atgEff0_10.push(shotsToHoleOut);
        else if (bucket === '10_20') atgEff10_20.push(shotsToHoleOut);
        else atgEff20_30.push(shotsToHoleOut);

        if (hole.approachLie === 'fairway') atgEffFairway.push(shotsToHoleOut);
        else if (hole.approachLie === 'rough') atgEffRough.push(shotsToHoleOut);
        else if (hole.approachLie === 'sand') atgEffSand.push(shotsToHoleOut);

        const lie = (hole.approachLie || 'other') as string;
        if (lie === 'fairway' || lie === 'rough' || lie === 'sand') {
          const bucketData = atgEffByDistanceLie[bucket];
          if (bucketData && bucketData[lie]) {
            bucketData[lie].push(shotsToHoleOut);
          }
        }
      }

      // Sand saves
      if (hole.sandSaveAttempt) {
        stats.sandSaveAttempts++;
        if (hole.sandSaveMade) stats.sandSavesMade++;
      }

      // Penalties
      stats.totalPenalties += hole.penalties;

      // Strokes Gained - process each shot
      for (const shot of hole.shots) {
        // Skip penalty shots
        if (shot.result === 'penalty') continue;

        const sg = calculateStrokesGainedForShot(shot);
        const category = getStrokesGainedCategory(shot);

        // Accumulate by category
        if (category === 'tee') sgTee += sg;
        else if (category === 'approach') sgApproach += sg;
        else if (category === 'around_green') sgAroundGreen += sg;
        else if (category === 'putting') sgPutting += sg;
      }
    }
  }

  stats.currentNo3PuttStreak = current3PuttStreak;

  // Calculate averages and percentages
  stats.scoringAverage = safeAverage(totalScore, rounds.length);
  stats.avgScoreToPar = rounds.length > 0 ? (totalScore - totalPar) / rounds.length : null;
  stats.birdiesPerRound = safeAverage(stats.totalBirdies, rounds.length);
  stats.eaglesPerRound = safeAverage(stats.totalEagles, rounds.length);
  stats.parsPerRound = safeAverage(stats.totalPars, rounds.length);
  stats.bogeysPerRound = safeAverage(stats.totalBogeys, rounds.length);
  stats.doublePlusPerRound = safeAverage(stats.totalDoublePlus, rounds.length);

  stats.practiceScoringAvg = safeAverage(practiceScore, stats.practiceRounds);
  stats.qualifyingScoringAvg = safeAverage(qualifyingScore, stats.qualifyingRounds);
  stats.tournamentScoringAvg = safeAverage(tournamentScore, stats.tournamentRounds);

  stats.drivingDistanceAvg = safeAverage(
    drivingDistances.reduce((a, b) => a + b, 0),
    drivingDistances.length
  );
  stats.drivingDistanceDriverOnly = safeAverage(
    drivingDistancesDriverOnly.reduce((a, b) => a + b, 0),
    drivingDistancesDriverOnly.length
  );

  stats.fairwayPercentage = safePercent(stats.fairwaysHit, stats.fairwayOpportunities);
  stats.fairwayPctPar4 = safePercent(fairwaysPar4.hit, fairwaysPar4.total);
  stats.fairwayPctPar5 = safePercent(fairwaysPar5.hit, fairwaysPar5.total);
  stats.fairwayPctDriver = safePercent(fairwaysDriver.hit, fairwaysDriver.total);
  stats.fairwayPctNonDriver = safePercent(fairwaysNonDriver.hit, fairwaysNonDriver.total);
  stats.fairwaysHitPerRound = safeAverage(stats.fairwaysHit, rounds.length);

  const totalMisses = stats.missLeftCount + stats.missRightCount;
  stats.missLeftPct = safePercent(stats.missLeftCount, totalMisses);
  stats.missRightPct = safePercent(stats.missRightCount, totalMisses);

  stats.girPercentage = safePercent(stats.girTotal, stats.girOpportunities);
  stats.girPerRound = safeAverage(stats.girTotal, rounds.length);
  stats.girPctPar3 = safePercent(girPar3.made, girPar3.total);
  stats.girPctPar4 = safePercent(girPar4.made, girPar4.total);
  stats.girPctPar5 = safePercent(girPar5.made, girPar5.total);

  stats.puttsPerRound = safeAverage(stats.totalPutts, rounds.length);
  stats.puttsPerHole = safeAverage(stats.totalPutts, stats.holesPlayed);
  stats.puttsPerGir = safeAverage(puttsOnGir, stats.girTotal);
  stats.threePuttsPerRound = safeAverage(stats.threePuttsTotal, rounds.length);

  // Putt make %
  stats.puttMakePct0_3 = safePercent(puttMake['0_3']?.made || 0, puttMake['0_3']?.total || 0);
  stats.puttMakePct3_5 = safePercent(puttMake['3_5']?.made || 0, puttMake['3_5']?.total || 0);
  stats.puttMakePct5_10 = safePercent(puttMake['5_10']?.made || 0, puttMake['5_10']?.total || 0);
  stats.puttMakePct10_15 = safePercent(puttMake['10_15']?.made || 0, puttMake['10_15']?.total || 0);
  stats.puttMakePct15_20 = safePercent(puttMake['15_20']?.made || 0, puttMake['15_20']?.total || 0);
  stats.puttMakePct20_25 = safePercent(puttMake['20_25']?.made || 0, puttMake['20_25']?.total || 0);
  stats.puttMakePct25_30 = safePercent(puttMake['25_30']?.made || 0, puttMake['25_30']?.total || 0);
  stats.puttMakePct30_35 = safePercent(puttMake['30_35']?.made || 0, puttMake['30_35']?.total || 0);
  stats.puttMakePct35Plus = safePercent(puttMake['35_plus']?.made || 0, puttMake['35_plus']?.total || 0);

  // Putt proximity
  stats.puttProximity0_5 = safeAverage(
    (puttProximity['0_5'] || []).reduce((a, b) => a + b, 0),
    (puttProximity['0_5'] || []).length
  );
  stats.puttProximity5_10 = safeAverage(
    (puttProximity['5_10'] || []).reduce((a, b) => a + b, 0),
    (puttProximity['5_10'] || []).length
  );
  stats.puttProximity10_15 = safeAverage(
    (puttProximity['10_15'] || []).reduce((a, b) => a + b, 0),
    (puttProximity['10_15'] || []).length
  );
  stats.puttProximity15_20 = safeAverage(
    (puttProximity['15_20'] || []).reduce((a, b) => a + b, 0),
    (puttProximity['15_20'] || []).length
  );
  stats.puttProximity20Plus = safeAverage(
    (puttProximity['20_plus'] || []).reduce((a, b) => a + b, 0),
    (puttProximity['20_plus'] || []).length
  );

  // Putt efficiency
  stats.puttEff0_5 = safeAverage(
    (puttEff['0_3'] || []).reduce((a, b) => a + b, 0),
    (puttEff['0_3'] || []).length
  );
  stats.puttEff5_10 = safeAverage(
    (puttEff['5_10'] || []).reduce((a, b) => a + b, 0),
    (puttEff['5_10'] || []).length
  );
  stats.puttEff10_15 = safeAverage(
    (puttEff['10_15'] || []).reduce((a, b) => a + b, 0),
    (puttEff['10_15'] || []).length
  );
  stats.puttEff15_20 = safeAverage(
    (puttEff['15_20'] || []).reduce((a, b) => a + b, 0),
    (puttEff['15_20'] || []).length
  );
  stats.puttEff20_25 = safeAverage(
    (puttEff['20_25'] || []).reduce((a, b) => a + b, 0),
    (puttEff['20_25'] || []).length
  );
  stats.puttEff25_30 = safeAverage(
    (puttEff['25_30'] || []).reduce((a, b) => a + b, 0),
    (puttEff['25_30'] || []).length
  );
  stats.puttEff30_35 = safeAverage(
    (puttEff['30_35'] || []).reduce((a, b) => a + b, 0),
    (puttEff['30_35'] || []).length
  );
  stats.puttEff35Plus = safeAverage(
    (puttEff['35_plus'] || []).reduce((a, b) => a + b, 0),
    (puttEff['35_plus'] || []).length
  );

  // Putt miss direction
  stats.puttMissLeftPct = safePercent(puttMissLeft, puttMissTotal);
  stats.puttMissRightPct = safePercent(puttMissRight, puttMissTotal);
  stats.puttMissShortPct = safePercent(puttMissShort, puttMissTotal);
  stats.puttMissLongPct = safePercent(puttMissLong, puttMissTotal);
  stats.puttMissLowPct = safePercent(puttMissLow, puttMissTotal);
  stats.puttMissHighPct = safePercent(puttMissHigh, puttMissTotal);

  // GIR by distance
  stats.girPct50_75 = safePercent(girByDistance['50_75']?.made || 0, girByDistance['50_75']?.total || 0);
  stats.girPct75_100 = safePercent(girByDistance['75_100']?.made || 0, girByDistance['75_100']?.total || 0);
  stats.girPct100_125 = safePercent(girByDistance['100_125']?.made || 0, girByDistance['100_125']?.total || 0);
  stats.girPct125_150 = safePercent(girByDistance['125_150']?.made || 0, girByDistance['125_150']?.total || 0);
  stats.girPct150_175 = safePercent(girByDistance['150_175']?.made || 0, girByDistance['150_175']?.total || 0);
  stats.girPct175_200 = safePercent(girByDistance['175_200']?.made || 0, girByDistance['175_200']?.total || 0);
  stats.girPct200_225 = safePercent(girByDistance['200_225']?.made || 0, girByDistance['200_225']?.total || 0);
  stats.girPct225Plus = safePercent(girByDistance['225_plus']?.made || 0, girByDistance['225_plus']?.total || 0);

  // GIR by lie
  stats.girPctFromFairway = safePercent(girByLie.fairway.made, girByLie.fairway.total);
  stats.girPctFromRough = safePercent(girByLie.rough.made, girByLie.rough.total);
  stats.girPctFromSand = safePercent(girByLie.sand.made, girByLie.sand.total);

  // Approach miss direction (when missing green)
  stats.approachMissTotal = approachMissTotal;
  stats.approachMissShortPct = safePercent(approachMissShort + approachMissShortLeft + approachMissShortRight, approachMissTotal);
  stats.approachMissLongPct = safePercent(approachMissLong + approachMissLongLeft + approachMissLongRight, approachMissTotal);
  stats.approachMissLeftPct = safePercent(approachMissLeft + approachMissShortLeft + approachMissLongLeft, approachMissTotal);
  stats.approachMissRightPct = safePercent(approachMissRight + approachMissShortRight + approachMissLongRight, approachMissTotal);
  stats.approachMissShortLeftPct = safePercent(approachMissShortLeft, approachMissTotal);
  stats.approachMissShortRightPct = safePercent(approachMissShortRight, approachMissTotal);
  stats.approachMissLongLeftPct = safePercent(approachMissLongLeft, approachMissTotal);
  stats.approachMissLongRightPct = safePercent(approachMissLongRight, approachMissTotal);

  // Proximity split (hit vs miss)
  stats.approachProximityWhenHitGreen = safeAverage(
    greenHitProximities.reduce((a, b) => a + b, 0),
    greenHitProximities.length
  );
  stats.approachProximityWhenMissedGreen = safeAverage(
    greenMissProximities.reduce((a, b) => a + b, 0),
    greenMissProximities.length
  );

  // Putting stats by break type
  for (const breakType of ['left_to_right', 'right_to_left', 'straight', 'multiple'] as const) {
    const breakData = puttStatsByBreak[breakType];
    if (breakData) {
      const totalPutts = Object.values(breakData.make).reduce((sum, bucket) => sum + bucket.total, 0);

      stats.puttingByBreak[breakType] = {
        totalPutts,
        makePct0_3: safePercent(breakData.make['0_3']?.made || 0, breakData.make['0_3']?.total || 0),
        makePct3_5: safePercent(breakData.make['3_5']?.made || 0, breakData.make['3_5']?.total || 0),
        makePct5_10: safePercent(breakData.make['5_10']?.made || 0, breakData.make['5_10']?.total || 0),
        makePct10_15: safePercent(breakData.make['10_15']?.made || 0, breakData.make['10_15']?.total || 0),
        makePct15_20: safePercent(breakData.make['15_20']?.made || 0, breakData.make['15_20']?.total || 0),
        makePct20_25: safePercent(breakData.make['20_25']?.made || 0, breakData.make['20_25']?.total || 0),
        makePct25_30: safePercent(breakData.make['25_30']?.made || 0, breakData.make['25_30']?.total || 0),
        makePct30_35: safePercent(breakData.make['30_35']?.made || 0, breakData.make['30_35']?.total || 0),
        makePct35Plus: safePercent(breakData.make['35_plus']?.made || 0, breakData.make['35_plus']?.total || 0),
        overallMakePct: safePercent(
          Object.values(breakData.make).reduce((sum, bucket) => sum + bucket.made, 0),
          totalPutts
        ),
        missShortPct: safePercent(breakData.missShort, breakData.missTotal),
        missLowPct: safePercent(breakData.missLow, breakData.missTotal),
        missHighPct: safePercent(breakData.missHigh, breakData.missTotal),
      };
    }
  }

  // Strokes Gained
  const sgTotal = sgTee + sgApproach + sgAroundGreen + sgPutting;
  stats.strokesGainedTotal = sgTotal;
  stats.strokesGainedTee = sgTee;
  stats.strokesGainedApproach = sgApproach;
  stats.strokesGainedAroundGreen = sgAroundGreen;
  stats.strokesGainedPutting = sgPutting;

  // Strokes Gained per round
  stats.sgTeePerRound = safeAverage(sgTee, rounds.length);
  stats.sgApproachPerRound = safeAverage(sgApproach, rounds.length);
  stats.sgAroundGreenPerRound = safeAverage(sgAroundGreen, rounds.length);
  stats.sgPuttingPerRound = safeAverage(sgPutting, rounds.length);
  stats.sgTotalPerRound = safeAverage(sgTotal, rounds.length);

  // Approach proximity
  stats.approachProximityAvg = safeAverage(
    approachProximities.reduce((a, b) => a + b, 0),
    approachProximities.length
  );
  stats.approachProximityPar3 = safeAverage(
    approachProxPar3.reduce((a, b) => a + b, 0),
    approachProxPar3.length
  );
  stats.approachProximityPar4 = safeAverage(
    approachProxPar4.reduce((a, b) => a + b, 0),
    approachProxPar4.length
  );
  stats.approachProximityPar5 = safeAverage(
    approachProxPar5.reduce((a, b) => a + b, 0),
    approachProxPar5.length
  );
  stats.approachProximityFairway = safeAverage(
    approachProxFairway.reduce((a, b) => a + b, 0),
    approachProxFairway.length
  );
  stats.approachProximityRough = safeAverage(
    approachProxRough.reduce((a, b) => a + b, 0),
    approachProxRough.length
  );
  stats.approachProximitySand = safeAverage(
    approachProxSand.reduce((a, b) => a + b, 0),
    approachProxSand.length
  );

  // Approach proximity by distance
  stats.approachProx30_75 = safeAverage(
    (approachProxByDistance['30_75'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['30_75'] || []).length
  );
  stats.approachProx75_100 = safeAverage(
    (approachProxByDistance['75_100'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['75_100'] || []).length
  );
  stats.approachProx100_125 = safeAverage(
    (approachProxByDistance['100_125'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['100_125'] || []).length
  );
  stats.approachProx125_150 = safeAverage(
    (approachProxByDistance['125_150'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['125_150'] || []).length
  );
  stats.approachProx150_175 = safeAverage(
    (approachProxByDistance['150_175'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['150_175'] || []).length
  );
  stats.approachProx175_200 = safeAverage(
    (approachProxByDistance['175_200'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['175_200'] || []).length
  );
  stats.approachProx200_225 = safeAverage(
    (approachProxByDistance['200_225'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['200_225'] || []).length
  );
  stats.approachProx225Plus = safeAverage(
    (approachProxByDistance['225_plus'] || []).reduce((a, b) => a + b, 0),
    (approachProxByDistance['225_plus'] || []).length
  );

  // Approach efficiency by distance and lie
  for (const bucket of Object.keys(approachEffByDistanceLie)) {
    const bucketKey = bucket.replace('_', '') as keyof GolfStats;
    if (bucketKey.toString().startsWith('approachEff')) {
      const lies = approachEffByDistanceLie[bucket];
      if (lies) {
        const effData = {
          fairway: safeAverage(
            (lies.fairway || []).reduce((a, b) => a + b, 0),
            (lies.fairway || []).length
          ),
          rough: safeAverage(
            (lies.rough || []).reduce((a, b) => a + b, 0),
            (lies.rough || []).length
          ),
          sand: safeAverage(
            (lies.sand || []).reduce((a, b) => a + b, 0),
            (lies.sand || []).length
          ),
        };
        // Type-safe dynamic assignment
        const statsRecord = stats as unknown as Record<string, unknown>;
        statsRecord[bucketKey] = effData;
      }
    }
  }

  // Scrambling
  stats.scramblingPercentage = safePercent(stats.scramblesMade, stats.scrambleAttempts);
  stats.scramblingPctFairway = safePercent(scrambleFairway.made, scrambleFairway.total);
  stats.scramblingPctRough = safePercent(scrambleRough.made, scrambleRough.total);
  stats.scramblingPctSand = safePercent(scrambleSand.made, scrambleSand.total);
  stats.scramblingPct0_10 = safePercent(scramble0_10.made, scramble0_10.total);
  stats.scramblingPct10_20 = safePercent(scramble10_20.made, scramble10_20.total);
  stats.scramblingPct20_30 = safePercent(scramble20_30.made, scramble20_30.total);

  // Around the green
  const allAtgStrokes = [...atgEff0_10, ...atgEff10_20, ...atgEff20_30];
  stats.atgEfficiencyAvg = safeAverage(
    allAtgStrokes.reduce((a, b) => a + b, 0),
    allAtgStrokes.length
  );
  stats.atgEfficiency0_10 = safeAverage(
    atgEff0_10.reduce((a, b) => a + b, 0),
    atgEff0_10.length
  );
  stats.atgEfficiency10_20 = safeAverage(
    atgEff10_20.reduce((a, b) => a + b, 0),
    atgEff10_20.length
  );
  stats.atgEfficiency20_30 = safeAverage(
    atgEff20_30.reduce((a, b) => a + b, 0),
    atgEff20_30.length
  );
  stats.atgEffFairway = safeAverage(
    atgEffFairway.reduce((a, b) => a + b, 0),
    atgEffFairway.length
  );
  stats.atgEffRough = safeAverage(
    atgEffRough.reduce((a, b) => a + b, 0),
    atgEffRough.length
  );
  stats.atgEffSand = safeAverage(
    atgEffSand.reduce((a, b) => a + b, 0),
    atgEffSand.length
  );

  // ATG by distance and lie
  for (const bucket of Object.keys(atgEffByDistanceLie)) {
    const lies = atgEffByDistanceLie[bucket];
    if (lies) {
      stats.atgEffByDistanceLie[bucket] = {
        fairway: safeAverage(
          (lies.fairway || []).reduce((a, b) => a + b, 0),
          (lies.fairway || []).length
        ),
        rough: safeAverage(
          (lies.rough || []).reduce((a, b) => a + b, 0),
          (lies.rough || []).length
        ),
        sand: safeAverage(
          (lies.sand || []).reduce((a, b) => a + b, 0),
          (lies.sand || []).length
        ),
      };
    }
  }

  // Sand saves
  stats.sandSavePercentage = safePercent(stats.sandSavesMade, stats.sandSaveAttempts);

  // Penalties
  stats.penaltiesPerRound = safeAverage(stats.totalPenalties, rounds.length);

  return stats;
}

// ============================================================================
// FORMAT HELPERS (for display)
// ============================================================================

export function formatStat(value: number | null, suffix: string = '', decimals: number = 1): string {
  if (value === null || value === undefined) return '--';
  return value.toFixed(decimals) + suffix;
}

export function formatStatInt(value: number | null): string {
  if (value === null || value === undefined) return '--';
  return Math.round(value).toString();
}
