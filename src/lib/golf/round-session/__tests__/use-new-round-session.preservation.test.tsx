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
vi.mock('@/app/golf/actions/golf', () => ({
  submitGolfRoundComprehensive: vi.fn(),
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
  getPlayerQualifiers: vi.fn(async () => ({ success: true, data: [] })),
  getNextQualifierRoundNumber: vi.fn(),
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
