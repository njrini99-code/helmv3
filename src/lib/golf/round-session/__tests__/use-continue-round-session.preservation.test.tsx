/**
 * Round preservation on the continue engine (swap audit §9, findings R-1, R-2, R-4, R-7, R-8, R-9), through the real
 * hook with every server action and browser store stubbed (harness as `use-continue-round-session.ports.test.tsx`).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  savePartialRound: vi.fn(),
  submitGolfRoundComprehensive: vi.fn(),
  deleteInProgressRound: vi.fn(),
  deleteOfflineRound: vi.fn(async () => {}),
}));

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/app/golf/actions/golf', () => ({
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  submitGolfRoundComprehensive: (...args: unknown[]) => mocks.submitGolfRoundComprehensive(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
}));
const staleness = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: (...args: unknown[]) => staleness.check(...args) }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: vi.fn() }));
vi.mock('@/hooks/golf/use-round-status-sync', () => ({ useRoundStatusSync: vi.fn() }));
vi.mock('@/stores/offline-sync-store', () => {
  const status = { isOnline: true, isSyncing: false, pendingCount: { total: 0 }, syncError: null };
  return { useOfflineSyncStatus: () => status };
});
vi.mock('@/lib/offline/indexed-db', () => ({
  saveOfflineRound: vi.fn(async () => {}),
  deleteOfflineRound: (...args: unknown[]) => mocks.deleteOfflineRound(...(args as [])),
}));
vi.mock('@/lib/offline/partial-save-beacon', () => ({ beaconPartialSave: vi.fn(() => false) }));
vi.mock('@/lib/offline/shot-storage', () => ({
  getRoundRecoverySnapshot: vi.fn(async () => null),
  getRoundRecoverySnapshots: vi.fn(async () => []),
  saveRoundRecoverySnapshot: vi.fn(async () => {}),
  deleteRoundRecoverySnapshot: vi.fn(async () => {}),
  clearRoundRecoverySnapshotThrough: vi.fn(async () => {}),
}));
vi.mock('@/lib/observability/client-breadcrumbs', () => ({ recordHelmBreadcrumb: vi.fn() }));
vi.mock('@/lib/recovery/use-active-work', () => ({ useActiveWork: vi.fn() }));

import { emergencySave, loadEmergencySave, markRoundDiscarded, wasRoundDiscarded, DISCARDED_ROUNDS_STORAGE_KEY } from '@/lib/utils/emergency-save';
import { isAutoSaveHeld, type AutoSaveHeldError } from '@/hooks/golf/use-shot-state-machine';
import { CONFLICT_CHECK_TIMEOUT_MS } from '@/lib/golf/round-session/settle-within';
import {
  useContinueRoundSession,
  type ContinueRoundSessionOptions,
  type ContinueRoundSessionProps,
} from '@/lib/golf/round-session/use-continue-round-session';

const ports = { showToast: vi.fn() };

const setupData: ContinueRoundSessionProps['setupData'] = {
  courseName: 'Pinehurst No. 2',
  courseCity: '',
  courseState: '',
  courseRating: '',
  courseSlope: '',
  teesPlayed: 'Blue',
  roundType: 'practice',
  roundDate: '2020-01-01',
};
const holes = [
  { number: 1, par: 4, yardage: 400, score: null },
  { number: 2, par: 3, yardage: 170, score: null },
];

const shot = (n: number, result: ShotRecord['result'] = 'fairway'): ShotRecord => ({
  shotNumber: n,
  shotType: n === 1 ? 'tee' : 'approach',
  clubType: n === 1 ? 'driver' : 'non_driver',
  lieBefore: n === 1 ? 'tee' : 'fairway',
  distanceToHoleBefore: 400 - (n - 1) * 150,
  distanceUnitBefore: 'yards',
  result,
  distanceToHoleAfter: 400 - n * 150,
  distanceUnitAfter: 'yards',
  shotDistance: 150,
  isPenalty: false,
});
const statsFor = (holeNumber: number, score: number) =>
  ({ holeNumber, par: 4, yardage: 400, score, putts: 2, shots: [] }) as unknown as HoleStats;

function render(options: Partial<ContinueRoundSessionProps & ContinueRoundSessionOptions> = {}) {
  return renderHook(() =>
    useContinueRoundSession({
      roundId: 'round-1',
      playerId: 'player-1',
      setupData,
      holes,
      completedHoleStats: [],
      startHoleIndex: 0,
      ports,
      ...options,
    }),
  );
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

/** The rejection `handleAutoSave` ended with, or null when it resolved. */
async function autoSave(hook: ReturnType<typeof render>, shots: ShotRecord[], holeIndex = 0): Promise<unknown> {
  let thrown: unknown = null;
  await act(async () => {
    try {
      await hook.result.current.handleAutoSave(shots, holeIndex);
    } catch (error) {
      thrown = error;
    }
  });
  return thrown;
}

function copy(timestamp: number, over: Partial<Parameters<typeof emergencySave>[0]> = {}) {
  emergencySave({
    playerId: 'player-1',
    roundId: 'round-1',
    timestamp,
    setupData,
    holes,
    completedHoleStats: [],
    inProgressShotsByHole: { 0: [shot(1), shot(2)] },
    currentHoleIndex: 0,
    ...over,
  });
}

const saved = { success: true, data: { roundId: 'round-1', updatedAt: '2026-09-30T12:00:00.000Z' } };

beforeEach(() => {
  window.localStorage.clear();
  mocks.savePartialRound.mockResolvedValue(saved);
  mocks.deleteInProgressRound.mockResolvedValue({ success: true });
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('R-1: an auto-save that did not reach the server says so', () => {
  it('offline: held on the device, nothing sent', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const hook = render();
    const thrown = await autoSave(hook, [shot(1)]);

    expect(isAutoSaveHeld(thrown)).toBe(true);
    expect((thrown as AutoSaveHeldError).reason).toBe('offline');
    expect((thrown as AutoSaveHeldError).onDevice).toBe(true);
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(loadEmergencySave('round-1', 'player-1')?.inProgressShotsByHole[0]).toHaveLength(1);
  });

  it('busy: held, never counted as a failure (no "having trouble" warning)', async () => {
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'busy' });
    const hook = render();
    for (let i = 0; i < 3; i++) {
      const thrown = await autoSave(hook, [shot(1)]);
      expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('busy');
    }
    expect(ports.showToast).not.toHaveBeenCalled();
  });

  it('queued behind a save in flight: held, not resolved as saved', async () => {
    let release: (value: unknown) => void = () => {};
    mocks.savePartialRound.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const hook = render();
    let first: Promise<void> | undefined;
    act(() => {
      first = hook.result.current.handleAutoSave([shot(1)], 0);
    });
    const thrown = await autoSave(hook, [shot(1), shot(2)]);

    expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('queued');
    await act(async () => {
      release(saved);
      await first;
    });
  });

  it('a hole the server refused: held with the sentence shown, not saved', async () => {
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'hole_invalid', code: 'hole_invalid', message: 'Hole 1 needs a fix.' });
    const hook = render();
    const thrown = await autoSave(hook, [shot(1)]);

    expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('invalid');
    expect(hook.result.current.error).toBe('Hole 1 needs a fix.');
  });

  it('a server acknowledgement still resolves', async () => {
    const hook = render();
    expect(await autoSave(hook, [shot(1)])).toBeNull();
  });

  it('a conflict the server answered is never an acknowledgement: a healed one is held to be sent again, an unhealed one is blocked', async () => {
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'conflict' });

    // The mismatch was this device's own (the server agrees with the token now): the same shots go again under it.
    staleness.check.mockResolvedValue({ success: true, data: { isStale: false, currentUpdatedAt: '2026-09-30T12:00:00.000Z', status: 'in_progress' } });
    const healed = await autoSave(render(), [shot(1)]);
    expect(isAutoSaveHeld(healed)).toBe(true);
    expect((healed as AutoSaveHeldError).reason).toBe('conflict');
    expect((healed as AutoSaveHeldError).onDevice).toBe(true);

    // A genuine collision with another device: this device is behind and writes nothing more until a reload.
    staleness.check.mockResolvedValue({ success: true, data: { isStale: true, currentUpdatedAt: '2026-09-30T12:05:00.000Z', status: 'in_progress' } });
    const blockedHook = render();
    const blocked = await autoSave(blockedHook, [shot(1)]);
    expect(isAutoSaveHeld(blocked)).toBe(true);
    expect((blocked as AutoSaveHeldError).reason).toBe('blocked');
    mocks.savePartialRound.mockClear();
    const after = await autoSave(blockedHook, [shot(1), shot(2)]);
    expect((after as AutoSaveHeldError).reason).toBe('blocked');
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });

  it('a conflict check that hangs does not hold the save lock open: the save is held as a conflict after the bound', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      mocks.savePartialRound.mockResolvedValue({ success: false, error: 'conflict' });
      staleness.check.mockReturnValue(new Promise(() => {}));
      const hook = render();
      let thrown: unknown = null;
      const pending = act(async () => {
        try {
          await hook.result.current.handleAutoSave([shot(1)], 0);
        } catch (error) {
          thrown = error;
        }
      });
      await vi.advanceTimersByTimeAsync(CONFLICT_CHECK_TIMEOUT_MS);
      await pending;
      expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('conflict');
    } finally {
      vi.useRealTimers();
    }
  });

  it('handleSaveShot reports whether the device copy landed, which is the only thing the save line may claim before the server answers', async () => {
    const hook = render();
    let landed: unknown;
    act(() => {
      landed = hook.result.current.handleSaveShot(shot(1));
    });
    expect(landed).toBe(true);
    expect(loadEmergencySave('round-1', 'player-1')?.inProgressShotsByHole[0]).toHaveLength(1);

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      act(() => {
        landed = hook.result.current.handleSaveShot(shot(2));
      });
      expect(landed).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('R-8 / R-4: after Discard nothing is written and nothing re-creates the round', () => {
  it('Discard marks the round discarded on this device, drops its queued entry, and later saves write nothing', async () => {
    const hook = render();
    await act(async () => {
      await hook.result.current.handleDeleteRound();
    });
    expect(wasRoundDiscarded('round-1', 'player-1')).toBe(true);
    expect(mocks.deleteOfflineRound).toHaveBeenCalledWith('round-1');

    const thrown = await autoSave(hook, [shot(1)]);
    expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('discarded');
    expect(loadEmergencySave('round-1', 'player-1')).toBeNull();
    expect(mocks.savePartialRound).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.handleSaveShot(shot(1));
    });
    expect(loadEmergencySave('round-1', 'player-1')).toBeNull();
  });

  it('a round discarded in another tab is not re-created when this screen finds it missing', async () => {
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'round_missing' });
    const hook = render();
    markRoundDiscarded('round-1', 'player-1');
    const thrown = await autoSave(hook, [shot(1)]);

    expect(thrown).toBeInstanceOf(Error);
    // One write against the dead id, and no create without an id.
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
    expect(mocks.savePartialRound.mock.calls[0]![1]).toBe('round-1');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('the storage event from that other tab stops this screen writing at all', async () => {
    const hook = render();
    markRoundDiscarded('round-1', 'player-1');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: DISCARDED_ROUNDS_STORAGE_KEY }));
    });
    const thrown = await autoSave(hook, [shot(1)]);

    expect(isAutoSaveHeld(thrown) && (thrown as AutoSaveHeldError).reason).toBe('discarded');
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });
});

describe('R-2: an offered device copy is not lost to the first auto-save', () => {
  it('the tracker\'s save of the server\'s own shots neither overwrites nor clears the offered copy', async () => {
    copy(Date.now());
    const hook = render({ initialShots: [shot(1)], initialShotNumber: 2, serverDataTimestamp: '2020-01-01T00:00:00.000Z' });
    await flush();
    expect(hook.result.current.showRecoveryDialog).toBe(true);

    expect(await autoSave(hook, [shot(1)])).toBeNull();
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(loadEmergencySave('round-1', 'player-1')?.inProgressShotsByHole[0]).toHaveLength(2);

    // Closing without choosing keeps it the same way.
    act(() => {
      hook.result.current.setShowRecoveryDialog(false);
    });
    expect(await autoSave(hook, [shot(1)])).toBeNull();
    expect(loadEmergencySave('round-1', 'player-1')?.inProgressShotsByHole[0]).toHaveLength(2);
  });

  it('Restore on the same hole bumps the epoch the tracker is keyed by, so it re-reads the restored shots', async () => {
    copy(Date.now());
    const hook = render({ initialShots: [shot(1)], initialShotNumber: 2, serverDataTimestamp: '2020-01-01T00:00:00.000Z' });
    await flush();
    expect(hook.result.current.restoreEpoch).toBe(0);

    act(() => {
      hook.result.current.handleRestoreRecovery();
    });
    expect(hook.result.current.restoreEpoch).toBe(1);
    expect(hook.result.current.currentHoleIndex).toBe(0);
    expect(hook.result.current.activeHoleShots).toHaveLength(2);
  });
});

describe('R-7: a device copy with shots the server lacks survives a newer server timestamp', () => {
  it('still offers the copy when the server is "newer" by the clock but has fewer shots', async () => {
    const older = Date.parse('2026-09-30T11:59:59.000Z');
    copy(older);
    const hook = render({ initialShots: [shot(1)], initialShotNumber: 2, serverDataTimestamp: '2026-09-30T12:00:00.000Z' });
    await flush();

    expect(hook.result.current.showRecoveryDialog).toBe(true);
    expect(loadEmergencySave('round-1', 'player-1')).not.toBeNull();
  });

  it('still retires an older copy the server already holds every shot of', async () => {
    const older = Date.parse('2026-09-30T11:59:59.000Z');
    copy(older, { inProgressShotsByHole: { 0: [shot(1)] }, holes: holes.map((h) => ({ ...h })) });
    const hook = render({ initialShots: [shot(1), shot(2)], initialShotNumber: 3, serverDataTimestamp: '2026-09-30T12:00:00.000Z' });
    await flush();

    expect(hook.result.current.showRecoveryDialog).toBe(false);
    expect(loadEmergencySave('round-1', 'player-1')).toBeNull();
  });
});

describe('R-9: a restored copy with every hole scored can be submitted', () => {
  it('Restore of a fully scored copy opens the finish step', async () => {
    const finished = [statsFor(1, 4), statsFor(2, 3)];
    copy(Date.now(), {
      holes: [{ ...holes[0]!, score: 4 }, { ...holes[1]!, score: 3 }],
      completedHoleStats: finished,
      inProgressShotsByHole: {},
      currentHoleIndex: 1,
    });
    const hook = render({ completedHoleStats: [statsFor(1, 4)], holes: [{ ...holes[0]!, score: 4 }, holes[1]!], startHoleIndex: 1 });
    await flush();
    expect(hook.result.current.showRecoveryDialog).toBe(true);
    expect(hook.result.current.pendingFinalStats).toBeNull();

    act(() => {
      hook.result.current.handleRestoreRecovery();
    });
    expect(hook.result.current.pendingFinalStats).toEqual(finished);
    expect(hook.result.current.showFinishConfirm).toBe(true);
  });
});

describe('journey: a shot entered, the connection cut, the screen left and reopened, the connection back', () => {
  /** The shots a save sent for the first hole, in the order sent. */
  const sentShots = (call: number) => (mocks.savePartialRound.mock.calls[call]![0] as { inProgressShots: Array<{ holeNumber: number; shots: ShotRecord[] }> }).inProgressShots[0]?.shots ?? [];

  it('the shot exists exactly once, nothing reached the server while offline, and every status along the way was held, then saved', async () => {
    // The server holds shot 1; shot 2 is entered on this phone, and its device copy lands before any network call.
    const first = render({ initialShots: [shot(1)], initialShotNumber: 2 });
    await flush();
    let landed: unknown;
    act(() => {
      landed = first.result.current.handleSaveShot(shot(2));
    });
    expect(landed).toBe(true);

    // The connection is cut: the save is HELD (the line says "on this phone"), never resolved as saved, and nothing is sent.
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const held = await autoSave(first, [shot(1), shot(2)]);
    expect(isAutoSaveHeld(held)).toBe(true);
    expect((held as AutoSaveHeldError).reason).toBe('offline');
    expect((held as AutoSaveHeldError).onDevice).toBe(true);
    expect(mocks.savePartialRound).not.toHaveBeenCalled();

    // The screen is left; the device copy is what remains.
    first.unmount();
    expect(loadEmergencySave('round-1', 'player-1')?.inProgressShotsByHole[0]).toHaveLength(2);

    // Reopened, still offline: the server's copy has one shot, the device's has two, so the device copy is offered, and restoring it
    // gives two shots, not three.
    const second = render({ initialShots: [shot(1)], initialShotNumber: 2, serverDataTimestamp: '2020-01-01T00:00:00.000Z' });
    await flush();
    expect(second.result.current.showRecoveryDialog).toBe(true);
    act(() => {
      second.result.current.handleRestoreRecovery();
    });
    expect(second.result.current.activeHoleShots.map((s) => s.shotNumber)).toEqual([1, 2]);

    // Reconnected: the tracker sends the restored shots. The server is written once, with each shot once, and only its answer
    // retires the device copy.
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    expect(loadEmergencySave('round-1', 'player-1')).not.toBeNull();
    expect(await autoSave(second, second.result.current.activeHoleShots)).toBeNull();
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
    expect(sentShots(0).map((s) => s.shotNumber)).toEqual([1, 2]);
    expect(loadEmergencySave('round-1', 'player-1')).toBeNull();

    // A retry of the same save (a double fire, or a resend after a lost answer) sends the same snapshot again, never a longer one.
    expect(await autoSave(second, second.result.current.activeHoleShots)).toBeNull();
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
    expect(sentShots(1).map((s) => s.shotNumber)).toEqual([1, 2]);
  });
});
