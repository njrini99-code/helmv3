/**
 * `start(form)`, the routes and the log source of the new-round engine (ROUNDS_PLAN step 5a), through the real hook
 * with every server action and browser store stubbed. The source-text tests pin the legacy flow; these pin what a
 * second renderer relies on: a start that reads the form it is handed, an engine that then runs under that form, and
 * navigation and log tags the renderer names.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  savePartialRound: vi.fn(),
  getNextQualifierRoundNumber: vi.fn(),
  getPlayerQualifiers: vi.fn(),
  deleteInProgressRound: vi.fn(),
  savePlayerCourse: vi.fn(),
  contributeCourseFromRound: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('next/navigation', () => {
  const searchParams = new URLSearchParams();
  return { useRouter: () => mocks.router, useSearchParams: () => searchParams };
});

vi.mock('@/app/golf/actions/golf', () => ({
  submitGolfRoundComprehensive: vi.fn(),
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
  getPlayerQualifiers: (...args: unknown[]) => mocks.getPlayerQualifiers(...args),
  getNextQualifierRoundNumber: (...args: unknown[]) => mocks.getNextQualifierRoundNumber(...args),
  getPlayerSavedCourses: vi.fn(async () => ({ success: true, data: [] })),
  getRecentCoursesForPlayer: vi.fn(async () => ({ success: true, data: [] })),
  savePlayerCourse: (...args: unknown[]) => mocks.savePlayerCourse(...args),
  touchSavedCourse: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/course-library', () => ({
  contributeCourseFromRound: (...args: unknown[]) => mocks.contributeCourseFromRound(...args),
}));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: vi.fn() }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: vi.fn() }));
vi.mock('@/hooks/golf/use-connection-status', () => ({
  useConnectionStatus: () => ({ isOnline: true, isConnected: true, quality: 'excellent' }),
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
  getSyncEngine: () => ({
    registerCallback: vi.fn(),
    unregisterCallback: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    syncNow: vi.fn(),
  }),
}));
vi.mock('@/lib/offline/indexed-db', () => ({ saveOfflineRound: vi.fn(async () => {}) }));
vi.mock('@/lib/offline/partial-save-beacon', () => ({ beaconPartialSave: vi.fn(() => false) }));
vi.mock('@/lib/offline/shot-storage', () => ({
  getRoundRecoverySnapshots: vi.fn(async () => []),
  saveRoundRecoverySnapshot: vi.fn(async () => {}),
  deleteRoundRecoverySnapshot: vi.fn(async () => {}),
  clearRoundRecoverySnapshotThrough: vi.fn(async () => {}),
}));
vi.mock('@/lib/recovery/use-active-work', () => ({ useActiveWork: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({
  logError: (...args: unknown[]) => mocks.logError(...args),
  isStaleServerActionError: () => false,
  softReloadForStaleServerAction: vi.fn(),
}));
vi.mock('@/lib/golf/new-round-setup-restore-signal', () => ({ reportRoundSetupRestoredAfterReload: vi.fn() }));
vi.mock('@/lib/golf/round-start-guard-signal', () => ({
  reportDuplicateCompletedRoundWarned: vi.fn(),
  reportRoundStartValidationBlocked: vi.fn(),
}));

import {
  useNewRoundSession,
  type NewRoundSessionOptions,
  type NewRoundStartForm,
} from '@/lib/golf/round-session/use-new-round-session';
import { LEGACY_ROUND_ROUTES } from '@/lib/golf/round-session/routes';

// Stable, as a real renderer's ports are.
const ports = {
  showToast: vi.fn(),
  hideMobileNav: vi.fn(),
  showMobileNav: vi.fn(),
  haptic: vi.fn(),
};

function render(options: Partial<NewRoundSessionOptions> = {}) {
  return renderHook(() => useNewRoundSession({ playerId: 'player-1', ports, ...options }));
}

const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: i % 3 === 0 ? 5 : 4, yardage: 400 + i }));

function form(overrides: Partial<NewRoundStartForm> = {}): NewRoundStartForm {
  return {
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
    ...overrides,
  };
}

const created = { success: true, data: { roundId: 'round-1', updatedAt: '2026-09-30T12:00:00.000Z' } };

beforeEach(() => {
  window.localStorage.clear();
  mocks.savePartialRound.mockResolvedValue(created);
  mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [] });
  mocks.getNextQualifierRoundNumber.mockResolvedValue({
    success: true,
    data: { nextRoundNumber: 3, availableRounds: [3], activeRoundId: 'round-1' },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('start(form)', () => {
  it('starts the round from the form it is handed and leaves the engine tracking under it', async () => {
    const hook = render();
    let result: Awaited<ReturnType<typeof hook.result.current.start>> | undefined;
    await act(async () => {
      result = await hook.result.current.start(form());
    });

    expect(result).toEqual({ ok: true, roundId: 'round-1' });
    const [payload, existingId, options] = mocks.savePartialRound.mock.calls[0]!;
    expect(existingId).toBeUndefined();
    expect(options).toMatchObject({ startIntent: true });
    expect(payload).toMatchObject({
      courseName: 'Pinehurst No. 2',
      courseId: 'course-1',
      teeId: 'tee-1',
      courseRating: 75.4,
      courseSlope: 135,
      teesPlayed: 'Blue',
      roundType: 'practice',
      roundDate: '2020-01-01',
      holesToPlay: 18,
    });
    expect(payload.holeConfigs).toHaveLength(18);

    // The engine runs under the form from here on.
    expect(hook.result.current.step).toBe('tracking');
    expect(hook.result.current.setupData.courseName).toBe('Pinehurst No. 2');
    expect(hook.result.current.holes).toHaveLength(18);
    expect(hook.result.current.resolvedCourseIdRef.current).toBe('course-1');
    expect(hook.result.current.selectedTeeIdRef.current).toBe('tee-1');
    expect(hook.result.current.savedRoundIdRef.current).toBe('round-1');
  });

  it('numbers a back nine 1..9, as the legacy hole editor does, whatever the form calls its holes', async () => {
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form({ holes: holes.slice(9).map((h) => ({ ...h })) }));
    });

    const payload = mocks.savePartialRound.mock.calls[0]![0];
    expect(payload.holesToPlay).toBe(9);
    expect(payload.holeConfigs.map((h: { holeNumber: number }) => h.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(payload.holeConfigs[0]).toMatchObject({ par: holes[9]!.par, yardage: holes[9]!.yardage });
    expect(hook.result.current.holes.map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('refuses a second start while one runs, instead of meeting the server dedupe with the round the first made', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.savePartialRound.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const hook = render();
    let first: Promise<unknown> | undefined;
    let second: Awaited<ReturnType<typeof hook.result.current.start>> | undefined;
    await act(async () => {
      first = hook.result.current.start(form());
      second = await hook.result.current.start(form());
    });
    expect(second).toEqual({ ok: false, reason: 'in_flight', error: 'A round is already starting.' });
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(created);
      await first;
    });
    expect(hook.result.current.step).toBe('tracking');
  });

  it('keeps a qualifier round number the form decided, and does not leave for Continue when the round it made comes back as active', async () => {
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form({
        setup: { ...form().setup, roundType: 'qualifier' },
        qualifierId: 'qualifier-1',
        qualifierRoundNumber: 2,
      }));
    });

    expect(mocks.savePartialRound.mock.calls[0]![0]).toMatchObject({ qualifierId: 'qualifier-1', qualifierRoundNumber: 2 });
    expect(mocks.getNextQualifierRoundNumber).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(hook.result.current.selectedQualifierId).toBe('qualifier-1');
    expect(hook.result.current.selectedRoundNumber).toBe(2);
    expect(hook.result.current.step).toBe('tracking');
  });

  it('still runs the qualifier round-number effect for a qualifier the legacy screen picked (no adoption)', async () => {
    const hook = render();
    await act(async () => {
      hook.result.current.setSelectedQualifierId('qualifier-1');
    });

    expect(mocks.getNextQualifierRoundNumber).toHaveBeenCalledWith('qualifier-1');
    // The legacy default: an active round found for the qualifier resumes it on the Fairway Continue route.
    expect(mocks.router.replace).toHaveBeenCalledWith(LEGACY_ROUND_ROUTES.continueRound('round-1'));
  });

  it('refuses an invalid form before any server call, with the sentence as both the result and the error', async () => {
    const hook = render();
    let result: Awaited<ReturnType<typeof hook.result.current.start>> | undefined;
    await act(async () => {
      result = await hook.result.current.start(form({ setup: { ...form().setup, roundDate: '2999-01-01' } }));
    });

    expect(result).toEqual({ ok: false, reason: 'invalid', error: 'Round date cannot be in the future.' });
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBe('Round date cannot be in the future.');
    expect(hook.result.current.step).toBe('setup');
  });

  it('asks for a qualifier round the form leaves out', async () => {
    const hook = render();
    let result: Awaited<ReturnType<typeof hook.result.current.start>> | undefined;
    await act(async () => {
      result = await hook.result.current.start(form({ setup: { ...form().setup, roundType: 'qualifier' }, qualifierId: 'q-1' }));
    });

    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      error: 'Please select which round of the qualifier this is',
    });
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });

  it('confirms the duplicate-course warning on the second tap of the same form', async () => {
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'duplicate_completed_round', completedRoundId: 'done-1' });
    const hook = render();
    let first: Awaited<ReturnType<typeof hook.result.current.start>> | undefined;
    await act(async () => {
      first = await hook.result.current.start(form());
    });
    expect(first).toMatchObject({ ok: false, reason: 'duplicate_completed_round' });
    expect(mocks.savePartialRound.mock.calls[0]![2]).toMatchObject({ confirmDuplicateCourse: false });

    let second: Awaited<ReturnType<typeof hook.result.current.start>> | undefined;
    await act(async () => {
      second = await hook.result.current.start(form());
    });
    expect(second).toEqual({ ok: true, roundId: 'round-1' });
    expect(mocks.savePartialRound.mock.calls[1]![2]).toMatchObject({ confirmDuplicateCourse: true });
  });

  it('does not carry a duplicate confirmation over to a different course', async () => {
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'duplicate_completed_round', completedRoundId: 'done-1' });
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form());
    });
    await act(async () => {
      await hook.result.current.start(form({ setup: { ...form().setup, courseName: 'Pinehurst No. 4' } }));
    });

    expect(mocks.savePartialRound.mock.calls[1]![2]).toMatchObject({ confirmDuplicateCourse: false });
  });

  it('reports an in-progress round as a conflict for the renderer to draw, and Resume goes where the renderer says', async () => {
    mocks.savePartialRound.mockResolvedValueOnce({
      success: false,
      error: 'in_progress_exists',
      roundId: 'round-old',
      scoredHoles: 4,
      updatedAt: '2026-09-29T12:00:00.000Z',
    });
    const hook = render({ routes: { continueRound: (id) => `/clubhouse/rounds/${id}/continue` } });
    let result: Awaited<ReturnType<typeof hook.result.current.start>> | undefined;
    await act(async () => {
      result = await hook.result.current.start(form());
    });

    expect(result).toMatchObject({ ok: false, reason: 'in_progress_exists' });
    expect(hook.result.current.inProgressConflict).toEqual({
      roundId: 'round-old',
      scoredHoles: 4,
      updatedAt: '2026-09-29T12:00:00.000Z',
    });
    expect(hook.result.current.step).toBe('setup');

    act(() => {
      hook.result.current.handleConflictResume();
    });
    expect(mocks.router.push).toHaveBeenCalledWith('/clubhouse/rounds/round-old/continue');
  });

  it('retries the whole start with the same form after Start a new round', async () => {
    mocks.savePartialRound.mockResolvedValueOnce({
      success: false,
      error: 'in_progress_exists',
      roundId: 'round-old',
      scoredHoles: 4,
      updatedAt: null,
    });
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form());
    });
    await act(async () => {
      await hook.result.current.handleConflictStartNewRound();
    });

    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
    expect(mocks.savePartialRound.mock.calls[1]![2]).toMatchObject({ confirmSeparateRound: true });
    expect(mocks.savePartialRound.mock.calls[1]![0]).toMatchObject({ courseName: 'Pinehurst No. 2', teeId: 'tee-1' });
    expect(hook.result.current.step).toBe('tracking');
  });

  it('saves a hand-typed course to the library only when the form opts in', async () => {
    mocks.savePlayerCourse.mockResolvedValue({ success: true, data: { id: 'saved-1' } });
    mocks.contributeCourseFromRound.mockResolvedValue({ success: true, data: { courseId: 'cloud-1', teeId: 'cloud-tee-1' } });

    const off = render();
    await act(async () => {
      await off.result.current.start(form({ courseId: null, teeId: null, saveCourse: false }));
    });
    expect(mocks.savePlayerCourse).not.toHaveBeenCalled();
    off.unmount();

    const on = render();
    await act(async () => {
      await on.result.current.start(form({ courseId: null, teeId: null, saveCourse: true }));
    });
    expect(mocks.savePlayerCourse).toHaveBeenCalledWith(expect.objectContaining({ courseName: 'Pinehurst No. 2', holesPerRound: 18 }));
    expect(mocks.contributeCourseFromRound).toHaveBeenCalledTimes(1);
    expect(on.result.current.selectedTeeIdRef.current).toBe('cloud-tee-1');
  });

  it('tags a failed start with the renderer\'s own component and route, and the Fairway ones by default', async () => {
    mocks.savePartialRound.mockRejectedValue(new Error('Load failed'));

    const own = render({ logSource: { component: 'ClubhouseRoundNew', route: '/clubhouse/rounds/new' } });
    let result: Awaited<ReturnType<typeof own.result.current.start>> | undefined;
    await act(async () => {
      result = await own.result.current.start(form());
    });
    expect(result).toMatchObject({ ok: false, reason: 'transport' });
    expect(mocks.logError.mock.calls[0]![1]).toMatchObject({ component: 'ClubhouseRoundNew', route: '/clubhouse/rounds/new' });
    own.unmount();
    mocks.logError.mockClear();

    const legacy = render();
    await act(async () => {
      await legacy.result.current.start(form());
    });
    expect(mocks.logError.mock.calls[0]![1]).toMatchObject({ component: 'NewRoundClient', route: '/golf/dashboard/rounds/new' });
  });
});

describe('screen handlers that live in the engine', () => {
  it('Back to setup drops the round but keeps the chosen course and its cloud tee', async () => {
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form());
    });
    expect(hook.result.current.step).toBe('tracking');

    act(() => {
      hook.result.current.handleConfirmBackToSetup();
    });
    expect(hook.result.current.step).toBe('holes');
    expect(hook.result.current.savedRoundIdRef.current).toBeNull();
    expect(hook.result.current.completedHoleStats).toEqual([]);
    expect(hook.result.current.selectedTeeIdRef.current).toBe('tee-1');
    expect(hook.result.current.setupData.courseName).toBe('Pinehurst No. 2');
  });

  it('Change course clears the cloud link, and the submit overlay actions release the submit flag', async () => {
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form());
    });

    act(() => {
      hook.result.current.handleClearSelectedCourse();
    });
    expect(hook.result.current.resolvedCourseIdRef.current).toBeNull();
    expect(hook.result.current.selectedTeeIdRef.current).toBeNull();
    expect(hook.result.current.cloudPickActive).toBe(false);
    expect(hook.result.current.setupData.courseName).toBe('');

    hook.result.current.isSubmittingRef.current = true;
    act(() => {
      hook.result.current.setStep('submitting');
      hook.result.current.setError('Nope');
    });
    act(() => {
      hook.result.current.handleSubmitGoBack();
    });
    expect(hook.result.current.step).toBe('tracking');
    expect(hook.result.current.error).toBe('');
    expect(hook.result.current.isSubmittingRef.current).toBe(false);
  });

  it('Save for later and Discard land on the library the renderer names', async () => {
    mocks.deleteInProgressRound.mockResolvedValue({ success: true });
    const hook = render({ routes: { library: '/clubhouse/rounds' } });
    await act(async () => {
      await hook.result.current.start(form());
    });
    await act(async () => {
      await hook.result.current.handleSubmitDiscard();
    });

    expect(mocks.deleteInProgressRound).toHaveBeenCalledWith('round-1');
    expect(mocks.router.push).toHaveBeenCalledWith('/clubhouse/rounds');
  });
});
