import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEmergencySaveThrough,
  emergencySave,
  isEmergencySaveEquivalentToProgress,
  loadEmergencySave,
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

describe('confirmed emergency saves', () => {
  it('removes a snapshot once that exact snapshot has been acknowledged', () => {
    const timestamp = Date.now();
    const save = savedRound(timestamp, '00000000-0000-4000-8000-000000000003');

    emergencySave(save);
    clearEmergencySaveThrough(save.roundId, timestamp);

    expect(loadEmergencySave(save.roundId)).toBeNull();
  });

  it('retains a newer snapshot written while an older save was in flight', () => {
    const roundId = '00000000-0000-4000-8000-000000000004';
    const acknowledgedAt = Date.now() - 1_000;
    const newerSave = savedRound(Date.now(), roundId);

    emergencySave(newerSave);
    clearEmergencySaveThrough(roundId, acknowledgedAt);

    expect(loadEmergencySave(roundId)).toEqual(newerSave);
  });

  it('recognizes matching server progress even when server shots have IDs', () => {
    const emergency = savedRound(Date.now(), '00000000-0000-4000-8000-000000000005');
    emergency.holes = [{ number: 1, par: 4, yardage: 410, score: 4 }];
    emergency.completedHoleStats = [{
      holeNumber: 1,
      par: 4,
      yardage: 410,
      score: 4,
      putts: 2,
      fairwayHit: true,
      greenInRegulation: true,
      drivingDistance: 280,
      usedDriver: true,
      driveMissDirection: null,
      approachDistance: 130,
      approachLie: 'fairway',
      approachProximity: 12,
      approachMissDirection: null,
      scrambleAttempt: false,
      scrambleMade: false,
      sandSaveAttempt: false,
      sandSaveMade: false,
      penaltyStrokes: 0,
      firstPuttDistance: 12,
      firstPuttLeave: 1,
      firstPuttBreak: 'straight',
      firstPuttSlope: 'level',
      firstPuttMissDirection: null,
      holedOutDistance: 1,
      holedOutType: 'putt',
      shots: [{
        shotNumber: 1,
        shotType: 'tee',
        clubType: 'driver',
        lieBefore: 'tee',
        distanceToHoleBefore: 410,
        distanceUnitBefore: 'yards',
        result: 'fairway',
        distanceToHoleAfter: 130,
        distanceUnitAfter: 'yards',
        shotDistance: 280,
        isPenalty: false,
      }],
    }];

    const serverProgress = structuredClone({
      holes: emergency.holes,
      completedHoleStats: emergency.completedHoleStats,
      inProgressShotsByHole: emergency.inProgressShotsByHole,
    });
    serverProgress.completedHoleStats[0]!.shots[0]!.id = 'server-generated-shot-id';

    expect(isEmergencySaveEquivalentToProgress(emergency, serverProgress)).toBe(true);
  });

  it('keeps recovery available whenever the local scorecard differs from the server', () => {
    const emergency = savedRound(Date.now(), '00000000-0000-4000-8000-000000000006');
    emergency.holes = [{ number: 1, par: 4, yardage: 410, score: 5 }];

    expect(isEmergencySaveEquivalentToProgress(emergency, {
      holes: [{ number: 1, par: 4, yardage: 410, score: 4 }],
      completedHoleStats: [],
      inProgressShotsByHole: {},
    })).toBe(false);
  });
});
