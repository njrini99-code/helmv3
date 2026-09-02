import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShotRecord } from '@/lib/types/golf';
import {
  EMERGENCY_SAVE_DEGRADED_EVENT,
  clearEmergencySaveThrough,
  emergencySave,
  isEmergencySaveEquivalentToProgress,
  isRecoverableRoundSubmitError,
  loadEmergencySave,
  loadLatestEmergencySave,
  migrateEmergencySave,
  resetEmergencySaveDegradedNoticeForTests,
  type EmergencySaveData,
  type EmergencySaveProgress,
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

/**
 * C4: the server-shaped `completedHoleStats`/`inProgressShotsByHole` that
 * `continue-round-client.tsx` compares an emergency snapshot against are
 * built by the continue page's server loader
 * (`src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx`,
 * `mapShotToRecord` + the `completedHoleStats` loop), not typed straight
 * off `golf_shots`/`golf_holes`. Two of its enrichments have no client-side
 * equivalent at shot-entry time, so an otherwise byte-identical hole read
 * back from the server compared unequal to the local emergency copy and
 * triggered a spurious "recover this round?" prompt on a completely
 * up-to-date device:
 *
 *  - `distanceFromGreenYards` on a shot: populated ONLY from a
 *    `golf_shot_approach_details` join (`mapShotToRecord`'s `approachDetail`
 *    param) — nothing under `src/components/fairway/pages/rounds-tracking/`
 *    or `src/hooks/golf/` ever sets this field when a shot is first
 *    recorded, so the local copy simply never carries the key.
 *  - `yardage` on a hole: the loader takes
 *    `courseYardageMap.get(hole.hole_number) ?? hole.yardage ?? 0` — the
 *    CONFIGURED course/tee yardage wins over the round's own persisted
 *    value whenever a course link resolves, which can happen after the
 *    local snapshot was written (e.g. the round's course being matched into
 *    the shared Cloud Course Library mid-round). The yardage is a course
 *    attribute, not player-entered progress, so a refinement there must not
 *    read as "you have unsaved work."
 *
 * Fixtures below are shaped exactly like `mapShotToRecord`'s return value
 * and the `completedHoleStats` it feeds, not a hand-trimmed minimal object —
 * that fidelity is the point: a smaller fixture would have passed even
 * against the pre-fix comparison, the same way the unit tests already in
 * this file did before this defect was caught in production.
 */
describe('isEmergencySaveEquivalentToProgress — server-shaped enrichment fields (C4)', () => {
  function serverShapedShot(overrides: Partial<ShotRecord> = {}): ShotRecord {
    // Every field `mapShotToRecord` sets, in the same shape it sets them.
    return {
      id: 'server-generated-shot-id',
      shotNumber: 2,
      shotType: 'approach',
      clubType: 'non_driver',
      lieBefore: 'fairway',
      distanceToHoleBefore: 145,
      distanceUnitBefore: 'yards',
      result: 'green',
      distanceToHoleAfter: 18,
      distanceUnitAfter: 'feet',
      shotDistance: 130,
      missDirection: undefined,
      puttBreak: undefined,
      puttSlope: undefined,
      isPenalty: false,
      penaltyType: undefined,
      puttMissTags: undefined,
      puttDistanceFeet: undefined,
      approachMissDirection: undefined,
      approachMissLieType: undefined,
      // Only present when a golf_shot_approach_details row exists — this is
      // the field with NO client-side setter at all.
      distanceFromGreenYards: 18,
      ...overrides,
    };
  }

  function clientCapturedShot(overrides: Partial<ShotRecord> = {}): ShotRecord {
    // What the player's device wrote at the moment of the shot: identical
    // gameplay data, but this key was never in the object to begin with —
    // not "set to undefined", genuinely absent, matching how a plain object
    // literal built during shot entry looks.
    const { distanceFromGreenYards: _omit, ...shot } = serverShapedShot(overrides);
    return shot;
  }

  it('treats a server-enriched approach shot (distanceFromGreenYards) as equivalent to the client copy that never set it', () => {
    const server: EmergencySaveProgress = {
      holes: [{ number: 5, par: 4, yardage: 410, score: 4 }],
      completedHoleStats: [],
      inProgressShotsByHole: { 4: [serverShapedShot()] },
    };
    const local: EmergencySaveData = {
      ...savedRound(Date.now(), '00000000-0000-4000-8000-0000000000c4'),
      holes: server.holes,
      completedHoleStats: [],
      inProgressShotsByHole: { 4: [clientCapturedShot()] },
    };

    expect(isEmergencySaveEquivalentToProgress(local, server)).toBe(true);
  });

  it('treats a course-linked yardage correction as equivalent, not new progress', () => {
    // The round started before its course resolved to a library tee; the
    // hole's own persisted yardage (410) is what the local snapshot has.
    // The server loader now prefers the resolved course/tee yardage (415).
    const server: EmergencySaveProgress = {
      holes: [{ number: 5, par: 4, yardage: 415, score: 4 }],
      completedHoleStats: [],
      inProgressShotsByHole: {},
    };
    const local: EmergencySaveData = {
      ...savedRound(Date.now(), '00000000-0000-4000-8000-0000000000c5'),
      holes: [{ number: 5, par: 4, yardage: 410, score: 4 }],
      completedHoleStats: [],
      inProgressShotsByHole: {},
    };

    expect(isEmergencySaveEquivalentToProgress(local, server)).toBe(true);
  });

  it('still catches a real score difference on the same hole (not blindly equivalent)', () => {
    const server: EmergencySaveProgress = {
      holes: [{ number: 5, par: 4, yardage: 415, score: 4 }],
      completedHoleStats: [],
      inProgressShotsByHole: {},
    };
    const local: EmergencySaveData = {
      ...savedRound(Date.now(), '00000000-0000-4000-8000-0000000000c6'),
      holes: [{ number: 5, par: 4, yardage: 410, score: 5 }],
      completedHoleStats: [],
      inProgressShotsByHole: {},
    };

    expect(isEmergencySaveEquivalentToProgress(local, server)).toBe(false);
  });

  it('still catches a real shot-data difference beyond the ignored enrichment fields', () => {
    const server: EmergencySaveProgress = {
      holes: [{ number: 5, par: 4, yardage: 410, score: 4 }],
      completedHoleStats: [],
      inProgressShotsByHole: { 4: [serverShapedShot()] },
    };
    const local: EmergencySaveData = {
      ...savedRound(Date.now(), '00000000-0000-4000-8000-0000000000c7'),
      holes: server.holes,
      completedHoleStats: [],
      // A genuinely different club — this must NOT be swallowed by the C4 fix.
      inProgressShotsByHole: { 4: [clientCapturedShot({ clubType: 'driver' })] },
    };

    expect(isEmergencySaveEquivalentToProgress(local, server)).toBe(false);
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

/**
 * C5: `emergencySave` returns `false` when localStorage is full or
 * unavailable even after compacting old saves, and none of the 13 call
 * sites across both round screens checked that return value — a device
 * whose fast local backup is down got no signal at all, shot after shot,
 * while the player kept tracking. The independent IndexedDB mirror
 * (`queueRecoverySnapshot`) still runs unconditionally on every call and is
 * NOT what this covers — it is deliberately slower/best-effort, and the
 * player deserves to know the FAST path is down. Fixed: `emergencySave`
 * fires `EMERGENCY_SAVE_DEGRADED_EVENT` at most once per session so a
 * listener (both round screens) can show a one-time notice.
 */
describe('emergencySave — localStorage failure notice (C5)', () => {
  beforeEach(() => {
    resetEmergencySaveDegradedNoticeForTests();
    // This file's tests run in vitest's `node` project (no DOM), so `window`
    // does not exist by default — stub a real EventTarget so
    // addEventListener/dispatchEvent behave exactly like a browser's.
    // Cleaned up by the top-level `afterEach`'s `vi.unstubAllGlobals()`.
    vi.stubGlobal('window', new EventTarget());
  });

  it('returns false and fires the degraded event when localStorage.setItem always throws', () => {
    vi.stubGlobal('localStorage', {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    const listener = vi.fn();
    window.addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, listener);
    try {
      const result = emergencySave(savedRound(1, PLAYER_ID));
      expect(result).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, listener);
    }
  });

  it('fires the event at most once per session, even across many failed saves', () => {
    vi.stubGlobal('localStorage', {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    const listener = vi.fn();
    window.addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, listener);
    try {
      emergencySave(savedRound(1, PLAYER_ID));
      emergencySave(savedRound(2, PLAYER_ID));
      emergencySave(savedRound(3, PLAYER_ID));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, listener);
    }
  });

  it('does not fire the event when localStorage.setItem succeeds', () => {
    const listener = vi.fn();
    window.addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, listener);
    try {
      const result = emergencySave(savedRound(1, PLAYER_ID));
      expect(result).toBe(true);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, listener);
    }
  });
});
