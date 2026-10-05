import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round entry's plumbing (P011, Q-81): which addresses are Clubhouse's and which page draws them, the setup screen's
 * ports over the course library and the engine's `start(form)`, how the engines' notices become Clubhouse states,
 * and what the round does once it has posted (the tick, the review, the way out of a slow submit). The engines and the
 * screens are in round-entry-wiring.test.tsx and round-entry-continue.test.tsx.
 */

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  flag: { on: true },
  session: { current: null as unknown },
  tables: { current: {} as import('./supabase-fake').ChFakeTables },
  haptic: vi.fn(),
  getPlayerQualifiers: vi.fn(),
  getNextQualifierRoundNumber: vi.fn(),
  listCoursesStrict: vi.fn(),
  getRecentlyPlayedCourses: vi.fn(),
  getTeamSavedCourses: vi.fn(),
  getCourseDetail: vi.fn(),
  getTeeWithHoles: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('../lib/haptics', () => ({ haptic: mocks.haptic }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => mocks.flag.on }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(mocks.session.current) }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(mocks.tables));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/app/golf/actions/golf', () => ({
  getPlayerQualifiers: (...args: unknown[]) => mocks.getPlayerQualifiers(...args),
  getNextQualifierRoundNumber: (...args: unknown[]) => mocks.getNextQualifierRoundNumber(...args),
}));
vi.mock('@/app/golf/actions/course-library', () => ({
  listCoursesStrict: (...args: unknown[]) => mocks.listCoursesStrict(...args),
  getRecentlyPlayedCourses: (...args: unknown[]) => mocks.getRecentlyPlayedCourses(...args),
  getTeamSavedCourses: (...args: unknown[]) => mocks.getTeamSavedCourses(...args),
  getCourseDetail: (...args: unknown[]) => mocks.getCourseDetail(...args),
  getTeeWithHoles: (...args: unknown[]) => mocks.getTeeWithHoles(...args),
}));
// The pages hand off to the screens, and to the Fairway clients: only which one, and with what, is read here.
vi.mock('@/app/golf/(dashboard)/dashboard/rounds/new/new-round-client', () => ({ default: function NewRoundClient() { return null; } }));
vi.mock('@/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client', () => ({ default: function ContinueRoundClient() { return null; } }));
vi.mock('@/components/fairway/pages/rounds/RoundTypeEditor', () => ({ RoundTypeEditor: function RoundTypeEditor() { return null; } }));
vi.mock('@/clubhouse/routes/round-new', () => ({ ClubhouseNewRoundRoute: function ClubhouseNewRoundRoute() { return null; } }));
vi.mock('@/clubhouse/routes/round-continue', () => ({ ClubhouseContinueRoundRoute: function ClubhouseContinueRoundRoute() { return null; } }));
vi.mock('../screens/rounds/track/RoundTracking', () => ({
  RoundTracking: (props: { statusSlot?: ReactNode }) => <div data-testid="tracking">{props.statusSlot}</div>,
}));

import NewRoundPage from '@/app/golf/(dashboard)/dashboard/rounds/new/page';
import ContinueRoundPage from '@/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page';
import { AnimatedPage } from '@/components/golf/layout/AnimatedPage';
import { ClubhouseContinueRoundRoute } from '@/clubhouse/routes/round-continue';
import { ClubhouseNewRoundRoute } from '@/clubhouse/routes/round-new';
import { isRebuilt, rebuiltHref } from '../shell/nav';
import { useAction, type ActionCopy } from '../lib/use-action';
import { noticeToast, useRoundPorts } from '../screens/rounds/entry/ports';
import { POSTED_OPEN_MS, RoundRuntime, SUBMIT_SLOW_MS } from '../screens/rounds/entry/RoundRuntime';
import { cardHoles, monthDay, outcomeOf, recoveryFacts, summaryHoles, thrownReason, trackingRound, type ChRoundSession } from '../screens/rounds/entry/session';
import { listCoursesRead, listTeesRead, loadSetupQualifiers, placeParts, startRefusal, teeFrom, teeHolesRead, toStartForm } from '../screens/rounds/entry/setup-reads';
import type { ChSetupForm } from '../screens/rounds/setup/shape';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
const ID = 'a0000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flag.on = true;
  mocks.session.current = { userId: 'u1', role: 'player', player: { id: 'p1' }, coach: null };
  mocks.tables.current = {};
});
afterEach(() => vi.useRealTimers());

// ── Whose addresses these are ──

describe('112401 Round entry: the addresses (110105, 110109)', () => {
  it('110105 /rounds/new, /rounds/recover and /rounds/continue/[id] are a player’s in Clubhouse, and a coach’s are not', () => {
    expect([isRebuilt('/golf/dashboard/rounds/new', 'player'), isRebuilt('/golf/dashboard/rounds/new/', 'player')]).toEqual([true, true]);
    expect(isRebuilt(`/golf/dashboard/rounds/continue/${ID}`, 'player')).toBe(true);
    expect([isRebuilt('/golf/dashboard/rounds/new', 'coach'), isRebuilt(`/golf/dashboard/rounds/continue/${ID}`, 'coach')]).toEqual([false, false]);
    expect([isRebuilt('/golf/dashboard/rounds/continue', 'player'), isRebuilt('/golf/dashboard/rounds/continue/not-an-id', 'player'), isRebuilt('/golf/dashboard/rounds/new/x', 'player')]).toEqual([false, false, false]);
    // Recovery is rebuilt (swap audit F-02): where the engines send a submit that could not reach the server. A coach has none.
    expect([isRebuilt('/golf/dashboard/rounds/recover', 'player'), isRebuilt('/golf/dashboard/rounds/recover', 'coach')]).toEqual([true, false]);
  });

  it('110109 a round still being played opens in the rebuilt Continue: the controls that lead to round entry are drawn for a player, and never for a coach', () => {
    expect(rebuiltHref('/golf/dashboard/rounds/new', 'player')).toBe('/golf/dashboard/rounds/new');
    expect(rebuiltHref(`/golf/dashboard/rounds/continue/${ID}`, 'player')).toBe(`/golf/dashboard/rounds/continue/${ID}`);
    expect(rebuiltHref('/golf/dashboard/rounds/new', 'coach')).toBeNull();
  });
});

describe('Round entry: the pages (golf_clubhouse_ui)', () => {
  it('110114 /rounds/new draws Clubhouse’s round for a player when the flag is on, and Fairway’s client when it is off', async () => {
    const on = (await NewRoundPage()) as ReactElement<{ playerId: string }>;
    expect(on.type).toBe(ClubhouseNewRoundRoute);
    expect(on.props.playerId).toBe('p1');
    mocks.flag.on = false;
    const off = (await NewRoundPage()) as ReactElement;
    expect(off.type).toBe(AnimatedPage);
  });

  it('/rounds/new keeps the Fairway message for a coach, flag on or off (only players log rounds)', async () => {
    mocks.session.current = { userId: 'u2', role: 'coach', player: null, coach: { id: 'c1' } };
    const on = (await NewRoundPage()) as ReactElement;
    expect(on.type).not.toBe(ClubhouseNewRoundRoute);
    expect(on.type).not.toBe(AnimatedPage);
  });

  const roundRow = { id: ID, player_id: 'p1', status: 'in_progress', course_name: 'Finley GC', course_id: null, tee_id: null, holes_played: 9, current_hole: 4, round_type: 'practice', round_date: '2026-10-14', updated_at: '2026-10-14T12:00:00.000Z', qualifier_id: null, qualifier_round_number: null, back_nine: null, draft_data: null, notes: null };
  const qualifierEntries = vi.fn(() => ({ data: [] }));
  function loaded() {
    mocks.tables.current = {
      golf_rounds: { data: roundRow },
      golf_holes: { data: [1, 2, 3].map((n) => ({ hole_number: n, par: 4, score: 4, putts: 2, fairway_hit: true, gir: true, penalty_strokes: 0, yardage: 380, up_and_down: null, sand_save: null })) },
      golf_shots: { data: [] },
      golf_qualifier_entries: qualifierEntries,
    };
  }

  it('110114 /rounds/continue/[id] hands the loaded round to Clubhouse, without the Fairway-only type editor or its qualifier reads, when the flag is on', async () => {
    loaded();
    const el = (await ContinueRoundPage({ params: Promise.resolve({ id: ID }) })) as ReactElement<Record<string, unknown>>;
    expect(el.type).toBe(ClubhouseContinueRoundRoute);
    expect(el.props).toMatchObject({ roundId: ID, playerId: 'p1', startHoleIndex: 3, serverDataTimestamp: '2026-10-14T12:00:00.000Z' });
    expect((el.props.holes as unknown[]).length).toBe(9);
    expect((el.props.setupData as { courseName: string }).courseName).toBe('Finley GC');
    expect(el.props.roundTypeEditor).toBeUndefined();
    expect(qualifierEntries).not.toHaveBeenCalled();
  });

  it('110114 /rounds/continue/[id] with the flag off renders Fairway’s client, with its type editor, as it always did', async () => {
    loaded();
    mocks.flag.on = false;
    const el = (await ContinueRoundPage({ params: Promise.resolve({ id: ID }) })) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
    expect(el.type).toBe(AnimatedPage);
    expect(el.props.children.props.roundTypeEditor).toBeTruthy();
    expect(qualifierEntries).toHaveBeenCalled();
  });

  it('/rounds/continue/[id] for a round that is not in progress still goes to its page, in either UI', async () => {
    mocks.tables.current = { golf_rounds: { data: { ...roundRow, status: 'completed' } } };
    // Not a thrown redirect(): the submit action's response re-renders this
    // page after the round completes, and a redirect thrown there surfaced as
    // React #441 and the route's error boundary. The client replace lands on
    // the same page from any render.
    const el = (await ContinueRoundPage({ params: Promise.resolve({ id: ID }) })) as ReactElement;
    mocks.router.replace.mockClear();
    render(el);
    expect(mocks.router.replace).toHaveBeenCalledWith(`/golf/dashboard/rounds/${ID}`);
    expect(screen.getByRole('link', { name: 'View round' })).toHaveAttribute('href', `/golf/dashboard/rounds/${ID}`);
    expect(screen.getByRole('status')).toHaveTextContent('This round is complete');
  });
});

describe('Round entry: loading (CH-11407)', () => {
  it('CH-11407 each entry route’s loading is Clubhouse’s skeleton inside the Clubhouse shell, and Fairway’s everywhere else', async () => {
    const New = (await import('@/app/golf/(dashboard)/dashboard/rounds/new/loading')).default;
    const Continue = (await import('@/app/golf/(dashboard)/dashboard/rounds/continue/[id]/loading')).default;
    for (const Loading of [New, Continue]) {
      const inside = render(
        <ClubhouseMarker {...{ role: 'player' as const }}>
          <Loading />
        </ClubhouseMarker>,
      );
      expect(code('CH-11407')).not.toBeNull();
      inside.unmount();
      const outside = render(<Loading />);
      expect(code('CH-11407')).toBeNull();
      outside.unmount();
    }
  });
});

// ── useAction: what a round action needs beyond a plain toast ──

describe('Round entry: useAction options (CH-1903, CH-11007)', () => {
  function Probe({ result, copy }: { result: { success: boolean; error?: string }; copy: ActionCopy }) {
    const a = useAction('rounds.probe', async () => result, copy);
    return (
      <button type="button" onClick={() => void a.run()}>
        run
      </button>
    );
  }
  const shown = (result: { success: boolean; error?: string }, copy: Partial<ActionCopy>) => {
    render(
      <ToastProvider>
        <Probe result={result} copy={{ done: 'Done', failed: 'Couldn’t', code: 'CH-11007', ...copy }} />
      </ToastProvider>,
    );
    return userEvent.setup();
  };

  it('quiet says and ticks nothing, for a failure and for a success: another surface owns the outcome', async () => {
    const user = shown({ success: false, error: 'busy?' }, { quiet: true });
    await user.click(screen.getByRole('button', { name: 'run' }));
    expect(document.querySelector('.ch-toast')).toBeNull();
    expect(mocks.haptic).not.toHaveBeenCalled();
  });

  it('retry: false drops the action, and a string names it', async () => {
    const user = shown({ success: false, error: 'Nope.' }, { retry: false });
    await user.click(screen.getByRole('button', { name: 'run' }));
    await waitFor(() => expect(code('CH-11007')).not.toBeNull());
    expect(within(code('CH-11007')!).queryByRole('button')).toBeNull();
  });

  it('retry names the action', async () => {
    const user = shown({ success: false, error: 'Nope.' }, { retry: 'Start anyway' });
    await user.click(screen.getByRole('button', { name: 'run' }));
    await waitFor(() => expect(within(code('CH-11007')!).getByRole('button', { name: 'Start anyway' })).toBeTruthy());
  });

  it('111404 a run kept from a render that saw the action pending still runs once the action has settled (a toast’s Retry)', async () => {
    const kept: Array<() => Promise<unknown>> = [];
    let calls = 0;
    let release: () => void = () => undefined;
    function Kept() {
      const a = useAction(
        'rounds.kept',
        async () => {
          calls += 1;
          if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
          return { success: true };
        },
        { done: 'Done', failed: 'Couldn’t' },
      );
      if (a.pending) kept.push(a.run);
      return (
        <button type="button" onClick={() => void a.run()}>
          run
        </button>
      );
    }
    render(
      <ToastProvider>
        <Kept />
      </ToastProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'run' }));
    await waitFor(() => expect(kept.length).toBeGreaterThan(0));
    release();
    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
    await act(async () => {
      await kept[0]!();
    });
    expect(calls).toBe(2);
  });

  it('111404 two calls in one tick run the action once, before any render has seen it pending', async () => {
    let calls = 0;
    let go: () => Promise<unknown> = async () => undefined;
    function Twice() {
      const a = useAction(
        'rounds.twice',
        async () => {
          calls += 1;
          return { success: true };
        },
        { done: 'Done', failed: 'Couldn’t' },
      );
      go = a.run;
      return null;
    }
    render(
      <ToastProvider>
        <Twice />
      </ToastProvider>,
    );
    await act(async () => {
      await Promise.all([go(), go()]);
    });
    expect(calls).toBe(1);
  });

  it('offline follows the copy’s own reading, not only the browser’s', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = shown({ success: true }, { done: 'Done', offline: () => false });
    await user.click(screen.getByRole('button', { name: 'run' }));
    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
    expect(code('CH-1903')).toBeNull();
  });
});

// ── The setup screen's ports ──

describe('Round entry: setup over the course library and the engine (ChSetupPorts)', () => {
  const course = (id: string, name: string, city = 'Chapel Hill', state = 'NC') => ({ id, name, city, state, total_par: 72 });

  it('CH-11510 the library is grouped recent, then team, then the rest, each course once', async () => {
    mocks.listCoursesStrict.mockResolvedValue([course('a', 'Alpha'), course('b', 'Beta'), course('c', 'Gamma', 'Durham', '')]);
    mocks.getRecentlyPlayedCourses.mockResolvedValue([course('b', 'Beta')]);
    mocks.getTeamSavedCourses.mockResolvedValue([{ course: course('a', 'Alpha') }, { course: course('b', 'Beta') }]);
    const r = await listCoursesRead();
    expect(r).toEqual({
      ok: true,
      data: [
        { id: 'b', name: 'Beta', place: 'Chapel Hill, NC', par: 72, teeCount: null, group: 'recent', lastPlayed: null },
        { id: 'a', name: 'Alpha', place: 'Chapel Hill, NC', par: 72, teeCount: null, group: 'team', lastPlayed: null },
        { id: 'c', name: 'Gamma', place: 'Durham', par: 72, teeCount: null, group: 'library', lastPlayed: null },
      ],
    });
  });

  it('CH-11209 a library that fails to read is a failure, never an empty library; a failing recent list is not', async () => {
    mocks.listCoursesStrict.mockRejectedValue(new Error('boom'));
    mocks.getRecentlyPlayedCourses.mockResolvedValue([]);
    mocks.getTeamSavedCourses.mockResolvedValue([]);
    expect(await listCoursesRead()).toEqual({ ok: false, error: 'boom' });
    mocks.listCoursesStrict.mockResolvedValue([course('a', 'Alpha')]);
    mocks.getRecentlyPlayedCourses.mockRejectedValue(new Error('recent failed'));
    const r = await listCoursesRead();
    expect(r.ok && r.data.map((c) => c.id)).toEqual(['a']);
  });

  it('CH-11208 the tees of a course, and a course that cannot be read is a failure (CH-11311 is a course with none)', async () => {
    mocks.getCourseDetail.mockResolvedValueOnce({ course: {}, tees: [{ id: 't1', course_id: 'a', tee_name: 'Blue', tee_color: 'blue', category: 'mens', total_yards: 6984, total_par: 72, course_rating: 73.1, slope_rating: 133, holes_count: 18, is_draft: false }, { id: 't2', course_id: 'a', tee_name: 'Gold', tee_color: null, category: 'custom', total_yards: null, total_par: null, course_rating: null, slope_rating: null, holes_count: 9, is_draft: true }] });
    const r = await listTeesRead('a');
    expect(r.ok && r.data).toEqual([
      { id: 't1', name: 'Blue', color: 'blue', category: 'Men’s', yards: 6984, par: 72, rating: 73.1, slope: 133, holesCount: 18, draft: false },
      { id: 't2', name: 'Gold', color: 'gold', category: null, yards: null, par: null, rating: null, slope: null, holesCount: 9, draft: true },
    ]);
    mocks.getCourseDetail.mockResolvedValueOnce(null);
    expect((await listTeesRead('zzz')).ok).toBe(false);
    expect(teeFrom({ id: 'x', tee_name: 'Championship', tee_color: null, category: null, holes_count: 18, is_draft: false } as never).color).toBeNull();
  });

  it('CH-11210 a tee’s card in hole order, a missing yardage left blank; a tee that cannot be read is a failure', async () => {
    mocks.getTeeWithHoles.mockResolvedValueOnce({ id: 't1', holes: [{ hole_number: 2, par: 3, yardage: 150 }, { hole_number: 1, par: 4, yardage: null }] });
    expect(await teeHolesRead('t1')).toEqual({ ok: true, data: [{ n: 1, par: 4, yards: '' }, { n: 2, par: 3, yards: '150' }] });
    mocks.getTeeWithHoles.mockResolvedValueOnce(null);
    expect((await teeHolesRead('t1')).ok).toBe(false);
  });

  it('CH-11211 the qualifiers: a coach-closed one is left out, a full one and one in progress say why they cannot be played, and a failed list is null', async () => {
    const q = (id: string, over = {}) => ({ id, name: `Q ${id}`, status: 'in_progress', numRounds: 3, roundsCompleted: 0, courseName: 'Finley GC', ...over });
    mocks.getPlayerQualifiers.mockResolvedValue({ success: true, data: [q('open'), q('closed', { status: 'completed' }), q('full', { roundsCompleted: 3 }), q('active'), q('gone')] });
    mocks.getNextQualifierRoundNumber.mockImplementation(async (id: string) =>
      id === 'active' ? { success: true, data: { nextRoundNumber: 1, availableRounds: [1], activeRoundId: 'r-9' } } : id === 'gone' ? { success: false, error: 'x' } : { success: true, data: { nextRoundNumber: 2, availableRounds: [2, 3] } },
    );
    const list = (await loadSetupQualifiers())!;
    expect(list.map((x) => x.id)).toEqual(['open', 'full', 'active', 'gone']);
    expect(list[0]).toMatchObject({ nextRound: 2, rounds: 3, completed: 0, blocked: null, courseName: 'Finley GC', teeId: null });
    expect(list[1]).toMatchObject({ nextRound: null, blocked: 'All 3 rounds are in; your coach is selecting.' });
    expect(list[2]).toMatchObject({ nextRound: null, blocked: 'A round is already in progress. Continue it from Rounds.' });
    expect(list[3]!.nextRound).toBeNull();
    mocks.getPlayerQualifiers.mockResolvedValue({ success: false, error: 'nope' });
    expect(await loadSetupQualifiers()).toBeNull();
  });

  const holes = Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, yards: String(380 + i) }));
  const form: ChSetupForm = {
    pick: { courseId: 'c1', courseName: 'Finley GC', place: 'Chapel Hill, NC', teeId: 't1', teeName: 'Blue', teeColor: 'blue', rating: 73.1, slope: 133, yards: 6984 },
    type: 'practice',
    date: '2026-10-14',
    count: 18,
    nine: 'front',
    holes,
    baseline: holes,
    qualifierId: 'stale',
    qualifierRound: 2,
    saveCourse: false,
  };

  it('110110 the setup form is the engine’s start form: the chosen nine numbered 1 to 9, the tee’s figures as text, the qualifier only for a qualifier round', () => {
    expect(toStartForm(form)).toMatchObject({
      setup: { courseName: 'Finley GC', courseCity: 'Chapel Hill', courseState: 'NC', courseRating: '73.1', courseSlope: '133', teesPlayed: 'Blue', roundType: 'practice', roundDate: '2026-10-14' },
      qualifierId: null,
      qualifierRoundNumber: null,
      courseId: 'c1',
      teeId: 't1',
      saveCourse: false,
    });
    const back = toStartForm({ ...form, count: 9, nine: 'back', type: 'qualifier' });
    expect(back.holes.map((h) => h.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(back.holes[0]).toEqual({ holeNumber: 1, par: 4, yardage: 389 });
    expect([back.qualifierId, back.qualifierRoundNumber]).toEqual(['stale', 2]);
    const typed = toStartForm({ ...form, pick: { ...form.pick!, courseId: null, teeId: null, rating: null, slope: null, place: null }, saveCourse: true });
    expect(typed).toMatchObject({ courseId: null, teeId: null, saveCourse: true, setup: { courseRating: '', courseSlope: '', courseCity: '', courseState: '' } });
    expect(placeParts('Washington, D.C., US')).toEqual({ city: 'Washington, D.C.', state: 'US' });
    expect(placeParts('Pittsboro')).toEqual({ city: 'Pittsboro', state: '' });
    expect(placeParts(null)).toEqual({ city: '', state: '' });
  });

  it('CH-11007 CH-11014 CH-11015 CH-11016 CH-11907 CH-1903 each refusal of a start is the surface that owns it', () => {
    const r = (reason: string, extra = {}) => startRefusal({ ok: false, reason, error: 'Said.', ...extra } as never);
    expect(r('in_progress_exists', { roundId: 'x' })).toEqual({ ok: false, error: 'Said.', kind: 'handled' });
    expect(r('in_flight')).toMatchObject({ kind: 'handled' });
    expect(r('already_started')).toMatchObject({ kind: 'handled' });
    expect(r('qualifier_round_active', { roundId: 'q-1' })).toMatchObject({ kind: 'handled', open: 'q-1' });
    expect(r('qualifier_round_unavailable')).toMatchObject({ kind: 'final', code: 'CH-11014' });
    expect(r('qualifier_unverified')).toEqual({ ok: false, error: 'Said.', code: 'CH-11015' });
    expect(r('duplicate_completed_round')).toEqual({ ok: false, error: 'Said.', code: 'CH-11016', retry: 'Start anyway' });
    expect(r('offline')).toEqual({ ok: false, error: 'Said.', code: 'CH-1903' });
    for (const reason of ['invalid', 'server_rejected', 'transport']) expect(r(reason)).toEqual({ ok: false, error: 'Said.' });
  });
});

// ── The engines' notices ──

describe('Round entry: the engines’ notices (CH-11902, CH-11903 to CH-11908)', () => {
  it('each notice the engines word for the Fairway toast has Clubhouse’s words and its own code', () => {
    expect(noticeToast('Auto-save is having trouble. Your draft is saved locally, but server sync may be delayed.', 'warning')).toMatchObject({ code: 'CH-11903', tone: 'error', title: 'Saving is slow' });
    expect(noticeToast('Auto-save is having trouble. Your data is cached locally.', 'warning').code).toBe('CH-11903');
    expect(noticeToast('This device could not save a quick local backup of your shots. They are still being saved to a slower backup and to the server.', 'warning').code).toBe('CH-11904');
    expect(noticeToast('Round saved on this device. Opening recovery flow.', 'warning')).toMatchObject({ code: 'CH-11905', body: 'It couldn’t reach the server. Restore it on the next screen to submit it.' });
    expect(noticeToast('Saved as a practice round.', 'success')).toEqual({ title: 'Saved as a practice round', code: 'CH-11906' });
    expect(noticeToast('Saved as a practice round. Reloading…', 'success').code).toBe('CH-11906');
    expect(noticeToast('Something new.', 'info')).toEqual({ tone: 'done', title: 'Something new.', code: 'CH-11908' });
    expect(noticeToast('Something bad.', 'error')).toEqual({ tone: 'error', title: 'Something bad.', code: 'CH-11908' });
  });

  function ports() {
    return renderHook(() => useRoundPorts(), { wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider> });
  }

  it('CH-11902 both wordings of a round changed elsewhere are the Reload toast, in a capture or not', async () => {
    const { result } = ports();
    act(() => result.current.ports.showToast('This round was updated on another device. Please reload.', 'error'));
    await waitFor(() => expect(within(code('CH-11902')!).getByRole('button', { name: 'Reload' })).toBeTruthy());
    const run = await act(() => result.current.capture(async () => result.current.ports.showToast('This round was updated on another device. Reload to continue.', 'error')));
    expect(run.notices).toEqual({ errors: [], conflict: true });
  });

  it('CH-11908 an error inside a capture is handed back, not drawn; outside one it is drawn with the error tick, so nothing is lost', async () => {
    const { result } = ports();
    const run = await act(() => result.current.capture(async () => result.current.ports.showToast('Failed to save round. Please try again.', 'error')));
    expect(run.notices.errors).toEqual(['Failed to save round. Please try again.']);
    expect(document.querySelector('.ch-toast')).toBeNull();
    expect(mocks.haptic).not.toHaveBeenCalled();
    act(() => result.current.ports.showToast('Failed to save round. Please try again.', 'error'));
    await waitFor(() => expect(code('CH-11908')).toHaveTextContent('Failed to save round.'));
    expect(mocks.haptic).toHaveBeenCalledWith('error');
  });

  it('a capture reports a throw, and two overlapping captures both hear an error', async () => {
    const { result } = ports();
    const thrown = await act(() => result.current.capture(async () => Promise.reject(new Error('down'))));
    expect(outcomeOf(thrown)).toEqual({ failed: true, conflict: false, reason: 'down' });
    const [a, b] = await act(() =>
      Promise.all([
        result.current.capture(async () => {
          await Promise.resolve();
          result.current.ports.showToast('Bad.', 'error');
        }),
        result.current.capture(async () => {
          await Promise.resolve();
        }),
      ]),
    );
    expect([a.notices.errors, b.notices.errors]).toEqual([['Bad.'], ['Bad.']]);
    expect(outcomeOf({ notices: { errors: [], conflict: false } })).toEqual({ failed: false, conflict: false, reason: undefined });
  });

  it('a dropped connection’s bare throw has no reason worth saying', () => {
    expect(thrownReason(new TypeError('Failed to fetch'))).toBeUndefined();
    expect(thrownReason(new Error('Load failed'))).toBeUndefined();
    expect(thrownReason(new Error('This round is locked.'))).toBe('This round is locked.');
    expect(thrownReason('x')).toBeUndefined();
  });
});

// ── The round's own words ──

describe('Round entry: what the round says about itself', () => {
  it('names the round, the tees and the day; the card and the summary read the saved stats', () => {
    expect(monthDay('2026-10-14')).toBe('Oct 14');
    expect(monthDay('')).toBeNull();
    expect(trackingRound({ courseName: ' Finley GC ', teesPlayed: 'Blue', roundType: 'qualifier' })).toEqual({ course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue', type: 'qualifier' });
    expect(trackingRound({ courseName: '', teesPlayed: '', roundType: '' })).toEqual({ course: 'Your round', teeLabel: null, teeColor: null, type: null });
    const hs = [{ number: 1, par: 4, yardage: 380, score: 5 }, { number: 2, par: 3, yardage: 150, score: null }];
    const st = [{ putts: 2, score: 5, fairwayHit: true, greenInRegulation: false }, undefined] as never;
    expect(cardHoles(hs, st)).toEqual([{ number: 1, par: 4, score: 5, putts: 2 }, { number: 2, par: 3, score: null, putts: null }]);
    expect(summaryHoles(hs, st)).toEqual([{ number: 1, par: 4, score: 5, putts: 2, fairwayHit: true, gir: false }, { number: 2, par: 3, score: null, putts: null, fairwayHit: null, gir: false }]);
    expect(recoveryFacts(null)).toEqual({ course: null, tees: null, type: null, holesDone: 0, holesTotal: null, savedAt: null });
  });
});

// ── The round, once it is posted or stuck ──

function fakeSession(over: Partial<ChRoundSession> = {}): ChRoundSession {
  return {
    round: { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue', type: 'practice' },
    heading: 'Finley GC · Blue · Oct 14',
    holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, yardage: 380, score: 4 })),
    currentHoleIndex: 8,
    setCurrentHoleIndex: vi.fn(),
    completedHoleStats: [],
    activeHoleShots: [],
    activeShotNumber: 1,
    onHoleComplete: vi.fn(async () => true),
    onHoleStatsUpdate: vi.fn(),
    onSaveShot: vi.fn(),
    onAutoSave: vi.fn(async () => {}),
    autoSaveDisabled: false,
    error: '',
    setError: vi.fn(),
    roundConflictBlocked: false,
    offline: () => false,
    engineExitOpen: false,
    setEngineExitOpen: vi.fn(),
    saveForLater: vi.fn(async () => {}),
    deleteRound: vi.fn(async () => {}),
    pendingFinalStats: null,
    showFinishConfirm: false,
    setShowFinishConfirm: vi.fn(),
    submit: vi.fn(async () => {}),
    submitting: false,
    completedRoundId: null,
    qualifierClosed: false,
    submitRetry: vi.fn(),
    submitGoBack: vi.fn(),
    submitSaveAndExit: vi.fn(async () => {}),
    submitDiscard: vi.fn(async () => {}),
    saveAsPractice: vi.fn(async () => {}),
    recovery: { open: false, data: null, restoring: false },
    restoreRecovery: vi.fn(),
    discardRecovery: vi.fn(),
    closeRecovery: vi.fn(),
    ...over,
  };
}
const capture = async <T,>(run: () => Promise<T>) => {
  try {
    return { value: await run(), notices: { errors: [], conflict: false } };
  } catch (thrown) {
    return { thrown, notices: { errors: [], conflict: false } };
  }
};
const ROUTES = { library: '/golf/dashboard/rounds', review: (id: string) => `/golf/dashboard/rounds/${id}` };
function runtime(session: ChRoundSession, held = false) {
  const ui = (s: ChRoundSession) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <RoundRuntime session={s} capture={capture} routes={ROUTES} errorsHeld={held} />
      </ToastProvider>
    </LazyMotion>
  );
  const view = render(ui(session));
  return { ...view, again: (s: ChRoundSession) => view.rerender(ui(s)) };
}

describe('Round entry: a round that posts, is slow, or fails (CH-11603, CH-11005, CH-11909)', () => {
  it('110902 CH-11603 a posted round ticks once and opens its review after a beat, once, however often the screen redraws', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const view = runtime(fakeSession({ submitting: true, completedRoundId: 'r-77' }));
    expect(mocks.haptic.mock.calls.filter(([k]) => k === 'success')).toHaveLength(1);
    expect(mocks.router.push).not.toHaveBeenCalled();
    // The router the page hands out is a new object (as Next's can be) when the screen redraws.
    mocks.router = { ...mocks.router };
    view.again(fakeSession({ submitting: true, completedRoundId: 'r-77' }));
    act(() => void vi.advanceTimersByTime(POSTED_OPEN_MS + 10));
    expect(mocks.router.push).toHaveBeenCalledTimes(1);
    expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds/r-77');
    expect(mocks.haptic.mock.calls.filter(([k]) => k === 'success')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /View round review/ }).getAttribute('href')).toBe('/golf/dashboard/rounds/r-77');
  });

  it('CH-11909 saving for over 15 seconds says it is slow and names the way out; a quicker one says nothing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    runtime(fakeSession({ submitting: true }));
    act(() => void vi.advanceTimersByTime(SUBMIT_SLOW_MS - 1000));
    expect(code('CH-11909')).toBeNull();
    act(() => void vi.advanceTimersByTime(1500));
    expect(code('CH-11909')).toHaveTextContent('This is taking longer than usual.');
    expect(within(code('CH-11909')!).getByRole('link', { name: 'Rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
  });

  it('CH-11005 a submit that failed offers Try again and Go back, so a failure that will not clear is not a dead end', async () => {
    const s = fakeSession({ submitting: true, error: 'The server said no.' });
    runtime(s);
    const user = userEvent.setup();
    expect(code('CH-11005')).toHaveTextContent('The round didn’t submit');
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(s.submitGoBack).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(s.submitRetry).toHaveBeenCalledTimes(1);
  });

  it('CH-11910 every hole is in but the finish sheet is closed: a note offers it again', async () => {
    const s = fakeSession({ pendingFinalStats: [], showFinishConfirm: false });
    runtime(s);
    await userEvent.setup().click(within(code('CH-11910')!).getByRole('button', { name: 'Review and submit' }));
    expect(s.setShowFinishConfirm).toHaveBeenCalledWith(true);
    runtime(fakeSession({ pendingFinalStats: [], showFinishConfirm: true }));
    expect(document.querySelectorAll('[data-ch-code="CH-11910"]')).toHaveLength(1);
  });

  it('CH-11902 CH-11013 the Reload note replaces the error note, an open dialog holds the error, and Dismiss clears it', async () => {
    const blocked = fakeSession({ error: 'This round was updated on another device. Please reload.', roundConflictBlocked: true });
    const view = runtime(blocked);
    expect(code('CH-11902')).not.toBeNull();
    expect(code('CH-11013')).toBeNull();
    const plain = fakeSession({ error: 'This hole has not saved yet.' });
    view.again(plain);
    expect(code('CH-11013')).toHaveTextContent('This hole has not saved yet.');
    await userEvent.setup().click(within(code('CH-11013')!).getByRole('button', { name: 'Dismiss' }));
    expect(plain.setError).toHaveBeenCalledWith('');
    view.unmount();
    runtime(fakeSession({ error: 'A restore failed.' }), true);
    expect(code('CH-11013')).toBeNull();
  });

  it('CH-11506 the engine’s own Exit flag (the back button) opens the Exit sheet, and Keep playing closes both', async () => {
    const s = fakeSession({ engineExitOpen: true });
    runtime(s);
    await waitFor(() => expect(code('CH-11506')).toHaveAttribute('open'));
    await userEvent.setup().click(within(code('CH-11506')!).getByRole('button', { name: /Keep playing/ }));
    expect(s.setEngineExitOpen).toHaveBeenCalledWith(false);
  });
});
