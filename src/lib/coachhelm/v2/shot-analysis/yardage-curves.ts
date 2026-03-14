/**
 * Yardage Performance Curves
 *
 * Builds per-player performance curves across yardage buckets and
 * identifies "dead zones" where a player significantly underperforms
 * their baseline.
 */

import type { ShotData, SGBaseline } from './shot-level-sg';
import { calculateShotSG } from './shot-level-sg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface YardageBucket {
  rangeStart: number;
  rangeEnd: number;
  shotCount: number;
  avgProximity: number;     // Average distance to hole after shot (feet)
  avgSG: number;
  greenHitRate: number;     // For approach shots
}

export interface YardageCurve {
  playerId: string;
  buckets: YardageBucket[];
}

export interface DeadZone {
  rangeStart: number;
  rangeEnd: number;
  playerAvgSG: number;
  baselineAvgSG: number;
  deficit: number;          // How much worse than baseline
  shotCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGreenHit(shot: ShotData): boolean {
  if (shot.result === 'green_hit') return true;
  if (shot.lieAfter === 'green') return true;
  return false;
}

function yardsToFeet(yards: number): number {
  return yards * 3;
}

// ---------------------------------------------------------------------------
// Build yardage curve
// ---------------------------------------------------------------------------

/**
 * Build a yardage performance curve from shot data.
 * Groups shots into buckets of `bucketSize` yards (default 25)
 * and calculates performance metrics for each bucket.
 */
export function buildYardageCurve(
  shots: ShotData[],
  baseline: SGBaseline,
  bucketSize = 25,
  playerId = '',
): YardageCurve {
  // Build dynamic buckets up to a reasonable max
  const maxDistance = 300;
  const bucketDefs: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < maxDistance; start += bucketSize) {
    bucketDefs.push({ start, end: start + bucketSize });
  }

  const bucketMap = new Map<
    number,
    {
      start: number;
      end: number;
      sgValues: number[];
      proximities: number[];
      greenHits: number;
      totalApproach: number;
    }
  >();

  for (const def of bucketDefs) {
    bucketMap.set(def.start, {
      start: def.start,
      end: def.end,
      sgValues: [],
      proximities: [],
      greenHits: 0,
      totalApproach: 0,
    });
  }

  for (const shot of shots) {
    // Find the right bucket
    const bucketStart =
      Math.floor(shot.distanceBefore / bucketSize) * bucketSize;
    let entry = bucketMap.get(bucketStart);
    if (!entry) {
      // Beyond our max — put in the last bucket
      const lastStart = (Math.floor((maxDistance - 1) / bucketSize)) * bucketSize;
      entry = bucketMap.get(lastStart);
      if (!entry) continue;
    }

    const sg = calculateShotSG(
      shot.distanceBefore,
      shot.lieBefore,
      shot.distanceAfter,
      shot.lieAfter,
      baseline,
    );
    entry.sgValues.push(sg);
    entry.proximities.push(yardsToFeet(shot.distanceAfter));

    // Count approach shots and green hits
    if (shot.lieBefore !== 'green') {
      entry.totalApproach++;
      if (isGreenHit(shot)) {
        entry.greenHits++;
      }
    }
  }

  const buckets: YardageBucket[] = [];
  for (const def of bucketDefs) {
    const entry = bucketMap.get(def.start);
    if (!entry || entry.sgValues.length === 0) continue;

    const shotCount = entry.sgValues.length;
    const avgSG = entry.sgValues.reduce((a, b) => a + b, 0) / shotCount;
    const avgProximity =
      entry.proximities.reduce((a, b) => a + b, 0) / shotCount;
    const greenHitRate =
      entry.totalApproach > 0
        ? entry.greenHits / entry.totalApproach
        : 0;

    buckets.push({
      rangeStart: entry.start,
      rangeEnd: entry.end,
      shotCount,
      avgProximity,
      avgSG,
      greenHitRate,
    });
  }

  return { playerId, buckets };
}

// ---------------------------------------------------------------------------
// Dead zone detection
// ---------------------------------------------------------------------------

/**
 * Find yardage ranges where the player significantly underperforms
 * compared to a baseline curve.
 *
 * A dead zone is identified when:
 * - Player SG is worse than baseline SG by more than `threshold` (default 0.3)
 * - The bucket has at least `minShots` (default 10) shots
 */
export function findDeadZones(
  playerCurve: YardageCurve,
  baselineCurve: YardageCurve,
  threshold = 0.3,
  minShots = 10,
): DeadZone[] {
  const baselineMap = new Map<number, YardageBucket>();
  for (const b of baselineCurve.buckets) {
    baselineMap.set(b.rangeStart, b);
  }

  const deadZones: DeadZone[] = [];

  for (const playerBucket of playerCurve.buckets) {
    if (playerBucket.shotCount < minShots) continue;

    const baselineBucket = baselineMap.get(playerBucket.rangeStart);
    if (!baselineBucket) continue;

    const deficit = baselineBucket.avgSG - playerBucket.avgSG;
    if (deficit > threshold) {
      deadZones.push({
        rangeStart: playerBucket.rangeStart,
        rangeEnd: playerBucket.rangeEnd,
        playerAvgSG: playerBucket.avgSG,
        baselineAvgSG: baselineBucket.avgSG,
        deficit,
        shotCount: playerBucket.shotCount,
      });
    }
  }

  // Sort by deficit descending (biggest weakness first)
  deadZones.sort((a, b) => b.deficit - a.deficit);

  return deadZones;
}

// ---------------------------------------------------------------------------
// Curve comparison
// ---------------------------------------------------------------------------

/**
 * Compare a player's yardage curve against a baseline curve,
 * returning per-bucket deltas.
 */
export function compareYardageCurves(
  player: YardageCurve,
  baseline: YardageCurve,
): Array<{ range: string; playerSG: number; baselineSG: number; delta: number }> {
  const baselineMap = new Map<number, YardageBucket>();
  for (const b of baseline.buckets) {
    baselineMap.set(b.rangeStart, b);
  }

  const comparisons: Array<{
    range: string;
    playerSG: number;
    baselineSG: number;
    delta: number;
  }> = [];

  for (const playerBucket of player.buckets) {
    const baselineBucket = baselineMap.get(playerBucket.rangeStart);
    const baselineSG = baselineBucket?.avgSG ?? 0;
    const delta = playerBucket.avgSG - baselineSG;

    comparisons.push({
      range: `${playerBucket.rangeStart}-${playerBucket.rangeEnd}`,
      playerSG: playerBucket.avgSG,
      baselineSG,
      delta,
    });
  }

  return comparisons;
}
