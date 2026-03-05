/**
 * Shared shot helper utilities used by both ShotTrackingComprehensive (client)
 * and golf.ts server actions.
 */
import type { ShotRecord } from '@/lib/types/golf';

/**
 * Derive the lie_after value from a shot result.
 * Used when saving/updating shots to determine where the ball ended up.
 */
export function deriveLieAfterFromResult(result: string | null | undefined): string | null {
  if (!result) return null;
  switch (result) {
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
  if (lieType === 'hazard') return 'rough';
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
    }))
  );
}
