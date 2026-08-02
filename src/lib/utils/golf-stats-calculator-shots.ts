/**
 * Golf Stats Calculator - Shot-Based (Pure)
 *
 * Calculates ALL stats from raw shot data ONLY.
 * The golf_shots table is the single source of truth.
 *
 * This replaces the hole-based calculator (golf-stats-calculator.ts)
 * with a pure shot-based approach that derives everything from individual shots.
 */

import { calculatePuttsPerRound } from '@/lib/golf/putts-per-round';
import { isPlausibleApproach } from '@/lib/golf/approach-plausibility';

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
  putt_made?: boolean | null;
  is_penalty?: boolean | null;
  penalty_type?: string | null;
  // Extended detail fields from putt_details table
  putt_miss_tags?: string[] | null;
  putt_break_direction?: string | null;
  putt_estimated_break_inches?: number | null;
  // Extended detail fields from approach_miss_details table
  approach_miss_direction?: string | null;
  approach_miss_lie_type?: string | null;
  approach_miss_distance_from_green?: number | null;
}

export interface HoleInfo {
  id?: string;
  round_id: string;
  hole_number: number;
  par: number;
  yardage: number | null;
  score?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  gir?: boolean | null;
  sand_save?: boolean | null; // canonical greenside-bunker up-and-down flag (golf_holes.sand_save)
}

export interface RoundInfo {
  id: string;
  round_date: string;
  course_name: string | null;
  round_type: 'practice' | 'qualifier' | 'qualifying' | 'tournament' | null;
  course_par?: number | null;
  holes_played?: number | null;
}

// ============================================================================
// TYPES - Calculated Stats Output
// ============================================================================

/** Scoring outcome counts for the holes of one par type (3 / 4 / 5). */
export interface ParScoreDistribution {
  eagle: number; // score-to-par <= -2 (eagle or better)
  birdie: number; // -1
  par: number; // 0
  bogey: number; // +1
  doublePlus: number; // >= +2
  total: number; // holes of this par played
  avgToPar: number | null; // mean (score - par), null when no holes
}

export interface GolfStats {
  // General
  roundsPlayed: number;
  holesPlayed: number;

  // Scoring
  scoringAverage: number | null;
  avgScoreToPar: number | null;
  bestRound: number | null;
  worstRound: number | null;

  // Scoring by format (9 vs 18 holes)
  scoringAverage18: number | null;
  scoringAverage9: number | null;
  bestRound18: number | null;
  bestRound9: number | null;
  worstRound18: number | null;
  worstRound9: number | null;
  roundsPlayed18: number;
  roundsPlayed9: number;

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

  /** Scoring distribution split by hole par (3 / 4 / 5). */
  scoringByPar: {
    par3: ParScoreDistribution;
    par4: ParScoreDistribution;
    par5: ParScoreDistribution;
  };

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
  // ADDITIVE (Fairway redesign Phase A): avg tee-shot distance (yards) for holes where
  // a non-driver was used off the tee (usedDriver === false). null when no such holes.
  drivingDistanceNonDriverOnly: number | null;
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
  // ADDITIVE (Fairway redesign Phase A): tee-miss left/right tendency split by club class
  // off the tee. Same idea as overall missLeft/RightPct (% of that class's L/R misses)
  // but keyed on usedDriver. Denominator = (left+right) misses for that class on par 4/5.
  // null when that club class has no L/R misses recorded.
  missLeftPctDriver: number | null;
  missRightPctDriver: number | null;
  missLeftPctNonDriver: number | null;
  missRightPctNonDriver: number | null;

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
  girCountFromFairway: number;
  girCountFromRough: number;

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
  // ADDITIVE (Fairway redesign Phase A): the overall approachMiss*Pct above are
  // aggregated across ALL distances. This bucket the SAME approach-miss-direction data
  // by approach distance band (keyed by getApproachDistanceBucket: '30_75','75_100',
  // '100_125','125_150','150_175','175_200','200_225','225_plus'). For each band, the %
  // distribution of missed-green approaches by direction. Compound misses count toward
  // both axes (e.g. short_left → short and left), matching the overall aggregate's logic.
  // Bands with no missed approaches are omitted. Each component is null when no misses
  // landed in that band (record key absent rather than a zeroed entry). `total` is the
  // real count of missed approaches this band's percentages are computed over — the
  // sample size a consumer needs to render an honest "n=" annotation (mirrors the
  // Putting tab's heatmap, which annotates every cell with its own n).
  approachMissByBand: Record<string, { short: number | null; long: number | null; left: number | null; right: number | null; total: number }>;

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

  // Putting sample counts (number of first putts in each distance bucket)
  puttMakeCount0_3: number;
  puttMakeCount3_5: number;
  puttMakeCount5_10: number;
  puttMakeCount10_15: number;
  puttMakeCount15_20: number;

  // --- ADDITIVE (Fairway redesign Phase A) ---
  // Putting approach distance: how far away first putts are, on average (in FEET,
  // matching per-hole `firstPuttDistance` which is normalized to feet). null when
  // no holes have a first-putt distance recorded.
  firstPuttDistanceAvg: number | null;
  // Putting approach distance — COUNT DISTRIBUTION by distance band: for each band
  // (keyed by getPuttDistanceBucket: '0_3','3_5','5_10','10_15','15_20','20_25',
  // '25_30','30_35','35_plus'), the % of all first putts whose approach distance fell
  // in that band. Bands with no first putts are omitted from the record. null overall
  // when there are no first putts. This describes where a player tends to leave their
  // first putt FROM (their lag/approach proximity to the green), not make rate.
  firstPuttDistanceByBand: Record<string, number | null>;

  // --- APPROACH PUTTING (average distance left after EVERY putt, 0 for makes) ---
  // Overall average leave distance across all putts with a known outcome.
  // A holed putt contributes 0. A missed putt with distance_to_hole_after null
  // is excluded (null-honest, never fabricated). Keyed by getPuttDistanceBucket
  // of the putt's starting distance.
  approachPuttAvgLeave: number | null;
  // Per-starting-distance-band average leave. Keys match PUTT_BAND_LABELS:
  // '0_3','3_5','5_10','10_15','15_20','20_25','25_30','30_35','35_plus'.
  // A band with no qualifying putts is omitted from the record entirely (so a
  // present key always has count >= 1 → safeAverage returns a real number, never
  // null). Consumers must treat a missing key (undefined) as "no data".
  approachPuttAvgLeaveByBand: Record<string, number>;

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
  // Partner definition (feedback verbatim): "track total proximity to the
  // hole which would [be] shots that hit the green and miss the green on
  // the shot that is the GIR [approach] shot. Then have card for only when
  // it hits and a card for when it misses." All three are the SAME canonical
  // unit (feet) so they're directly comparable on one card row.
  approachProximityAvg: number | null;  // UNION — every logged approach finish, hit + miss
  approachProximityWhenHitGreen: number | null;  // Hit-only subset of the union above
  approachProximityWhenMissedGreen: number | null;  // Miss-only subset of the union above

  // Finer-grained proximity cuts (by par / lie / distance) intentionally stay
  // GREEN-HIT ONLY, matching their conventional "how close did you leave it
  // when you found the green" meaning — NOT the partner's total union above.
  approachProximityPar3: number | null;
  approachProximityPar4: number | null;
  approachProximityPar5: number | null;
  approachProximityFairway: number | null;
  approachProximityRough: number | null;
  approachProximitySand: number | null;

  // Approach proximity by distance — GREEN-HIT ONLY (see note above)
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

  // --- SHORT GAME "MISSES" TAB (additive) ---
  // Everything below is derived PURELY from raw shot rows already flowing
  // through this file (lie_before, miss_direction, distance_to_hole_after)
  // — no new DB reads. True pin-relative "short-siding" (how much green a
  // player has to work with) needs pin-position data we don't capture, so
  // it is NOT approximated here — only what's actually derivable is exposed.

  /**
   * Scrambling (up-and-down) conversion split by the ORIGINATING miss
   * direction of the approach shot that missed the green — the same
   * `hole.approachMissDirection` field `approachMissByBand` above buckets,
   * scoped to actual scramble attempts. Answers "does missing short / long /
   * left / right change the up-and-down rate, and how often does each
   * happen". Compound directions (e.g. `short_left`) count toward BOTH
   * axes — same convention as `approachMissShortPct`/`approachMissLeftPct`
   * etc. A direction with zero attempts is OMITTED (key absent), never a
   * zeroed placeholder.
   */
  scramblingByMissDirection: Partial<Record<'short' | 'long' | 'left' | 'right', {
    attempts: number;
    made: number;
    /** Up-and-down % FROM this miss direction. */
    pct: number | null;
    /** % of all direction-tagged scramble attempts that missed this way.
     *  Can sum to more than 100% across the 4 keys for the same reason
     *  approachMissShortPct/approachMissLeftPct etc. can — compound misses
     *  count on two axes. */
    shareOfMisses: number | null;
  }>>;
  /** Scramble attempts with a KNOWN originating miss direction — the `shareOfMisses` denominator. */
  scramblingMissDirectionTotal: number;

  // Up-and-down conversion + sample counts by chip/pitch lie. Fairway/Rough/
  // Sand mirror `scramblingPctFairway/Rough/Sand` above (counts weren't
  // previously exposed at top level); Fringe is new — a chip from the
  // fringe/collar is a materially different shot than one from rough, and
  // the fairway/rough/sand trio above doesn't cover it.
  scrambleFairwayAttempts: number;
  scrambleFairwayMade: number;
  scrambleRoughAttempts: number;
  scrambleRoughMade: number;
  scrambleSandAttempts: number;
  scrambleSandMade: number;
  scramblingPctFringe: number | null;
  scrambleFringeAttempts: number;
  scrambleFringeMade: number;

  /**
   * Average distance LEFT after a chip/pitch (around-the-green shot) that
   * actually found the green, in FEET — the "how close do you leave it"
   * complement to up-and-down %. ON-GREEN ONLY, mirroring
   * `approachProximity`'s rule above: a chip that didn't reach the green
   * doesn't produce a comparable proximity figure. A holed chip contributes
   * 0. null when no around-green shot reached the green with a known leave.
   */
  atgProximityAvg: number | null;
  atgProximityByLie: { fairway: number | null; rough: number | null; sand: number | null };

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

  // Truncation signal — set to `true` by `getDetailedStats` when the
  // non-preset query window was capped at DETAILED_STATS_MAX_ROUNDS rounds
  // (i.e. there are more completed rounds than fit in the bounded IN-list).
  // The UI surfaces a banner so prolific players (4-year college players
  // with 80–150+ rounds) know to apply a date/season filter to see older
  // data. Always `false` when an explicit preset (last5/10/20) is in use,
  // because that's a user-driven cap, not a silent one.
  truncated?: boolean;
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

  // Sample counts by distance (attempts feeding each makePct band above — the
  // n= the RampMatrix cell badges read so a 1-of-1 "0%" cell doesn't look as
  // trustworthy as a 40-of-50 one).
  count0_3: number;
  count3_5: number;
  count5_10: number;
  count10_15: number;
  count15_20: number;
  count20_25: number;
  count25_30: number;
  count30_35: number;
  count35Plus: number;

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

/** @internal - exported for testing */
export function normalizeToYards(distance: number | null | undefined, unit: string | null | undefined): number {
  if (distance == null) return 0;
  return unit === 'feet' ? distance / 3 : distance;
}

/** @internal - exported for testing */
export function normalizeToFeet(distance: number | null | undefined, unit: string | null | undefined): number {
  if (distance == null) return 0;
  return unit === 'yards' ? distance * 3 : distance;
}

/**
 * Longest realistic putt, in feet. Anything beyond this is a unit/entry error
 * (e.g. a putt distance recorded in yards then ×3'd to a 390-foot "putt").
 */
/** @internal - exported for testing */
export const MAX_PUTT_FEET = 120;

/**
 * Putt distances are ALWAYS feet, regardless of the stored `distance_unit`.
 *
 * SG-2: putts mis-stored with `distance_unit === 'yards'` were being ×3'd by
 * `normalizeToFeet`, producing impossible 390-foot putts. A putt is on the
 * green by definition, so the raw value is the distance in feet — never convert
 * it. We additionally clamp to {@link MAX_PUTT_FEET} so a stray yards-as-feet
 * tail (or a fat-fingered entry) can't poison putting SG.
 */
/** @internal - exported for testing */
export function normalizePuttFeet(distance: number | null | undefined): number {
  if (distance == null) return 0;
  return Math.min(Math.max(distance, 0), MAX_PUTT_FEET);
}

/** @internal - exported for testing */
export function normalizeShotType(shotType: string | null | undefined): string | null {
  if (!shotType) return null;
  const lower = shotType.toLowerCase();
  if (lower === 'putt') return 'putting';
  if (lower === 'drive') return 'tee';
  if (lower === 'chip' || lower === 'pitch') return 'around_green';
  if (lower === 'iron') return 'approach';
  return lower;
}

/**
 * Check if a shot result indicates the ball reached the green
 * Handles multiple possible result values: 'green', 'gir', 'hole' (for hole-outs)
 */
/** @internal - exported for testing */
export function isGreenHit(result: string | null | undefined): boolean {
  if (!result) return false;
  const normalized = result.toLowerCase();
  return normalized === 'green' || normalized === 'gir' || normalized === 'hole';
}

/** @internal - exported for testing */
export function normalizeRoundType(
  roundType: RoundInfo['round_type']
): 'practice' | 'qualifier' | 'tournament' | null {
  if (roundType === 'qualifying') return 'qualifier';
  return roundType;
}

/** @internal - exported for testing */
export function safePercent(made: number, attempts: number): number | null {
  if (attempts === 0) return null;
  return Math.round((made / attempts) * 1000) / 10;
}

/** @internal - exported for testing */
export function safeAverage(total: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round((total / count) * 100) / 100;
}

/** @internal - exported for testing */
export function getPuttDistanceBucket(distance: number): string {
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

/** @internal - exported for testing */
export function getApproachDistanceBucket(distance: number): string {
  // Approach shots are from >= AROUND_GREEN_THRESHOLD_YARDS (distance to hole)
  // Shots closer than this are "around the green" and tracked separately
  if (distance < AROUND_GREEN_THRESHOLD_YARDS) return '';
  if (distance <= 75) return '30_75';
  if (distance <= 100) return '75_100';
  if (distance <= 125) return '100_125';
  if (distance <= 150) return '125_150';
  if (distance <= 175) return '150_175';
  if (distance <= 200) return '175_200';
  if (distance <= 225) return '200_225';
  return '225_plus';
}

/** @internal - exported for testing */
export function getAtgDistanceBucket(distance: number): string {
  // Buckets for around-the-green shots (up to AROUND_GREEN_THRESHOLD_YARDS from hole)
  // The '20_plus' bucket captures 20 yards through the threshold
  if (distance <= 10) return '0_10';
  if (distance <= 20) return '10_20';
  return '20_30';  // Note: despite the name, this bucket captures 20+ yards up to the threshold
}

// ============================================================================
// STROKES GAINED - CONFIGURATION
// ============================================================================

/**
 * Around-the-green distance threshold (in yards from the HOLE).
 *
 * PGA Tour methodology uses ~30 yards from the GREEN EDGE as the boundary
 * between "approach" and "around the green" shots. Since our app measures
 * distance to the HOLE (flag) — which is what amateur golfers typically
 * record — we use a larger threshold to approximate the same boundary.
 *
 * Average green depth is ~30 yards, so:
 *   50 yards from hole ≈ 20-30 yards from green edge
 *
 * This is a best-effort approximation. True green-edge measurement would
 * require pin position and green depth data per hole.
 */
/** @internal - exported for testing */
export const AROUND_GREEN_THRESHOLD_YARDS = 50;

// ============================================================================
// STROKES GAINED - PGA TOUR BENCHMARKS
// ============================================================================

// PGA Tour benchmark data - average strokes to hole out from each position
// Source: PGA Tour Strokes Gained methodology

// Broadie "Every Shot Counts" / ShotLink expected-strokes anchors. MUST stay
// identical to the DB function public.sg_expected_strokes() and PGA_BASELINE_DATA
// in src/lib/golf/strokes-gained.ts (recalibrated 2026-06-06, migration
// 20260606140000) so the shot-derived player-page SG matches the DB/cache SG.
// interpolateBenchmark() interpolates linearly between anchors and clamps outside
// the range — so anchors-only is exact at the published points and continuous
// between, with no nearest-neighbour seam (the DC-SG-1/DC-SG-3 fixes).
const STROKES_GAINED_BENCHMARKS = {
  // From tee (yards) — par-3/short tee shots (80yd) through long par-5s (600yd).
  tee: {
    600: 4.85, 540: 4.65, 400: 3.99, 300: 3.71, 240: 3.25,
    200: 3.12, 150: 2.95, 120: 2.88, 100: 2.82, 80: 2.78,
  },

  // From fairway (yards)
  fairway: {
    540: 4.78, 400: 4.11, 300: 3.78, 240: 3.45, 200: 3.19,
    180: 3.08, 140: 2.91, 100: 2.80, 80: 2.75, 20: 2.40,
  },

  // From rough (yards)
  rough: {
    540: 4.97, 400: 4.30, 300: 3.90, 240: 3.64, 200: 3.42,
    100: 3.02, 20: 2.59,
  },

  // From sand (yards)
  sand: {
    540: 5.36, 400: 4.69, 300: 4.04, 240: 3.84, 200: 3.55,
    100: 3.23, 20: 2.53,
  },

  // From green (putting, by distance in FEET) — Broadie Tour expected putts.
  green: {
    1: 1.00, 2: 1.00, 3: 1.04, 4: 1.13, 5: 1.23,
    6: 1.34, 7: 1.42, 8: 1.50, 9: 1.56, 10: 1.61,
    15: 1.78, 20: 1.87, 30: 1.98, 40: 2.06, 50: 2.14,
    60: 2.21, 90: 2.40,
  },

};

/**
 * Look up an expected-strokes value from a {distance: strokes} benchmark table
 * using LINEAR INTERPOLATION between the two bracketing anchors.
 *
 * DC-SG-1/DC-SG-3: the previous nearest-neighbour lookup snapped a query to the
 * single closest anchor, so e.g. a 13ft putt jumped to the 15ft value and the
 * whole curve was a staircase. Interpolating between bracketing anchors makes the
 * curve continuous and distance-sensitive. Queries below the first / above the
 * last anchor clamp to that anchor (no extrapolation).
 */
function interpolateBenchmark(table: Record<number, number>, distance: number): number {
  const distances = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (distances.length === 0) return 0;

  const first = distances[0]!;
  const last = distances[distances.length - 1]!;

  // Clamp outside the table range (avoid extrapolating past calibrated anchors).
  if (distance <= first) return table[first]!;
  if (distance >= last) return table[last]!;

  // Find the bracketing anchors and interpolate.
  for (let i = 0; i < distances.length - 1; i++) {
    const lo = distances[i]!;
    const hi = distances[i + 1]!;
    if (distance >= lo && distance <= hi) {
      const t = (distance - lo) / (hi - lo);
      return table[lo]! + t * (table[hi]! - table[lo]!);
    }
  }
  // Unreachable (clamped above), but keep TS exhaustive.
  return table[last]!;
}

// Helper to get expected strokes from position
/** @internal - exported for testing */
export function getExpectedStrokes(lie: string | null, distanceYards: number, distanceFeet?: number, scale = 1): number {
  if (!lie) return 0;
  if (lie === 'green' && distanceFeet !== undefined) {
    // Putting — distance is feet, never converted (see normalizePuttFeet), and
    // interpolated across the green make-rate curve.
    return interpolateBenchmark(STROKES_GAINED_BENCHMARKS.green, distanceFeet) * scale;
  }

  // DC-SG-3: tee shots use a single continuous tee curve (100-600yd). The old
  // <400yd → fairway re-route created a discontinuity at the 400yd handoff; the
  // tee table now covers the short distances directly.
  let benchmarkTable = STROKES_GAINED_BENCHMARKS[lie as keyof typeof STROKES_GAINED_BENCHMARKS] as
    | Record<number, number>
    | undefined;

  // SG-1: unmapped / non-tabulated lies ('other', 'recovery', 'water', and any
  // unrecognised value) previously collapsed to a flat 3.50 with ZERO distance
  // sensitivity — fabricating ±1-stroke SG that flipped sign with distance.
  // Route them to the FAIRWAY table: it keeps the estimate distance-sensitive
  // AND matches the canonical DB sg_expected_strokes() ELSE branch (which uses
  // the fairway curve for unknown lies), so the TS recompute agrees with the
  // cache SG instead of diverging for malformed lies.
  if (!benchmarkTable || typeof benchmarkTable !== 'object') {
    benchmarkTable = STROKES_GAINED_BENCHMARKS.fairway;
  }

  // Per-team SG baseline scale (women's 1.083, NCAA D1/D2/D3, etc.) multiplies the
  // expected-strokes curve, mirroring the DB sg_expected_strokes(...,p_scale)
  // (RETURN v_es * COALESCE(p_scale,1.0)). The -1 stroke charged per shot stays
  // UNSCALED (applied by the caller), so SG = scale·E_before − 1 − scale·E_after.
  return interpolateBenchmark(benchmarkTable, distanceYards) * scale;
}

// Calculate Strokes Gained for a shot
// Returns null when data is incomplete (cannot calculate accurately)
/** @internal - exported for testing */
export function calculateStrokesGainedForShot(shot: RawShot, scale = 1): number | null {
  // Strokes Gained = Expected strokes BEFORE - (1 + Expected strokes AFTER)

  // CRITICAL: Cannot calculate SG without lie_before and distance_to_hole_before
  // Return null to indicate incomplete data (not 0, which would skew averages)
  if (!shot.lie_before || shot.distance_to_hole_before == null) {
    return null;
  }

  const lieBefore = shot.lie_before;
  const distBefore = normalizeToYards(shot.distance_to_hole_before, shot.distance_unit_before);
  // SG-2: when the ball is on the green the distance is a PUTT — always feet,
  // never unit-converted, and clamped (a yards-as-feet tail would ×3 into a
  // 390-foot "putt"). Only consumed by the green branch below.
  const distBeforeFeet = normalizePuttFeet(shot.distance_to_hole_before);

  // Use lie_after if available, otherwise derive from result
  // Result values like 'fairway', 'rough', 'sand', 'green', 'hole' map to lie types
  const lieAfter = shot.lie_after || (isGreenHit(shot.result) ? 'green' : shot.result);

  // Get expected strokes before
  const expectedBefore = lieBefore === 'green'
    ? getExpectedStrokes('green', 0, distBeforeFeet, scale)
    : getExpectedStrokes(lieBefore, distBefore, undefined, scale);

  // Get expected strokes after (0 if holed)
  let expectedAfter = 0;
  if (shot.result !== 'hole') {
    // SG-2: a putt's remaining distance is a PUTT — feet, never converted, clamped.
    // (An approach that lands on the green keeps unit-aware conversion: its
    // proximity is legitimately recorded in feet OR yards.)
    const isPutt = lieBefore === 'green';
    let distAfterYards = shot.distance_to_hole_after != null
      ? normalizeToYards(shot.distance_to_hole_after, shot.distance_unit_after)
      : null;
    let distAfterFeet = shot.distance_to_hole_after != null
      ? (isPutt
          ? normalizePuttFeet(shot.distance_to_hole_after)
          : normalizeToFeet(shot.distance_to_hole_after, shot.distance_unit_after))
      : null;

    // Fallback estimation when distance_to_hole_after is missing
    if (distAfterYards === null) {
      const shotType = normalizeShotType(shot.shot_type);
      if (shotType === 'putting') {
        // Average recreational putt miss: ~3 feet
        distAfterFeet = 3;
        distAfterYards = 1;
      } else if (isGreenHit(shot.result)) {
        // Hit the green but no after-distance: estimate ~20 feet (average proximity)
        distAfterFeet = 20;
        distAfterYards = 7;
      } else {
        // Non-green result without after-distance: can't estimate reliably
        return null;
      }
    }

    expectedAfter = lieAfter === 'green'
      ? getExpectedStrokes('green', 0, distAfterFeet!, scale)
      : getExpectedStrokes(lieAfter!, distAfterYards!, undefined, scale);
  }

  // Strokes Gained = what was expected - what it cost (1 stroke + remaining expected)
  return expectedBefore - (1 + expectedAfter);
}

// Categorize SG by shot type
/** @internal - exported for testing */
export function getStrokesGainedCategory(shot: RawShot, par: number): 'tee' | 'approach' | 'around_green' | 'putting' {
  const shotType = normalizeShotType(shot.shot_type);
  if (shotType === 'putting') return 'putting';
  if (shotType === 'tee') return par === 3 ? 'approach' : 'tee';
  if (shotType === 'around_green') return 'around_green';
  return 'approach';
}

/**
 * SG-4: attribute a penalty stroke to the OFFENDING category.
 *
 * A penalty shot has `shot_type === 'penalty'` and carries no real lie/result of
 * its own, so it can't be categorised by `getStrokesGainedCategory`. The stroke
 * that actually went wrong was hit from the penalty shot's `lie_before` /
 * distance-to-hole — so we categorise by that position:
 *   - on the tee (and not a par 3) → tee
 *   - on/around the green          → around_green
 *   - otherwise (in play)          → approach (long game)
 *
 * Returns 'approach' as the conservative default when position is unknown.
 */
/** @internal - exported for testing */
export function getPenaltyCategory(shot: RawShot, par: number): 'tee' | 'approach' | 'around_green' {
  if (shot.lie_before === 'tee') return par === 3 ? 'approach' : 'tee';
  if (shot.lie_before === 'green') return 'around_green';
  if (shot.distance_to_hole_before != null) {
    const distYards = normalizeToYards(shot.distance_to_hole_before, shot.distance_unit_before);
    if (distYards <= AROUND_GREEN_THRESHOLD_YARDS) return 'around_green';
  }
  return 'approach';
}

// ============================================================================
// SHOT-BASED HOLE CALCULATOR
// ============================================================================

interface CalculatedHoleStats {
  holeNumber: number;
  par: number;
  // Null-honest: null means "hole row exists but no score/putts were recorded"
  // (shotless hole with NULL golf_holes.score/putts). Aggregation null-skips
  // these holes — they must never contribute fabricated values.
  score: number | null;
  putts: number | null;
  fairwayHit: boolean | null;
  usedDriver: boolean | null;
  drivingDistance: number | null;
  driveMissDirection: string | null;
  greenInRegulation: boolean;
  approachShotNumber: number | null; // Shot number of the approach attempt
  approachDistance: number | null;
  approachLie: string | null;
  approachRawLie: string | null; // un-remapped lie (tee NOT folded into fairway) — GIR-by-lie split
  approachProximity: number | null; // GREEN-HIT ONLY, feet
  /**
   * Miss twin of `approachProximity`: the GIR-attempt approach's finish
   * distance in FEET when it did NOT find the green. Mutually exclusive with
   * `approachProximity` — exactly one of the two is non-null whenever an
   * approach shot with a logged finish distance exists. See the write-up on
   * `approachProximity` below for why converting the off-green (yards-tagged)
   * finish via `normalizeToFeet` is honest here, not the ×3 inflation bug.
   */
  approachProximityMiss: number | null;
  approachMissDirection: string | null; // Where approach missed when not GIR
  chipLie: string | null;      // Lie of the chip/pitch shot (for scrambling stats)
  chipDistance: number | null; // Distance of the chip/pitch shot (for scrambling by distance)
  firstPuttDistance: number | null;
  // All-putt make% by distance band: EVERY putt on the hole, made = holed.
  // The conventional PGA "putts made from distance" (matches golf_pga_standards
  // + the cache writer update_player_putt_make_pct), not first-putt-only.
  puttMakeByBand: Record<string, { made: number; total: number }>;
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

function createHoleStatsFromKnownHole(hole: HoleInfo): CalculatedHoleStats {
  // Null-honest: a shotless hole contributes ONLY what golf_holes actually
  // recorded. Fabricating score=par / putts=2 silently dragged scoring
  // averages toward even par and putting stats toward 2.0/hole. A null
  // score/putts means "no data" and is null-skipped at every aggregation
  // point (totals, averages, streaks).
  const score = hole.score ?? null;
  const putts = hole.putts ?? null;
  const greenInRegulation = hole.gir ?? false;
  const fairwayHit = hole.par < 4 ? null : (hole.fairway_hit ?? null);

  return {
    holeNumber: hole.hole_number,
    par: hole.par,
    score,
    putts,
    fairwayHit,
    usedDriver: null,
    drivingDistance: null,
    driveMissDirection: null,
    greenInRegulation,
    approachShotNumber: null,
    approachDistance: null,
    approachLie: null,
    approachRawLie: null,
    approachProximity: null,
    approachProximityMiss: null,
    approachMissDirection: null,
    chipLie: null,
    chipDistance: null,
    firstPuttDistance: null,
    puttMakeByBand: {},
    firstPuttLeave: null,
    firstPuttBreak: null,
    firstPuttSlope: null,
    // Canonical scramble definition (DB cache trigger): attempt = gir=false
    // AND score IS NOT NULL. A missed green with no recorded score is NOT a
    // scramble attempt — we cannot know whether it converted.
    scrambleAttempt: !greenInRegulation && score !== null,
    scrambleMade: !greenInRegulation && score !== null && score <= hole.par,
    sandSaveAttempt: false,
    sandSaveMade: false,
    penalties: 0,
    threePutts: putts !== null && putts >= 3,
    shots: [],
  };
}

/**
 * Calculate hole statistics from raw shots
 * This is where all hole-level stats are DERIVED from individual shots
 */
/** @internal - exported for testing */
export function calculateHoleStatsFromShots(
  shots: RawShot[],
  holeInfoOrPar: number | Pick<HoleInfo, 'hole_number' | 'par' | 'score' | 'putts' | 'fairway_hit' | 'gir' | 'sand_save'>
): CalculatedHoleStats {
  // Sort shots by shot number
  const sortedShots = [...shots].sort((a, b) => a.shot_number - b.shot_number);
  const normalizedShots = sortedShots.map((shot) => ({
    ...shot,
    shot_type: normalizeShotType(shot.shot_type),
  }));
  const holeInfo = typeof holeInfoOrPar === 'number'
    ? {
        hole_number: normalizedShots[0]?.hole_number ?? 0,
        par: holeInfoOrPar,
        score: null,
        putts: null,
        fairway_hit: null,
        gir: null,
        // sand_save intentionally left undefined → shot-derived fallback below
      }
    : holeInfoOrPar;

  // Score = number of shots
  const score = holeInfo.score ?? normalizedShots.length;

  // Putts = shots where shot_type is 'putting'
  const puttingShots = normalizedShots.filter(s => s.shot_type === 'putting');
  const putts = holeInfo.putts ?? puttingShots.length;

  // Tee shot analysis
  const teeShot = normalizedShots.find(s => s.shot_type === 'tee');
  const fairwayHit = holeInfo.par < 4
    ? null
    : (holeInfo.fairway_hit ?? (teeShot ? teeShot.result === 'fairway' : null));
  const usedDriver = teeShot ? teeShot.club_type === 'driver' : null;
  // shot_distance is already stored in yards, no conversion needed
  const drivingDistance = teeShot?.shot_distance ?? null;
  const driveMissDirection = teeShot && teeShot.result !== 'fairway'
    ? teeShot.miss_direction
    : null;

  // GIR = shot that lands on green has shot_number <= par - 2
  // Use isGreenHit to handle multiple result values: 'green', 'gir', 'hole'
  const shotToGreen = normalizedShots.find(s => isGreenHit(s.result));
  const derivedGir = shotToGreen
    ? shotToGreen.shot_number <= (holeInfo.par - 2)
    : false;
  const greenInRegulation = holeInfo.gir ?? derivedGir;

  // APPROACH SHOT IDENTIFICATION
  // The "approach shot" is the GIR attempt - the shot trying to reach the green in regulation:
  // - Par 3: Shot #1 (trying to hit green in 1)
  // - Par 4: Shot #2 (trying to hit green in 2)
  // - Par 5: Shot #2 or #3 depending on strategy
  //
  // For stats purposes, we use: shot_number === par - 2 (the regulation attempt)
  // If that shot doesn't exist, fall back to shotToGreen
  const girAttemptShotNumber = Math.max(holeInfo.par - 2, 1); // par 3 → shot 1, par 4 → shot 2, par 5 → shot 3

  // The ordinal is a HINT, not proof. It silently mis-selects whenever the
  // hole did not play to script:
  //   - a penalty off the tee shifts every later shot up one, so on a par 4
  //     shot #2 is the REPLAYED TEE SHOT, still 375y out. That was being
  //     recorded as a 375-yard approach from a "fairway" lie that missed short.
  //   - on a par 5 the shot at #3 may be a second layup, not a shot at the green.
  // Validate the candidate against the shared rule and fall through when it is
  // not actually an approach. (isPlausibleApproach needs yards; the shared
  // helper below normalizes whatever unit the row carries.)
  const asApproachCandidate = (s: (typeof normalizedShots)[number] | undefined) =>
    s
      ? {
          distanceToHoleBeforeYards:
            s.distance_to_hole_before !== null
              ? normalizeToYards(s.distance_to_hole_before, s.distance_unit_before)
              : null,
          distanceToHoleAfterYards:
            s.distance_to_hole_after !== null && !isGreenHit(s.result)
              ? normalizeToYards(s.distance_to_hole_after, s.distance_unit_after)
              : null,
          lieBefore: s.lie_before,
          par: holeInfo.par,
        }
      : null;

  // Find the GIR attempt shot (the approach)
  // Priority: 1) Shot at GIR attempt number, 2) Shot that landed on green (if earlier)
  const ordinalCandidate = normalizedShots.find(s => s.shot_number === girAttemptShotNumber);
  const ordinalCandidateArgs = asApproachCandidate(ordinalCandidate);
  let approachShot =
    ordinalCandidateArgs && isPlausibleApproach(ordinalCandidateArgs)
      ? ordinalCandidate
      : undefined;

  // If we hit green earlier (e.g., eagle attempt on par 5), use that shot instead
  if (shotToGreen && shotToGreen.shot_number < girAttemptShotNumber) {
    approachShot = shotToGreen;
  }

  // Fall back to shotToGreen if no approach shot found at expected position —
  // this is also the recovery path when the ordinal pick was rejected above:
  // the shot that actually reached the green is the honest approach.
  if (!approachShot && shotToGreen) {
    approachShot = shotToGreen;
  }

  // Approach distance - distance FROM which the approach was hit
  // Only set if we have actual distance data (null means "no data")
  const approachDistance = approachShot && approachShot.distance_to_hole_before !== null
    ? normalizeToYards(approachShot.distance_to_hole_before, approachShot.distance_unit_before)
    : null;

  // Approach lie - where the approach was hit FROM (fairway, rough, sand, etc.)
  // Normalize 'tee' lie (par 3 first shots) → treat as 'fairway' for stats
  const rawLie = approachShot ? approachShot.lie_before : null;
  const approachLie = rawLie === 'tee' ? 'fairway' : rawLie;

  // Approach proximity - how close to the hole the approach left the ball, in FEET.
  // Split into two mutually-exclusive per-hole fields:
  //   - `approachProximity`     : GREEN-HIT ONLY (feet finish, conventional meaning —
  //                                still what by-par/by-lie/by-distance aggregates use).
  //   - `approachProximityMiss` : OFF-GREEN ONLY — the partner-requested miss twin.
  // Partner feedback verbatim: "we need to track total proximity to the hole which
  // would [be] shots that hit the green and miss the green on the shot that is the
  // GIR [approach] shot. Then have card for only when it hits and a card for when
  // it misses." Both fields feed the headline "total" card as a union (see the
  // aggregation below), while the finer by-par/lie/distance cuts stay green-hit-only.
  //
  // UNIT HONESTY: an earlier author suspected converting the off-green finish (stored
  // in YARDS, distance_unit_after='yards') through normalizeToFeet (×3) was an
  // inflation bug, and hard-coded miss proximity to null. It is not — the live write
  // path (resolveDistanceAfterShot in FairwayShotTracking.tsx) deterministically tags
  // 'feet' only for a hole/green finish and 'yards' for every other result; verified
  // against production golf_shots (2026-07-21): ~99% of off-green approach finishes
  // carry the correct 'yards' tag with sane yardages (~25-65 yd avg, i.e. ~75-195 ft —
  // a believable miss distance, not a corrupted one). normalizeToFeet respects the
  // per-row unit tag, so a 25y miss legitimately converts to 75ft here — that is
  // correct, not inflated. (`approachShot` is already reassigned to an earlier
  // green-finding shot for par-5 eagle attempts above, so both fields stay correct there.)
  const approachHitGreen = approachShot ? isGreenHit(approachShot.result) : false;
  const approachFinishFeet = approachShot
    ? approachShot.result === 'hole'
      ? 0 // holed the approach — best possible proximity (0 ft), not "no data"
      : approachShot.distance_to_hole_after !== null
        ? normalizeToFeet(approachShot.distance_to_hole_after, approachShot.distance_unit_after)
        : null
    : null;
  const approachProximity = approachHitGreen ? approachFinishFeet : null;
  const approachProximityMiss = approachShot && !approachHitGreen ? approachFinishFeet : null;

  // Approach miss direction - when NOT GIR, get the miss direction from the approach shot
  // Use the identified approach shot (the GIR attempt), not searching for any missed shot
  const approachMissDirection = !greenInRegulation && approachShot && !isGreenHit(approachShot.result)
    ? approachShot.miss_direction ?? null
    : null;

  // First putt analysis - only set if we have actual distance data.
  // Putt distances are ALWAYS feet (a putt is on the green by definition), so
  // use normalizePuttFeet — treat the raw value as feet and clamp — NEVER
  // normalizeToFeet, which would ×3 a 'yards'-tagged putt into an impossible
  // distance. Both the start distance and the leave are on-green putts.
  const firstPutt = puttingShots[0];
  const firstPuttDistance = firstPutt && firstPutt.distance_to_hole_before !== null
    ? normalizePuttFeet(firstPutt.distance_to_hole_before)
    : null;
  const firstPuttLeave = firstPutt && firstPutt.result !== 'hole' && firstPutt.distance_to_hole_after !== null
    ? normalizePuttFeet(firstPutt.distance_to_hole_after)
    : null;
  const firstPuttBreak = firstPutt ? (firstPutt.putt_break ?? null) : null;
  const firstPuttSlope = firstPutt ? (firstPutt.putt_slope ?? null) : null;

  // All-putt make% by distance band: every putt on the hole, bucketed by ITS OWN
  // start distance, made = holed. This is the conventional PGA "make % from
  // distance" (matches golf_pga_standards + the cache writer), not first-putt
  // only — a 0-3ft tap-in is a real make from 0-3ft.
  const puttMakeByBand: Record<string, { made: number; total: number }> = {};
  for (const p of puttingShots) {
    if (p.distance_to_hole_before === null) continue;
    const band = getPuttDistanceBucket(normalizePuttFeet(p.distance_to_hole_before));
    if (!puttMakeByBand[band]) puttMakeByBand[band] = { made: 0, total: 0 };
    puttMakeByBand[band].total++;
    if (p.result === 'hole' || p.putt_made === true) puttMakeByBand[band].made++;
  }

  // Scrambling = missed GIR but made par or better
  const scrambleAttempt = !greenInRegulation;
  const scrambleMade = scrambleAttempt && (score <= holeInfo.par);

  // Find the around-green shot for scrambling stats
  // This is the shot that actually tries to get up-and-down (chip/pitch), not the approach
  // Detection: shot_type === 'around_green' OR (not on green, not putting, within threshold)
  // Note: threshold is measured from the HOLE, not green edge (see AROUND_GREEN_THRESHOLD_YARDS)
  const aroundGreenShot = normalizedShots.find(s => {
    // Explicit around_green type
    if (s.shot_type === 'around_green') return true;
    // Or: not on green, not a putt, not a tee shot, not a full approach, and
    // within the around-green threshold. Excluding shot_type === 'approach'
    // prevents a long approach hit from <=50yd (e.g. an approach-from-sand) from
    // being mislabeled as the greenside up-and-down shot, which would corrupt
    // the chip-lie / sand-save split.
    if (s.lie_before !== 'green' &&
        s.shot_type !== 'putting' &&
        s.shot_type !== 'tee' &&
        s.shot_type !== 'approach' &&
        !s.is_penalty &&
        s.distance_to_hole_before !== null) {
      const distYards = normalizeToYards(s.distance_to_hole_before, s.distance_unit_before);
      return distYards <= AROUND_GREEN_THRESHOLD_YARDS;
    }
    return false;
  });

  // Chip lie and distance - where the chip/pitch was hit FROM (for scrambling by lie/distance)
  const chipLie = aroundGreenShot?.lie_before ?? null;
  const chipDistance = aroundGreenShot && aroundGreenShot.distance_to_hole_before !== null
    ? normalizeToYards(aroundGreenShot.distance_to_hole_before, aroundGreenShot.distance_unit_before)
    : null;

  // Sand save = a greenside-bunker visit (around_green shot FROM sand), scored par or
  // better. The denominator is the bunker visit itself — do NOT also gate on
  // !greenInRegulation: a greenside-bunker visit is a sand-save opportunity even on a
  // (correctly) GIR hole, e.g. a par-5 whose regulation 3rd shot is played from a
  // greenside bunker onto the green. Gating on greenInRegulation (which derives from
  // the gir column) would drop those legit bunker visits. Denominator matches the DB
  // cache + shot-level ground truth (team 248 greenside-bunker visits).
  // Sand save = up-and-down from a greenside bunker. Prefer the canonical
  // golf_holes.sand_save flag (the SAME source the DB cache uses, per
  // stat-formulas) so the engine and cache agree: attempt = flag is non-null
  // (a greenside-bunker visit was recorded), made = flag === true. The old
  // `score <= par` rule wrongly credited GIR pars (green reached in regulation,
  // never in a bunker) as saves. When the flag is absent (number-only path),
  // fall back to shot-derived detection requiring an actual up-and-down: a
  // greenside-bunker visit on a missed green, holed in <=2 from the sand shot.
  const sandFlag = holeInfo.sand_save;
  const sandShotIdx = aroundGreenShot ? normalizedShots.indexOf(aroundGreenShot) : -1;
  const strokesFromSand = sandShotIdx >= 0 ? normalizedShots.length - sandShotIdx : Infinity;
  const sandSaveAttempt = sandFlag !== undefined
    ? sandFlag !== null
    : aroundGreenShot?.lie_before === 'sand';
  const sandSaveMade = sandFlag !== undefined
    ? sandFlag === true
    : (aroundGreenShot?.lie_before === 'sand' && !greenInRegulation && strokesFromSand <= 2);

  // Penalties
  const penalties = normalizedShots.filter(s => s.is_penalty).length;

  // 3-putts
  const threePutts = putts >= 3;

  return {
    holeNumber: holeInfo.hole_number,
    par: holeInfo.par,
    score,
    putts,
    fairwayHit,
    usedDriver,
    drivingDistance,
    driveMissDirection,
    greenInRegulation,
    approachShotNumber: approachShot?.shot_number ?? null,
    approachDistance,
    approachLie,
    approachRawLie: rawLie,
    approachProximity,
    approachProximityMiss,
    approachMissDirection,
    chipLie,
    chipDistance,
    firstPuttDistance,
    puttMakeByBand,
    firstPuttLeave,
    firstPuttBreak,
    firstPuttSlope,
    scrambleAttempt,
    scrambleMade,
    sandSaveAttempt,
    sandSaveMade,
    penalties,
    threePutts,
    shots: normalizedShots,
  };
}

// ============================================================================
// MAIN CALCULATOR - Calculate stats from raw shots
// ============================================================================

export function calculateStatsFromShots(
  shots: RawShot[],
  holes: HoleInfo[],
  rounds: RoundInfo[],
  opts?: { sgScale?: number }
): GolfStats {
  // Per-team SG baseline scale (1.0 = PGA Tour/men's; women's 1.083; NCAA D1/D2/D3).
  // Resolve via the DB sg_scale_for_player RPC in the caller and pass it here so the
  // TS engine's SG matches the DB cache (which already applies the scale).
  const sgScale = opts?.sgScale ?? 1;
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
        const stats = calculateHoleStatsFromShots(holeShots, hole);
        holeStats.push(stats);
      } else {
        holeStats.push(createHoleStatsFromKnownHole(hole));
      }
    }

    if (holeStats.length === 0) {
      continue;
    }

    // Sum of KNOWN hole scores only (null-honest). Round-level scoring
    // aggregates additionally require every hole to carry a real score
    // (see hasCompleteScores in aggregateRoundStats) so a partial sum can
    // never masquerade as a full round total.
    //
    // Findings #1/#4/#5 (AUDIT-0724 stats-visual-accuracy.md): this Σgolf_holes
    // .score IS the canonical round total — `golf_rounds.total_score` is only
    // a denormalized copy of this same sum, written once at submission time,
    // that can drift stale by ±1 stroke if a hole is ever corrected afterward
    // (see src/lib/golf/round-total.ts for the full root-cause + the DB
    // trigger gap). Dashboard/Rounds-page reads have been switched to prefer
    // the holes-derived value too (via that helper) so this Stats-page engine
    // and those surfaces agree; do NOT "fix" this line to read
    // `round.total_score` instead — that would make this engine wrong for the
    // rounds where the drift exists.
    const totalScore = holeStats.reduce((sum, h) => sum + (h.score ?? 0), 0);

    roundsWithStats.push({
      roundInfo: round,
      holes: holeStats,
      totalScore,
    });
  }

  // Now aggregate stats across all rounds
  return aggregateRoundStats(roundsWithStats, sgScale);
}

// ============================================================================
// AGGREGATE STATS ACROSS ROUNDS
// ============================================================================

function aggregateRoundStats(rounds: Array<{
  roundInfo: RoundInfo;
  holes: CalculatedHoleStats[];
  totalScore: number;
}>, sgScale = 1): GolfStats {
  const stats: GolfStats = {
    roundsPlayed: rounds.length,
    holesPlayed: 0,
    scoringAverage: null,
    avgScoreToPar: null,
    bestRound: null,
    worstRound: null,
    scoringAverage18: null,
    scoringAverage9: null,
    bestRound18: null,
    bestRound9: null,
    worstRound18: null,
    worstRound9: null,
    roundsPlayed18: 0,
    roundsPlayed9: 0,
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
    scoringByPar: {
      par3: { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0, total: 0, avgToPar: null },
      par4: { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0, total: 0, avgToPar: null },
      par5: { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0, total: 0, avgToPar: null },
    },
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
    drivingDistanceNonDriverOnly: null,
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
    missLeftPctDriver: null,
    missRightPctDriver: null,
    missLeftPctNonDriver: null,
    missRightPctNonDriver: null,
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
    girCountFromFairway: 0,
    girCountFromRough: 0,
    approachMissShortPct: null,
    approachMissLongPct: null,
    approachMissLeftPct: null,
    approachMissRightPct: null,
    approachMissShortLeftPct: null,
    approachMissShortRightPct: null,
    approachMissLongLeftPct: null,
    approachMissLongRightPct: null,
    approachMissTotal: 0,
    approachMissByBand: {},
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
    puttMakeCount0_3: 0,
    puttMakeCount3_5: 0,
    puttMakeCount5_10: 0,
    puttMakeCount10_15: 0,
    puttMakeCount15_20: 0,
    firstPuttDistanceAvg: null,
    firstPuttDistanceByBand: {},
    approachPuttAvgLeave: null,
    approachPuttAvgLeaveByBand: {},
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
        count0_3: 0,
        count3_5: 0,
        count5_10: 0,
        count10_15: 0,
        count15_20: 0,
        count20_25: 0,
        count25_30: 0,
        count30_35: 0,
        count35Plus: 0,
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
        count0_3: 0,
        count3_5: 0,
        count5_10: 0,
        count10_15: 0,
        count15_20: 0,
        count20_25: 0,
        count25_30: 0,
        count30_35: 0,
        count35Plus: 0,
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
        count0_3: 0,
        count3_5: 0,
        count5_10: 0,
        count10_15: 0,
        count15_20: 0,
        count20_25: 0,
        count25_30: 0,
        count30_35: 0,
        count35Plus: 0,
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
        count0_3: 0,
        count3_5: 0,
        count5_10: 0,
        count10_15: 0,
        count15_20: 0,
        count20_25: 0,
        count25_30: 0,
        count30_35: 0,
        count35Plus: 0,
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
    scramblingByMissDirection: {},
    scramblingMissDirectionTotal: 0,
    scrambleFairwayAttempts: 0,
    scrambleFairwayMade: 0,
    scrambleRoughAttempts: 0,
    scrambleRoughMade: 0,
    scrambleSandAttempts: 0,
    scrambleSandMade: 0,
    scramblingPctFringe: null,
    scrambleFringeAttempts: 0,
    scrambleFringeMade: 0,
    atgProximityAvg: null,
    atgProximityByLie: { fairway: null, rough: null, sand: null },
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
  let totalScore18 = 0;
  let totalScore9 = 0;
  let totalScoreToPar18 = 0; // strictly-18-hole rounds only (canonical scoring_average_vs_par)
  let bestRoundNormalized: number | null = null; // min over all rounds, normalized to 18
  let worstRoundNormalized: number | null = null;
  let practiceScore = 0;
  let qualifyingScore = 0;
  let tournamentScore = 0;

  const drivingDistances: number[] = [];
  const drivingDistancesDriverOnly: number[] = [];
  const drivingDistancesNonDriverOnly: number[] = [];
  const fairwaysPar4 = { hit: 0, total: 0 };
  const fairwaysPar5 = { hit: 0, total: 0 };
  const fairwaysDriver = { hit: 0, total: 0 };
  const fairwaysNonDriver = { hit: 0, total: 0 };

  const girPar3 = { made: 0, total: 0 };
  const girPar4 = { made: 0, total: 0 };
  const girPar5 = { made: 0, total: 0 };
  let puttsOnGir = 0;
  // GIR holes with KNOWN putts — the puttsPerGir denominator. A GIR hole
  // whose putts are unrecorded contributes to neither side of the ratio.
  let girHolesWithPutts = 0;

  // Per-par scoring distribution accumulators (→ stats.scoringByPar).
  const scorePar3 = { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0, total: 0, toParSum: 0 };
  const scorePar4 = { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0, total: 0, toParSum: 0 };
  const scorePar5 = { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0, total: 0, toParSum: 0 };

  // GIR by distance and lie
  const girByDistance: Record<string, { made: number; total: number }> = {};
  const girByLie = {
    fairway: { made: 0, total: 0 },
    rough: { made: 0, total: 0 },
    sand: { made: 0, total: 0 },
  };

  // Putting stats by break type — ALL-PUTT semantics: every putt with a
  // recorded break direction is an attempt (the entry flow requires a break
  // on every putt), made = that putt holed. attempts/makes cover ALL break-
  // tagged putts; `make` holds the per-distance-band split (needs a distance).
  const puttStatsByBreak: Record<string, {
    make: Record<string, { made: number; total: number }>;
    attempts: number;
    makes: number;
    missShort: number;
    missLow: number;
    missHigh: number;
    missTotal: number;
  }> = {
    left_to_right: { make: {}, attempts: 0, makes: 0, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
    straight: { make: {}, attempts: 0, makes: 0, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
    right_to_left: { make: {}, attempts: 0, makes: 0, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
    multiple: { make: {}, attempts: 0, makes: 0, missShort: 0, missLow: 0, missHigh: 0, missTotal: 0 },
  };

  // Strokes Gained accumulators
  // Track both the sum and count of valid shots to properly handle incomplete data
  let sgTee = 0;
  let sgTeeCount = 0;
  let sgApproach = 0;
  let sgApproachCount = 0;
  let sgAroundGreen = 0;
  let sgAroundGreenCount = 0;
  let sgPutting = 0;
  let sgPuttingCount = 0;
  // Rounds that contributed ANY SG value. The DB cache divides every
  // sg_*_per_round by COUNT of rounds with strokes_gained_total IS NOT NULL
  // (update_player_stats_strokes_gained), NOT by all rounds in the window —
  // a shot-untracked round must not dilute the per-round SG averages.
  let roundsWithSg = 0;

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

  // ADDITIVE: tee-miss left/right split by club class off the tee (usedDriver).
  const teeMissDriver = { left: 0, right: 0 };
  const teeMissNonDriver = { left: 0, right: 0 };

  // ADDITIVE: approach-miss direction distribution bucketed by approach distance band.
  // Per band: counts of missed-green approaches by direction (compound misses count to
  // both axes) plus the band's total missed approaches for the percentage denominator.
  const approachMissByBand: Record<
    string,
    { short: number; long: number; left: number; right: number; total: number }
  > = {};

  // ADDITIVE: first-putt approach distance (feet) — total list + per-band counts.
  const firstPuttDistances: number[] = [];
  const firstPuttDistanceBandCounts: Record<string, number> = {};

  // APPROACH PUTTING: average leave distance across ALL putts (0 for makes).
  // sumLeave / countLeave = overall average; per-band parallel running totals.
  let approachPuttSumLeave = 0;
  let approachPuttCountLeave = 0;
  const approachPuttSumLeaveByBand: Record<string, number> = {};
  const approachPuttCountLeaveByBand: Record<string, number> = {};

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
  const scrambleFringe = { made: 0, total: 0 };
  const scramble0_10 = { made: 0, total: 0 };
  const scramble10_20 = { made: 0, total: 0 };
  const scramble20_30 = { made: 0, total: 0 };

  // ADDITIVE (short-game Misses tab): scrambling outcome bucketed by the
  // ORIGINATING approach miss direction (short/long/left/right; compound
  // directions like short_left count toward BOTH axes, matching
  // approachMissShortPct/approachMissLeftPct etc. above).
  const scrambleMissDir: Record<'short' | 'long' | 'left' | 'right', { made: number; total: number }> = {
    short: { made: 0, total: 0 },
    long: { made: 0, total: 0 },
    left: { made: 0, total: 0 },
    right: { made: 0, total: 0 },
  };
  // Scramble attempts with a KNOWN miss direction — the shareOfMisses denominator.
  let scrambleMissDirTotal = 0;

  const atgEff0_10: number[] = [];
  const atgEff10_20: number[] = [];
  const atgEff20_30: number[] = [];
  const atgEffFairway: number[] = [];
  const atgEffRough: number[] = [];
  const atgEffSand: number[] = [];

  // ADDITIVE (short-game Misses tab): average distance LEFT (feet) after a
  // chip/pitch that actually reached the green — see atgProximityAvg doc.
  const atgProximities: number[] = [];
  const atgProximityByLie: Record<'fairway' | 'rough' | 'sand', number[]> = {
    fairway: [],
    rough: [],
    sand: [],
  };

  const atgEffByDistanceLie: Record<string, Record<string, number[]>> = {
    '0_10': { fairway: [], rough: [], sand: [] },
    '10_20': { fairway: [], rough: [], sand: [] },
    '20_30': { fairway: [], rough: [], sand: [] },
  };

  let currentBirdieStreak = 0;
  let currentParStreak = 0;
  let current3PuttStreak = 0;
  // Denominator for puttsPerRound (#917) — holes that actually carry a
  // recorded putts value, NOT every hole played (stats.holesPlayed). Dividing
  // by every hole played dilutes the average for any round with an unlogged
  // hole; see src/lib/golf/putts-per-round.ts for the shared formula this
  // and Team Stats both consume.
  let totalHolesWithPutts = 0;

  // Process each round
  for (const round of rounds) {
    // Null-honest: round-level SCORING aggregates (totals, best/worst,
    // 9/18 buckets, round-type averages) require every hole to carry a real
    // score — round.totalScore only sums known scores, so a round with any
    // null-score hole would otherwise feed a fabricated low total.
    const hasCompleteScores = round.holes.every(h => h.score !== null);
    const roundBirdies = round.holes.filter(
      h => h.score !== null && (h.score - h.par) === -1
    ).length;

    stats.holesPlayed += round.holes.length;

    // Determine 9-hole vs 18-hole format. Only STRICTLY-18 rounds feed the
    // 18-hole scoring bucket (matches the canonical cache:
    // COALESCE(holes_played,18)=18). Partial rounds (10-17 holes) are excluded
    // from BOTH format buckets so they can't masquerade as full 18-hole rounds.
    const holesInRound = round.roundInfo.holes_played ?? round.holes.length;
    const is9Hole = holesInRound <= 9; // for round-type (practice/qual/tourney) gating below

    if (hasCompleteScores) {
      // Best/worst (overall) is normalized to an 18-hole equivalent across ALL
      // rounds, mirroring the cache best_round_normalized = MIN(total_score * 18
      // / holes_played).
      if (holesInRound > 0) {
        const normalized = round.totalScore * (18 / holesInRound);
        if (bestRoundNormalized === null || normalized < bestRoundNormalized) {
          bestRoundNormalized = normalized;
        }
        if (worstRoundNormalized === null || normalized > worstRoundNormalized) {
          worstRoundNormalized = normalized;
        }
      }

      if (holesInRound <= 9) {
        totalScore9 += round.totalScore;
        stats.roundsPlayed9++;
        if (stats.bestRound9 === null || round.totalScore < stats.bestRound9) {
          stats.bestRound9 = round.totalScore;
        }
        if (stats.worstRound9 === null || round.totalScore > stats.worstRound9) {
          stats.worstRound9 = round.totalScore;
        }
      } else if (holesInRound === 18) {
        totalScore18 += round.totalScore;
        stats.roundsPlayed18++;
        const roundPar = round.holes.reduce((s, h) => s + h.par, 0);
        totalScoreToPar18 += round.totalScore - roundPar;
        if (stats.bestRound18 === null || round.totalScore < stats.bestRound18) {
          stats.bestRound18 = round.totalScore;
        }
        if (stats.worstRound18 === null || round.totalScore > stats.worstRound18) {
          stats.worstRound18 = round.totalScore;
        }
      }

      // Round type scoring
      const roundType = normalizeRoundType(round.roundInfo.round_type);
      if (!is9Hole && roundType === 'practice') {
        practiceScore += round.totalScore;
        stats.practiceRounds++;
      } else if (!is9Hole && roundType === 'qualifier') {
        qualifyingScore += round.totalScore;
        stats.qualifyingRounds++;
      } else if (!is9Hole && roundType === 'tournament') {
        tournamentScore += round.totalScore;
        stats.tournamentRounds++;
      }
    }

    // Most birdies
    if (roundBirdies > stats.mostBirdiesRound) {
      stats.mostBirdiesRound = roundBirdies;
    }

    // Process each hole. Streak counters reset at every round boundary (a
    // birdie/par/no-3-putt run cannot span two rounds) and holes are walked in
    // hole_number order so the run reflects true play order, not DB row order.
    currentBirdieStreak = 0;
    currentParStreak = 0;
    current3PuttStreak = 0;
    // Snapshot the SG shot tallies so we can tell whether THIS round
    // contributed any SG (feeds the roundsWithSg per-round denominator).
    const sgShotCountBefore = sgTeeCount + sgApproachCount + sgAroundGreenCount + sgPuttingCount;
    const orderedHoles = [...round.holes].sort((a, b) => a.holeNumber - b.holeNumber);
    for (const hole of orderedHoles) {
      // Null-honest: a hole without a recorded score contributes NO scoring
      // outcome and BREAKS scoring streaks (an unknown score is not a par,
      // and a streak cannot be verified across it).
      if (hole.score !== null) {
        const scoreToPar = hole.score - hole.par;

        // Scoring counts
        if (scoreToPar <= -2) stats.totalEagles++;
        else if (scoreToPar === -1) stats.totalBirdies++;
        else if (scoreToPar === 0) stats.totalPars++;
        else if (scoreToPar === 1) stats.totalBogeys++;
        else stats.totalDoublePlus++;

        // Per-par scoring distribution — bucket the same outcome by hole par.
        const parBucket =
          hole.par === 3 ? scorePar3 : hole.par === 4 ? scorePar4 : hole.par === 5 ? scorePar5 : null;
        if (parBucket) {
          parBucket.total++;
          parBucket.toParSum += scoreToPar;
          if (scoreToPar <= -2) parBucket.eagle++;
          else if (scoreToPar === -1) parBucket.birdie++;
          else if (scoreToPar === 0) parBucket.par++;
          else if (scoreToPar === 1) parBucket.bogey++;
          else parBucket.doublePlus++;
        }

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
      } else {
        currentBirdieStreak = 0;
        currentParStreak = 0;
      }

      if (hole.putts === null) {
        // Unknown putts cannot extend a verified no-3-putt run.
        current3PuttStreak = 0;
      } else if (!hole.threePutts) {
        current3PuttStreak++;
        if (current3PuttStreak > stats.longestNo3PuttStreak) {
          stats.longestNo3PuttStreak = current3PuttStreak;
        }
      } else {
        current3PuttStreak = 0;
      }

      // Driving — exclude 0-yard placeholder tee shots (data artifacts) so the
      // average matches shot-analytics (which filters > 0) and isn't dragged
      // down by zero-distance entries.
      if (hole.drivingDistance !== null && hole.drivingDistance > 0) {
        drivingDistances.push(hole.drivingDistance);
        if (hole.usedDriver) {
          drivingDistancesDriverOnly.push(hole.drivingDistance);
        } else if (hole.usedDriver === false) {
          // ADDITIVE: parallel non-driver accumulator (opposite usedDriver branch).
          drivingDistancesNonDriverOnly.push(hole.drivingDistance);
        }
      }

      // Fairway stats - a par 4/par 5 counts as an opportunity ONLY when its
      // tee result resolved to a KNOWN fairway outcome (fairwayHit !== null).
      // Holes with an unknown fairway outcome are excluded — never counted as a
      // miss — per CANON, matching the team stats page and ground-truth formula.
      if (hole.par !== 3 && hole.fairwayHit !== null) {
        stats.fairwayOpportunities++;
        if (hole.fairwayHit) stats.fairwaysHit++;

        if (hole.par === 4) {
          fairwaysPar4.total++;
          if (hole.fairwayHit) fairwaysPar4.hit++;
        } else if (hole.par === 5) {
          fairwaysPar5.total++;
          if (hole.fairwayHit) fairwaysPar5.hit++;
        }

        if (hole.usedDriver === true) {
          fairwaysDriver.total++;
          if (hole.fairwayHit) fairwaysDriver.hit++;
        } else if (hole.usedDriver === false) {
          fairwaysNonDriver.total++;
          if (hole.fairwayHit) fairwaysNonDriver.hit++;
        }

        if (!hole.fairwayHit && hole.driveMissDirection) {
          const dm = hole.driveMissDirection;
          const isLeft = dm === 'left' || dm.startsWith('left_') || dm.endsWith('_left');
          const isRight = dm === 'right' || dm.startsWith('right_') || dm.endsWith('_right');
          if (isLeft) stats.missLeftCount++;
          if (isRight) stats.missRightCount++;
          // ADDITIVE: same L/R miss detection, split by club class off the tee.
          if (hole.usedDriver === true) {
            if (isLeft) teeMissDriver.left++;
            if (isRight) teeMissDriver.right++;
          } else if (hole.usedDriver === false) {
            if (isLeft) teeMissNonDriver.left++;
            if (isRight) teeMissNonDriver.right++;
          }
        }
      }

      // GIR
      stats.girOpportunities++;
      if (hole.greenInRegulation) {
        stats.girTotal++;
        if (hole.putts !== null) {
          puttsOnGir += hole.putts;
          girHolesWithPutts++;
        }
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
        // Route through the shared bucketer so a given approach yardage lands in
        // the SAME band as the proximity/efficiency/miss charts on this surface
        // (single source of band edges — no per-chart boundary drift, and the
        // 30-50yd shots previously dropped by the inline 50yd floor are kept).
        const bucket = getApproachDistanceBucket(hole.approachDistance);

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

      // GIR by approach lie — use the UN-remapped lie so par-3 tee shots (which
      // line 918 folds into 'fairway' for proximity) are NOT counted as fairway
      // approaches. "GIR from the fairway" must mean an approach genuinely played
      // from the fairway, else par-3 tee shots inflate the fairway denominator.
      if (hole.approachRawLie) {
        const girLie = hole.approachRawLie;
        if (girLie === 'fairway' || girLie === 'rough' || girLie === 'sand') {
          girByLie[girLie].total++;
          if (hole.greenInRegulation) {
            girByLie[girLie].made++;
          }
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

        // ADDITIVE: same missed-approach direction data bucketed by approach distance.
        // Compound misses count toward both axes (short_left → short and left), matching
        // the overall aggregate. Requires a known approach distance to assign a band.
        if (hole.approachDistance !== null) {
          const band = getApproachDistanceBucket(hole.approachDistance);
          if (band) {
            if (!approachMissByBand[band]) {
              approachMissByBand[band] = { short: 0, long: 0, left: 0, right: 0, total: 0 };
            }
            const acc = approachMissByBand[band]!;
            acc.total++;
            if (missDir.includes('short')) acc.short++;
            if (missDir.includes('long')) acc.long++;
            if (missDir.includes('left')) acc.left++;
            if (missDir.includes('right')) acc.right++;
          }
        }
      }

      // Putts — null-skip: a hole without recorded putts contributes nothing
      // (the old known-hole path fabricated putts=2 for these holes).
      if (hole.putts !== null) {
        stats.totalPutts += hole.putts;
        // Denominator for puttsPerRound/threePuttsPerRound (#917): count every
        // hole with a RECORDED putts value, including legitimate 0-putt holes
        // (chip-ins / hole-outs from off the green — createHoleStatsFromKnownHole
        // and calculateHoleStatsFromShots both only reach putts=0 via a real
        // recorded value, never a fabricated one). The old `hole.putts > 0`
        // guard silently dropped those holes from the denominator despite the
        // null check above already establishing the value is real, not missing.
        totalHolesWithPutts++;
        if (hole.threePutts) stats.threePuttsTotal++;
        if (hole.putts === 1) stats.onePuttsTotal++;
      }

      // Make % — ALL-PUTT (every putt on the hole, made = holed), merged from
      // the hole's per-band tallies. Conventional PGA "make % from distance"
      // (matches golf_pga_standards + the cache writer). Was first-putt-only
      // with made = 1-putt, which mislabeled the rate and conflicted with the
      // leak-map/cache grid shown on the same tab. Deliberately NOT gated on
      // the FIRST putt having a distance: the DB function buckets EVERY putt
      // with a distance_to_hole_before, so a hole whose first putt lacks a
      // distance still contributes its other distance-tagged putts.
      for (const [band, mc] of Object.entries(hole.puttMakeByBand)) {
        if (!puttMake[band]) puttMake[band] = { made: 0, total: 0 };
        puttMake[band].total += mc.total;
        puttMake[band].made += mc.made;
      }

      // Putting by break — ALL-PUTT, aligned with the headline make% above:
      // every putt with a recorded break direction is an attempt in its own
      // distance band, made = THAT putt holed (result/putt_made). The entry
      // flow requires a break on every putt — not just the first — so all
      // putts carry putt_break. Was first-putt-only with made = "exactly 1
      // putt on the hole", which both mislabeled the rate and disagreed with
      // the all-putt make% grid rendered alongside it.
      for (const putt of hole.shots) {
        if (putt.shot_type !== 'putting') continue;
        const breakType = putt.putt_break;
        if (breakType !== 'left_to_right' && breakType !== 'right_to_left' &&
            breakType !== 'straight' && breakType !== 'multiple') {
          continue;
        }
        const breakData = puttStatsByBreak[breakType];
        if (!breakData) continue;
        const holed = putt.result === 'hole' || putt.putt_made === true;

        breakData.attempts++;
        if (holed) breakData.makes++;

        // Per-distance-band split needs the putt's own start distance.
        if (putt.distance_to_hole_before !== null) {
          const band = getPuttDistanceBucket(normalizePuttFeet(putt.distance_to_hole_before));
          if (!breakData.make[band]) {
            breakData.make[band] = { made: 0, total: 0 };
          }
          breakData.make[band].total++;
          if (holed) breakData.make[band].made++;
        }

        // Miss tendency for this break — per missed putt with a tagged
        // direction (compound tags like 'low_short' count toward each axis),
        // matching the all-putt attempt definition.
        if (!holed && putt.miss_direction) {
          breakData.missTotal++;
          if (putt.miss_direction.includes('short')) breakData.missShort++;
          if (putt.miss_direction.includes('low')) breakData.missLow++;
          if (putt.miss_direction.includes('high')) breakData.missHigh++;
        }
      }

      // Approach putting: average leave distance across ALL putts (0 for makes).
      // The OVERALL average counts every putt with a known outcome/leave — a
      // missing starting distance does NOT exclude it (only the per-band split
      // needs a start distance for its band key).
      // A missed putt with null distance_to_hole_after is excluded (null-honest).
      for (const putt of hole.shots) {
        if (putt.shot_type !== 'putting') continue;
        const holed = putt.result === 'hole' || putt.putt_made === true;
        // Leave = 0 for holed putts; distance_to_hole_after for misses.
        // Skip misses whose leave distance is unknown (null-honest).
        const leave = holed ? 0 : (putt.distance_to_hole_after != null
          ? normalizePuttFeet(putt.distance_to_hole_after)
          : null);
        if (leave === null) continue;
        // Overall accumulators: every qualifying putt counts (incl. unbanded).
        approachPuttSumLeave += leave;
        approachPuttCountLeave++;
        // Per-band split requires a known starting distance for the band key.
        if (putt.distance_to_hole_before == null) continue;
        const band = getPuttDistanceBucket(normalizePuttFeet(putt.distance_to_hole_before));
        approachPuttSumLeaveByBand[band] = (approachPuttSumLeaveByBand[band] ?? 0) + leave;
        approachPuttCountLeaveByBand[band] = (approachPuttCountLeaveByBand[band] ?? 0) + 1;
      }

      // First putt stats
      if (hole.firstPuttDistance !== null) {
        const bucket = getPuttDistanceBucket(hole.firstPuttDistance);

        // ADDITIVE: first-putt approach distance — overall list + per-band count.
        firstPuttDistances.push(hole.firstPuttDistance);
        firstPuttDistanceBandCounts[bucket] = (firstPuttDistanceBandCounts[bucket] ?? 0) + 1;

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
        if (hole.putts !== null) {
          if (!puttEff[bucket]) puttEff[bucket] = [];
          puttEff[bucket].push(hole.putts);
        }

        // Miss direction
        if (hole.putts !== null && hole.putts > 1 && hole.firstPuttLeave && hole.firstPuttLeave > 0) {
          // Determine miss direction from shots
          const firstPuttShot = hole.shots.find(s => s.shot_type === 'putting');
          if (firstPuttShot?.miss_direction) {
            // Denominator counts only tagged misses (matches the by-break and
            // approach-miss patterns) so each direction % is "% of missed putts
            // with a recorded direction", not diluted by untagged multi-putts.
            puttMissTotal++;
            const pm = firstPuttShot.miss_direction;
            if (pm === 'left' || pm.startsWith('left_') || pm.endsWith('_left')) puttMissLeft++;
            if (pm === 'right' || pm.startsWith('right_') || pm.endsWith('_right')) puttMissRight++;
            if (pm === 'short' || pm.startsWith('short_') || pm.endsWith('_short')) puttMissShort++;
            if (pm === 'long' || pm.startsWith('long_') || pm.endsWith('_long')) puttMissLong++;
            if (pm === 'low' || pm.startsWith('low_') || pm.endsWith('_low')) puttMissLow++;
            if (pm === 'high' || pm.startsWith('high_') || pm.endsWith('_high')) puttMissHigh++;
          }
        }
      }

      // Approach proximity headline cards (partner definition — see the
      // `approachProximity`/`approachProximityMiss` doc comment above): the
      // union of EVERY logged approach finish (hit + miss) feeds the "total"
      // card, and the mutually-exclusive hit/miss pools feed their own cards.
      // `hole.approachProximity` and `hole.approachProximityMiss` are never
      // both non-null for the same hole, so this cannot double-count.
      if (hole.approachProximity !== null) {
        approachProximities.push(hole.approachProximity);
        greenHitProximities.push(hole.approachProximity);
      } else if (hole.approachProximityMiss !== null) {
        approachProximities.push(hole.approachProximityMiss);
        greenMissProximities.push(hole.approachProximityMiss);
      }

      // Finer-grained cuts (by par / lie / distance) stay GREEN-HIT ONLY —
      // the conventional "how close did you leave it when you found the
      // green" meaning, deliberately NOT the partner's total union above.
      if (hole.approachProximity !== null) {
        if (hole.par === 3) approachProxPar3.push(hole.approachProximity);
        else if (hole.par === 4) approachProxPar4.push(hole.approachProximity);
        else if (hole.par === 5) approachProxPar5.push(hole.approachProximity);

        if (hole.approachLie === 'fairway') approachProxFairway.push(hole.approachProximity);
        else if (hole.approachLie === 'rough') approachProxRough.push(hole.approachProximity);
        else if (hole.approachLie === 'sand') approachProxSand.push(hole.approachProximity);

        // Only push proximity if the approach distance is also known (prevents NaN from null in array)
        if (hole.approachDistance !== null) {
          const bucket = getApproachDistanceBucket(hole.approachDistance);
          // Only track approach proximity for actual approach shots (beyond around-green threshold)
          if (bucket) {
            if (!approachProxByDistance[bucket]) approachProxByDistance[bucket] = [];
            approachProxByDistance[bucket].push(hole.approachProximity);
          }
        }
      }

      // Approach efficiency (strokes to hole out from approach distance)
      // This is SEPARATE from proximity - we can calculate efficiency even without proximity data
      // We need: approachDistance (where they hit from), approachShotNumber, score, and lie
      // Only for approach shots (>= AROUND_GREEN_THRESHOLD_YARDS from hole) - around-the-green shots are tracked separately
      if (hole.score !== null && hole.approachDistance !== null && hole.approachDistance >= AROUND_GREEN_THRESHOLD_YARDS && hole.approachShotNumber !== null) {
        const bucket = getApproachDistanceBucket(hole.approachDistance);
        // Strokes to hole out = total shots - approach shot number + 1
        // Example: 5 total shots, approach is shot #2 → 5 - 2 + 1 = 4 strokes to hole out from approach
        const strokesToHoleOut = hole.score - hole.approachShotNumber + 1;

        if (bucket && !approachEffByDistanceLie[bucket]) {
          approachEffByDistanceLie[bucket] = { fairway: [], rough: [], sand: [] };
        }
        // Default to 'fairway' when lie is unknown - most approach shots are from fairway
        const approachEffLie = (hole.approachLie || 'fairway') as string;
        if (bucket && (approachEffLie === 'fairway' || approachEffLie === 'rough' || approachEffLie === 'sand')) {
          const bucketData = approachEffByDistanceLie[bucket];
          if (bucketData && bucketData[approachEffLie]) {
            bucketData[approachEffLie].push(strokesToHoleOut);
          }
        }
      }

      // Scrambling
      // FIXED: Now uses chipLie/chipDistance (the actual chip/pitch shot) instead of
      // approachLie/approachDistance (the GIR attempt shot)
      if (hole.scrambleAttempt) {
        stats.scrambleAttempts++;
        if (hole.scrambleMade) stats.scramblesMade++;

        // Scrambling by lie - use chipLie (where the chip/pitch was FROM)
        if (hole.chipLie === 'fairway') {
          scrambleFairway.total++;
          if (hole.scrambleMade) scrambleFairway.made++;
        } else if (hole.chipLie === 'rough') {
          scrambleRough.total++;
          if (hole.scrambleMade) scrambleRough.made++;
        } else if (hole.chipLie === 'sand') {
          scrambleSand.total++;
          if (hole.scrambleMade) scrambleSand.made++;
        } else if (hole.chipLie === 'fringe') {
          scrambleFringe.total++;
          if (hole.scrambleMade) scrambleFringe.made++;
        }

        // Miss-direction breakdown — bucket by the ORIGINATING approach miss
        // that created this scramble situation (the same field
        // approachMissByBand buckets above). Compound directions (e.g.
        // short_left) count toward BOTH axes, matching approachMissShortPct/
        // approachMissLeftPct etc.'s convention.
        if (hole.approachMissDirection) {
          const missDir = hole.approachMissDirection.toLowerCase();
          const isMissShort = missDir === 'short' || missDir.startsWith('short_');
          const isMissLong = missDir === 'long' || missDir.startsWith('long_');
          const isMissLeft = missDir === 'left' || missDir.endsWith('_left');
          const isMissRight = missDir === 'right' || missDir.endsWith('_right');
          if (isMissShort || isMissLong || isMissLeft || isMissRight) {
            scrambleMissDirTotal++;
            if (isMissShort) {
              scrambleMissDir.short.total++;
              if (hole.scrambleMade) scrambleMissDir.short.made++;
            }
            if (isMissLong) {
              scrambleMissDir.long.total++;
              if (hole.scrambleMade) scrambleMissDir.long.made++;
            }
            if (isMissLeft) {
              scrambleMissDir.left.total++;
              if (hole.scrambleMade) scrambleMissDir.left.made++;
            }
            if (isMissRight) {
              scrambleMissDir.right.total++;
              if (hole.scrambleMade) scrambleMissDir.right.made++;
            }
          }
        }

        // Scrambling by distance - use chipDistance (how far the chip/pitch was)
        // Fallback: if chipDistance is null, try to find around_green shot's distance_to_hole_before
        let scrambleDistance = hole.chipDistance;
        if (scrambleDistance === null) {
          const atgShot = hole.shots.find(s => {
            if (s.shot_type === 'around_green') return true;
            // Or: near green, not putting, not tee
            if (s.lie_before !== 'green' && s.shot_type !== 'putting' && s.shot_type !== 'tee' && !s.is_penalty && s.distance_to_hole_before !== null) {
              const d = s.distance_unit_before === 'feet' ? (s.distance_to_hole_before || 0) / 3 : (s.distance_to_hole_before || 0);
              return d <= AROUND_GREEN_THRESHOLD_YARDS;
            }
            return false;
          });
          if (atgShot && atgShot.distance_to_hole_before !== null) {
            scrambleDistance = atgShot.distance_unit_before === 'feet'
              ? (atgShot.distance_to_hole_before / 3)
              : atgShot.distance_to_hole_before;
          }
        }
        if (scrambleDistance !== null) {
          if (scrambleDistance <= 10) {
            scramble0_10.total++;
            if (hole.scrambleMade) scramble0_10.made++;
          } else if (scrambleDistance <= 20) {
            scramble10_20.total++;
            if (hole.scrambleMade) scramble10_20.made++;
          } else {
            scramble20_30.total++;
            if (hole.scrambleMade) scramble20_30.made++;
          }
        }
      }

      // Around the green efficiency - track actual around_green shots
      // For each around_green shot, calculate shots to hole out from that point
      const aroundGreenShots = hole.shots.filter(s => s.shot_type === 'around_green');
      for (const atgShot of aroundGreenShots) {
        // Skip shots without distance data
        if (atgShot.distance_to_hole_before === null) continue;

        const distYards = normalizeToYards(atgShot.distance_to_hole_before, atgShot.distance_unit_before);
        // Only track shots within around-green threshold (distance to hole, not green edge)
        if (distYards > AROUND_GREEN_THRESHOLD_YARDS) continue;

        // Count shots from this around_green shot to hole out
        // Include this shot plus all subsequent putting shots
        const shotsToHoleOut = hole.shots.filter(s =>
          s.shot_number >= atgShot.shot_number &&
          (s.shot_type === 'around_green' || s.shot_type === 'putting')
        ).length;

        // Bucket by distance
        const bucket = getAtgDistanceBucket(distYards);
        if (bucket === '0_10') atgEff0_10.push(shotsToHoleOut);
        else if (bucket === '10_20') atgEff10_20.push(shotsToHoleOut);
        else atgEff20_30.push(shotsToHoleOut);

        // Track by lie (use the around_green shot's lie_before)
        const lie = atgShot.lie_before;
        if (lie === 'fairway') atgEffFairway.push(shotsToHoleOut);
        else if (lie === 'rough') atgEffRough.push(shotsToHoleOut);
        else if (lie === 'sand') atgEffSand.push(shotsToHoleOut);

        // Populate the distance x lie matrix
        const matrixLie = lie;
        if (matrixLie === 'fairway' || matrixLie === 'rough' || matrixLie === 'sand') {
          const bucketData = atgEffByDistanceLie[bucket];
          if (bucketData && bucketData[matrixLie]) {
            bucketData[matrixLie].push(shotsToHoleOut);
          }
        }

        // Proximity LEFT after this chip/pitch, in feet — ON-GREEN ONLY
        // (mirrors approachProximity's rule above: an off-green finish isn't
        // a comparable "proximity" figure). A holed chip contributes 0.
        if (isGreenHit(atgShot.result)) {
          const proximityFeet = atgShot.result === 'hole'
            ? 0
            : atgShot.distance_to_hole_after !== null
              ? normalizeToFeet(atgShot.distance_to_hole_after, atgShot.distance_unit_after)
              : null;
          if (proximityFeet !== null) {
            atgProximities.push(proximityFeet);
            if (matrixLie === 'fairway' || matrixLie === 'rough' || matrixLie === 'sand') {
              atgProximityByLie[matrixLie].push(proximityFeet);
            }
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
        // SG-4: a penalty stroke is a pure lost stroke (the stroke counted but
        // made no progress to the hole → exactly -1.0 SG). Previously these were
        // skipped, so the four SG categories under-counted the round by every
        // penalty stroke and SG:Total no longer reconciled with the score.
        // Charge -1.0 to the OFFENDING category (where the errant shot was hit
        // from) to keep SG additive (sgTotal = sum of the 4 categories).
        const isPenaltyShot =
          shot.result === 'penalty' ||
          shot.is_penalty === true ||
          shot.shot_type === 'penalty';
        if (isPenaltyShot) {
          const penaltyCategory = getPenaltyCategory(shot, hole.par);
          if (penaltyCategory === 'tee') {
            sgTee -= 1;
            sgTeeCount++;
          } else if (penaltyCategory === 'around_green') {
            sgAroundGreen -= 1;
            sgAroundGreenCount++;
          } else {
            sgApproach -= 1;
            sgApproachCount++;
          }
          continue;
        }

        const sg = calculateStrokesGainedForShot(shot, sgScale);
        const category = getStrokesGainedCategory(shot, hole.par);

        // Accumulate by category - only when SG is calculable (not null)
        // This ensures incomplete data doesn't skew averages
        if (sg !== null) {
          if (category === 'tee') {
            sgTee += sg;
            sgTeeCount++;
          } else if (category === 'approach') {
            sgApproach += sg;
            sgApproachCount++;
          } else if (category === 'around_green') {
            sgAroundGreen += sg;
            sgAroundGreenCount++;
          } else if (category === 'putting') {
            sgPutting += sg;
            sgPuttingCount++;
          }
        }

        // Track longest hole-out (non-putt shots that go directly in the hole)
        // Typically chip-ins, approach hole-outs, etc.
        if (shot.result === 'hole' && shot.shot_type !== 'putting' && shot.distance_to_hole_before !== null) {
          const distanceYards = normalizeToYards(shot.distance_to_hole_before, shot.distance_unit_before);
          if (stats.longestHoleOut === null || distanceYards > stats.longestHoleOut) {
            stats.longestHoleOut = distanceYards;
          }
        }
      }
    }

    // This round contributed SG iff any category tally advanced while
    // processing its holes (includes penalty-stroke charges).
    if (sgTeeCount + sgApproachCount + sgAroundGreenCount + sgPuttingCount > sgShotCountBefore) {
      roundsWithSg++;
    }
  }

  stats.currentNo3PuttStreak = current3PuttStreak;

  // Calculate averages and percentages
  // Format-specific scoring averages
  stats.scoringAverage18 = safeAverage(totalScore18, stats.roundsPlayed18);
  stats.scoringAverage9 = safeAverage(totalScore9, stats.roundsPlayed9);

  // Scoring average: 18-hole rounds only (NCAA-style)
  stats.scoringAverage = stats.scoringAverage18;

  // Best/worst (overall): normalized to 18 holes across all rounds (matches the
  // cache best_round_normalized). Per-format bestRound18/9 stay raw for the
  // hole-format toggle.
  stats.bestRound = bestRoundNormalized !== null ? Math.round(bestRoundNormalized) : null;
  stats.worstRound = worstRoundNormalized !== null ? Math.round(worstRoundNormalized) : null;

  // Scoring average vs par: 18-hole rounds only (matches cache scoring_average_vs_par),
  // NOT a normalize-all-holes figure.
  stats.avgScoreToPar = safeAverage(totalScoreToPar18, stats.roundsPlayed18);
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
  // ADDITIVE: parallel non-driver tee-shot distance average.
  stats.drivingDistanceNonDriverOnly = safeAverage(
    drivingDistancesNonDriverOnly.reduce((a, b) => a + b, 0),
    drivingDistancesNonDriverOnly.length
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

  // ADDITIVE: same L/R miss tendency, split by club class off the tee.
  const driverMisses = teeMissDriver.left + teeMissDriver.right;
  stats.missLeftPctDriver = safePercent(teeMissDriver.left, driverMisses);
  stats.missRightPctDriver = safePercent(teeMissDriver.right, driverMisses);
  const nonDriverMisses = teeMissNonDriver.left + teeMissNonDriver.right;
  stats.missLeftPctNonDriver = safePercent(teeMissNonDriver.left, nonDriverMisses);
  stats.missRightPctNonDriver = safePercent(teeMissNonDriver.right, nonDriverMisses);

  stats.girPercentage = safePercent(stats.girTotal, stats.girOpportunities);
  // 18-hole-normalized (matches puttsPerRound above and the DB cache contract);
  // a raw divide by round count under-reports when a 9-hole round is present.
  stats.girPerRound = stats.holesPlayed > 0
    ? Math.round(((stats.girTotal / stats.holesPlayed) * 18) * 100) / 100
    : null;
  stats.girPctPar3 = safePercent(girPar3.made, girPar3.total);
  stats.girPctPar4 = safePercent(girPar4.made, girPar4.total);
  stats.girPctPar5 = safePercent(girPar5.made, girPar5.total);

  const finalizeParScore = (acc: typeof scorePar3): ParScoreDistribution => ({
    eagle: acc.eagle,
    birdie: acc.birdie,
    par: acc.par,
    bogey: acc.bogey,
    doublePlus: acc.doublePlus,
    total: acc.total,
    avgToPar: acc.total > 0 ? acc.toParSum / acc.total : null,
  });
  stats.scoringByPar = {
    par3: finalizeParScore(scorePar3),
    par4: finalizeParScore(scorePar4),
    par5: finalizeParScore(scorePar5),
  };

  // Shared formula with Team Stats (src/app/golf/(dashboard)/dashboard/stats/
  // team/page.tsx) via calculatePuttsPerRound — divides by holes that
  // actually carry a recorded putts value (totalHolesWithPutts), not every
  // hole played (stats.holesPlayed), so the two surfaces can never disagree
  // on the same player again (#917).
  const rawPuttsPerRound = calculatePuttsPerRound(stats.totalPutts, totalHolesWithPutts);
  stats.puttsPerRound = rawPuttsPerRound != null ? Math.round(rawPuttsPerRound * 100) / 100 : null;
  stats.puttsPerHole = safeAverage(stats.totalPutts, stats.holesPlayed);
  // Denominator = GIR holes with KNOWN putts (null-skip both sides of the
  // ratio; a GIR hole with unrecorded putts must not drag the average down).
  stats.puttsPerGir = safeAverage(puttsOnGir, girHolesWithPutts);
  // Denominator mirrors puttsPerRound above (#917) — holes with a RECORDED
  // putts value (totalHolesWithPutts), not every hole played
  // (stats.holesPlayed). stats.threePuttsTotal only increments inside the
  // same `hole.putts !== null` guard that feeds totalHolesWithPutts, so
  // dividing by holesPlayed diluted the rate for any round with an unlogged
  // hole — the same denominator bug #917 fixed for puttsPerRound. Normalized
  // to the 18-hole equivalent the same way, but kept as its own ternary
  // (rather than routing through calculatePuttsPerRound) so a genuine 0
  // three-putts round still reports 0.00, not null.
  stats.threePuttsPerRound = totalHolesWithPutts > 0
    ? Math.round(((stats.threePuttsTotal / totalHolesWithPutts) * 18) * 100) / 100
    : null;

  // Putt make %
  stats.puttMakePct0_3 = safePercent(puttMake['0_3']?.made || 0, puttMake['0_3']?.total || 0);
  stats.puttMakePct3_5 = safePercent(puttMake['3_5']?.made || 0, puttMake['3_5']?.total || 0);
  stats.puttMakePct5_10 = safePercent(puttMake['5_10']?.made || 0, puttMake['5_10']?.total || 0);
  stats.puttMakePct10_15 = safePercent(puttMake['10_15']?.made || 0, puttMake['10_15']?.total || 0);
  stats.puttMakePct15_20 = safePercent(puttMake['15_20']?.made || 0, puttMake['15_20']?.total || 0);

  // Putt sample counts (how many first putts in each distance bucket)
  stats.puttMakeCount0_3 = puttMake['0_3']?.total || 0;
  stats.puttMakeCount3_5 = puttMake['3_5']?.total || 0;
  stats.puttMakeCount5_10 = puttMake['5_10']?.total || 0;
  stats.puttMakeCount10_15 = puttMake['10_15']?.total || 0;
  stats.puttMakeCount15_20 = puttMake['15_20']?.total || 0;
  stats.puttMakePct20_25 = safePercent(puttMake['20_25']?.made || 0, puttMake['20_25']?.total || 0);
  stats.puttMakePct25_30 = safePercent(puttMake['25_30']?.made || 0, puttMake['25_30']?.total || 0);
  stats.puttMakePct30_35 = safePercent(puttMake['30_35']?.made || 0, puttMake['30_35']?.total || 0);
  stats.puttMakePct35Plus = safePercent(puttMake['35_plus']?.made || 0, puttMake['35_plus']?.total || 0);

  // ADDITIVE: first-putt approach distance — overall average (feet) + count distribution
  // by distance band (% of first putts that originated in each band).
  stats.firstPuttDistanceAvg = safeAverage(
    firstPuttDistances.reduce((a, b) => a + b, 0),
    firstPuttDistances.length
  );
  const firstPuttTotal = firstPuttDistances.length;
  for (const [band, count] of Object.entries(firstPuttDistanceBandCounts)) {
    stats.firstPuttDistanceByBand[band] = safePercent(count, firstPuttTotal);
  }

  // Approach putting: overall average leave + per-band average leave.
  // sum/count — never average-of-averages (house rule).
  stats.approachPuttAvgLeave = safeAverage(approachPuttSumLeave, approachPuttCountLeave);
  for (const [band, count] of Object.entries(approachPuttCountLeaveByBand)) {
    // count is always >= 1 here (band only exists once a putt is added), so
    // safeAverage never returns null for these keys — coalesce to satisfy the
    // narrowed Record<string, number> type.
    stats.approachPuttAvgLeaveByBand[band] = safeAverage(
      approachPuttSumLeaveByBand[band] ?? 0,
      count,
    ) ?? 0;
  }

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
  // Combine 0_3 and 3_5 buckets for 0-5 feet range
  const puttEff0_3 = puttEff['0_3'] || [];
  const puttEff3_5 = puttEff['3_5'] || [];
  const combinedPuttEff0_5 = [...puttEff0_3, ...puttEff3_5];
  stats.puttEff0_5 = safeAverage(
    combinedPuttEff0_5.reduce((a, b) => a + b, 0),
    combinedPuttEff0_5.length
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
  // NB: the shared getApproachDistanceBucket lowest band is keyed '30_75' (its
  // floor is AROUND_GREEN_THRESHOLD_YARDS=50, so it only ever holds 50-75yd
  // shots). The output field name stays girPct50_75 for compatibility, but it
  // now reads the '30_75' bucket key so boundary yardages land in the same band
  // as the proximity/efficiency/miss charts.
  stats.girPct50_75 = safePercent(girByDistance['30_75']?.made || 0, girByDistance['30_75']?.total || 0);
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
  stats.girCountFromFairway = girByLie.fairway.total;
  stats.girCountFromRough = girByLie.rough.total;

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

  // ADDITIVE: approach-miss direction distribution bucketed by approach distance band.
  // Bands with no missed approaches are omitted (record key absent).
  for (const [band, acc] of Object.entries(approachMissByBand)) {
    stats.approachMissByBand[band] = {
      short: safePercent(acc.short, acc.total),
      long: safePercent(acc.long, acc.total),
      left: safePercent(acc.left, acc.total),
      right: safePercent(acc.right, acc.total),
      total: acc.total,
    };
  }

  // Proximity split (hit vs miss)
  stats.approachProximityWhenHitGreen = safeAverage(
    greenHitProximities.reduce((a, b) => a + b, 0),
    greenHitProximities.length
  );
  stats.approachProximityWhenMissedGreen = safeAverage(
    greenMissProximities.reduce((a, b) => a + b, 0),
    greenMissProximities.length
  );

  // Putting stats by break type — all-putt: totalPutts/overall cover every
  // break-tagged putt (even one missing a start distance); the per-band
  // make%s split the distance-tagged subset.
  for (const breakType of ['left_to_right', 'right_to_left', 'straight', 'multiple'] as const) {
    const breakData = puttStatsByBreak[breakType];
    if (breakData) {
      stats.puttingByBreak[breakType] = {
        totalPutts: breakData.attempts,
        makePct0_3: safePercent(breakData.make['0_3']?.made || 0, breakData.make['0_3']?.total || 0),
        makePct3_5: safePercent(breakData.make['3_5']?.made || 0, breakData.make['3_5']?.total || 0),
        makePct5_10: safePercent(breakData.make['5_10']?.made || 0, breakData.make['5_10']?.total || 0),
        makePct10_15: safePercent(breakData.make['10_15']?.made || 0, breakData.make['10_15']?.total || 0),
        makePct15_20: safePercent(breakData.make['15_20']?.made || 0, breakData.make['15_20']?.total || 0),
        makePct20_25: safePercent(breakData.make['20_25']?.made || 0, breakData.make['20_25']?.total || 0),
        makePct25_30: safePercent(breakData.make['25_30']?.made || 0, breakData.make['25_30']?.total || 0),
        makePct30_35: safePercent(breakData.make['30_35']?.made || 0, breakData.make['30_35']?.total || 0),
        makePct35Plus: safePercent(breakData.make['35_plus']?.made || 0, breakData.make['35_plus']?.total || 0),
        // FIX 3: per-cell attempt counts for every band the RampMatrix renders
        // (previously only count5_10 existed) — feeds both the matrix's n=
        // badge and the RxCard's n>=8 eligibility gate.
        count0_3: breakData.make['0_3']?.total || 0,
        count3_5: breakData.make['3_5']?.total || 0,
        count5_10: breakData.make['5_10']?.total || 0,
        count10_15: breakData.make['10_15']?.total || 0,
        count15_20: breakData.make['15_20']?.total || 0,
        count20_25: breakData.make['20_25']?.total || 0,
        count25_30: breakData.make['25_30']?.total || 0,
        count30_35: breakData.make['30_35']?.total || 0,
        count35Plus: breakData.make['35_plus']?.total || 0,
        overallMakePct: safePercent(breakData.makes, breakData.attempts),
        missShortPct: safePercent(breakData.missShort, breakData.missTotal),
        missLowPct: safePercent(breakData.missLow, breakData.missTotal),
        missHighPct: safePercent(breakData.missHigh, breakData.missTotal),
      };
    }
  }

  // Strokes Gained - only assign when we have valid data
  // Setting to null when no valid shots prevents misleading 0 values
  const hasSgData = sgTeeCount > 0 || sgApproachCount > 0 || sgAroundGreenCount > 0 || sgPuttingCount > 0;
  const sgTotal = sgTee + sgApproach + sgAroundGreen + sgPutting;

  stats.strokesGainedTotal = hasSgData ? sgTotal : null;
  stats.strokesGainedTee = sgTeeCount > 0 ? sgTee : null;
  stats.strokesGainedApproach = sgApproachCount > 0 ? sgApproach : null;
  stats.strokesGainedAroundGreen = sgAroundGreenCount > 0 ? sgAroundGreen : null;
  stats.strokesGainedPutting = sgPuttingCount > 0 ? sgPutting : null;

  // Strokes Gained per round - only calculate when we have valid data.
  // Denominator = rounds that actually contributed SG (roundsWithSg), matching
  // the DB cache (update_player_stats_strokes_gained divides every category by
  // COUNT of rounds with strokes_gained_total IS NOT NULL) — dividing by ALL
  // rounds in the window let shot-untracked rounds dilute the averages.
  //
  // Finding #8 (AUDIT-0724): this recomputes every shot's SG live, on every
  // call, against the CURRENT sg-benchmarks table. `golf_player_stats_cache
  // .sg_putting_per_round` instead sums the PERSISTED per-round
  // `golf_round_stats_cache.strokes_gained_putting` values (frozen at
  // whatever benchmark version was live when each round was scored/cached —
  // see update_player_stats_strokes_gained(p_player_id) in
  // 20260527000000_prod_public_baseline.sql:6631-6698) and divides by round
  // count. A ~0.03-stroke (~0.8%) gap between the two (e.g. -3.88 live vs
  // -3.91 cached) is therefore EXPECTED whenever the benchmark table has been
  // recalibrated since a round's cache row was last written (see the
  // 2026-06-06 SG recalibration) — it is not a bug in this function, and
  // recomputing live is the more accurate of the two. Do not silently swap
  // this to read the cache instead: that would trade "always current" for
  // "matches a possibly-stale snapshot." If exact parity with the cache is
  // ever required, the fix belongs in the caller (StatsBento.tsx's
  // Priorities panel) choosing to read golf_player_stats_cache directly for
  // that one figure, not here.
  stats.sgTeePerRound = sgTeeCount > 0 ? safeAverage(sgTee, roundsWithSg) : null;
  stats.sgApproachPerRound = sgApproachCount > 0 ? safeAverage(sgApproach, roundsWithSg) : null;
  stats.sgAroundGreenPerRound = sgAroundGreenCount > 0 ? safeAverage(sgAroundGreen, roundsWithSg) : null;
  stats.sgPuttingPerRound = sgPuttingCount > 0 ? safeAverage(sgPutting, roundsWithSg) : null;
  stats.sgTotalPerRound = hasSgData ? safeAverage(sgTotal, roundsWithSg) : null;

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
  // Map bucket names to stats property names
  const bucketToStatsKey: Record<string, keyof GolfStats> = {
    '30_75': 'approachEff30_75',
    '75_100': 'approachEff75_100',
    '100_125': 'approachEff100_125',
    '125_150': 'approachEff125_150',
    '150_175': 'approachEff150_175',
    '175_200': 'approachEff175_200',
    '200_225': 'approachEff200_225',
    '225_plus': 'approachEff225Plus',
  };

  for (const bucket of Object.keys(approachEffByDistanceLie)) {
    const statsKey = bucketToStatsKey[bucket];
    if (statsKey) {
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
        statsRecord[statsKey] = effData;
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

  // Short-game "Misses" tab (additive) — scrambling by lie, incl. counts +
  // the new fringe bucket.
  stats.scrambleFairwayAttempts = scrambleFairway.total;
  stats.scrambleFairwayMade = scrambleFairway.made;
  stats.scrambleRoughAttempts = scrambleRough.total;
  stats.scrambleRoughMade = scrambleRough.made;
  stats.scrambleSandAttempts = scrambleSand.total;
  stats.scrambleSandMade = scrambleSand.made;
  stats.scramblingPctFringe = safePercent(scrambleFringe.made, scrambleFringe.total);
  stats.scrambleFringeAttempts = scrambleFringe.total;
  stats.scrambleFringeMade = scrambleFringe.made;

  // Short-game "Misses" tab (additive) — scrambling by originating miss direction.
  stats.scramblingMissDirectionTotal = scrambleMissDirTotal;
  const missDirResult: GolfStats['scramblingByMissDirection'] = {};
  (['short', 'long', 'left', 'right'] as const).forEach((dir) => {
    const bucket = scrambleMissDir[dir];
    if (bucket.total > 0) {
      missDirResult[dir] = {
        attempts: bucket.total,
        made: bucket.made,
        pct: safePercent(bucket.made, bucket.total),
        shareOfMisses: safePercent(bucket.total, scrambleMissDirTotal),
      };
    }
  });
  stats.scramblingByMissDirection = missDirResult;

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

  // Short-game "Misses" tab (additive) — average chip/pitch proximity leave.
  stats.atgProximityAvg = safeAverage(
    atgProximities.reduce((a, b) => a + b, 0),
    atgProximities.length
  );
  stats.atgProximityByLie = {
    fairway: safeAverage(
      atgProximityByLie.fairway.reduce((a, b) => a + b, 0),
      atgProximityByLie.fairway.length
    ),
    rough: safeAverage(
      atgProximityByLie.rough.reduce((a, b) => a + b, 0),
      atgProximityByLie.rough.length
    ),
    sand: safeAverage(
      atgProximityByLie.sand.reduce((a, b) => a + b, 0),
      atgProximityByLie.sand.length
    ),
  };

  // Sand saves
  stats.sandSavePercentage = safePercent(stats.sandSavesMade, stats.sandSaveAttempts);

  // Penalties
  // 18-hole-normalized to match the DB cache (update_player_stats_complete:
  // total_penalties / total_holes * 18) and stat-formulas.computePerRound18.
  stats.penaltiesPerRound = stats.holesPlayed > 0
    ? Math.round(((stats.totalPenalties / stats.holesPlayed) * 18) * 100) / 100
    : null;

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
