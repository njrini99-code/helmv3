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
// Distance buckets (yards — for non-green lies)
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
  // Fallback: last bucket (250+) — DISTANCE_BUCKETS is non-empty so this is safe.
  const last = DISTANCE_BUCKETS[DISTANCE_BUCKETS.length - 1];
  return last ?? DISTANCE_BUCKETS[0]!;
}

// ---------------------------------------------------------------------------
// Green distance buckets (feet — for putting)
// ---------------------------------------------------------------------------

function getGreenDistanceBucket(distanceFeet: number): string {
  if (distanceFeet <= 3) return '0-3';
  if (distanceFeet <= 5) return '3-5';
  if (distanceFeet <= 10) return '5-10';
  if (distanceFeet <= 15) return '10-15';
  if (distanceFeet <= 20) return '15-20';
  if (distanceFeet <= 30) return '20-30';
  if (distanceFeet <= 50) return '30-50';
  return '50+';
}

function baselineKey(lie: string, distance: number): string {
  if (lie === 'green') {
    return `green_${getGreenDistanceBucket(distance)}`;
  }
  const bucket = getBucket(distance);
  return `${lie}_${bucket.label}`;
}

// ---------------------------------------------------------------------------
// Baseline lookup helper
// ---------------------------------------------------------------------------

function lookupBaseline(baseline: SGBaseline, lie: string, distance: number): number {
  const key = baselineKey(lie, distance);
  const primary = baseline.strokesToHole[key];
  if (primary !== undefined) {
    return primary;
  }
  // Fallback: try just the distance bucket with a generic lie
  const bucket = getBucket(distance);
  const fallbackKey = `fairway_${bucket.label}`;
  const fallback = baseline.strokesToHole[fallbackKey];
  if (fallback !== undefined) {
    return fallback;
  }
  // Last resort: rough estimate based on distance
  return 1.0 + distance / 100;
}

// ---------------------------------------------------------------------------
// Core SG calculation
// ---------------------------------------------------------------------------

/**
 * Detect whether a shot is holed based on unambiguous signals.
 *
 * Task B15: prior \`calculateShotSG\` inferred "holed" solely from
 * \`distanceAfter === 0\`, which collided with null/undefined distances
 * (coerced to 0 in some code paths) and with tap-in shots logged with
 * distanceAfter=0 but not actually holed. Null/undefined distanceAfter
 * returns false (unknown state, not holed); explicit signals are
 * \`result === 'hole'\` or \`lieAfter === 'hole'\`.
 */
export function detectHoled(args: {
  distanceAfter?: number | null;
  lieAfter?: string | null;
  result?: string | null;
}): boolean {
  if (args.result === 'hole') return true;
  if (args.lieAfter === 'hole') return true;
  return false;
}

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
  result?: string | null,
): number {
  const baselineStart = lookupBaseline(baseline, lieBefore, distanceBefore);

  // Unambiguous holed signals only (B15).
  const isHoled = detectHoled({ distanceAfter, lieAfter, result });
  const baselineEnd = isHoled ? 0 : lookupBaseline(baseline, lieAfter, distanceAfter);

  return baselineStart - (1 + baselineEnd);
}

// ---------------------------------------------------------------------------
// Default baseline (Broadie PGA Tour expected-strokes scale — see docstring)
// ---------------------------------------------------------------------------

/**
 * Build a default SGBaseline on the Broadie PGA Tour expected-strokes scale.
 *
 * Each value is the expected strokes to hole out from that lie+distance bucket,
 * taken at the bucket's representative distance from the canonical Broadie
 * "Every Shot Counts" / ShotLink curve — the SAME benchmark as the DB function
 * public.sg_expected_strokes() and PGA_BASELINE_DATA in
 * src/lib/golf/strokes-gained.ts. Previously this used a separate, divergent
 * "D2/D3 college" table whose tee values were ~0.4 too high and green values
 * too low, which biased the v2 yardage-curve dead-zone detection. Keeping all
 * three SG engines on one benchmark prevents re-divergence. See migration
 * 20260606140000_fix_sg_expected_strokes_baseline_calibration.sql.
 */
export function buildDefaultBaseline(): SGBaseline {
  const strokesToHole: Record<string, number> = {};

  // ---- Tee (par-4/5 driving + par-3/short tee shots) ----
  strokesToHole['tee_0-25'] = 2.78;
  strokesToHole['tee_25-50'] = 2.78;
  strokesToHole['tee_50-75'] = 2.78;
  strokesToHole['tee_75-100'] = 2.80;
  strokesToHole['tee_100-125'] = 2.86;
  strokesToHole['tee_125-150'] = 2.92;
  strokesToHole['tee_150-175'] = 2.99;
  strokesToHole['tee_175-200'] = 3.08;
  strokesToHole['tee_200-225'] = 3.16;
  strokesToHole['tee_225-250'] = 3.24;
  strokesToHole['tee_250+'] = 3.60;

  // ---- Fairway ----
  strokesToHole['fairway_0-25'] = 2.41;
  strokesToHole['fairway_25-50'] = 2.50;
  strokesToHole['fairway_50-75'] = 2.64;
  strokesToHole['fairway_75-100'] = 2.77;
  strokesToHole['fairway_100-125'] = 2.84;
  strokesToHole['fairway_125-150'] = 2.91;
  strokesToHole['fairway_150-175'] = 3.00;
  strokesToHole['fairway_175-200'] = 3.12;
  strokesToHole['fairway_200-225'] = 3.27;
  strokesToHole['fairway_225-250'] = 3.43;
  strokesToHole['fairway_250+'] = 3.62;

  // ---- Rough ----
  strokesToHole['rough_0-25'] = 2.62;
  strokesToHole['rough_25-50'] = 2.72;
  strokesToHole['rough_50-75'] = 2.84;
  strokesToHole['rough_75-100'] = 2.96;
  strokesToHole['rough_100-125'] = 3.08;
  strokesToHole['rough_125-150'] = 3.18;
  strokesToHole['rough_150-175'] = 3.28;
  strokesToHole['rough_175-200'] = 3.39;
  strokesToHole['rough_200-225'] = 3.49;
  strokesToHole['rough_225-250'] = 3.62;
  strokesToHole['rough_250+'] = 3.80;

  // ---- Sand ----
  strokesToHole['sand_0-25'] = 2.55;
  strokesToHole['sand_25-50'] = 2.72;
  strokesToHole['sand_50-75'] = 2.92;
  strokesToHole['sand_75-100'] = 3.13;
  strokesToHole['sand_100-125'] = 3.28;
  strokesToHole['sand_125-150'] = 3.36;
  strokesToHole['sand_150-175'] = 3.44;
  strokesToHole['sand_175-200'] = 3.52;
  strokesToHole['sand_200-225'] = 3.64;
  strokesToHole['sand_225-250'] = 3.82;
  strokesToHole['sand_250+'] = 3.96;

  // ---- Recovery (trees, deep trouble) ----
  strokesToHole['recovery_0-25'] = 2.80;
  strokesToHole['recovery_25-50'] = 3.10;
  strokesToHole['recovery_50-75'] = 3.40;
  strokesToHole['recovery_75-100'] = 3.70;
  strokesToHole['recovery_100-125'] = 3.81;
  strokesToHole['recovery_125-150'] = 3.83;
  strokesToHole['recovery_150-175'] = 3.85;
  strokesToHole['recovery_175-200'] = 3.87;
  strokesToHole['recovery_200-225'] = 3.90;
  strokesToHole['recovery_225-250'] = 3.96;
  strokesToHole['recovery_250+'] = 4.10;

  // ---- Green (putting) — uses FEET, not yards ----
  // Broadie Tour expected putts at each bucket's representative distance.
  strokesToHole['green_0-3'] = 1.02;    // Tap-in
  strokesToHole['green_3-5'] = 1.13;    // Short putt
  strokesToHole['green_5-10'] = 1.45;   // Makeable
  strokesToHole['green_10-15'] = 1.71;  // Mid-range
  strokesToHole['green_15-20'] = 1.83;  // Longer
  strokesToHole['green_20-30'] = 1.93;  // Long putt
  strokesToHole['green_30-50'] = 2.06;  // Lag putt
  strokesToHole['green_50+'] = 2.21;    // Very long lag

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
    const bucketLabel = shot.lieBefore === 'green'
      ? getGreenDistanceBucket(shot.distanceBefore)
      : getBucket(shot.distanceBefore).label;
    const key = `${shot.lieBefore}_${bucketLabel}`;

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
      shot.result,
    );
    group.sgValues.push(sg);
  }

  // Build analyses
  const analyses: ShotContextAnalysis[] = [];

  groups.forEach((group, key) => {
    const [lie, ...rangeParts] = key.split('_');
    const distanceRange = rangeParts.join('_');
    const firstShot = group.shots[0];
    if (!lie || !firstShot) return;

    const shotCount = group.sgValues.length;
    const avgSG = group.sgValues.reduce((a, b) => a + b, 0) / shotCount;

    // Baseline average strokes from this state
    const baselineAvg = lookupBaseline(baseline, lie, firstShot.distanceBefore);

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
