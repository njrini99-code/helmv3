/**
 * The continue-round engine's ports, routes and lifted screen handlers (ROUNDS_PLAN step 5c), through the real hook
 * with every server action and browser store stubbed. The source-text tests pin the logic; these pin what a second
 * renderer relies on: toasts through its port, navigation where it says, and the recovery, qualifier-number and
 * submit-overlay actions living in the engine.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HoleStats } from '@/lib/types/golf';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  savePartialRound: vi.fn(),
  submitGolfRoundComprehensive: vi.fn(),
  deleteInProgressRound: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/app/golf/actions/golf', () => ({
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  submitGolfRoundComprehensive: (...args: unknown[]) => mocks.submitGolfRoundComprehensive(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
}));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: vi.fn() }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: vi.fn() }));
vi.mock('@/hooks/golf/use-round-status-sync', () => ({ useRoundStatusSync: vi.fn() }));
vi.mock('@/stores/offline-sync-store', () => {
  const status = { isOnline: true, isSyncing: false, pendingCount: { total: 0 }, syncError: null };
  return { useOfflineSyncStatus: () => status };
});
vi.mock('@/lib/offline/indexed-db', () => ({
  saveOfflineRound: vi.fn(async () => {}),
  deleteOfflineRound: vi.fn(async () => {}),
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

import { emergencySave, loadEmergencySave } from '@/lib/utils/emergency-save';
import {
  useContinueRoundSession,
  type ContinueRoundSessionOptions,
  type ContinueRoundSessionProps,
} from '@/lib/golf/round-session/use-continue-round-session';
import { LEGACY_ROUND_ROUTES } from '@/lib/golf/round-session/routes';

// Stable, as a real renderer's port is.
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
const noStats: HoleStats[] = [];

function render(options: Partial<ContinueRoundSessionProps & ContinueRoundSessionOptions> = {}) {
  return renderHook(() =>
    useContinueRoundSession({
      roundId: 'round-1',
      playerId: 'player-1',
      setupData,
      holes,
      completedHoleStats: noStats,
      startHoleIndex: 0,
      ports,
      ...options,
    }),
  );
}

// The recovery check on mount awaits a few promises before it settles.
const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

const saved = { success: true, data: { roundId: 'round-1', updatedAt: '2026-09-30T12:00:00.000Z' } };
const holeStats = { holeNumber: 1, par: 4, yardage: 400, score: 4, putts: 2, shots: [] } as unknown as HoleStats;

beforeEach(() => {
  window.localStorage.clear();
  mocks.savePartialRound.mockResolvedValue(saved);
  mocks.deleteInProgressRound.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('routes', () => {
  it('Save for later and Discard land on the library the renderer names, and on the Fairway one by default', async () => {
    const own = render({ routes: { library: '/clubhouse/rounds' } });
    await act(async () => {
      await own.result.current.handleSaveForLater();
    });
    await act(async () => {
      await own.result.current.handleDeleteRound();
    });
    expect(mocks.router.push.mock.calls).toEqual([['/clubhouse/rounds'], ['/clubhouse/rounds']]);
    own.unmount();
    mocks.router.push.mockClear();

    const legacy = render();
    await act(async () => {
      await legacy.result.current.handleSaveForLater();
    });
    expect(mocks.router.push).toHaveBeenCalledWith(LEGACY_ROUND_ROUTES.library);
  });

  it('sends a round the server already completed to the round page the renderer names', async () => {
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'This round has already been completed.' });
    const hook = render({ routes: { round: (id) => `/clubhouse/rounds/${id}` } });
    await act(async () => {
      await hook.result.current.handleSaveForLater();
    });

    expect(mocks.router.replace).toHaveBeenCalledWith('/clubhouse/rounds/round-1');
  });

  it('moves onto the re-created round through the continue route the renderer names', async () => {
    mocks.savePartialRound
      .mockResolvedValueOnce({ success: false, error: 'round_missing' })
      .mockResolvedValueOnce({ success: true, data: { roundId: 'round-2', updatedAt: '2026-09-30T12:05:00.000Z' } });
    const hook = render({ routes: { continueRound: (id) => `/clubhouse/rounds/${id}/continue` } });
    await act(async () => {
      await hook.result.current.handleHoleComplete(0, holeStats);
    });

    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
    expect(mocks.savePartialRound.mock.calls[1]![1]).toBeUndefined();
    expect(mocks.router.replace).toHaveBeenCalledWith('/clubhouse/rounds/round-2/continue');
    expect(hook.result.current.roundId).toBe('round-2');
  });

  it('opens the recovery flow the renderer names when a submit could not reach the server', async () => {
    mocks.submitGolfRoundComprehensive.mockRejectedValue(new Error('Failed to fetch'));
    const hook = render({ routes: { recover: '/clubhouse/rounds/recover' } });
    await act(async () => {
      await hook.result.current.handleRoundSubmit([holeStats]);
    });

    expect(ports.showToast).toHaveBeenCalledWith('Round saved on this device. Opening recovery flow.', 'warning');
    expect(mocks.router.push).toHaveBeenCalledWith('/clubhouse/rounds/recover');
  });
});

describe('the toast port', () => {
  it('carries the engine\'s messages', async () => {
    mocks.savePartialRound.mockRejectedValue(new Error('Load failed'));
    const hook = render();
    await act(async () => {
      await hook.result.current.handleSaveForLater();
    });
    expect(ports.showToast).toHaveBeenCalledWith('Failed to save round. Please try again.', 'error');

    mocks.deleteInProgressRound.mockResolvedValue({ success: false, error: 'This round can no longer be discarded.' });
    await act(async () => {
      await hook.result.current.handleDeleteRound();
    });
    expect(ports.showToast).toHaveBeenCalledWith('This round can no longer be discarded.', 'error');
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});

describe('screen handlers that live in the engine', () => {
  function snapshot(timestamp: number) {
    emergencySave({
      playerId: 'player-1',
      roundId: 'round-1',
      timestamp,
      setupData,
      holes: [{ ...holes[0]!, score: 4 }, holes[1]!],
      completedHoleStats: [holeStats],
      inProgressShotsByHole: {},
      currentHoleIndex: 1,
    });
  }

  it('offers a newer device snapshot, and Restore puts its holes and position back', async () => {
    snapshot(Date.now());
    const hook = render();
    await flush();
    expect(hook.result.current.showRecoveryDialog).toBe(true);

    act(() => {
      hook.result.current.handleRestoreRecovery();
    });
    expect(hook.result.current.completedHoleStats).toEqual([holeStats]);
    expect(hook.result.current.holes[0]!.score).toBe(4);
    expect(hook.result.current.currentHoleIndex).toBe(1);
    expect(hook.result.current.activeProgressHoleRef.current).toBe(1);
    expect(hook.result.current.showRecoveryDialog).toBe(false);
    // The snapshot stays until the next successful server save clears it.
    expect(loadEmergencySave('round-1', 'player-1')).not.toBeNull();
  });

  it('Discard drops the snapshot', async () => {
    snapshot(Date.now());
    const hook = render();
    await flush();
    act(() => {
      hook.result.current.handleDiscardRecovery();
    });

    expect(hook.result.current.showRecoveryDialog).toBe(false);
    expect(hook.result.current.recoveryData).toBeNull();
    expect(loadEmergencySave('round-1', 'player-1')).toBeNull();
  });

  it('the qualifier round-number dialog returns to the finish confirm on Back, and submits the chosen round', async () => {
    mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: true, data: { roundId: 'round-1' } });
    const hook = render({
      setupData: { ...setupData, roundType: 'qualifier', qualifierId: 'q-1' },
      holes: [holes[0]!],
      completedHoleStats: [holeStats],
    });
    await flush();
    // Every hole is scored on mount, so the finish confirm is up; asking for the number closes it.
    expect(hook.result.current.pendingFinalStats).toEqual([holeStats]);
    await act(async () => {
      await hook.result.current.requestRoundSubmission([holeStats]);
    });
    expect(hook.result.current.showQualifierRoundNumberDialog).toBe(true);
    expect(hook.result.current.showFinishConfirm).toBe(false);

    act(() => {
      hook.result.current.handleQualifierRoundBack();
    });
    expect(hook.result.current.showQualifierRoundNumberDialog).toBe(false);
    expect(hook.result.current.showFinishConfirm).toBe(true);

    await act(async () => {
      await hook.result.current.requestRoundSubmission([holeStats]);
    });
    act(() => {
      hook.result.current.setSelectedQualifierRoundNumber(2);
    });
    await act(async () => {
      hook.result.current.handleQualifierRoundSubmit();
    });
    expect(mocks.submitGolfRoundComprehensive.mock.calls[0]![0]).toMatchObject({ qualifierId: 'q-1', qualifierRoundNumber: 2 });
    expect(hook.result.current.completedRoundId).toBe('round-1');
  });

  it('the submit overlay actions release the submit flag: go back, retry, save and exit, discard', async () => {
    mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: false, error: 'Total score appears invalid.' });
    const hook = render({ holes: [holes[0]!], completedHoleStats: [holeStats] });
    await flush();
    await act(async () => {
      await hook.result.current.handleRoundSubmit([holeStats]);
    });
    expect(hook.result.current.submitting).toBe(true);
    expect(hook.result.current.error).not.toBe('');

    act(() => {
      hook.result.current.handleSubmitGoBack();
    });
    expect(hook.result.current.submitting).toBe(false);
    expect(hook.result.current.error).toBe('');
    expect(hook.result.current.isSubmittingRef.current).toBe(false);
    expect(hook.result.current.showFinishConfirm).toBe(true);

    await act(async () => {
      await hook.result.current.handleRoundSubmit([holeStats]);
    });
    await act(async () => {
      hook.result.current.handleSubmitRetry();
    });
    expect(mocks.submitGolfRoundComprehensive).toHaveBeenCalledTimes(3);

    await act(async () => {
      await hook.result.current.handleSubmitSaveAndExit();
    });
    expect(hook.result.current.submitting).toBe(false);
    expect(mocks.router.push).toHaveBeenCalledWith(LEGACY_ROUND_ROUTES.library);

    mocks.router.push.mockClear();
    await act(async () => {
      await hook.result.current.handleSubmitDiscard();
    });
    expect(mocks.deleteInProgressRound).toHaveBeenCalledWith('round-1');
    expect(mocks.router.push).toHaveBeenCalledWith(LEGACY_ROUND_ROUTES.library);
  });
});
