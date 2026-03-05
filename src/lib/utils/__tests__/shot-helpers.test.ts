import { describe, it, expect } from 'vitest';
import {
  deriveLieAfterFromResult,
  deriveLieAfter,
  calculateShotDistanceWithDirection,
  computeShotFingerprint,
  lieFromShotResult,
} from '../shot-helpers';
import type { ShotRecord } from '@/lib/types/golf';
import { makeShotRecord } from '@/test/fixtures/golf-shots';

// ============================================================================
// deriveLieAfterFromResult
// ============================================================================

describe('deriveLieAfterFromResult', () => {
  it('returns fairway for fairway result', () => {
    expect(deriveLieAfterFromResult('fairway')).toBe('fairway');
  });

  it('returns rough for rough result', () => {
    expect(deriveLieAfterFromResult('rough')).toBe('rough');
  });

  it('returns sand for sand result', () => {
    expect(deriveLieAfterFromResult('sand')).toBe('sand');
  });

  it('returns green for green result', () => {
    expect(deriveLieAfterFromResult('green')).toBe('green');
  });

  it('returns green for hole result', () => {
    expect(deriveLieAfterFromResult('hole')).toBe('green');
  });

  it('returns penalty for penalty result', () => {
    expect(deriveLieAfterFromResult('penalty')).toBe('penalty');
  });

  it('returns rough for other result', () => {
    expect(deriveLieAfterFromResult('other')).toBe('rough');
  });

  it('returns null for null input', () => {
    expect(deriveLieAfterFromResult(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(deriveLieAfterFromResult(undefined)).toBeNull();
  });

  it('returns null for unknown result', () => {
    expect(deriveLieAfterFromResult('unknown')).toBeNull();
  });
});

// ============================================================================
// deriveLieAfter
// ============================================================================

describe('deriveLieAfter', () => {
  const baseShot: ShotRecord = makeShotRecord({
    shotType: 'approach',
    clubType: 'non_driver',
    lieBefore: 'fairway',
    distanceToHoleBefore: 150,
    distanceUnitBefore: 'yards',
    result: 'green',
    distanceToHoleAfter: 20,
    distanceUnitAfter: 'feet',
    shotDistance: 150,
  });

  it('returns penalty for penalty shots', () => {
    const shot = { ...baseShot, isPenalty: true, result: 'penalty' as const };
    expect(deriveLieAfter(shot)).toBe('penalty');
  });

  it('returns penalty when result is penalty regardless of isPenalty flag', () => {
    const shot = { ...baseShot, result: 'penalty' as const };
    expect(deriveLieAfter(shot)).toBe('penalty');
  });

  it('normalizes bunker approach miss to sand', () => {
    const shot = { ...baseShot, result: 'rough' as const, approachMissLieType: 'bunker' as const };
    expect(deriveLieAfter(shot)).toBe('sand');
  });

  it('normalizes hazard approach miss to rough', () => {
    const shot = { ...baseShot, result: 'rough' as const, approachMissLieType: 'hazard' as const };
    expect(deriveLieAfter(shot)).toBe('rough');
  });

  it('passes through fairway approach miss', () => {
    const shot = { ...baseShot, result: 'rough' as const, approachMissLieType: 'fairway' as const };
    expect(deriveLieAfter(shot)).toBe('fairway');
  });

  it('falls back to result when no approach miss type', () => {
    expect(deriveLieAfter(baseShot)).toBe('green');
  });

  it('returns green for holed shots', () => {
    const shot = { ...baseShot, result: 'hole' as const };
    expect(deriveLieAfter(shot)).toBe('green');
  });
});

// ============================================================================
// calculateShotDistanceWithDirection
// ============================================================================

describe('calculateShotDistanceWithDirection', () => {
  it('returns distanceBefore when distanceAfter is 0 (holed)', () => {
    expect(calculateShotDistanceWithDirection(150, 0, null)).toBe(150);
  });

  it('returns distanceBefore when distanceAfter is 0 with direction', () => {
    expect(calculateShotDistanceWithDirection(150, 0, 'left')).toBe(150);
  });

  it('calculates before - after when no miss direction', () => {
    expect(calculateShotDistanceWithDirection(400, 150, null)).toBe(250);
  });

  it('calculates before - after when no miss direction (undefined)', () => {
    expect(calculateShotDistanceWithDirection(400, 150, undefined)).toBe(250);
  });

  it('returns 0 when after > before with no direction', () => {
    expect(calculateShotDistanceWithDirection(100, 200, null)).toBe(0);
  });

  // SHORT direction
  it('calculates SHORT: before - after', () => {
    expect(calculateShotDistanceWithDirection(400, 50, 'short')).toBe(350);
  });

  // LONG direction
  it('calculates LONG: before + after', () => {
    expect(calculateShotDistanceWithDirection(150, 10, 'long')).toBe(160);
  });

  // LEFT/RIGHT directions (same as short: before - after)
  it('calculates LEFT: before - after', () => {
    expect(calculateShotDistanceWithDirection(400, 30, 'left')).toBe(370);
  });

  it('calculates RIGHT: before - after', () => {
    expect(calculateShotDistanceWithDirection(400, 30, 'right')).toBe(370);
  });

  // SHORT_LEFT/SHORT_RIGHT
  it('calculates SHORT_LEFT: before - after', () => {
    expect(calculateShotDistanceWithDirection(400, 50, 'short_left')).toBe(350);
  });

  it('calculates SHORT_RIGHT: before - after', () => {
    expect(calculateShotDistanceWithDirection(400, 50, 'short_right')).toBe(350);
  });

  // LONG_LEFT/LONG_RIGHT (diagonal: before + after * 0.7)
  it('calculates LONG_LEFT: before + round(after * 0.7)', () => {
    expect(calculateShotDistanceWithDirection(150, 20, 'long_left')).toBe(150 + Math.round(20 * 0.7));
  });

  it('calculates LONG_RIGHT: before + round(after * 0.7)', () => {
    expect(calculateShotDistanceWithDirection(150, 20, 'long_right')).toBe(150 + Math.round(20 * 0.7));
  });

  // Case insensitivity
  it('handles uppercase direction', () => {
    expect(calculateShotDistanceWithDirection(150, 10, 'LONG')).toBe(160);
  });

  it('handles mixed case direction', () => {
    expect(calculateShotDistanceWithDirection(150, 10, 'Long')).toBe(160);
  });

  // Edge cases
  it('clamps to 0 when LEFT result would be negative', () => {
    expect(calculateShotDistanceWithDirection(10, 50, 'left')).toBe(0);
  });
});

// ============================================================================
// lieFromShotResult
// ============================================================================

describe('lieFromShotResult', () => {
  it('returns green for green result', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'green' }))).toBe('green');
  });

  it('returns fairway for fairway result', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'fairway' }))).toBe('fairway');
  });

  it('returns rough for rough result', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'rough' }))).toBe('rough');
  });

  it('returns sand for sand result', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'sand' }))).toBe('sand');
  });

  it('returns lieBefore for penalty result (preserves position)', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'penalty', lieBefore: 'fairway' }))).toBe('fairway');
  });

  it('returns lieBefore for penalty even when lieBefore is tee (cast passes)', () => {
    // The Exclude<LieType, 'tee'> cast still lets 'tee' through at runtime
    expect(lieFromShotResult(makeShotRecord({ result: 'penalty', lieBefore: 'tee' }))).toBe('tee');
  });

  it('returns other for hole result', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'hole' }))).toBe('other');
  });

  it('returns other for other result', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'other' }))).toBe('other');
  });
});

// ============================================================================
// computeShotFingerprint
// ============================================================================

describe('computeShotFingerprint', () => {
  it('returns consistent fingerprint for empty array', () => {
    expect(computeShotFingerprint([])).toBe('[]');
  });

  it('returns consistent fingerprint for same shots', () => {
    const shots = [makeShotRecord({ shotNumber: 1, result: 'fairway' })];
    const fp1 = computeShotFingerprint(shots);
    const fp2 = computeShotFingerprint(shots);
    expect(fp1).toBe(fp2);
  });

  it('detects change in result', () => {
    const shot1 = [makeShotRecord({ shotNumber: 1, result: 'fairway' })];
    const shot2 = [makeShotRecord({ shotNumber: 1, result: 'rough' })];
    expect(computeShotFingerprint(shot1)).not.toBe(computeShotFingerprint(shot2));
  });

  it('detects change in distance', () => {
    const shot1 = [makeShotRecord({ distanceToHoleAfter: 150 })];
    const shot2 = [makeShotRecord({ distanceToHoleAfter: 160 })];
    expect(computeShotFingerprint(shot1)).not.toBe(computeShotFingerprint(shot2));
  });

  it('detects additional shot added', () => {
    const base = makeShotRecord({ shotNumber: 1 });
    const extra = makeShotRecord({ shotNumber: 2 });
    expect(computeShotFingerprint([base])).not.toBe(computeShotFingerprint([base, extra]));
  });

  it('includes putt-specific fields', () => {
    const shot1 = [makeShotRecord({ puttBreak: 'left_to_right' })];
    const shot2 = [makeShotRecord({ puttBreak: 'right_to_left' })];
    expect(computeShotFingerprint(shot1)).not.toBe(computeShotFingerprint(shot2));
  });

  it('includes penalty type', () => {
    const shot1 = [makeShotRecord({ penaltyType: 'ob' })];
    const shot2 = [makeShotRecord({ penaltyType: 'water' })];
    expect(computeShotFingerprint(shot1)).not.toBe(computeShotFingerprint(shot2));
  });

  it('includes approach miss direction', () => {
    const shot1 = [makeShotRecord({ approachMissDirection: 'short' })];
    const shot2 = [makeShotRecord({ approachMissDirection: 'long' })];
    expect(computeShotFingerprint(shot1)).not.toBe(computeShotFingerprint(shot2));
  });

  it('produces different fingerprints for different shot order', () => {
    const a = makeShotRecord({ shotNumber: 1, result: 'fairway' });
    const b = makeShotRecord({ shotNumber: 2, result: 'green' });
    expect(computeShotFingerprint([a, b])).not.toBe(computeShotFingerprint([b, a]));
  });

  it('distinguishes distanceToHoleAfter 0 from undefined', () => {
    const shot0 = [makeShotRecord({ distanceToHoleAfter: 0 })];
    const shotUndef = [makeShotRecord({ distanceToHoleAfter: undefined as unknown as number })];
    expect(computeShotFingerprint(shot0)).not.toBe(computeShotFingerprint(shotUndef));
  });
});

// ============================================================================
// EDGE CASES: deriveLieAfterFromResult
// ============================================================================

describe('deriveLieAfterFromResult edge cases', () => {
  it('returns null for empty string', () => {
    expect(deriveLieAfterFromResult('')).toBeNull();
  });

  it('is case-sensitive (Fairway returns null)', () => {
    expect(deriveLieAfterFromResult('Fairway')).toBeNull();
  });

  it('is case-sensitive (PENALTY returns null)', () => {
    expect(deriveLieAfterFromResult('PENALTY')).toBeNull();
  });

  it('returns null for string with trailing space', () => {
    expect(deriveLieAfterFromResult('fairway ')).toBeNull();
  });
});

// ============================================================================
// EDGE CASES: deriveLieAfter
// ============================================================================

describe('deriveLieAfter edge cases', () => {
  const baseShot: ShotRecord = makeShotRecord({
    shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway',
    result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet', shotDistance: 150,
  });

  it('isPenalty takes precedence over approachMissLieType', () => {
    const shot = { ...baseShot, isPenalty: true, result: 'penalty' as const, approachMissLieType: 'bunker' as const };
    expect(deriveLieAfter(shot)).toBe('penalty');
  });

  it('result=penalty takes precedence over approachMissLieType', () => {
    const shot = { ...baseShot, result: 'penalty' as const, approachMissLieType: 'bunker' as const };
    expect(deriveLieAfter(shot)).toBe('penalty');
  });

  it('passes through rough approachMissLieType', () => {
    const shot = { ...baseShot, result: 'rough' as const, approachMissLieType: 'rough' as const };
    expect(deriveLieAfter(shot)).toBe('rough');
  });

  it('returns null when result is null and no approachMissLieType', () => {
    const shot = { ...baseShot, result: null as unknown as ShotRecord['result'] };
    expect(deriveLieAfter(shot)).toBeNull();
  });

  it('isPenalty true with non-penalty result still returns penalty', () => {
    const shot = { ...baseShot, isPenalty: true, result: 'fairway' as const };
    expect(deriveLieAfter(shot)).toBe('penalty');
  });
});

// ============================================================================
// EDGE CASES: calculateShotDistanceWithDirection
// ============================================================================

describe('calculateShotDistanceWithDirection edge cases', () => {
  it('both distances zero, no direction → 0', () => {
    expect(calculateShotDistanceWithDirection(0, 0, null)).toBe(0);
  });

  it('both distances zero, long direction → 0', () => {
    expect(calculateShotDistanceWithDirection(0, 0, 'long')).toBe(0);
  });

  it('zero before, non-zero after, long → 0 + after', () => {
    expect(calculateShotDistanceWithDirection(0, 100, 'long')).toBe(100);
  });

  it('very large distances', () => {
    expect(calculateShotDistanceWithDirection(10000, 200, 'long')).toBe(10200);
  });

  it('empty string direction falls through to default (before - after)', () => {
    expect(calculateShotDistanceWithDirection(150, 10, '')).toBe(140);
  });

  it('exact equal distances with short → 0', () => {
    expect(calculateShotDistanceWithDirection(100, 100, 'short')).toBe(0);
  });

  it('after > before with short → clamped to 0', () => {
    expect(calculateShotDistanceWithDirection(100, 150, 'short')).toBe(0);
  });

  it('floating point with long_left', () => {
    expect(calculateShotDistanceWithDirection(150, 20.5, 'long_left')).toBe(150 + Math.round(20.5 * 0.7));
  });

  it('spaces in direction name do not match (treated as default)', () => {
    expect(calculateShotDistanceWithDirection(150, 10, ' long ')).toBe(140);
  });
});

// ============================================================================
// EDGE CASES: lieFromShotResult
// ============================================================================

describe('lieFromShotResult edge cases', () => {
  it('penalty with lieBefore=rough returns rough', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'penalty', lieBefore: 'rough' }))).toBe('rough');
  });

  it('penalty with lieBefore=sand returns sand', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'penalty', lieBefore: 'sand' }))).toBe('sand');
  });

  it('penalty with lieBefore=green returns green', () => {
    expect(lieFromShotResult(makeShotRecord({ result: 'penalty', lieBefore: 'green' }))).toBe('green');
  });

  it('isPenalty flag is ignored (only result matters)', () => {
    // isPenalty=true but result='fairway' → uses result switch, returns fairway
    expect(lieFromShotResult(makeShotRecord({ result: 'fairway', isPenalty: true }))).toBe('fairway');
  });
});
