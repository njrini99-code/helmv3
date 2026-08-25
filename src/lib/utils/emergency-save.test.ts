/**
 * @vitest-environment jsdom
 *
 * A local emergency copy is a recovery artifact, not a cache.  It remains
 * eligible until the player explicitly discards the round or the server
 * confirms completion.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearEmergencySave, emergencySave, loadEmergencySave, type EmergencySaveData } from './emergency-save';

function savedRound(timestamp: number): EmergencySaveData {
  return {
    roundId: 'round-1',
    timestamp,
    setupData: {
      courseName: 'Test Course',
      courseCity: '',
      courseState: '',
      courseRating: '',
      courseSlope: '',
      teesPlayed: 'Blue',
      roundType: 'practice',
      roundDate: '2026-08-01',
    },
    holes: [],
    completedHoleStats: [{ holeNumber: 1, par: 4, score: 4 } as EmergencySaveData['completedHoleStats'][number]],
    inProgressShotsByHole: {},
    currentHoleIndex: 1,
  };
}

afterEach(() => {
  clearEmergencySave('round-1');
  clearEmergencySave(null);
});

describe('emergency saves', () => {
  it('keeps a valid older save recoverable instead of silently expiring it', () => {
    expect(emergencySave(savedRound(Date.now() - 48 * 60 * 60 * 1000))).toBe(true);

    expect(loadEmergencySave('round-1')).toMatchObject({
      roundId: 'round-1',
      currentHoleIndex: 1,
    });
  });
});
