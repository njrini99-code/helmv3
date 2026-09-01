import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEmergencySaveThrough,
  emergencySave,
  isEmergencySaveEquivalentToProgress,
  isRecoverableRoundSubmitError,
  loadEmergencySave,
  loadLatestEmergencySave,
  migrateEmergencySave,
  type EmergencySaveData,
} from './emergency-save';

const PREFIX = 'golf_emergency_save';
const PLAYER_ID = '00000000-0000-4000-8000-000000000099';
const OTHER_PLAYER_ID = '00000000-0000-4000-8000-000000000100';

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
    playerId: PLAYER_ID,
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

    emergencySave(older);
    emergencySave(latest);

    expect(loadLatestEmergencySave(PLAYER_ID)).toEqual(latest);
  });

  it('keeps unfinished saves recoverable even after more than a day', () => {
    const now = Date.now();
    const earlier = savedRound(now - (25 * 60 * 60 * 1000), '00000000-0000-4000-8000-000000000002');
    const valid = savedRound(now - 1_000, null);

    emergencySave(earlier);
    emergencySave(valid);

    expect(loadLatestEmergencySave(PLAYER_ID)).toEqual(valid);
    expect(loadEmergencySave(earlier.roundId, PLAYER_ID)).toEqual(earlier);
  });

  it('does not show or delete another player\'s valid recovery copy on a shared device', () => {
    const otherPlayersSave = {
      ...savedRound(Date.now(), null),
      playerId: OTHER_PLAYER_ID,
    };

    emergencySave(otherPlayersSave);

    expect(loadLatestEmergencySave(PLAYER_ID)).toBeNull();
    expect(loadLatestEmergencySave(OTHER_PLAYER_ID)).toEqual(otherPlayersSave);
  });

  it('can recover a pre-owner server backup only after server ownership is verified', () => {
    const legacyRoundId = '00000000-0000-4000-8000-000000000007';
    const { playerId: _legacyPlayerId, ...legacySave } = savedRound(Date.now(), legacyRoundId);
    localStorage.setItem(`${PREFIX}_${legacyRoundId}`, JSON.stringify(legacySave));

    expect(loadEmergencySave(legacyRoundId, PLAYER_ID)).toBeNull();
    expect(loadEmergencySave(legacyRoundId, PLAYER_ID, { allowLegacyServerSnapshot: true })).toEqual({
      ...legacySave,
      playerId: PLAYER_ID,
    });
  });
});

describe('confirmed emergency saves', () => {
  it('removes a snapshot once that exact snapshot has been acknowledged', () => {
    const timestamp = Date.now();
    const save = savedRound(timestamp, '00000000-0000-4000-8000-000000000003');

    emergencySave(save);
    clearEmergencySaveThrough(save.roundId, PLAYER_ID, timestamp);

    expect(loadEmergencySave(save.roundId, PLAYER_ID)).toBeNull();
  });

  it('retains a newer snapshot written while an older save was in flight', () => {
    const roundId = '00000000-0000-4000-8000-000000000004';
    const acknowledgedAt = Date.now() - 1_000;
    const newerSave = savedRound(Date.now(), roundId);

    emergencySave(newerSave);
    clearEmergencySaveThrough(roundId, PLAYER_ID, acknowledgedAt);

    expect(loadEmergencySave(roundId, PLAYER_ID)).toEqual(newerSave);
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

describe('migrateEmergencySave — a round re-created under a new id', () => {
  // P5 (review of 6a7577c71): Continue Round wrote its snapshot under the OLD
  // round id, then cleared through the NEW id after re-creating. Keys never
  // expire, so the dead-id snapshot lingered, New Round later offered it as
  // recoverable, and restore targeted the dead id again.
  const DEAD_ROUND = '00000000-0000-4000-8000-00000000dead';
  const NEW_ROUND = '00000000-0000-4000-8000-0000000000ee';

  it('re-keys a snapshot newer than the acknowledged save under the new id and drops the dead key', () => {
    const acknowledgedAt = Date.now() - 5_000;
    const newer = savedRound(Date.now(), DEAD_ROUND);
    emergencySave(newer);

    migrateEmergencySave(DEAD_ROUND, NEW_ROUND, PLAYER_ID, acknowledgedAt);

    expect(loadEmergencySave(DEAD_ROUND, PLAYER_ID)).toBeNull();
    expect(loadEmergencySave(NEW_ROUND, PLAYER_ID)).toEqual({ ...newer, roundId: NEW_ROUND });
  });

  it('only drops the dead key when the server already acknowledged that snapshot', () => {
    const timestamp = Date.now();
    emergencySave(savedRound(timestamp, DEAD_ROUND));

    migrateEmergencySave(DEAD_ROUND, NEW_ROUND, PLAYER_ID, timestamp);

    expect(loadEmergencySave(DEAD_ROUND, PLAYER_ID)).toBeNull();
    expect(loadEmergencySave(NEW_ROUND, PLAYER_ID)).toBeNull();
  });

  it('is a no-op without a snapshot under the dead id', () => {
    expect(() => migrateEmergencySave(DEAD_ROUND, NEW_ROUND, PLAYER_ID, Date.now())).not.toThrow();
    expect(loadLatestEmergencySave(PLAYER_ID)).toBeNull();
  });

  it('does not touch another player\'s snapshot stored under the same dead id', () => {
    const someoneElses = { ...savedRound(Date.now(), DEAD_ROUND), playerId: OTHER_PLAYER_ID };
    emergencySave(someoneElses);

    migrateEmergencySave(DEAD_ROUND, NEW_ROUND, PLAYER_ID, Date.now() - 1_000);

    expect(loadEmergencySave(DEAD_ROUND, OTHER_PLAYER_ID)).toEqual(someoneElses);
    expect(loadEmergencySave(NEW_ROUND, PLAYER_ID)).toBeNull();
  });
});

describe('isRecoverableRoundSubmitError', () => {
  it('treats round_missing as recoverable — the round is re-created, not lost', () => {
    // Before this, the key matched neither list, so a submit that came back
    // round_missing fell to the terminal error overlay with the raw key as
    // its message.
    expect(isRecoverableRoundSubmitError('round_missing')).toBe(true);
  });

  it('still refuses to route a genuinely terminal submit failure to recovery', () => {
    expect(isRecoverableRoundSubmitError('This round has already been submitted.')).toBe(false);
  });
});
