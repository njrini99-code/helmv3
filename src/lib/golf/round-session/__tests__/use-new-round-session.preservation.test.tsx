/**
 * Round preservation on the new-round engine (swap audit §9, findings R-1, R-3, R-4, R-8), through the real hook with
 * every server action and browser store stubbed (harness as `use-new-round-session.start.test.tsx`).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShotRecord } from '@/lib/types/golf';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  savePartialRound: vi.fn(),
  deleteInProgressRound: vi.fn(),
  deleteOfflineRound: vi.fn(async () => {}),
  connected: true,
}));

vi.mock('next/navigation', () => {
  const searchParams = new URLSearchParams();
  return { useRouter: () => mocks.router, useSearchParams: () => searchParams };
});
vi.mock('@/app/golf/actions/round-submit', () => ({
  submitGolfRoundComprehensive: vi.fn(),
}));
vi.mock('@/app/golf/actions/round-partial', () => ({
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
}));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({
  getPlayerQualifiers: vi.fn(async () => ({ success: true, data: [] })),
  getNextQualifierRoundNumber: vi.fn(),
}));
vi.mock('@/app/golf/actions/saved-courses', () => ({
  getPlayerSavedCourses: vi.fn(async () => ({ success: true, data: [] })),
  getRecentCoursesForPlayer: vi.fn(async () => ({ success: true, data: [] })),
  savePlayerCourse: vi.fn(),
  touchSavedCourse: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/course-library', () => ({ contributeCourseFromRound: vi.fn() }));
const staleness = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: (...args: unknown[]) => staleness.check(...args) }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: vi.fn() }));
vi.mock('@/hooks/golf/use-connection-status', () => ({
  useConnectionStatus: () => ({ isOnline: true, isConnected: mocks.connected, quality: 'excellent' }),
}));
vi.mock('@/hooks/golf/use-round-status-sync', () => ({ useRoundStatusSync: vi.fn() }));
vi.mock('@/stores/offline-sync-store', () => {
  const state = { updatePendingCount: vi.fn(async () => {}), setOnline: vi.fn(), setSlowConnection: vi.fn() };
  const status = { syncError: null, pendingCount: { total: 0 } };
  return {
    useOfflineSyncStore: Object.assign(() => state, { getState: () => state }),
    useOfflineSyncStatus: () => status,
  };
});
vi.mock('@/lib/offline/sync-engine', () => ({
  getSyncEngine: () => ({ registerCallback: vi.fn(), unregisterCallback: vi.fn(), start: vi.fn(), stop: vi.fn(), syncNow: vi.fn() }),
}));
vi.mock('@/lib/offline/indexed-db', () => ({
  saveOfflineRound: vi.fn(async () => {}),
  deleteOfflineRound: (...args: unknown[]) => mocks.deleteOfflineRound(...(args as [])),
}));
vi.mock('@/lib/offline/partial-save-beacon', () => ({ beaconPartialSave: vi.fn(() => false) }));
vi.mock('@/lib/offline/shot-storage', () => ({
  getRoundRecoverySnapshots: vi.fn(async () => []),
  saveRoundRecoverySnapshot: vi.fn(async () => {}),
  deleteRoundRecoverySnapshot: vi.fn(async () => {}),
  clearRoundRecoverySnapshotThrough: vi.fn(async () => {}),
}));
vi.mock('@/lib/recovery/use-active-work', () => ({ useActiveWork: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({
  logError: vi.fn(),
  isStaleServerActionError: () => false,
  softReloadForStaleServerAction: vi.fn(),
}));
vi.mock('@/lib/golf/new-round-setup-restore-signal', () => ({ reportRoundSetupRestoredAfterReload: vi.fn() }));
vi.mock('@/lib/golf/round-start-guard-signal', () => ({
  reportDuplicateCompletedRoundWarned: vi.fn(),
  reportRoundStartValidationBlocked: vi.fn(),
}));

import { useNewRoundSession, type NewRoundStartForm } from '@/lib/golf/round-session/use-new-round-session';
import { isAutoSaveHeld, type AutoSaveHeldError } from '@/hooks/golf/use-shot-state-machine';
import { loadEmergencySave, wasRoundDiscarded } from '@/lib/utils/emergency-save';
import { submitGolfRoundComprehensive } from '@/app/golf/actions/round-submit';
import type { HoleStats } from '@/lib/types/golf';

const ports = { showToast: vi.fn(), hideMobileNav: vi.fn(), showMobileNav: vi.fn(), haptic: vi.fn() };
const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, yardage: 400 + i }));
const form: NewRoundStartForm = {
  setup: {
    courseName: 'Pinehurst No. 2',
    courseCity: 'Pinehurst',
    courseState: 'NC',
    courseRating: '75.4',
    courseSlope: '135',
    teesPlayed: 'Blue',
    roundType: 'practice',
    roundDate: '2020-01-01',
  },
  qualifierId: null,
  qualifierRoundNumber: null,
  courseId: 'course-1',
  teeId: 'tee-1',
  holes,
  saveCourse: false,
};
const TEE: ShotRecord = {
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 400,
  distanceUnitBefore: 'yards',
  result: 'fairway',
  distanceToHoleAfter: 150,
  distanceUnitAfter: 'yards',
  shotDistance: 250,
  isPenalty: false,
};
const created = { success: true, data: { roundId: 'round-1', updatedAt: '2026-09-30T12:00:00.000Z' } };

async function started() {
  const hook = renderHook(() => useNewRoundSession({ playerId: 'player-1', ports }));
  await act(async () => {
    await hook.result.current.start(form);
  });
  expect(hook.result.current.savedRoundIdRef.current).toBe('round-1');
  mocks.savePartialRound.mockClear();
  return hook;
}

async function autoSave(hook: Awaited<ReturnType<typeof started>>, shots: ShotRecord[]): Promise<unknown> {
  let thrown: unknown = null;
  await act(async () => {
    try {
      await hook.result.current.handleAutoSave(shots, 0);
    } catch (error) {
      thrown = error;
    }
  });
  return thrown;
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.connected = true;
  mocks.savePartialRound.mockResolvedValue(created);
  mocks.deleteInProgressRound.mockResolvedValue({ success: true });
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('R-3: a Discard that throws leaves the round saving', () => {
  it('auto-save still reaches the server after the discard request failed in flight', async () => {
    const hook = await started();
    mocks.deleteInProgressRound.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => {
      await expect(hook.result.current.handleDeleteRound()).rejects.toThrow('Failed to fetch');
    });
    expect(wasRoundDiscarded('round-1', 'player-1')).toBe(false);

    expect(await autoSave(hook, [TEE])).toBeNull();
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
  });

  it('a refused discard leaves it saving too', async () => {
    const hook = await started();
    mocks.deleteInProgressRound.mockResolvedValue({ success: false, error: 'Failed to delete round' });
    await act(async () => {
      await hook.result.current.handleDeleteRound();
    });

    expect(await autoSave(hook, [TEE])).toBeNull();
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
  });
});

describe('R-8 / R-4: after a successful Discard nothing is written', () => {
  it('marks the round discarded on this device, drops its queued entry, and later saves write no device copy', async () => {
    const hook = await started();
    await act(async () => {
      await hook.result.current.handleDeleteRound();
    });
    expect(wasRoundDiscarded('round-1', 'player-1')).toBe(true);
    expect(mocks.deleteOfflineRound).toHaveBeenCalledWith('round-1');

    const thrown = await autoSave(hook, [TEE]);
    expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('discarded');
    expect(loadEmergencySave('round-1', 'player-1')).toBeNull();
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });
});

describe('R-1: an auto-save that did not reach the server says so', () => {
  it('offline by both readings: held on the device', async () => {
    const hook = await started();
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    mocks.connected = false;
    hook.rerender();
    const thrown = await autoSave(hook, [TEE]);

    expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('offline');
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });

  it('navigator.onLine false but the health probe connected (WKWebView): still sends', async () => {
    const hook = await started();
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const thrown = await autoSave(hook, [TEE]);

    expect(thrown).toBeNull();
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
  });

  it('busy: held, not resolved as saved', async () => {
    const hook = await started();
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'busy' });
    const thrown = await autoSave(hook, [TEE]);

    expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('busy');
    expect(ports.showToast).not.toHaveBeenCalled();
  });

  it('a conflict the server answered is never an acknowledgement: a healed one is held to be sent again, an unhealed one is blocked', async () => {
    const healedHook = await started();
    const blockedHook = await started();
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'conflict' });

    staleness.check.mockResolvedValue({ success: true, data: { isStale: false, currentUpdatedAt: '2026-09-30T12:00:00.000Z', status: 'in_progress' } });
    const healed = await autoSave(healedHook, [TEE]);
    expect(isAutoSaveHeld(healed) && (healed as AutoSaveHeldError).reason).toBe('conflict');

    staleness.check.mockResolvedValue({ success: true, data: { isStale: true, currentUpdatedAt: '2026-09-30T12:05:00.000Z', status: 'in_progress' } });
    const blocked = await autoSave(blockedHook, [TEE]);
    expect(isAutoSaveHeld(blocked) && (blocked as AutoSaveHeldError).reason).toBe('blocked');
    mocks.savePartialRound.mockClear();
    const after = await autoSave(blockedHook, [TEE]);
    expect(isAutoSaveHeld(after) && (after as AutoSaveHeldError).reason).toBe('blocked');
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });
});

describe('Q-120: a stale-device submit that the server refuses as a conflict', () => {
  const T0 = created.data.updatedAt;
  const CONFLICT_MESSAGE = 'This round was updated on another device. Please reload.';
  const finished = holes.map((h) => ({ holeNumber: h.holeNumber, par: 4, yardage: h.yardage, score: 4, putts: 2, shots: [] }) as unknown as HoleStats);
  const submit = vi.mocked(submitGolfRoundComprehensive);
  const submitted = { success: true as const, data: { roundId: 'round-1' } };

  async function runSubmit(hook: Awaited<ReturnType<typeof started>>) {
    let thrown: unknown = null;
    await act(async () => {
      try {
        await hook.result.current.handleRoundSubmit(finished);
      } catch (error) {
        thrown = error;
      }
    });
    return thrown;
  }

  it('sends the last acknowledged updated_at once the round exists server-side', async () => {
    const hook = await started();
    staleness.check.mockResolvedValue({ success: true, data: { isStale: false, currentUpdatedAt: T0, status: 'in_progress' } });
    submit.mockResolvedValue(submitted);

    expect(await runSubmit(hook)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toMatchObject({ expectedUpdatedAt: T0 });
    expect(submit.mock.calls[0]![1]).toBe('round-1');
    expect(hook.result.current.completedRoundId).toBe('round-1');
  });

  it('a genuine collision blocks the round with the reload sentence, keeps the device snapshot, and never shows the raw key', async () => {
    const hook = await started();
    staleness.check
      .mockResolvedValueOnce({ success: true, data: { isStale: false, currentUpdatedAt: T0, status: 'in_progress' } })
      .mockResolvedValue({ success: true, data: { isStale: true, currentUpdatedAt: '2026-09-30T12:05:00.000Z', status: 'in_progress' } });
    submit.mockResolvedValue({ success: false, error: 'conflict' });

    expect(await runSubmit(hook)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBe(CONFLICT_MESSAGE);
    expect(hook.result.current.roundConflictBlocked).toBe(true);
    expect(hook.result.current.step).toBe('tracking');
    expect(hook.result.current.completedRoundId).toBeNull();
    expect(loadEmergencySave('round-1', 'player-1')?.completedHoleStats).toHaveLength(holes.length);
    expect(mocks.router.push).not.toHaveBeenCalled();

    submit.mockClear();
    await runSubmit(hook);
    expect(submit).not.toHaveBeenCalled();
  });

  it('a self-caused mismatch (the server agrees with the token now) is re-sent once and completes', async () => {
    const hook = await started();
    staleness.check.mockResolvedValue({ success: true, data: { isStale: false, currentUpdatedAt: T0, status: 'in_progress' } });
    submit.mockResolvedValueOnce({ success: false, error: 'conflict' }).mockResolvedValueOnce(submitted);

    expect(await runSubmit(hook)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(hook.result.current.roundConflictBlocked).toBe(false);
    expect(hook.result.current.completedRoundId).toBe('round-1');
  });
});

// Rounds' "no data lost" contracts (docs/clubhouse/pages/P011-rounds/CONTRACT.md, categories 07 and 12), at the
// engine both round renderers share. The renderer halves are in src/clubhouse/__tests__ (round-setup, round-tracking,
// rounds).
describe('111201 111202 110702: a start, a hole or a discard that did not reach the server loses nothing', () => {
  const holeOne = { holeNumber: 1, par: 4, yardage: 400, score: 5, putts: 2, shots: [TEE] } as unknown as HoleStats;

  it('111201 a start whose request never lands adopts nothing, and the same form starts on the next try', async () => {
    mocks.savePartialRound.mockRejectedValueOnce(new TypeError('Load failed'));
    const hook = renderHook(() => useNewRoundSession({ playerId: 'player-1', ports }));
    let first: unknown;
    await act(async () => {
      first = await hook.result.current.start(form);
    });
    expect(first).toMatchObject({ ok: false, reason: 'transport' });
    expect(hook.result.current.savedRoundIdRef.current).toBeNull();
    expect(hook.result.current.step).not.toBe('tracking');
    expect(hook.result.current.isStartingRound).toBe(false);

    // Neither the in-flight guard nor the starting flag is left set by the throw: the next tap starts the round.
    let second: unknown;
    await act(async () => {
      second = await hook.result.current.start(form);
    });
    expect(second).toEqual({ ok: true, roundId: 'round-1' });
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
    expect(mocks.savePartialRound.mock.calls[1]![0]).toEqual(mocks.savePartialRound.mock.calls[0]![0]);
    expect(mocks.savePartialRound.mock.calls[1]![1]).toBeUndefined();
    expect(hook.result.current.step).toBe('tracking');
  });

  it('111202 a hole whose save never lands stays on this device with its score and shots; Try again sends it, and only then is the copy cleared', async () => {
    const hook = await started();
    // The connection drops: every attempt of the bounded checkpoint loop throws, as Safari's "Load failed" does.
    mocks.savePartialRound.mockRejectedValue(new TypeError('Load failed'));
    let saved: boolean | undefined;
    await act(async () => {
      saved = await hook.result.current.handleHoleComplete(0, holeOne);
    });
    expect(saved).toBe(false);
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(3);
    expect(hook.result.current.error).toBe('This hole has not saved yet. Keep this screen open and try again.');
    // The player is held on the hole, and the device copy holds the hole as played.
    expect(hook.result.current.currentHoleIndex).toBe(0);
    const kept = loadEmergencySave('round-1', 'player-1');
    expect(kept?.holes[0]?.score).toBe(5);
    expect(kept?.completedHoleStats[0]).toMatchObject({ holeNumber: 1, score: 5, putts: 2, shots: [TEE] });
    expect(wasRoundDiscarded('round-1', 'player-1')).toBe(false);

    // The connection is back: Try again runs the same hole's checkpoint, which carries the hole to the server.
    mocks.savePartialRound.mockReset();
    mocks.savePartialRound.mockResolvedValue(created);
    await act(async () => {
      saved = await hook.result.current.handleHoleComplete(0, holeOne);
    });
    expect(saved).toBe(true);
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
    const [payload, roundId] = mocks.savePartialRound.mock.calls[0]!;
    expect(roundId).toBe('round-1');
    expect(payload.holes[0]).toMatchObject({ holeNumber: 1, score: 5, shots: [TEE] });
    expect(hook.result.current.currentHoleIndex).toBe(1);
    expect(loadEmergencySave('round-1', 'player-1')).toBeNull();
  });

  it('110702 a discard that never reaches the server keeps the device copy and the round, and the round keeps saving', async () => {
    const hook = await started();
    const before = loadEmergencySave('round-1', 'player-1');
    expect(before).not.toBeNull();
    mocks.deleteInProgressRound.mockRejectedValue(new TypeError('Load failed'));
    await act(async () => {
      await expect(hook.result.current.handleDeleteRound()).rejects.toThrow('Load failed');
    });
    expect(loadEmergencySave('round-1', 'player-1')).toEqual(before);
    expect(wasRoundDiscarded('round-1', 'player-1')).toBe(false);
    expect(mocks.deleteOfflineRound).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(await autoSave(hook, [TEE])).toBeNull();
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
  });
});
