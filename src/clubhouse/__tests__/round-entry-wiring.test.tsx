import { LazyMotion, domAnimation } from 'framer-motion';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round entry wired to the engine (P011, Q-81): /rounds/new in Clubhouse, through the real new-round engine
 * (`useNewRoundSession`) with every server action and browser store stubbed, as the engine's own start test does.
 * The setup screen is the real one, over the real ports (`setup-reads`), so a start goes from a tap on Start to
 * the engine and back. The shot screen is a stub that hands its props to the test. Each state is found by its
 * catalog number in docs/clubhouse/catalog/rounds.md.
 */

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  search: new URLSearchParams(),
  savePartialRound: vi.fn(),
  submitGolfRoundComprehensive: vi.fn(),
  deleteInProgressRound: vi.fn(),
  getNextQualifierRoundNumber: vi.fn(),
  getPlayerQualifiers: vi.fn(),
  updateRoundType: vi.fn(),
  checkRoundStaleness: vi.fn(),
  connection: { isOnline: true, isConnected: true, quality: 'excellent' },
  tracking: { current: null as null | Record<string, (...args: never[]) => unknown> },
  haptic: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router, useSearchParams: () => mocks.search }));
vi.mock('../lib/haptics', () => ({ haptic: mocks.haptic }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/app/golf/actions/golf', () => ({
  submitGolfRoundComprehensive: (...args: unknown[]) => mocks.submitGolfRoundComprehensive(...args),
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
  getPlayerQualifiers: (...args: unknown[]) => mocks.getPlayerQualifiers(...args),
  getNextQualifierRoundNumber: (...args: unknown[]) => mocks.getNextQualifierRoundNumber(...args),
  getPlayerSavedCourses: vi.fn(async () => ({ success: true, data: [] })),
  getRecentCoursesForPlayer: vi.fn(async () => ({ success: true, data: [] })),
  savePlayerCourse: vi.fn(async () => ({ success: true, data: { id: 'sc-1' } })),
  touchSavedCourse: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/course-library', () => ({
  contributeCourseFromRound: vi.fn(async () => ({ success: false })),
  listCoursesStrict: vi.fn(async () => [{ id: 'c1', name: 'Finley GC', city: 'Chapel Hill', state: 'NC', total_par: 72 }]),
  getRecentlyPlayedCourses: vi.fn(async () => []),
  getTeamSavedCourses: vi.fn(async () => []),
  getCourseDetail: vi.fn(async () => ({
    course: { id: 'c1', name: 'Finley GC' },
    tees: [{ id: 't1', course_id: 'c1', tee_name: 'Blue', tee_color: 'blue', category: 'mens', total_yards: 6984, total_par: 72, course_rating: 73.1, slope_rating: 133, holes_count: 18, is_draft: false }],
  })),
  getTeeWithHoles: vi.fn(async () => ({
    id: 't1',
    holes: Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: [4, 5, 3][i % 3], yardage: 380 + i })),
  })),
}));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: (...args: unknown[]) => mocks.checkRoundStaleness(...args) }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: (...args: unknown[]) => mocks.updateRoundType(...args) }));
vi.mock('@/hooks/golf/use-connection-status', () => ({ useConnectionStatus: () => mocks.connection }));
vi.mock('@/hooks/golf/use-round-status-sync', () => ({ useRoundStatusSync: vi.fn() }));
vi.mock('@/stores/offline-sync-store', () => {
  const state = { updatePendingCount: vi.fn(async () => {}), setOnline: vi.fn(), setSlowConnection: vi.fn() };
  const status = { syncError: null, pendingCount: { total: 0 } };
  return { useOfflineSyncStore: Object.assign(() => state, { getState: () => state }), useOfflineSyncStatus: () => status };
});
vi.mock('@/lib/offline/sync-engine', () => ({ getSyncEngine: () => ({ registerCallback: vi.fn(), unregisterCallback: vi.fn(), start: vi.fn(), stop: vi.fn(), syncNow: vi.fn() }) }));
vi.mock('@/lib/offline/indexed-db', () => ({ saveOfflineRound: vi.fn(async () => {}) }));
vi.mock('@/lib/offline/partial-save-beacon', () => ({ beaconPartialSave: vi.fn(() => false) }));
vi.mock('@/lib/offline/shot-storage', () => ({
  getRoundRecoverySnapshots: vi.fn(async () => []),
  saveRoundRecoverySnapshot: vi.fn(async () => {}),
  deleteRoundRecoverySnapshot: vi.fn(async () => {}),
  clearRoundRecoverySnapshotThrough: vi.fn(async () => {}),
}));
vi.mock('@/lib/recovery/use-active-work', () => ({ useActiveWork: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn(), isStaleServerActionError: () => false, softReloadForStaleServerAction: vi.fn() }));
vi.mock('@/lib/golf/new-round-setup-restore-signal', () => ({ reportRoundSetupRestoredAfterReload: vi.fn() }));
vi.mock('@/lib/golf/round-start-guard-signal', () => ({ reportDuplicateCompletedRoundWarned: vi.fn(), reportRoundStartValidationBlocked: vi.fn() }));
// The shot screen is its own tests' subject: here it is a stand-in that hands the round its props.
vi.mock('../screens/rounds/track/RoundTracking', () => ({
  RoundTracking: (props: Record<string, unknown>) => {
    mocks.tracking.current = props as never;
    return (
      <div data-testid="tracking">
        <button type="button" onClick={props.onExit as () => void}>
          Exit
        </button>
        {props.statusSlot as never}
      </div>
    );
  },
}));

import { emergencySave, loadLatestEmergencySave } from '@/lib/utils/emergency-save';
import { NewRound } from '../screens/rounds/entry/NewRound';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const NOW = '2026-10-14T12:00:00.000Z';
const ok = (roundId = 'round-1') => ({ success: true, data: { roundId, updatedAt: NOW } });
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
const toastAction = (c: string, name: string | RegExp) => within(code(c)!).queryByRole('button', { name });
const startBtn = () => screen.getByRole('button', { name: /Start round|Starting/ });
const tracking = () => mocks.tracking.current as unknown as {
  onHoleComplete: (index: number, stats: unknown) => Promise<boolean>;
  onExit: () => void;
  statusSlot?: unknown;
};
const ticks = (kind: string) => mocks.haptic.mock.calls.filter(([k]) => k === kind).length;
const startCalls = () => mocks.savePartialRound.mock.calls.filter(([, id]) => id === undefined);
const saveCalls = () => mocks.savePartialRound.mock.calls.filter(([, id]) => id !== undefined);

function stats(index: number) {
  return { holeNumber: index + 1, par: 4, yardage: 380, score: 4, putts: 2, fairwayHit: true, greenInRegulation: true, penaltyStrokes: 0, shots: [] };
}

function renderNew() {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <NewRound playerId="player-1" />
      </ToastProvider>
    </LazyMotion>,
  );
  return user;
}

/** Course, tees and card, then (optionally) the nine, and Start. */
async function pickCourse(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Browse courses/ }));
  await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
  await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
}
async function startRound(user: ReturnType<typeof userEvent.setup>, { nine = false } = {}) {
  await pickCourse(user);
  if (nine) await user.click(screen.getByRole('radio', { name: '9 holes' }));
  await user.click(startBtn());
}
/** The qualifier round of the open qualifier, with the course picked by hand. */
async function startQualifierRound(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Open qualifier/ }));
  await pickCourse(user);
  await user.click(startBtn());
}

const qualifier = { id: 'q1', name: 'Fall qualifier', status: 'in_progress', numRounds: 3, roundsCompleted: 0, courseName: 'Finley GC' };

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  localStorage.clear();
  mocks.search = new URLSearchParams();
  mocks.connection.isConnected = true;
  mocks.tracking.current = null;
  mocks.savePartialRound.mockImplementation(async () => ok());
  mocks.deleteInProgressRound.mockResolvedValue({ success: true });
  mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [] });
  mocks.getNextQualifierRoundNumber.mockResolvedValue({ success: true, data: { nextRoundNumber: 1, availableRounds: [1, 2, 3] } });
  mocks.checkRoundStaleness.mockResolvedValue({ success: true, data: { status: 'in_progress', isStale: false, currentUpdatedAt: NOW } });
  mocks.updateRoundType.mockResolvedValue({ success: true });
  mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: true, data: { roundId: 'round-1' } });
});
afterEach(() => vi.restoreAllMocks());

// ── Starting: what each refusal of the engine becomes ──

describe('112401 Round entry: a start the engine refuses (CH-11514, CH-11007, CH-11014 to CH-11016, CH-11907)', () => {
  const conflict = { success: false, error: 'in_progress_exists', roundId: 'old-1', scoredHoles: 4, updatedAt: '2026-10-14T10:00:00.000Z' };

  it('CH-11514 a round already in progress asks what to do, and is not a failed start; Resume opens that round', async () => {
    mocks.savePartialRound.mockResolvedValueOnce(conflict);
    const user = renderNew();
    await startRound(user);
    await waitFor(() => expect(code('CH-11514')).toHaveAttribute('open'));
    expect(code('CH-11514')).toHaveTextContent('Round already in progress');
    expect(code('CH-11007')).toBeNull();
    expect(document.querySelector('.ch-toast')).toBeNull();
    expect(screen.queryByTestId('tracking')).toBeNull();
    await user.click(within(code('CH-11514')!).getByRole('button', { name: /^Resume/ }));
    expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds/continue/old-1');
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
  });

  it('CH-11514 Start a new round keeps that round and starts a separate one (confirmSeparateRound)', async () => {
    mocks.savePartialRound.mockResolvedValueOnce(conflict);
    const user = renderNew();
    await startRound(user);
    await waitFor(() => expect(code('CH-11514')).toHaveAttribute('open'));
    await user.click(within(code('CH-11514')!).getByRole('button', { name: /^Start a new round/ }));
    await screen.findByTestId('tracking');
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
    expect(mocks.savePartialRound.mock.calls[1]![2]).toMatchObject({ startIntent: true, confirmSeparateRound: true });
    expect(mocks.deleteInProgressRound).not.toHaveBeenCalled();
  });

  it('CH-11515 Discard asks first, then deletes the other round and starts this one', async () => {
    mocks.savePartialRound.mockResolvedValueOnce(conflict);
    const user = renderNew();
    await startRound(user);
    await waitFor(() => expect(code('CH-11514')).toHaveAttribute('open'));
    await user.click(within(code('CH-11514')!).getByRole('button', { name: /^Discard/ }));
    expect(code('CH-11515')).toHaveTextContent('It has 4 scored holes');
    expect(mocks.deleteInProgressRound).not.toHaveBeenCalled();
    await user.click(within(code('CH-11515')!).getByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(mocks.deleteInProgressRound).toHaveBeenCalledWith('old-1'));
    await screen.findByTestId('tracking');
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(2);
    expect(ticks('warning')).toBeGreaterThan(0);
  });

  it('CH-11009 a Discard that fails stays in its question with the reason, and can be tried again', async () => {
    mocks.savePartialRound.mockResolvedValueOnce(conflict);
    mocks.deleteInProgressRound.mockResolvedValueOnce({ success: false, error: 'This round can no longer be discarded.' }).mockResolvedValue({ success: true });
    const user = renderNew();
    await startRound(user);
    await waitFor(() => expect(code('CH-11514')).toHaveAttribute('open'));
    await user.click(within(code('CH-11514')!).getByRole('button', { name: /^Discard/ }));
    await user.click(within(code('CH-11515')!).getByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(code('CH-11009')).toHaveTextContent('This round can no longer be discarded.'));
    expect(screen.queryByTestId('tracking')).toBeNull();
    await user.click(within(code('CH-11515')!).getByRole('button', { name: 'Discard round' }));
    await screen.findByTestId('tracking');
    expect(mocks.deleteInProgressRound).toHaveBeenCalledTimes(2);
  });

  it('110110 111404 CH-11007 a start the server rejects is a toast with Retry, and Retry starts it with the engine as it is now', async () => {
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'The server is busy' });
    const user = renderNew();
    await startRound(user);
    await waitFor(() => expect(code('CH-11007')).toHaveTextContent("Couldn't start your round at Finley GC"));
    await user.click(toastAction('CH-11007', 'Retry')!);
    await screen.findByTestId('tracking');
    expect(startCalls()).toHaveLength(2);
  });

  it('111404 CH-11016 a completed round on this course and day warns once; the toast’s Start anyway is the second Start and goes ahead', async () => {
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'duplicate_completed_round', completedRoundId: 'done-1' });
    const user = renderNew();
    await startRound(user);
    await waitFor(() => expect(code('CH-11016')).toHaveTextContent('You already have a completed round for this course on this date'));
    expect(toastAction('CH-11016', 'Retry')).toBeNull();
    await user.click(toastAction('CH-11016', 'Start anyway')!);
    await screen.findByTestId('tracking');
    expect(mocks.savePartialRound.mock.calls[1]![2]).toMatchObject({ confirmDuplicateCourse: true });
  });

  it('CH-11907 a qualifier round already in progress opens it, and is not a failed start', async () => {
    mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [qualifier] });
    mocks.getNextQualifierRoundNumber
      .mockResolvedValueOnce({ success: true, data: { nextRoundNumber: 1, availableRounds: [1, 2, 3] } })
      .mockResolvedValue({ success: true, data: { nextRoundNumber: 1, availableRounds: [1, 2, 3], activeRoundId: 'q-active' } });
    const user = renderNew();
    await startQualifierRound(user);
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds/continue/q-active'));
    expect(code('CH-11907')).toHaveTextContent('You already have a round in progress for this qualifier');
    expect(code('CH-11007')).toBeNull();
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });

  it('CH-11014 a qualifier round that is no longer open is a toast with no Retry', async () => {
    mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [qualifier] });
    mocks.getNextQualifierRoundNumber
      .mockResolvedValueOnce({ success: true, data: { nextRoundNumber: 1, availableRounds: [1, 2, 3] } })
      .mockResolvedValue({ success: true, data: { nextRoundNumber: 2, availableRounds: [2, 3] } });
    const user = renderNew();
    await startQualifierRound(user);
    await waitFor(() => expect(code('CH-11014')).toHaveTextContent('Round 1 of this qualifier is not open to you now. Your next round is 2.'));
    expect(toastAction('CH-11014', 'Retry')).toBeNull();
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });

  it('CH-11015 a qualifier round that could not be checked is a toast with Retry', async () => {
    mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [qualifier] });
    mocks.getNextQualifierRoundNumber
      .mockResolvedValueOnce({ success: true, data: { nextRoundNumber: 1, availableRounds: [1, 2, 3] } })
      .mockResolvedValueOnce({ success: false, error: 'You are not entered in this qualifier' })
      .mockResolvedValue({ success: true, data: { nextRoundNumber: 1, availableRounds: [1, 2, 3] } });
    const user = renderNew();
    await startQualifierRound(user);
    await waitFor(() => expect(code('CH-11015')).toHaveTextContent('You are not entered in this qualifier'));
    await user.click(toastAction('CH-11015', 'Retry')!);
    await screen.findByTestId('tracking');
  });

  it('CH-1903 offline, nothing is sent: the browser and the connection probe both say so', async () => {
    const user = renderNew();
    await pickCourse(user);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.connection.isConnected = false;
    await user.click(startBtn());
    await waitFor(() => expect(code('CH-1903')).toHaveTextContent('offline'));
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
  });

  it('CH-1903 the browser says offline but the probe reaches the server (WKWebView): the start goes ahead', async () => {
    const user = renderNew();
    await pickCourse(user);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await user.click(startBtn());
    await screen.findByTestId('tracking');
    expect(code('CH-1903')).toBeNull();
    expect(startCalls()).toHaveLength(1);
  });

  it('110113 a page opened on a qualifier (?qualifier=) plays that qualifier’s round, and one that is not open is left alone', async () => {
    mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [qualifier] });
    mocks.search = new URLSearchParams('qualifier=q1');
    renderNew();
    await screen.findByText('This counts as round 1 of 3 in Fall qualifier.');
    expect(within(screen.getByRole('radiogroup', { name: 'Round type' })).getByRole('radio', { name: 'Qualifier' })).toHaveAttribute('aria-checked', 'true');
    document.body.innerHTML = '';
    mocks.search = new URLSearchParams('qualifier=other');
    renderNew();
    await screen.findByRole('button', { name: /Browse courses/ });
    expect(screen.queryByText(/This counts as round/)).toBeNull();
  });

  it('110103 CH-11407 while the day and the qualifiers are read, the page is a skeleton, and then setup opens', async () => {
    let release: (v: unknown) => void = () => {};
    mocks.getPlayerQualifiers.mockReturnValue(new Promise((r) => (release = r)));
    renderNew();
    await waitFor(() => expect(code('CH-11407')).not.toBeNull());
    expect(screen.queryByRole('button', { name: /Browse courses/ })).toBeNull();
    await act(async () => release({ success: true, data: [] }));
    await screen.findByRole('button', { name: /Browse courses/ });
    expect(code('CH-11407')).toBeNull();
  });
});

// ── A round saved on this device (CH-11512) ──

function seedRecovery() {
  emergencySave({
    playerId: 'player-1',
    roundId: null,
    timestamp: Date.now() - 5 * 60_000,
    setupData: { courseName: 'Finley GC', courseCity: '', courseState: '', courseRating: '', courseSlope: '', teesPlayed: 'Blue', roundType: 'practice', roundDate: '2026-10-14' },
    holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, yardage: 380, score: i < 3 ? 4 : null })),
    completedHoleStats: [stats(0), stats(1), stats(2)] as never,
    inProgressShotsByHole: {},
    currentHoleIndex: 3,
    holesPerRound: 9,
  });
}

describe('Round entry: a round saved on this device is found on opening (CH-11512, CH-11008, CH-11513)', () => {
  it('CH-11512 says what was found, and Restore writes it to the server and opens the round to continue', async () => {
    seedRecovery();
    const user = renderNew();
    await waitFor(() => expect(code('CH-11512')).toHaveAttribute('open'));
    expect(code('CH-11512')).toHaveTextContent('Finley GC');
    expect(code('CH-11512')).toHaveTextContent('Blue tees · Practice · saved 5 min ago');
    await user.click(within(code('CH-11512')!).getByRole('button', { name: /^Restore round/ }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds/continue/round-1'));
    expect(mocks.savePartialRound.mock.calls[0]![2]).toMatchObject({ allowReuse: true });
    expect(loadLatestEmergencySave('player-1')).toBeNull();
  });

  it('CH-11008 a restore that fails says so inside the dialog, and Restore again finishes it', async () => {
    seedRecovery();
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'busy' });
    const user = renderNew();
    await waitFor(() => expect(code('CH-11512')).toHaveAttribute('open'));
    await user.click(within(code('CH-11512')!).getByRole('button', { name: /^Restore round/ }));
    await waitFor(() => expect(code('CH-11008')).toHaveTextContent('Couldn’t restore your saved shots'));
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(loadLatestEmergencySave('player-1')).not.toBeNull();
    await user.click(within(code('CH-11512')!).getByRole('button', { name: /^Restore round/ }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds/continue/round-1'));
    expect(code('CH-11008')).toBeNull();
  });

  it('111404 CH-11512 two taps on Restore before the screen has redrawn write the round once', async () => {
    seedRecovery();
    let release: (v: unknown) => void = () => {};
    mocks.savePartialRound.mockReturnValueOnce(new Promise((r) => (release = r)));
    renderNew();
    await waitFor(() => expect(code('CH-11512')).toHaveAttribute('open'));
    const restore = within(code('CH-11512')!).getByRole('button', { name: /^Restore round/ });
    act(() => {
      fireEvent.click(restore);
      fireEvent.click(restore);
    });
    await act(async () => release(ok()));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalled());
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
  });

  it('CH-11513 Discard saved shots asks first, warns before it deletes, and removes only the copy on this device', async () => {
    seedRecovery();
    const user = renderNew();
    await waitFor(() => expect(code('CH-11512')).toHaveAttribute('open'));
    await user.click(within(code('CH-11512')!).getByRole('button', { name: /^Discard saved shots/ }));
    expect(code('CH-11513')).toHaveTextContent('Discard the saved shots?');
    expect(loadLatestEmergencySave('player-1')).not.toBeNull();
    await user.click(within(code('CH-11513')!).getByRole('button', { name: 'Discard shots' }));
    await waitFor(() => expect(loadLatestEmergencySave('player-1')).toBeNull());
    expect(code('CH-11512')).not.toHaveAttribute('open');
    expect(mocks.deleteInProgressRound).not.toHaveBeenCalled();
    expect(ticks('warning')).toBeGreaterThan(0);
  });
});

// ── The round: save, discard, a conflict, an error, a closed qualifier ──

async function playing() {
  const user = renderNew();
  await startRound(user, { nine: true });
  await screen.findByTestId('tracking');
  mocks.savePartialRound.mockClear();
  return user;
}
async function openExit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Exit' }));
  await waitFor(() => expect(code('CH-11506')).toHaveAttribute('open'));
}
async function finishRound() {
  await act(async () => {
    for (let i = 0; i < 9; i++) await tracking().onHoleComplete(i, stats(i));
  });
  await waitFor(() => expect(code('CH-11508')).toHaveAttribute('open'));
  mocks.savePartialRound.mockClear();
}

describe('Round entry: Save for later and Discard from the Exit sheet (CH-11010, CH-11006, CH-11902)', () => {
  it('111404 CH-11010 a Save for later that fails is a toast with Retry, and Retry saves with the round as it is now', async () => {
    const user = await playing();
    await openExit(user);
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'Something failed for real' });
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /Save for later/ }));
    await waitFor(() => expect(code('CH-11010')).toHaveTextContent('Couldn’t save your round at Finley GC'));
    expect(code('CH-11010')).toHaveTextContent('Something failed for real.');
    expect(mocks.router.push).not.toHaveBeenCalled();
    await user.click(toastAction('CH-11010', 'Retry')!);
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds'));
    expect(saveCalls()).toHaveLength(2);
    expect(saveCalls().at(-1)![1]).toBe('round-1');
  });

  it('111404 CH-11010 a Retry that meets a save already running does not save twice', async () => {
    const user = await playing();
    await openExit(user);
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'Something failed for real' });
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /Save for later/ }));
    await waitFor(() => expect(code('CH-11010')).not.toBeNull());
    const oldRetry = toastAction('CH-11010', 'Retry')!;
    let release: (v: unknown) => void = () => {};
    mocks.savePartialRound.mockReturnValueOnce(new Promise((r) => (release = r)));
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /Save for later/ }));
    await user.click(oldRetry);
    expect(saveCalls()).toHaveLength(2);
    await act(async () => release(ok()));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds'));
    expect(saveCalls()).toHaveLength(2);
  });

  it('CH-1903 Save for later offline sends nothing, and says so', async () => {
    const user = await playing();
    await openExit(user);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.connection.isConnected = false;
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /Save for later/ }));
    await waitFor(() => expect(code('CH-1903')).toHaveTextContent('offline'));
    expect(mocks.savePartialRound).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it('CH-11006 a Discard that fails stays in the Exit sheet’s question with the reason, and can be tried again', async () => {
    const user = await playing();
    await openExit(user);
    mocks.deleteInProgressRound.mockResolvedValueOnce({ success: false, error: 'This round can no longer be discarded.' });
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /^Discard round/ }));
    await user.click(within(code('CH-11507')!).getByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(code('CH-11006')).toHaveTextContent('Couldn’t discard the round. This round can no longer be discarded.'));
    expect(code('CH-11011')).toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
    await user.click(within(code('CH-11507')!).getByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds'));
    expect(mocks.deleteInProgressRound).toHaveBeenCalledTimes(2);
    expect(mocks.deleteInProgressRound).toHaveBeenLastCalledWith('round-1');
  });

  it('CH-11902 a save refused because the round changed on another device is the Reload toast and banner, never a Retry', async () => {
    const user = await playing();
    await openExit(user);
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'conflict' });
    mocks.checkRoundStaleness.mockResolvedValue({ success: true, data: { status: 'in_progress', isStale: true, currentUpdatedAt: '2026-10-14T13:00:00.000Z' } });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /Save for later/ }));
    await waitFor(() => expect(document.querySelectorAll('[data-ch-code="CH-11902"]').length).toBeGreaterThanOrEqual(2));
    expect(code('CH-11010')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Reload' })[0]!);
    expect(reload).toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});

describe('Round entry: the errors the round reports (CH-11013)', () => {
  it('CH-11013 a hole that will not save is a note over the shot screen, and Dismiss clears it', async () => {
    const user = await playing();
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'hole_invalid', message: 'Hole 1 needs a par.' });
    await act(async () => {
      await tracking().onHoleComplete(0, stats(0));
    });
    await waitFor(() => expect(code('CH-11013')).not.toBeNull());
    await user.click(within(code('CH-11013')!).getByRole('button', { name: 'Dismiss' }));
    expect(code('CH-11013')).toBeNull();
  });
});

// Each test plays a whole round to its finish sheet first: about 1.5 s alone, and past the 5 s default when the machine is busy.
describe('Round entry: a submit the coach’s closed qualifier refuses (CH-11516)', { timeout: 20_000 }, () => {
  const closed = 'This qualifier has already been completed. Rounds can no longer be submitted.';

  async function submitClosed(user: ReturnType<typeof userEvent.setup>) {
    mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: false, error: closed });
    await finishRound();
    await user.click(within(code('CH-11508')!).getByRole('button', { name: /Submit round/ }));
    await waitFor(() => expect(code('CH-11516')).toHaveAttribute('open'));
  }

  it('CH-11516 opens Save as practice, not the generic failure (CH-11005), with the server’s sentence', async () => {
    const user = await playing();
    await submitClosed(user);
    expect(code('CH-11516')).toHaveTextContent(closed);
    expect(screen.queryByText('The round didn’t submit')).toBeNull();
    expect(code('CH-11005')).toBeNull();
  });

  it('CH-11012 a change to practice that fails stays on the sheet with the reason; when it works the finish sheet is back to submit', async () => {
    const user = await playing();
    await submitClosed(user);
    mocks.updateRoundType.mockResolvedValueOnce({ success: false, error: 'This round is locked.' }).mockResolvedValue({ success: true });
    await user.click(within(code('CH-11516')!).getByRole('button', { name: /Save as practice round/ }));
    await waitFor(() => expect(code('CH-11012')).toHaveTextContent('This round is locked.'));
    expect(code('CH-11516')).toHaveAttribute('open');
    expect(mocks.updateRoundType).toHaveBeenCalledWith({ roundId: 'round-1', roundType: 'practice' });
    await user.click(within(code('CH-11516')!).getByRole('button', { name: /Save as practice round/ }));
    await waitFor(() => expect(code('CH-11516')).not.toHaveAttribute('open'));
    expect(mocks.updateRoundType).toHaveBeenCalledTimes(2);
    expect(code('CH-11906')).toHaveTextContent('Saved as a practice round');
    await waitFor(() => expect(code('CH-11508')).toHaveAttribute('open'));
  });

  it('CH-11517 Discard from the sheet asks first; a failure is a toast with Retry (CH-11011)', async () => {
    const user = await playing();
    await submitClosed(user);
    mocks.deleteInProgressRound.mockResolvedValueOnce({ success: false, error: 'This round can no longer be discarded.' }).mockResolvedValue({ success: true });
    await user.click(within(code('CH-11516')!).getByRole('button', { name: /^Discard round/ }));
    expect(code('CH-11517')).toHaveTextContent('Discard this round?');
    await user.click(within(code('CH-11517')!).getByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(code('CH-11011')).toHaveTextContent('This round can no longer be discarded.'));
    // The toast stack moves into whichever dialog is open, and that re-creates its buttons: click the Retry that is
    // there now, until the discard has run again (a click on a button that has just been replaced does nothing).
    await waitFor(
      async () => {
        const retry = toastAction('CH-11011', 'Retry');
        if (retry && mocks.deleteInProgressRound.mock.calls.length < 2) await user.click(retry);
        expect(mocks.deleteInProgressRound).toHaveBeenCalledTimes(2);
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds'), { timeout: 5000 });
    expect(mocks.deleteInProgressRound).toHaveBeenCalledTimes(2);
  });

  it('CH-11010 Save for later from the closed sheet saves the round and leaves', async () => {
    const user = await playing();
    await submitClosed(user);
    await user.click(within(code('CH-11516')!).getByRole('button', { name: /^Save for later/ }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds'));
    expect(saveCalls().length).toBeGreaterThan(0);
  });
});
