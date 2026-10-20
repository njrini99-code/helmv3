import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round lifecycle parity with production (P011, 2026-10-17): the Clubhouse round screens and Fairway's drive the same
 * engine (`useNewRoundSession`), so the only place a round's payload can differ is what each setup feeds it. Here both
 * setups are driven, through the real engine, to the same round (course, tees, nine, start hole, type, date), and the
 * server actions' arguments are compared field by field: the start (`savePartialRound`, start intent), each hole's
 * checkpoint, and the submit (`submitGolfRoundComprehensive`). Fairway's path is the one most players take: the tee
 * picked in the course library (`handleTeePick`), then the setup form's submit (`handleSetupSubmit`, its preloaded
 * quick start). Clubhouse's is the setup's real read ports (`setup-reads`) and `start(toStartForm(form))`.
 */

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  search: new URLSearchParams(),
  savePartialRound: vi.fn(),
  submitGolfRoundComprehensive: vi.fn(),
  deleteInProgressRound: vi.fn(),
  getNextQualifierRoundNumber: vi.fn(),
  getPlayerQualifiers: vi.fn(),
  checkRoundStaleness: vi.fn(),
  listCoursesStrict: vi.fn(),
  getCourseDetail: vi.fn(),
  getPlayerSavedCourses: vi.fn(),
  touchSavedCourse: vi.fn(),
  contributeCourseFromRound: vi.fn(),
  getTeeWithHoles: vi.fn(),
  connection: { isOnline: true, isConnected: true, quality: 'excellent' },
  tracking: { current: null as null | Record<string, (...args: never[]) => unknown> },
}));

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router, useSearchParams: () => mocks.search }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/app/golf/actions/round-submit', () => ({
  submitGolfRoundComprehensive: (...args: unknown[]) => mocks.submitGolfRoundComprehensive(...args),
}));
vi.mock('@/app/golf/actions/round-partial', () => ({
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
}));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({
  getPlayerQualifiers: (...args: unknown[]) => mocks.getPlayerQualifiers(...args),
  getNextQualifierRoundNumber: (...args: unknown[]) => mocks.getNextQualifierRoundNumber(...args),
}));
vi.mock('@/app/golf/actions/saved-courses', () => ({
  getPlayerSavedCourses: (...args: unknown[]) => mocks.getPlayerSavedCourses(...args),
  getRecentCoursesForPlayer: vi.fn(async () => ({ success: true, data: [] })),
  savePlayerCourse: vi.fn(async () => ({ success: true, data: { id: 'sc-1' } })),
  touchSavedCourse: (...args: unknown[]) => mocks.touchSavedCourse(...args),
}));
vi.mock('@/app/golf/actions/course-library', () => ({
  contributeCourseFromRound: (...args: unknown[]) => mocks.contributeCourseFromRound(...args),
  listCoursesStrict: (...args: unknown[]) => mocks.listCoursesStrict(...args),
  getRecentlyPlayedCourses: vi.fn(async () => []),
  getTeamSavedCourses: vi.fn(async () => []),
  getCourseDetail: (...args: unknown[]) => mocks.getCourseDetail(...args),
  getTeeWithHoles: (...args: unknown[]) => mocks.getTeeWithHoles(...args),
}));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: (...args: unknown[]) => mocks.checkRoundStaleness(...args) }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: vi.fn(async () => ({ success: true })) }));
vi.mock('@/hooks/golf/use-connection-status', () => ({ useConnectionStatus: () => mocks.connection }));
vi.mock('@/hooks/golf/use-round-status-sync', () => ({ useRoundStatusSync: vi.fn() }));
vi.mock('@/stores/offline-sync-store', () => {
  const state = { updatePendingCount: vi.fn(async () => {}), setOnline: vi.fn(), setSlowConnection: vi.fn() };
  const status = { syncError: null, pendingCount: { total: 0 } };
  return { useOfflineSyncStore: Object.assign(() => state, { getState: () => state }), useOfflineSyncStatus: () => status };
});
vi.mock('@/lib/offline/sync-engine', () => ({ getSyncEngine: () => ({ registerCallback: vi.fn(), unregisterCallback: vi.fn(), start: vi.fn(), stop: vi.fn(), syncNow: vi.fn() }) }));
vi.mock('@/lib/offline/indexed-db', () => ({ saveOfflineRound: vi.fn(async () => {}), deleteOfflineRound: vi.fn(async () => {}) }));
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
vi.mock('../screens/rounds/track/RoundTracking', () => ({
  RoundTracking: (props: Record<string, unknown>) => {
    mocks.tracking.current = props as never;
    return <div data-testid="tracking" />;
  },
}));

import type { TeeRoundDefaults } from '@/app/golf/actions/course-library';
import { localDayIso } from '@/lib/golf/local-day';
import { useNewRoundSession } from '@/lib/golf/round-session/use-new-round-session';
import type { HoleStats } from '@/lib/types/golf';
import { NewRound } from '../screens/rounds/entry/NewRound';
import { afterSavedCourseStart, listCoursesRead, listTeesRead, teeHolesRead, toStartForm } from '../screens/rounds/entry/setup-reads';
import type { ChSetupForm } from '../screens/rounds/setup/shape';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const NOW = '2026-10-14T12:00:00.000Z';
const ok = (roundId = 'round-1') => ({ success: true, data: { roundId, updatedAt: NOW } });
const PARS = Array.from({ length: 18 }, (_, i) => [4, 5, 3][i % 3]!);
const YARDS = Array.from({ length: 18 }, (_, i) => 380 + i);

const COURSE = { id: 'c1', name: 'Finley GC', city: 'Chapel Hill', state: 'NC', total_par: 72 };
const TEE = { id: 't1', course_id: 'c1', tee_name: 'Blue', tee_color: 'blue', category: 'mens', total_yards: 6984, total_par: 72, course_rating: 73.1, slope_rating: 133, holes_count: 18, is_draft: false };

/** What Fairway's course picker hands the engine for that tee (FairwayCoursePicker.pickTee -> getTeeRoundDefaults). */
function fairwayTeePick(course: { city: string | null; state: string | null }, yards: Array<number | null> = YARDS): TeeRoundDefaults {
  return {
    teeId: 't1',
    teeName: 'Blue',
    category: 'mens',
    courseId: 'c1',
    courseName: 'Finley GC',
    courseCity: course.city,
    courseState: course.state,
    holesCount: 18,
    isDraft: false,
    courseRating: 73.1,
    slopeRating: 133,
    holes: PARS.map((par, i) => ({ holeNumber: i + 1, par, yardage: yards[i] ?? null, handicapIndex: null })),
  };
}

const ports = { showToast: vi.fn(), hideMobileNav: vi.fn(), showMobileNav: vi.fn(), haptic: vi.fn() };

/** The scored hole the shot screen hands `onHoleComplete`: par, its yardage on the card, a par score. */
function holeStats(holeNumber: number, par: number, yardage: number): HoleStats {
  return { holeNumber, par, yardage, score: par, putts: 2, fairwayHit: par === 3 ? null : true, greenInRegulation: true, penaltyStrokes: 0, shots: [] } as unknown as HoleStats;
}

type Engine = ReturnType<typeof useNewRoundSession>;

async function mountEngine() {
  const hook = renderHook(() => useNewRoundSession({ playerId: 'player-1', ports }));
  await waitFor(() => expect(hook.result.current.setupData.roundDate).not.toBe(''));
  return hook;
}

/** Fairway: the tee from the library, 9 holes (the chosen nine), the start hole, the type; then the setup form's submit. */
async function startFairway(input: { nine: 'front' | 'back' | null; startPosition: number; roundType: 'practice' | 'tournament'; course?: { city: string | null; state: string | null }; yards?: Array<number | null> }) {
  const hook = await mountEngine();
  act(() => hook.result.current.handleTeePick(fairwayTeePick(input.course ?? { city: COURSE.city, state: COURSE.state }, input.yards)));
  act(() => {
    if (input.nine) {
      hook.result.current.setHolesPerRound(9);
      hook.result.current.setNineSelection(input.nine);
    }
    hook.result.current.setSetupData((prev) => ({ ...prev, roundType: input.roundType, startHole: input.startPosition }));
  });
  await act(async () => {
    await hook.result.current.handleSetupSubmit({ preventDefault() {} } as unknown as React.FormEvent);
  });
  await waitFor(() => expect(hook.result.current.step).toBe('tracking'));
  return hook;
}

/** Clubhouse: the course, the tee and the card from setup's real read ports, the form RoundSetup builds, then `start`. */
async function startClubhouse(input: { nine: 'front' | 'back' | null; start: number | null; roundType: 'practice' | 'tournament' }) {
  const hook = await mountEngine();
  const courses = await listCoursesRead();
  const tees = await listTeesRead('c1');
  const holes = await teeHolesRead('t1');
  if (!courses.ok || !tees.ok || !holes.ok) throw new Error('setup reads failed');
  const course = courses.data[0]!;
  const tee = tees.data[0]!;
  // RoundSetup.pickTee's pick, field for field.
  const form: ChSetupForm = {
    pick: { courseId: course.id, courseName: course.name, place: course.place, city: course.city, state: course.state, teeId: tee.id, teeName: tee.name, teeColor: tee.color, rating: tee.rating, slope: tee.slope, yards: tee.yards },
    type: input.roundType,
    date: localDayIso(),
    count: input.nine ? 9 : 18,
    nine: input.nine ?? 'front',
    holes: holes.data,
    baseline: holes.data.map((h) => ({ ...h })),
    qualifierId: null,
    qualifierRound: null,
    saveCourse: false,
    start: input.start,
  };
  let result: Awaited<ReturnType<Engine['start']>> | undefined;
  await act(async () => {
    result = await hook.result.current.start(toStartForm(form));
  });
  expect(result).toMatchObject({ ok: true });
  await waitFor(() => expect(hook.result.current.step).toBe('tracking'));
  return hook;
}

/** Every hole in, in play order, then Submit with what the engine gathered (pendingFinalStats), as both screens do. */
async function playAndSubmit(hook: Awaited<ReturnType<typeof mountEngine>>) {
  const n = hook.result.current.holes.length;
  for (let k = 0; k < n; k++) {
    const i = hook.result.current.currentHoleIndex;
    const h = hook.result.current.holes[i]!;
    await act(async () => {
      await hook.result.current.handleHoleComplete(i, holeStats(h.number, h.par, h.yardage));
    });
  }
  await waitFor(() => expect(hook.result.current.pendingFinalStats).not.toBeNull());
  await act(async () => {
    await hook.result.current.handleRoundSubmit(hook.result.current.pendingFinalStats!);
  });
  await waitFor(() => expect(hook.result.current.completedRoundId).toBe('round-1'));
}

const startArgs = () => mocks.savePartialRound.mock.calls.filter(([, id]) => id === undefined).map(([data, , opts]) => ({ data, opts }));
const checkpointArgs = () => mocks.savePartialRound.mock.calls.filter(([, id]) => id !== undefined).map(([data, id]) => ({ data, id }));
const submitArgs = () => mocks.submitGolfRoundComprehensive.mock.calls.map(([data, id]) => ({ data, id }));

/** Run one setup, then hand back every server write it made, and clear them for the next. */
async function run(drive: () => Promise<Awaited<ReturnType<typeof mountEngine>>>) {
  const hook = await drive();
  await playAndSubmit(hook);
  const out = { start: startArgs(), checkpoints: checkpointArgs(), submit: submitArgs(), holes: hook.result.current.holes };
  hook.unmount();
  mocks.savePartialRound.mockClear();
  mocks.submitGolfRoundComprehensive.mockClear();
  localStorage.clear();
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  localStorage.clear();
  mocks.connection.isConnected = true;
  mocks.savePartialRound.mockImplementation(async () => ok());
  mocks.deleteInProgressRound.mockResolvedValue({ success: true });
  mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [] });
  mocks.getNextQualifierRoundNumber.mockResolvedValue({ success: true, data: { nextRoundNumber: 1, availableRounds: [1] } });
  mocks.checkRoundStaleness.mockResolvedValue({ success: true, data: { status: 'in_progress', isStale: false, currentUpdatedAt: NOW } });
  mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: true, data: { roundId: 'round-1' } });
  mocks.listCoursesStrict.mockResolvedValue([COURSE]);
  mocks.getCourseDetail.mockResolvedValue({ course: COURSE, tees: [TEE] });
  mocks.getPlayerSavedCourses.mockResolvedValue({ success: true, data: [] });
  mocks.touchSavedCourse.mockResolvedValue({ success: true });
  mocks.contributeCourseFromRound.mockResolvedValue({ success: false, error: 'not in this test' });
  mocks.getTeeWithHoles.mockImplementation(async () => teeCard(YARDS));
});

/** The tee's card as the course library reads it (getTeeWithHoles), with these yardages (null: none recorded). */
function teeCard(yards: Array<number | null>) {
  return { id: 't1', holes: PARS.map((par, i) => ({ hole_number: i + 1, par, yardage: yards[i] ?? null })) };
}
afterEach(() => vi.restoreAllMocks());

describe('112402 Round lifecycle parity: Clubhouse and Fairway send the engine the same round', () => {
  it('an 18-hole tournament round from a library tee: the start, every checkpoint and the submit match field for field', async () => {
    const fairway = await run(() => startFairway({ nine: null, startPosition: 1, roundType: 'tournament' }));
    const clubhouse = await run(() => startClubhouse({ nine: null, start: null, roundType: 'tournament' }));

    expect(clubhouse.start).toHaveLength(1);
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.start[0]!.data).toMatchObject({
      courseName: 'Finley GC',
      courseId: 'c1',
      teeId: 't1',
      courseCity: 'Chapel Hill',
      courseState: 'NC',
      courseRating: 73.1,
      courseSlope: 133,
      teesPlayed: 'Blue',
      roundType: 'tournament',
      holesToPlay: 18,
      startHole: 1,
    });
    expect(clubhouse.start[0]!.opts).toMatchObject({ startIntent: true });
    expect(clubhouse.checkpoints).toHaveLength(18);
    expect(clubhouse.checkpoints).toEqual(fairway.checkpoints);
    expect(clubhouse.submit).toHaveLength(1);
    expect(clubhouse.submit).toEqual(fairway.submit);
    expect(clubhouse.submit[0]).toMatchObject({ id: 'round-1', data: { roundType: 'tournament', expectedUpdatedAt: NOW, courseId: 'c1', teeId: 't1' } });
    expect((clubhouse.submit[0]!.data as { holes: HoleStats[] }).holes).toHaveLength(18);
  });

  it('a back nine started on its third hole (a shotgun start): the same holes, start, checkpoints and submit', async () => {
    const fairway = await run(() => startFairway({ nine: 'back', startPosition: 3, roundType: 'practice' }));
    // The card's hole 12 is the third hole of the back nine.
    const clubhouse = await run(() => startClubhouse({ nine: 'back', start: 12, roundType: 'practice' }));

    expect(clubhouse.holes).toEqual(fairway.holes);
    expect(clubhouse.holes.map((h) => h.par)).toEqual(PARS.slice(9, 18));
    expect(clubhouse.holes.map((h) => h.yardage)).toEqual(YARDS.slice(9, 18));
    // Both starts number the back nine's hole configs 1 to 9, as the engine numbers the holes themselves (Fairway sent
    // the card numbers 10 to 18 until 2026-10-17; golf_holes: no 9-hole round in production is numbered past 9).
    const { holeConfigs: fwConfigs, ...fwStart } = fairway.start[0]!.data as { holeConfigs: Array<{ holeNumber: number }> };
    const { holeConfigs: chConfigs, ...chStart } = clubhouse.start[0]!.data as { holeConfigs: Array<{ holeNumber: number }> };
    expect(fwConfigs.map((h) => h.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(chConfigs).toEqual(fwConfigs);
    expect(chStart).toEqual(fwStart);
    expect(chStart).toMatchObject({ holesToPlay: 9, startHole: 3, currentHole: 3, roundType: 'practice' });
    expect(clubhouse.start[0]!.opts).toEqual(fairway.start[0]!.opts);
    // After the start the engine's own holes drive every write, so the rest is identical.
    expect(clubhouse.checkpoints).toEqual(fairway.checkpoints);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('a library course with a state and no city saves the state as the state, as Fairway does (was saved as the city)', async () => {
    mocks.listCoursesStrict.mockResolvedValue([{ ...COURSE, city: null, state: 'NC' }]);
    const fairway = await run(() => startFairway({ nine: null, startPosition: 1, roundType: 'practice', course: { city: null, state: 'NC' } }));
    const clubhouse = await run(() => startClubhouse({ nine: null, start: null, roundType: 'practice' }));
    expect(clubhouse.start[0]!.data).toMatchObject({ courseState: 'NC' });
    expect((clubhouse.start[0]!.data as { courseCity?: string }).courseCity).toBeUndefined();
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('a library course with a comma in its city keeps the whole city', async () => {
    mocks.listCoursesStrict.mockResolvedValue([{ ...COURSE, city: 'Winston-Salem, Forsyth', state: 'NC' }]);
    const fairway = await run(() => startFairway({ nine: null, startPosition: 1, roundType: 'practice', course: { city: 'Winston-Salem, Forsyth', state: 'NC' } }));
    const clubhouse = await run(() => startClubhouse({ nine: null, start: null, roundType: 'practice' }));
    expect(clubhouse.start[0]!.data).toMatchObject({ courseCity: 'Winston-Salem, Forsyth', courseState: 'NC' });
    expect(clubhouse.start).toEqual(fairway.start);
  });

  it('a library tee with yardages missing on some holes starts on its pars, those holes at 0 yards, as Fairway does', async () => {
    const yards = YARDS.map((y, i) => (i === 2 || i === 6 ? null : y));
    mocks.getTeeWithHoles.mockImplementation(async () => teeCard(yards));
    const fairway = await run(() => startFairway({ nine: null, startPosition: 1, roundType: 'practice', yards }));
    const clubhouse = await run(() => startClubhouse({ nine: null, start: null, roundType: 'practice' }));
    const configs = (clubhouse.start[0]!.data as { holeConfigs: Array<{ yardage: number }> }).holeConfigs;
    expect(configs[2]!.yardage).toBe(0);
    expect(configs[6]!.yardage).toBe(0);
    expect(clubhouse.holes.map((h) => h.yardage)).toEqual(fairway.holes.map((h) => h.yardage));
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.checkpoints).toEqual(fairway.checkpoints);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('a library tee with no yardages at all starts too, every hole at 0 yards, as Fairway does', async () => {
    const yards = YARDS.map(() => null);
    mocks.getTeeWithHoles.mockImplementation(async () => teeCard(yards));
    const fairway = await run(() => startFairway({ nine: null, startPosition: 1, roundType: 'practice', yards }));
    const clubhouse = await run(() => startClubhouse({ nine: null, start: null, roundType: 'practice' }));
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });
});

describe('112402 Round lifecycle parity: the city and state reach the start through the real setup screen', () => {
  async function startThroughScreen() {
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <NewRound playerId="player-1" />
        </ToastProvider>
      </LazyMotion>,
    );
    const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement;
    await user.click(await screen.findByRole('button', { name: /Browse courses/ }));
    await user.click(await within(code('CH-11510')).findByRole('button', { name: /^Finley GC/ }));
    await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Start round|Starting/ }));
    await screen.findByTestId('tracking');
    return startArgs()[0]!.data as { courseCity?: string; courseState?: string };
  }

  it('a state-only course: Start saves courseState and no city', async () => {
    mocks.listCoursesStrict.mockResolvedValue([{ ...COURSE, city: null, state: 'NC' }]);
    const data = await startThroughScreen();
    expect(data.courseState).toBe('NC');
    expect(data.courseCity).toBeUndefined();
  });

  it('a city and a state: both saved as they are', async () => {
    const data = await startThroughScreen();
    expect(data).toMatchObject({ courseCity: 'Chapel Hill', courseState: 'NC' });
  });
});

// ── A round from one of the player's saved courses ("Your courses", golf_player_courses) ──

const SAVED = {
  id: 'sc1',
  courseId: null as string | null,
  courseName: 'Hidden Valley CC',
  courseCity: 'Sanford',
  courseState: 'NC',
  courseRating: 70.2,
  courseSlope: 124,
  teesPlayed: 'Gold' as string | null,
  holesPerRound: 18,
  holeConfigs: PARS.map((par, i) => ({ holeNumber: i + 1, par, yardage: 300 + i })),
  lastUsedAt: '2026-10-01T12:00:00.000Z',
  createdAt: '2026-09-01T12:00:00.000Z',
};

/** Fairway: the saved course picked on the setup screen (handleSavedCourseSelect), then the setup form's submit. */
async function startFairwaySaved(input: { nine: 'front' | 'back' | null; roundType: 'practice' | 'tournament' }) {
  const hook = await mountEngine();
  await waitFor(() => expect(hook.result.current.savedCourses).toHaveLength(1));
  act(() => hook.result.current.handleSavedCourseSelect(SAVED.id));
  act(() => {
    if (input.nine) {
      hook.result.current.setHolesPerRound(9);
      hook.result.current.setNineSelection(input.nine);
    }
    hook.result.current.setSetupData((prev) => ({ ...prev, roundType: input.roundType }));
  });
  await act(async () => {
    await hook.result.current.handleSetupSubmit({ preventDefault() {} } as unknown as React.FormEvent);
  });
  await waitFor(() => expect(hook.result.current.step).toBe('tracking'));
  return hook;
}

/** Clubhouse: the saved course from the picker's real reads, its one tee and its card, RoundSetup's pick, then `start`. */
async function startClubhouseSaved(input: { nine: 'front' | 'back' | null; roundType: 'practice' | 'tournament' }) {
  const hook = await mountEngine();
  const courses = await listCoursesRead();
  if (!courses.ok) throw new Error('library read failed');
  const course = courses.data.find((c) => c.group === 'saved')!;
  const tees = await listTeesRead(course.id);
  if (!tees.ok) throw new Error('tees read failed');
  const tee = tees.data[0]!;
  const holes = await teeHolesRead(tee.id);
  if (!holes.ok) throw new Error('holes read failed');
  // RoundSetup.pickTee's pick for a saved course: its library link (none here) and no tee.
  const form: ChSetupForm = {
    pick: { courseId: course.saved!.courseId, courseName: course.name, place: course.place, city: course.city, state: course.state, savedId: course.saved!.id, teeId: null, teeName: tee.name, teeColor: tee.color, rating: tee.rating, slope: tee.slope, yards: tee.yards },
    type: input.roundType,
    date: localDayIso(),
    count: input.nine ? 9 : 18,
    nine: input.nine ?? 'front',
    holes: holes.data,
    baseline: holes.data.map((h) => ({ ...h })),
    qualifierId: null,
    qualifierRound: null,
    saveCourse: false,
    start: null,
  };
  await act(async () => {
    const result = await hook.result.current.start(toStartForm(form));
    expect(result).toMatchObject({ ok: true });
  });
  await waitFor(() => expect(hook.result.current.step).toBe('tracking'));
  return { hook, form };
}

describe('110116 112402 Round lifecycle parity: a round from the player’s saved course (Your courses)', () => {
  beforeEach(() => mocks.getPlayerSavedCourses.mockResolvedValue({ success: true, data: [SAVED] }));

  it('the saved course is listed under Your courses with its one tee and its saved card', async () => {
    const courses = await listCoursesRead();
    expect(courses.ok && courses.data.map((c) => [c.name, c.group])).toEqual([
      ['Hidden Valley CC', 'saved'],
      ['Finley GC', 'library'],
    ]);
    const saved = courses.ok ? courses.data[0]! : null;
    expect(saved).toMatchObject({ place: 'Sanford, NC', city: 'Sanford', state: 'NC', par: 72, teeCount: 1, saved: { id: 'sc1', courseId: null } });
    const tees = await listTeesRead(saved!.id);
    expect(tees).toMatchObject({ ok: true, data: [{ name: 'Gold', rating: 70.2, slope: 124, par: 72, holesCount: 18, draft: false }] });
    const holes = await teeHolesRead(saved!.id);
    expect(holes.ok && holes.data.map((h) => [h.n, h.par, h.yards])).toEqual(SAVED.holeConfigs.map((h, i) => [i + 1, h.par, String(h.yardage)]));
  });

  it('an 18-hole round: the start, every checkpoint and the submit match Fairway’s saved-course start field for field', async () => {
    const fairway = await run(() => startFairwaySaved({ nine: null, roundType: 'tournament' }));
    const clubhouse = await run(async () => (await startClubhouseSaved({ nine: null, roundType: 'tournament' })).hook);
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.start[0]!.data).toMatchObject({
      courseName: 'Hidden Valley CC',
      courseCity: 'Sanford',
      courseState: 'NC',
      courseRating: 70.2,
      courseSlope: 124,
      teesPlayed: 'Gold',
      roundType: 'tournament',
      holesToPlay: 18,
    });
    expect((clubhouse.start[0]!.data as { courseId?: string; teeId?: string }).courseId).toBeUndefined();
    expect((clubhouse.start[0]!.data as { teeId?: string }).teeId).toBeUndefined();
    expect(clubhouse.checkpoints).toEqual(fairway.checkpoints);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('the front nine of a saved 18: the same payloads', async () => {
    const fairway = await run(() => startFairwaySaved({ nine: 'front', roundType: 'practice' }));
    const clubhouse = await run(async () => (await startClubhouseSaved({ nine: 'front', roundType: 'practice' })).hook);
    expect(clubhouse.holes).toEqual(fairway.holes);
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.checkpoints).toEqual(fairway.checkpoints);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('a saved course linked to a library course starts with that link, as Fairway does', async () => {
    mocks.getPlayerSavedCourses.mockResolvedValue({ success: true, data: [{ ...SAVED, courseId: 'c-hv' }] });
    const fairway = await run(() => startFairwaySaved({ nine: null, roundType: 'practice' }));
    const clubhouse = await run(async () => (await startClubhouseSaved({ nine: null, roundType: 'practice' })).hook);
    expect(clubhouse.start[0]!.data).toMatchObject({ courseId: 'c-hv' });
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('a saved course with no tee name plays the White tees, as Fairway defaults it', async () => {
    mocks.getPlayerSavedCourses.mockResolvedValue({ success: true, data: [{ ...SAVED, teesPlayed: null }] });
    const fairway = await run(() => startFairwaySaved({ nine: null, roundType: 'practice' }));
    const clubhouse = await run(async () => (await startClubhouseSaved({ nine: null, roundType: 'practice' })).hook);
    expect(clubhouse.start[0]!.data).toMatchObject({ teesPlayed: 'White' });
    expect(clubhouse.start).toEqual(fairway.start);
  });

  it('after the start: one with no library course is offered to the library with Fairway’s input, and the saved course is touched', async () => {
    const fw = await startFairwaySaved({ nine: null, roundType: 'practice' });
    await waitFor(() => expect(mocks.contributeCourseFromRound).toHaveBeenCalledTimes(1));
    const fairwayContribution = mocks.contributeCourseFromRound.mock.calls[0]![0];
    fw.unmount();
    mocks.contributeCourseFromRound.mockClear();
    mocks.touchSavedCourse.mockClear();
    localStorage.clear();

    // The offer is the engine's (`libraryOffer`), made by the start itself.
    const { hook, form } = await startClubhouseSaved({ nine: null, roundType: 'practice' });
    await waitFor(() => expect(mocks.contributeCourseFromRound).toHaveBeenCalledTimes(1));
    expect(mocks.contributeCourseFromRound.mock.calls[0]![0]).toEqual(fairwayContribution);
    afterSavedCourseStart(form);
    await waitFor(() => expect(mocks.touchSavedCourse).toHaveBeenCalledWith('sc1'));
    hook.unmount();
  });

  it('the back nine of a saved 18: the offer sends the card’s hole numbers, as Fairway’s does', async () => {
    const fw = await startFairwaySaved({ nine: 'back', roundType: 'practice' });
    await waitFor(() => expect(mocks.contributeCourseFromRound).toHaveBeenCalledTimes(1));
    const fairwayContribution = mocks.contributeCourseFromRound.mock.calls[0]![0] as { holes: Array<{ holeNumber: number }> };
    fw.unmount();
    mocks.contributeCourseFromRound.mockClear();
    localStorage.clear();
    const { hook } = await startClubhouseSaved({ nine: 'back', roundType: 'practice' });
    await waitFor(() => expect(mocks.contributeCourseFromRound).toHaveBeenCalledTimes(1));
    expect(fairwayContribution.holes.map((h) => h.holeNumber)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(mocks.contributeCourseFromRound.mock.calls[0]![0]).toEqual(fairwayContribution);
    hook.unmount();
  });

  it('the library course the offer creates links the round: later checkpoints and the submit carry it, as Fairway’s do', async () => {
    mocks.contributeCourseFromRound.mockResolvedValue({ success: true, data: { courseId: 'c-new', teeId: 't-new' } });
    const fairway = await run(() => startFairwaySaved({ nine: null, roundType: 'practice' }));
    const clubhouse = await run(async () => (await startClubhouseSaved({ nine: null, roundType: 'practice' })).hook);
    expect(fairway.submit[0]!.data).toMatchObject({ courseId: 'c-new', teeId: 't-new' });
    expect(clubhouse.submit[0]!.data).toMatchObject({ courseId: 'c-new', teeId: 't-new' });
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.checkpoints).toEqual(fairway.checkpoints);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('a saved course with yardages missing on some holes starts, those holes at 0 yards, as Fairway does', async () => {
    const row = { ...SAVED, holeConfigs: SAVED.holeConfigs.map((h, i) => (i % 4 === 0 ? { ...h, yardage: 0 } : h)) };
    mocks.getPlayerSavedCourses.mockResolvedValue({ success: true, data: [row] });
    const fairway = await run(() => startFairwaySaved({ nine: null, roundType: 'practice' }));
    const clubhouse = await run(async () => (await startClubhouseSaved({ nine: null, roundType: 'practice' })).hook);
    expect((clubhouse.start[0]!.data as { holeConfigs: Array<{ yardage: number }> }).holeConfigs[0]!.yardage).toBe(0);
    expect(clubhouse.start).toEqual(fairway.start);
    expect(clubhouse.checkpoints).toEqual(fairway.checkpoints);
    expect(clubhouse.submit).toEqual(fairway.submit);
  });

  it('a saved course already in the library (by its link or by name) is offered once, as the library course', async () => {
    mocks.getPlayerSavedCourses.mockResolvedValue({
      success: true,
      data: [
        { ...SAVED, id: 'sc-linked', courseId: 'c1', courseName: 'Finley Golf Club' },
        { ...SAVED, id: 'sc-named', courseName: '  finley   gc ' },
        SAVED,
      ],
    });
    const courses = await listCoursesRead();
    expect(courses.ok && courses.data.map((c) => [c.name, c.group])).toEqual([
      ['Hidden Valley CC', 'saved'],
      ['Finley GC', 'library'],
    ]);
  });

  it('a saved-courses read that fails leaves the library as it is', async () => {
    mocks.getPlayerSavedCourses.mockResolvedValue({ success: false, error: 'boom' });
    const courses = await listCoursesRead();
    expect(courses).toMatchObject({ ok: true, data: [{ name: 'Finley GC', group: 'library' }] });
  });
});

describe('110116 112402 Round lifecycle parity: a saved course through the real setup screen', () => {
  it('Your courses lists it; its tees and card load; Start sends the saved course, then touches it and offers it to the library', async () => {
    mocks.getPlayerSavedCourses.mockResolvedValue({ success: true, data: [SAVED] });
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <NewRound playerId="player-1" />
        </ToastProvider>
      </LazyMotion>,
    );
    const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement;
    await user.click(await screen.findByRole('button', { name: /Browse courses/ }));
    const picker = code('CH-11510');
    expect(await within(picker).findByText('Your courses')).toBeInTheDocument();
    await user.click(await within(picker).findByRole('button', { name: /^Hidden Valley CC/ }));
    await user.click(await screen.findByRole('button', { name: /Play the Gold tees/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Start round|Starting/ }));
    await screen.findByTestId('tracking');
    const data = startArgs()[0]!.data as Record<string, unknown>;
    expect(data).toMatchObject({ courseName: 'Hidden Valley CC', courseCity: 'Sanford', courseState: 'NC', teesPlayed: 'Gold', courseRating: 70.2, courseSlope: 124, holesToPlay: 18 });
    expect(data.courseId).toBeUndefined();
    expect(data.teeId).toBeUndefined();
    await waitFor(() => expect(mocks.touchSavedCourse).toHaveBeenCalledWith('sc1'));
    await waitFor(() => expect(mocks.contributeCourseFromRound).toHaveBeenCalledTimes(1));
    expect(mocks.contributeCourseFromRound.mock.calls[0]![0]).toMatchObject({ courseName: 'Hidden Valley CC', city: 'Sanford', state: 'NC', teeName: 'Gold' });
  });
});
