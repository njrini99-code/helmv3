/**
 * Shared shot helper utilities used by both ShotTrackingComprehensive (client)
 * and golf.ts server actions.
 */
import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';

/**
 * Derive the lie_after value from a shot result.
 * Used when saving/updating shots to determine where the ball ended up.
 */
export function deriveLieAfterFromResult(result: string | null | undefined): string | null {
  if (!result) return null;
  const normalized = result.toLowerCase();
  switch (normalized) {
    case 'fairway':
      return 'fairway';
    case 'rough':
      return 'rough';
    case 'sand':
      return 'sand';
    case 'green':
    case 'hole':
      return 'green';
    case 'penalty':
      return 'penalty';
    case 'other':
      return 'rough';
    default:
      return null;
  }
}

/**
 * Derive the full lie_after for a shot, considering penalties and approach miss details.
 * Falls back to deriveLieAfterFromResult for simple cases.
 */
export function deriveLieAfter(shot: ShotRecord): string | null {
  if (shot.isPenalty || shot.result === 'penalty') return 'penalty';
  const approachLie = normalizeApproachMissLieType(shot.approachMissLieType);
  if (approachLie) return approachLie;
  return deriveLieAfterFromResult(shot.result);
}

/**
 * Normalize approach miss lie type from frontend values to DB values.
 */
function normalizeApproachMissLieType(
  lieType: ShotRecord['approachMissLieType']
): string | null {
  if (!lieType) return null;
  if (lieType === 'bunker') return 'sand';
  if (lieType === 'hazard') return 'other';
  return lieType;
}

// ============================================================================
// SHOT DISTANCE CALCULATION
// ============================================================================

/**
 * Calculates the actual shot distance based on miss direction.
 *
 * distanceToHoleAfter tells us how far the ball is from the hole,
 * but the DIRECTION tells us WHERE the ball is relative to the hole:
 *
 * - SHORT: Ball is between you and the hole → shot = before - after
 * - LONG: Ball went past the hole → shot = before + after
 * - LEFT/RIGHT: Ball is lateral to the hole at ~same depth → shot ≈ before
 * - SHORT_LEFT/SHORT_RIGHT: Diagonal short → shot ≈ before - (after * 0.7)
 * - LONG_LEFT/LONG_RIGHT: Diagonal long → shot ≈ before + (after * 0.7)
 *
 * The 0.7 factor approximates a 45-degree diagonal (cos(45°) ≈ 0.707)
 */
export function calculateShotDistanceWithDirection(
  distanceBeforeYards: number,
  distanceAfterYards: number,
  missDirection: string | null | undefined
): number {
  if (distanceAfterYards === 0) {
    return distanceBeforeYards;
  }

  if (!missDirection) {
    return Math.max(0, distanceBeforeYards - distanceAfterYards);
  }

  const direction = missDirection.toLowerCase();

  if (direction === 'long') {
    return distanceBeforeYards + distanceAfterYards;
  }

  if (direction === 'long_left' || direction === 'long_right') {
    return distanceBeforeYards + Math.round(distanceAfterYards * 0.7);
  }

  if (direction === 'short_left' || direction === 'short_right') {
    return Math.max(0, distanceBeforeYards - Math.round(distanceAfterYards * 0.7));
  }

  return Math.max(0, distanceBeforeYards - distanceAfterYards);
}

// ============================================================================
// LIE & STATE DERIVATION
// ============================================================================

export type LieType = 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';

/** Derive the current lie from a shot's result (for restoring position after undo/delete). */
export function lieFromShotResult(shot: ShotRecord): LieType {
  switch (shot.result) {
    case 'green': return 'green';
    case 'fairway': return 'fairway';
    case 'rough': return 'rough';
    case 'sand': return 'sand';
    case 'penalty': return (shot.lieBefore as Exclude<LieType, 'tee'>) || 'other';
    default: return 'other';
  }
}

// ============================================================================
// AUTO-SAVE FINGERPRINTING
// ============================================================================

/** Creates a compact fingerprint string for a shot array to detect changes. */
export function computeShotFingerprint(shots: ShotRecord[]): string {
  return JSON.stringify(
    shots.map(s => ({
      n: s.shotNumber,
      t: s.shotType,
      r: s.result,
      d: s.distanceToHoleAfter,
      db: s.distanceToHoleBefore,
      md: s.missDirection,
      pb: s.puttBreak,
      ps: s.puttSlope,
      ct: s.clubType,
      pt: s.penaltyType,
      pmt: s.puttMissTags,
      amd: s.approachMissDirection,
      amlt: s.approachMissLieType,
      sd: s.shotDistance,
      dub: s.distanceUnitBefore,
      dua: s.distanceUnitAfter,
      lb: s.lieBefore,
      ip: s.isPenalty,
    }))
  );
}

// ============================================================================
// HOLE STATS CALCULATION (shared between server page.tsx and client component)
// ============================================================================

// Hole type alias for the function signature
type StatsHole = Pick<RoundHole, 'number' | 'par' | 'yardage'>;

/**
 * Calculate comprehensive hole stats from shot records.
 * Pure function -- no React dependencies. Used by:
 *   - ShotTrackingComprehensive.tsx (client, on hole completion)
 *   - continue/[id]/page.tsx (server, reconstructing stats from DB shots)
 */
export function calculateHoleStats(shots: ShotRecord[], hole: StatsHole): HoleStats {
  const nonPenaltyShots = shots.filter(s => !s.isPenalty);
  const penaltyRecords = shots.filter(s => s.isPenalty).length;
  // Safety: if a shot has result='penalty' without a corresponding isPenalty record,
  // the penalty stroke is missing from shots.length — add it back
  const penaltyResults = shots.filter(s => s.result === 'penalty' && !s.isPenalty).length;
  const missingPenalties = Math.max(0, penaltyResults - penaltyRecords);
  const score = shots.length + missingPenalties;
  const putts = shots.filter(s => s.shotType === 'putting').length;
  const penalties = penaltyRecords + missingPenalties;

  // DRIVING STATS (Par 4/5 only)
  let fairwayHit: boolean | null = null;
  let drivingDistance: number | null = null;
  let driveMissDirection: string | null = null;
  let driverUsed: boolean | null = null;

  if (hole.par >= 4) {
    const teeShot = shots.find(s => s.shotType === 'tee' && !s.isPenalty);
    if (teeShot) {
      fairwayHit = teeShot.result === 'fairway';
      driveMissDirection = teeShot.missDirection || null;
      driverUsed = teeShot.clubType === 'driver';
      drivingDistance = teeShot.shotDistance;
    }
  }

  // APPROACH STATS
  let approachDistance: number | null = null;
  let approachLie: string | null = null;
  let approachProximity: number | null = null;
  let approachMissDir: string | null = null;

  const greenShotIndex = nonPenaltyShots.findIndex(s => s.result === 'green' || s.result === 'hole');
  if (greenShotIndex > 0 || (greenShotIndex === 0 && hole.par === 3)) {
    const approachShot = nonPenaltyShots[greenShotIndex];
    if (approachShot && approachShot.shotType !== 'putting') {
      approachDistance = approachShot.distanceUnitBefore === 'feet'
        ? Math.round(approachShot.distanceToHoleBefore / 3)
        : approachShot.distanceToHoleBefore;
      approachLie = approachShot.lieBefore;
      if (approachShot.result === 'green') {
        approachProximity = approachShot.distanceUnitAfter === 'yards'
          ? approachShot.distanceToHoleAfter * 3
          : approachShot.distanceToHoleAfter;
      }
      approachMissDir = approachShot.missDirection || null;
    }
  }

  // GREEN IN REGULATION
  // Must match server-side calculateGirFromShots() in golf.ts (source of truth for stored values)
  const shotsToGreen = hole.par - 2;
  const greenHitResults = ['green', 'hole', 'gir'];
  const shotsTakenToGreen = shots.findIndex(s => greenHitResults.includes(s.result));
  const greenInRegulation = shotsTakenToGreen !== -1 && (shotsTakenToGreen + 1) <= shotsToGreen;

  // SCRAMBLING
  const scrambleAttempt = !greenInRegulation && shotsTakenToGreen !== -1;
  const scrambleMade = scrambleAttempt && score <= hole.par;

  // SAND SAVE
  let sandSaveAttempt = false;
  let sandSaveMade = false;
  // Sand save only applies to greenside bunker shots, not fairway bunkers.
  // Only count around_green shots from sand (fairway bunker shots are 'approach' type).
  const sandShots = nonPenaltyShots.filter(s =>
    s.lieBefore === 'sand' && s.shotType === 'around_green'
  );
  if (sandShots.length > 0) {
    sandSaveAttempt = true;
    const sandShotIndex = nonPenaltyShots.findIndex(s => s === sandShots[0]);
    const shotsAfterSand = nonPenaltyShots.length - sandShotIndex;
    sandSaveMade = shotsAfterSand <= 2 && score <= hole.par;
  }

  // PUTTING STATS
  let firstPuttDistance: number | null = null;
  let firstPuttLeave: number | null = null;
  let firstPuttBreak: string | null = null;
  let firstPuttSlope: string | null = null;
  let firstPuttMissDirection: string | null = null;

  const puttingShots = nonPenaltyShots.filter(s => s.shotType === 'putting');
  if (puttingShots.length > 0) {
    const firstPutt = puttingShots[0]!;
    firstPuttDistance = firstPutt.distanceUnitBefore === 'yards'
      ? firstPutt.distanceToHoleBefore * 3
      : firstPutt.distanceToHoleBefore;
    firstPuttBreak = firstPutt.puttBreak || null;
    firstPuttSlope = firstPutt.puttSlope || null;
    if (firstPutt.result !== 'hole' && puttingShots.length > 1) {
      firstPuttLeave = firstPutt.distanceUnitAfter === 'yards'
        ? firstPutt.distanceToHoleAfter * 3
        : firstPutt.distanceToHoleAfter;
      firstPuttMissDirection = firstPutt.missDirection || null;
    }
  }

  // HOLE OUT STATS
  let holedOutDistance: number | null = null;
  let holedOutType: string | null = null;
  const holeOutShot = nonPenaltyShots.find(s => s.result === 'hole' && s.shotType !== 'putting');
  if (holeOutShot) {
    holedOutDistance = holeOutShot.distanceUnitBefore === 'feet'
      ? holeOutShot.distanceToHoleBefore
      : holeOutShot.distanceToHoleBefore * 3;
    holedOutType = holeOutShot.shotType;
  }

  return {
    holeNumber: hole.number,
    par: hole.par,
    yardage: hole.yardage,
    score,
    putts,
    fairwayHit,
    greenInRegulation,
    drivingDistance,
    usedDriver: driverUsed,
    driveMissDirection,
    approachDistance,
    approachLie,
    approachProximity,
    approachMissDirection: approachMissDir,
    scrambleAttempt,
    scrambleMade,
    sandSaveAttempt,
    sandSaveMade,
    penaltyStrokes: penalties,
    firstPuttDistance,
    firstPuttLeave,
    firstPuttBreak,
    firstPuttSlope,
    firstPuttMissDirection,
    holedOutDistance,
    holedOutType,
    shots,
  };
}
