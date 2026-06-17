/**
 * Guards the "never-synced round" recovery breadcrumb's gating predicate.
 *
 * The banner must surface a `_new` localStorage emergencySave ONLY when it holds
 * real recoverable progress (a completed hole or in-progress shots) — never an
 * empty shell — so a booted player sees an honest path back to their round and
 * is never shown a fabricated/empty "resume".
 */
import { describe, it, expect } from 'vitest';
import { hasRecoverableData } from './FairwayUnsyncedRoundBanner';
import type { EmergencySaveData } from '@/lib/utils/emergency-save';

function make(partial: Partial<EmergencySaveData>): EmergencySaveData {
  return {
    roundId: null,
    timestamp: 1_700_000_000_000,
    setupData: {
      courseName: 'Test Course',
      courseCity: '',
      courseState: '',
      courseRating: '',
      courseSlope: '',
      teesPlayed: 'White',
      roundType: 'practice',
      roundDate: '2026-06-16',
    },
    holes: [],
    completedHoleStats: [],
    inProgressShotsByHole: {},
    currentHoleIndex: 0,
    ...partial,
  };
}

describe('hasRecoverableData', () => {
  it('returns false for null', () => {
    expect(hasRecoverableData(null)).toBe(false);
  });

  it('returns false for an empty save (no holes, no shots)', () => {
    expect(hasRecoverableData(make({}))).toBe(false);
  });

  it('returns false when completedHoleStats are all null (sparse shell)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sparse = [null, null, null] as any;
    expect(hasRecoverableData(make({ completedHoleStats: sparse }))).toBe(false);
  });

  it('returns false when inProgressShotsByHole holes are all empty arrays', () => {
    expect(hasRecoverableData(make({ inProgressShotsByHole: { 0: [], 3: [] } }))).toBe(false);
  });

  it('returns true when at least one hole is completed', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = [{ score: 4 }] as any;
    expect(hasRecoverableData(make({ completedHoleStats: stats }))).toBe(true);
  });

  it('returns true when a hole has in-progress shots', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shots = { 2: [{ shotNumber: 1 }] } as any;
    expect(hasRecoverableData(make({ inProgressShotsByHole: shots }))).toBe(true);
  });
});
