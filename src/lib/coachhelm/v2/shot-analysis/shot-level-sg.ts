/**
 * Shot-Level Strokes Gained
 *
 * Calculates strokes gained at the individual shot level using
 * baseline expected strokes from each lie/distance state.
 *
 * SG = baseline_from_start - (1 + baseline_from_end)
 * If the shot goes in the hole, baseline_from_end = 0.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShotData {
  id: string;
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  lieBefore: string;        // tee, fairway, rough, sand, recovery, green
  distanceBefore: number;   // yards to hole
  lieAfter: string;
  distanceAfter: number;
  club?: string;
  result?: string;          // fairway_hit, green_hit, in_hole, etc.
}

export interface SGBaseline {
  /** Average strokes to hole from each starting state.
   *  Key format: "{lie}_{distanceBucket}" e.g. "fairway_150" */
  strokesToHole: Record<string, number>;
}

export interface ShotContextAnalysis {
  context: string;          // "fairway_150-175"
  lie: string;
  distanceRange: string;
  shotCount: number;
  avgSG: number;
  baselineAvg: number;
  playerAvg: number;
  delta: number;            // playerAvg - baselineAvg (negative = losing strokes)
}

// ---------------------------------------------------------------------------
// Distance buckets
// ---------------------------------------------------------------------------

const DISTANCE_BUCKETS = [
  { min: 0, max: 25, label: '0-25' },
  { min: 25, max: 50, label: '25-50' },
  { min: 50, max: 75, label: '50-75' },
  { min: 75, max: 100, label: '75-100' },
  { min: 100, max: 125, label: '100-125' },
  { min: 125, max: 150, label: '125-150' },
  { min: 150, max: 175, label: '150-175' },
  { min: 175, max: 200, label: '175-200' },
  { min: 200, max: 225, label: '200-225' },
  { min: 225, max: 250, label: '225-250' },
  { min: 250, max: Infinity, label: '250+' },
] as const;

function getBucket(distance: number): (typeof DISTANCE_BUCKETS)[number] {
  for (const bucket of DISTANCE_BUCKETS) {
    if (distance >= bucket.min && distance < bucket.max) return bucket;
  }
  return DISTANCE_BUCKETS[DISTANCE_BUCKETS.length - 1];
}

function baselineKey(lie: string, distance: number): string {
  const bucket = getBucket(distance);
  return `${lie}_${bucket.label}`;
}

// ---------------------------------------------------------------------------
// Baseline lookup helper
// ---------------------------------------------------------------------------

function lookupBaseline(baseline: SGBaseline, lie: string, distance: number): number {
  const key = baselineKey(lie, distance);
  if (key in baseline.strokesToHole) {
    return baseline.strokesToHole[key];
  }
  // Fallback: try just the distance bucket with a generic lie
  const bucket = getBucket(distance);
  const fallbackKey = `fairway_${bucket.label}`;
  if (fallbackKey in baseline.strokesToHole) {
    return baseline.strokesToHole[fallbackKey];
  }
  // Last resort: rough estimate based on distance
  return 1.0 + distance / 100;
}

// ---------------------------------------------------------------------------
// Core SG calculation
// ---------------------------------------------------------------------------

/**
 * Calculate strokes gained for a single shot.
 *
 * SG = baseline_strokes_from_start - (1 + baseline_strokes_from_end)
 * If the ball is holed, baseline_strokes_from_end = 0.
 */
export function calculateShotSG(
  distanceBefore: number,
  lieBefore: string,
  distanceAfter: number,
  lieAfter: string,
  baseline: SGBaseline,
): number {
  const baselineStart = lookupBaseline(baseline, lieBefore, distanceBefore);

  // If the ball went in the hole, end baseline is 0
  const isHoled = distanceAfter === 0;
  const baselineEnd = isHoled ? 0 : lookupBaseline(baseline, lieAfter, distanceAfter);

  return baselineStart - (1 + baselineEnd);
}

// ---------------------------------------------------------------------------
// Default baseline (D2/D3 college golf averages)
// ---------------------------------------------------------------------------

/**
 * Build a default SGBaseline using reasonable D2/D3 college golf averages.
 *
 * These represent the average number of strokes to hole out from each
 * lie + distance state. Values are approximate and derived from common
 * amateur/college benchmarks.
 */
export function buildDefaultBaseline(): SGBaseline {
  const strokesToHole: Record<string, number> = {};

  // ---- Tee ----
  strokesToHole['tee_0-25'] = 2.40;
  strokesToHole['tee_25-50'] = 2.65;
  strokesToHole['tee_50-75'] = 2.80;
  strokesToHole['tee_75-100'] = 2.92;
  strokesToHole['tee_100-125'] = 3.00;
  strokesToHole['tee_125-150'] = 3.10;
  strokesToHole['tee_150-175'] = 3.20;
  strokesToHole['tee_175-200'] = 3.35;
  strokesToHole['tee_200-225'] = 3.50;
  strokesToHole['tee_225-250'] = 3.70;
  strokesToHole['tee_250+'] = 4.10;

  // ---- Fairway ----
  strokesToHole['fairway_0-25'] = 2.30;
  strokesToHole['fairway_25-50'] = 2.55;
  strokesToHole['fairway_50-75'] = 2.72;
  strokesToHole['fairway_75-100'] = 2.86;
  strokesToHole['fairway_100-125'] = 2.95;
  strokesToHole['fairway_125-150'] = 3.05;
  strokesToHole['fairway_150-175'] = 3.18;
  strokesToHole['fairway_175-200'] = 3.32;
  strokesToHole['fairway_200-225'] = 3.50;
  strokesToHole['fairway_225-250'] = 3.70;
  strokesToHole['fairway_250+'] = 4.08;

  // ---- Rough ----
  strokesToHole['rough_0-25'] = 2.50;
  strokesToHole['rough_25-50'] = 2.75;
  strokesToHole['rough_50-75'] = 2.95;
  strokesToHole['rough_75-100'] = 3.10;
  strokesToHole['rough_100-125'] = 3.25;
  strokesToHole['rough_125-150'] = 3.40;
  strokesToHole['rough_150-175'] = 3.55;
  strokesToHole['rough_175-200'] = 3.72;
  strokesToHole['rough_200-225'] = 3.92;
  strokesToHole['rough_225-250'] = 4.12;
  strokesToHole['rough_250+'] = 4.40;

  // ---- Sand ----
  strokesToHole['sand_0-25'] = 2.55;
  strokesToHole['sand_25-50'] = 2.90;
  strokesToHole['sand_50-75'] = 3.15;
  strokesToHole['sand_75-100'] = 3.40;
  strokesToHole['sand_100-125'] = 3.60;
  strokesToHole['sand_125-150'] = 3.80;
  strokesToHole['sand_150-175'] = 4.00;
  strokesToHole['sand_175-200'] = 4.20;
  strokesToHole['sand_200-225'] = 4.45;
  strokesToHole['sand_225-250'] = 4.65;
  strokesToHole['sand_250+'] = 4.90;

  // ---- Recovery (trees, deep trouble) ----
  strokesToHole['recovery_0-25'] = 2.70;
  strokesToHole['recovery_25-50'] = 3.00;
  strokesToHole['recovery_50-75'] = 3.25;
  strokesToHole['recovery_75-100'] = 3.50;
  strokesToHole['recovery_100-125'] = 3.75;
  strokesToHole['recovery_125-150'] = 3.95;
  strokesToHole['recovery_150-175'] = 4.15;
  strokesToHole['recovery_175-200'] = 4.35;
  strokesToHole['recovery_200-225'] = 4.55;
  strokesToHole['recovery_225-250'] = 4.75;
  strokesToHole['recovery_250+'] = 5.00;

  // ---- Green (putting) — distance in yards, converted from feet mentally ----
  // 0-25 yards on the green covers most putts (up to 75 feet)
  strokesToHole['green_0-25'] = 1.80;
  strokesToHole['green_25-50'] = 2.20;
  strokesToHole['green_50-75'] = 2.50;
  strokesToHole['green_75-100'] = 2.80;
  // Longer distances on the green are unusual but can happen on large greens
  strokesToHole['green_100-125'] = 3.00;
  strokesToHole['green_125-150'] = 3.10;
  strokesToHole['green_150-175'] = 3.20;
  strokesToHole['green_175-200'] = 3.30;
  strokesToHole['green_200-225'] = 3.40;
  strokesToHole['green_225-250'] = 3.50;
  strokesToHole['green_250+'] = 3.60;

  return { strokesToHole };
}

// ---------------------------------------------------------------------------
// Context analysis
// ---------------------------------------------------------------------------

/**
 * Group shots by lie + distance bucket and calculate SG statistics
 * for each context group.
 */
export function analyzeShotsByContext(
  shots: ShotData[],
  baseline: SGBaseline,
): ShotContextAnalysis[] {
  // Group shots by context key
  const groups = new Map<string, { shots: ShotData[]; sgValues: number[] }>();

  for (const shot of shots) {
    const bucket = getBucket(shot.distanceBefore);
    const key = `${shot.lieBefore}_${bucket.label}`;

    let group = groups.get(key);
    if (!group) {
      group = { shots: [], sgValues: [] };
      groups.set(key, group);
    }
    group.shots.push(shot);

    const sg = calculateShotSG(
      shot.distanceBefore,
      shot.lieBefore,
      shot.distanceAfter,
      shot.lieAfter,
      baseline,
    );
    group.sgValues.push(sg);
  }

  // Build analyses
  const analyses: ShotContextAnalysis[] = [];

  groups.forEach((group, key) => {
    const [lie, ...rangeParts] = key.split('_');
    const distanceRange = rangeParts.join('_');

    const shotCount = group.sgValues.length;
    const avgSG = group.sgValues.reduce((a, b) => a + b, 0) / shotCount;

    // Baseline average strokes from this state
    const baselineAvg = lookupBaseline(baseline, lie, group.shots[0].distanceBefore);

    // Player actual average strokes from this state
    // playerAvg = baselineAvg - avgSG (because SG = baseline - actual cost)
    const playerAvg = baselineAvg - avgSG;

    // Delta = how many more strokes the player takes vs baseline (positive = worse)
    const delta = playerAvg - baselineAvg;

    analyses.push({
      context: `${lie}_${distanceRange}`,
      lie,
      distanceRange,
      shotCount,
      avgSG,
      baselineAvg,
      playerAvg,
      delta,
    });
  });

  return analyses;
}

// ---------------------------------------------------------------------------
// Weakness ranking
// ---------------------------------------------------------------------------

/**
 * Rank contexts where the player loses the most strokes to baseline.
 * Sorted by delta (most negative SG / most positive delta first),
 * filtered by minimum shot count.
 */
export function rankWeaknessContexts(
  analyses: ShotContextAnalysis[],
  minShotCount = 10,
): ShotContextAnalysis[] {
  return analyses
    .filter((a) => a.shotCount >= minShotCount)
    .sort((a, b) => a.avgSG - b.avgSG); // Most negative SG first (biggest weakness)
}
