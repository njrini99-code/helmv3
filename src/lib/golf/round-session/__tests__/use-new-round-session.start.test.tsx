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
  reportValidationBlocked: vi.fn(),
  reportDuplicateWarned: vi.fn(),
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
  reportDuplicateCompletedRoundWarned: (...args: unknown[]) => mocks.reportDuplicateWarned(...args),
  reportRoundStartValidationBlocked: (...args: unknown[]) => mocks.reportValidationBlocked(...args),
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
    // Start's own check finds round 2 open; every later answer (the effect, if it ran) finds the round it made active.
    mocks.getNextQualifierRoundNumber.mockResolvedValueOnce({
      success: true,
      data: { nextRoundNumber: 2, availableRounds: [2] },
    });
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form({
        setup: { ...form().setup, roundType: 'qualifier' },
        qualifierId: 'qualifier-1',
        qualifierRoundNumber: 2,
      }));
    });

    expect(mocks.savePartialRound.mock.calls[0]![0]).toMatchObject({ qualifierId: 'qualifier-1', qualifierRoundNumber: 2 });
    expect(mocks.getNextQualifierRoundNumber).toHaveBeenCalledTimes(1);
    expect(mocks.getNextQualifierRoundNumber).toHaveBeenCalledWith('qualifier-1');
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

const qualifierForm = (roundNumber: number | null = 2) =>
  form({ setup: { ...form().setup, roundType: 'qualifier' }, qualifierId: 'qualifier-1', qualifierRoundNumber: roundNumber });

type StartResult = Awaited<ReturnType<ReturnType<typeof render>['result']['current']['start']>>;

describe('start(form): the qualifier round is checked with the server before a round is created', () => {
  it('refuses a round the player already has in progress, and hands back its id to continue', async () => {
    mocks.getNextQualifierRoundNumber.mockResolvedValue({
      success: true,
      data: { nextRoundNumber: 2, availableRounds: [], activeRoundId: 'round-active' },
    });
    const hook = render();
    let result: StartResult | undefined;
    await act(async () => {
      result = await hook.result.current.start(qualifierForm());
    });

    expect(result).toEqual({
      ok: false,
      reason: 'qualifier_round_active',
      error: 'You already have a round in progress for this qualifier.',
      roundId: 'round-active',
    });
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBe('You already have a round in progress for this qualifier.');
    expect(hook.result.current.step).toBe('setup');
  });

  it('refuses a round number past the qualifier\'s rounds, or one the player cannot play now', async () => {
    mocks.getNextQualifierRoundNumber.mockResolvedValue({
      success: true,
      data: { nextRoundNumber: 2, availableRounds: [2] },
    });
    const hook = render();
    let result: StartResult | undefined;
    await act(async () => {
      result = await hook.result.current.start(qualifierForm(7));
    });

    expect(result).toEqual({
      ok: false,
      reason: 'qualifier_round_unavailable',
      error: 'Round 7 of this qualifier is not open to you now. Your next round is 2.',
    });
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(hook.result.current.error).toContain('Round 7');
  });

  it('refuses a qualifier the server cannot vouch for: not entered, signed out, or unreachable', async () => {
    mocks.getNextQualifierRoundNumber.mockResolvedValueOnce({ success: false, error: 'You are not entered in this qualifier' });
    const hook = render();
    let result: StartResult | undefined;
    await act(async () => {
      result = await hook.result.current.start(qualifierForm());
    });
    expect(result).toEqual({ ok: false, reason: 'qualifier_unverified', error: 'You are not entered in this qualifier' });

    mocks.getNextQualifierRoundNumber.mockRejectedValueOnce(new Error('Load failed'));
    await act(async () => {
      result = await hook.result.current.start(qualifierForm());
    });
    expect(result).toEqual({
      ok: false,
      reason: 'qualifier_unverified',
      error: 'We could not verify your next qualifier round. Try again before starting.',
    });
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });

  it('starts the round the server says is open, and never asks about a practice round', async () => {
    mocks.getNextQualifierRoundNumber.mockResolvedValueOnce({ success: true, data: { nextRoundNumber: 2, availableRounds: [2] } });
    const hook = render();
    await act(async () => {
      await hook.result.current.start(qualifierForm(2));
    });
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
    expect(hook.result.current.step).toBe('tracking');
    hook.unmount();

    mocks.getNextQualifierRoundNumber.mockClear();
    const practice = render();
    await act(async () => {
      await practice.result.current.start(form());
    });
    expect(mocks.getNextQualifierRoundNumber).not.toHaveBeenCalled();
  });
});

describe('start(form): the hole rules the legacy hole editor enforces', () => {
  const at = (index: number, patch: Partial<(typeof holes)[number]>) => holes.map((h, i) => (i === index ? { ...h, ...patch } : h));

  it.each([
    ['ten holes', holes.slice(0, 10), 'A round has 9 or 18 holes'],
    ['no holes', [], 'A round has 9 or 18 holes'],
    ['a par of 2', at(3, { par: 2 }), 'Hole 4: par must be 3 to 6'],
    ['a par of 7', at(3, { par: 7 }), 'Hole 4: par must be 3 to 6'],
    ['a par of 4.5', at(3, { par: 4.5 }), 'Hole 4: par must be 3 to 6'],
    ['no yardage', at(0, { yardage: 0 }), 'Hole 1 needs a yardage'],
    ['a yardage that is not a number', at(0, { yardage: Number.NaN }), 'Hole 1 needs a yardage'],
    ['a yardage over 999', at(17, { yardage: 1000 }), 'Hole 18: 1000 yards is too long (999 at most)'],
  ])('refuses %s before anything is adopted or written', async (_name, badHoles, message) => {
    const hook = render();
    let result: StartResult | undefined;
    await act(async () => {
      result = await hook.result.current.start(form({ holes: badHoles }));
    });

    expect(result).toEqual({ ok: false, reason: 'invalid', error: message });
    expect(hook.result.current.error).toBe(message);
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(hook.result.current.setupData.courseName).toBe('');
    expect(hook.result.current.resolvedCourseIdRef.current).toBeNull();
  });

  it('accepts a 9-hole round, and the edge pars and yardages', async () => {
    const hook = render();
    let result: StartResult | undefined;
    await act(async () => {
      result = await hook.result.current.start(
        form({ holes: holes.slice(0, 9).map((h, i) => ({ ...h, par: i % 2 ? 6 : 3, yardage: i % 2 ? 999 : 1 })) }),
      );
    });
    expect(result).toEqual({ ok: true, roundId: 'round-1' });
  });
});

describe('start(form): nothing is adopted until the form has passed', () => {
  it('leaves the engine untouched by a refused form, so the qualifier picker still works afterwards', async () => {
    const hook = render();
    await act(async () => {
      await hook.result.current.start({ ...qualifierForm(), holes: holes.slice(0, 10) });
    });

    expect(hook.result.current.setupData.courseName).toBe('');
    expect(hook.result.current.selectedQualifierId).toBeNull();
    expect(hook.result.current.selectedRoundNumber).toBeNull();
    expect(hook.result.current.selectedTeeIdRef.current).toBeNull();
    expect(hook.result.current.cloudPickActive).toBe(false);

    // The guard that keeps a started qualifier out of the round-number effect must not have been armed.
    await act(async () => {
      hook.result.current.setSelectedQualifierId('qualifier-1');
    });
    expect(mocks.getNextQualifierRoundNumber).toHaveBeenCalledWith('qualifier-1');
  });

  it('leaves the engine untouched by a qualifier the server refused', async () => {
    mocks.getNextQualifierRoundNumber.mockResolvedValueOnce({ success: false, error: 'You are not entered in this qualifier' });
    const hook = render();
    await act(async () => {
      await hook.result.current.start(qualifierForm());
    });
    expect(hook.result.current.setupData.courseName).toBe('');
    expect(hook.result.current.selectedQualifierId).toBeNull();
  });
});

describe('start(form): the conflict prompt does not outlive the setup it was raised for', () => {
  it('is cleared as soon as a different setup is started', async () => {
    mocks.savePartialRound.mockResolvedValueOnce({
      success: false,
      error: 'in_progress_exists',
      roundId: 'round-old',
      scoredHoles: 4,
      updatedAt: null,
    });
    const hook = render();
    let first: StartResult | undefined;
    await act(async () => {
      first = await hook.result.current.start(form());
    });
    expect(first).toMatchObject({ ok: false, reason: 'in_progress_exists', roundId: 'round-old' });
    expect(hook.result.current.inProgressConflict).not.toBeNull();

    mocks.savePartialRound.mockRejectedValueOnce(new Error('Load failed'));
    await act(async () => {
      await hook.result.current.start(form({ setup: { ...form().setup, courseName: 'Pinehurst No. 4' } }));
    });
    expect(hook.result.current.inProgressConflict).toBeNull();
    expect(hook.result.current.discardConfirming).toBe(false);
  });
});

describe('start(form): a round that is already running is not started again', () => {
  it('refuses a second start once the round exists, before the screen has re-rendered as tracking', async () => {
    const hook = render();
    let second: StartResult | undefined;
    await act(async () => {
      await hook.result.current.start(form());
      second = await hook.result.current.start(form());
    });

    expect(second).toEqual({ ok: false, reason: 'already_started', error: 'A round is already in progress on this screen.' });
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBe('');
  });

  it('refuses on the step alone: tracking or submitting, whether or not a round id is recorded yet', async () => {
    const hook = render();
    for (const step of ['tracking', 'submitting'] as const) {
      act(() => {
        hook.result.current.setStep(step);
      });
      let result: StartResult | undefined;
      await act(async () => {
        result = await hook.result.current.start(form());
      });
      expect(result).toMatchObject({ ok: false, reason: 'already_started' });
    }
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(hook.result.current.setupData.courseName).toBe('');
  });

  it('refuses while tracking or submitting, and starts again after Back to setup', async () => {
    const hook = render();
    await act(async () => {
      await hook.result.current.start(form());
    });
    let result: StartResult | undefined;
    await act(async () => {
      result = await hook.result.current.start(form());
    });
    expect(result).toMatchObject({ ok: false, reason: 'already_started' });

    act(() => {
      hook.result.current.setStep('submitting');
    });
    await act(async () => {
      result = await hook.result.current.start(form());
    });
    expect(result).toMatchObject({ ok: false, reason: 'already_started' });
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);

    act(() => {
      hook.result.current.setStep('tracking');
    });
    act(() => {
      hook.result.current.handleConfirmBackToSetup();
    });
    await act(async () => {
      result = await hook.result.current.start(form());
    });
    expect(result).toEqual({ ok: true, roundId: 'round-1' });
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
  });
});

describe('start(form): a library save that fails does not undo a started round', () => {
  beforeEach(() => {
    mocks.savePlayerCourse.mockRejectedValue(new Error('Load failed'));
    mocks.contributeCourseFromRound.mockResolvedValue({ success: false });
  });
  afterEach(() => {
    mocks.savePlayerCourse.mockReset();
    mocks.contributeCourseFromRound.mockReset();
  });

  it('still answers with the round, moves to tracking and frees the start lock', async () => {
    const hook = render();
    let result: StartResult | undefined;
    await act(async () => {
      result = await hook.result.current.start(form({ courseId: null, teeId: null, saveCourse: true }));
    });

    expect(result).toEqual({ ok: true, roundId: 'round-1' });
    expect(mocks.savePlayerCourse).toHaveBeenCalledTimes(1);
    expect(hook.result.current.step).toBe('tracking');
    expect(hook.result.current.isStartingRound).toBe(false);
  });

  it('is unchanged on the legacy screen: the rejection still reaches its caller', async () => {
    const hook = render();
    act(() => {
      hook.result.current.setSetupData(form().setup);
      hook.result.current.setSaveCourseChecked(true);
    });
    let error: unknown;
    await act(async () => {
      try {
        await hook.result.current.handleConfirmedHolesSave(holes);
      } catch (err) {
        error = err;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
    expect(hook.result.current.step).toBe('setup');
  });
});

describe('the legacy Start round (handleConfirmedHolesSave) goes through the start gate', () => {
  it('starts nothing for a qualifier round the player has not picked, and says why', async () => {
    const hook = render();
    act(() => {
      hook.result.current.setSetupData({ ...form().setup, roundType: 'qualifier' });
    });
    await act(async () => {
      await hook.result.current.handleConfirmedHolesSave(holes);
    });

    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBe('Please select a qualifier');
    expect(hook.result.current.isStartingRound).toBe(false);
    expect(mocks.reportValidationBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ validationError: 'Please select a qualifier', roundType: 'qualifier' }),
      { component: 'NewRoundClient', route: '/golf/dashboard/rounds/new' },
    );
  });

  it('sends the same request start(form) does for the same setup', async () => {
    const legacy = render();
    act(() => {
      legacy.result.current.setSetupData(form().setup);
      legacy.result.current.resolvedCourseIdRef.current = 'course-1';
      legacy.result.current.selectedTeeIdRef.current = 'tee-1';
    });
    await act(async () => {
      await legacy.result.current.handleConfirmedHolesSave(holes);
    });
    legacy.unmount();

    const fresh = render();
    await act(async () => {
      await fresh.result.current.start(form());
    });

    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
    expect(mocks.savePartialRound.mock.calls[0]).toEqual(mocks.savePartialRound.mock.calls[1]);
    expect(mocks.savePartialRound.mock.calls[0]![0].holeConfigs).toHaveLength(18);
  });
});

describe('the guard signals carry the renderer\'s own log source', () => {
  const logSource = { component: 'ClubhouseRoundNew', route: '/clubhouse/rounds/new' };

  it('for a form the start gate refuses, and for a duplicate-course warning', async () => {
    const hook = render({ logSource });
    await act(async () => {
      await hook.result.current.start(form({ setup: { ...form().setup, roundDate: '2999-01-01' } }));
    });
    expect(mocks.reportValidationBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ validationError: 'Round date cannot be in the future.' }),
      logSource,
    );

    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'duplicate_completed_round', completedRoundId: 'done-1' });
    await act(async () => {
      await hook.result.current.start(form());
    });
    expect(mocks.reportDuplicateWarned).toHaveBeenCalledWith(expect.objectContaining({ completedRoundId: 'done-1' }), logSource);
  });
});
