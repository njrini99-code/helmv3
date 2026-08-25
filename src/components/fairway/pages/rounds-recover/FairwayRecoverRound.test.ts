/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { getEmergencySavesFromLocalStorage } from './FairwayRecoverRound';

afterEach(() => localStorage.clear());

describe('getEmergencySavesFromLocalStorage', () => {
  it('offers a valid older emergency save for recovery', () => {
    localStorage.setItem('golf_emergency_save_round-1', JSON.stringify({
      timestamp: Date.now() - 48 * 60 * 60 * 1000,
      setupData: { courseName: 'Test Course', roundDate: '2026-08-01', roundType: 'practice' },
      completedHoleStats: [{ score: 4 }],
      holes: [],
      currentHoleIndex: 1,
    }));

    expect(getEmergencySavesFromLocalStorage()).toEqual([
      expect.objectContaining({
        id: 'localStorage_round-1',
        storageSource: 'localstorage',
      }),
    ]);
  });
});
