import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadLatestEmergencySave,
  type EmergencySaveData,
} from './emergency-save';

const PREFIX = 'golf_emergency_save';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function savedRound(timestamp: number, roundId: string | null): EmergencySaveData {
  return {
    roundId,
    timestamp,
    setupData: {
      courseName: roundId ? 'Saved Course' : 'New Course',
      courseCity: '',
      courseState: '',
      courseRating: '',
      courseSlope: '',
      teesPlayed: 'White',
      roundType: 'practice',
      roundDate: '2026-08-22',
    },
    holes: [],
    completedHoleStats: [],
    inProgressShotsByHole: {},
    currentHoleIndex: 0,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

afterEach(() => {
  for (let index = globalThis.localStorage.length - 1; index >= 0; index -= 1) {
    const key = globalThis.localStorage.key(index);
    if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
  }
  vi.unstubAllGlobals();
});

describe('loadLatestEmergencySave', () => {
  it('finds the freshest valid save regardless of whether it has a server round ID', () => {
    const now = Date.now();
    const older = savedRound(now - 10_000, null);
    const latest = savedRound(now - 1_000, '00000000-0000-4000-8000-000000000001');

    localStorage.setItem(`${PREFIX}_new`, JSON.stringify(older));
    localStorage.setItem(`${PREFIX}_${latest.roundId}`, JSON.stringify(latest));

    expect(loadLatestEmergencySave()).toEqual(latest);
  });

  it('ignores expired saves instead of offering stale data for recovery', () => {
    const now = Date.now();
    const expired = savedRound(now - (25 * 60 * 60 * 1000), '00000000-0000-4000-8000-000000000002');
    const valid = savedRound(now - 1_000, null);

    localStorage.setItem(`${PREFIX}_${expired.roundId}`, JSON.stringify(expired));
    localStorage.setItem(`${PREFIX}_new`, JSON.stringify(valid));

    expect(loadLatestEmergencySave()).toEqual(valid);
  });
});
