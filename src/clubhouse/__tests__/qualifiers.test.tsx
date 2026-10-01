import { LazyMotion, domAnimation } from 'framer-motion';
import { render, renderHook, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/**
 * Qualifiers: every numbered state in docs/clubhouse/catalog/qualifiers.md, found by its number, and every hand
 * contract of docs/clubhouse/pages/P009-qualifiers/CONTRACT.md, found by its Bridge ID (9ccii) in a test title.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  // The real hook reads the address, which is what the list's filter and search live in.
  useSearchParams: () => new URLSearchParams(window.location.search),
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void> | void) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
// The browser client the live standings use: the test hands out the channel and reads back what was asked of it.
const realtime = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: realtime.channel, removeChannel: realtime.removeChannel }) }));
// The route: who is signed in, which team they work in, and whether the Clubhouse is on for them.
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const gate = vi.hoisted(() => ({ on: true }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: (role: string | null) => gate.on && (role === 'coach' || role === 'player') }));
vi.mock('@/app/golf/actions/golf', () => ({
  createGolfQualifier: vi.fn(),
  setQualifierRoundCourses: vi.fn(),
  updateGolfQualifierDetails: vi.fn(),
  updateQualifierStatus: vi.fn(),
}));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: vi.fn(), setQualifierSquadSize: vi.fn() }));
vi.mock('@/app/golf/actions/v3/qualifying', () => ({ advanceSelectionState: vi.fn(), confirmQualifierSelection: vi.fn(), removeQualifierCoachPick: vi.fn(), setQualifierCoachPick: vi.fn() }));
vi.mock('@/app/golf/actions/course-library', () => ({ getCourseDetail: vi.fn(), getTeamSavedCourses: vi.fn(), listCoursesStrict: vi.fn() }));

import { getGolfSessionProfile } from '@/lib/auth/session';
import QualifierSelectionPage from '@/app/golf/(dashboard)/dashboard/qualifiers/[id]/selection/page';
import { advanceSelectionState, confirmQualifierSelection, removeQualifierCoachPick, setQualifierCoachPick } from '@/app/golf/actions/v3/qualifying';
import { loadQualifierDetail, loadQualifierForm, loadQualifierList, loadQualifierSelection, type ChQDetail, type ChQDetailCore, type ChQDetailLoad, type ChQDetailSecondary, type ChQFormData, type ChQList, type ChQSelectionData } from '../data/qualifiers';
import { chReport, chTrail } from '../lib/track';
import { ClubhouseQualifiersRoute } from '../routes/qualifiers';
import { resolveClubhouseTeam } from '../routes/team';
import { QualifiersList } from '../screens/qualifiers/QualifiersList';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { fulfilled } from '../screens/qualifiers/streamed';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import { QualifierSelection } from '../screens/qualifiers/QualifierSelection';
import { QualifierDetailSkeleton, QualifierFormSkeleton, QualifierSelectionSkeleton, QualifiersSkeleton } from '../screens/qualifiers/QualifiersSkeleton';
import { useLiveStandings } from '../screens/qualifiers/live';
import { buildBoard, roundPars, validateForm, type ChQFormValues, type ChQRound } from '../screens/qualifiers/model';
import { LIVE_SELECTION_WRITES, runEditPlan, selectionReason, startSelecting, type ChQSelectionWrites, type ChQWrites } from '../screens/qualifiers/writes';
import { DETAIL_INDEX, PLAYER_ID, PREVIEW_COURSES, PREVIEW_TEES, previewCreateForm, previewDetail, previewEditForm, previewList, previewSelection } from '../preview/fixtures-qualifiers';
import { isRebuilt } from '../shell/nav';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function wrap(node: ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
type FakeWrites = { [K in keyof ChQWrites]: Mock<ChQWrites[K]> };
function fakeWrites(over: Partial<Record<keyof ChQWrites, Mock>> = {}): FakeWrites {
  return {
    create: vi.fn<ChQWrites['create']>(async () => ({ success: true, data: { qualifierId: 'q-new' } })),
    saveEdit: vi.fn<ChQWrites['saveEdit']>(async () => ({ success: true })),
    setStatus: vi.fn<ChQWrites['setStatus']>(async () => ({ success: true })),
    courses: vi.fn<ChQWrites['courses']>(async () => PREVIEW_COURSES),
    tees: vi.fn<ChQWrites['tees']>(async () => PREVIEW_TEES),
    ...over,
  } as FakeWrites;
}
const fail = async () => ({ success: false, error: 'nope' });
const never = () => new Promise<never>(() => {});
const detail = (name: keyof typeof DETAIL_INDEX = 'live', role: 'coach' | 'player' = 'coach', over: Partial<ChQDetail> = {}): ChQDetail => ({ ...previewDetail(DETAIL_INDEX[name]!, role), ...over });
const list = (role: 'coach' | 'player' = 'coach', mode: 'all' | 'mine' = 'all', over: Partial<ChQList> = {}): ChQList => ({ ...previewList(role, mode), ...over });
/**
 * What the route does with the loader's result: the standings as `data`, the courses and cards beside them. They are awaited and handed
 * over already kept (a page whose courses are still coming suspends, and the streaming tests below are the ones that render that).
 */
const streamedPage = async (d: ChQDetailLoad) => {
  const { secondary, ...core } = d;
  return <QualifierDetail data={core} secondary={fulfilled(await secondary)} writes={fakeWrites()} live={false} />;
};

/** The selection writes, all succeeding unless a test says otherwise. */
type SelWrites = { [K in keyof ChQSelectionWrites]: Mock<ChQSelectionWrites[K]> };
const ok = async () => ({ success: true });
const selWrites = (over: Partial<Record<keyof ChQSelectionWrites, Mock>> = {}): SelWrites =>
  ({
    advance: vi.fn<ChQSelectionWrites['advance']>(ok),
    setPick: vi.fn<ChQSelectionWrites['setPick']>(ok),
    removePick: vi.fn<ChQSelectionWrites['removePick']>(ok),
    chooseTie: vi.fn<ChQSelectionWrites['chooseTie']>(ok),
    confirm: vi.fn<ChQSelectionWrites['confirm']>(ok),
    ...over,
  }) as SelWrites;
const inDialog = (c: string, name: string | RegExp) => within(code(c) as HTMLElement).getByRole('button', { name });
/** Sign in as the team's coach, for a route render. */
const asCoachSession = () => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
  vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' });
};

beforeEach(() => {
  hapticSpy.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
  router.refresh.mockClear();
  router.back.mockClear();
  logServer.mockClear();
  vi.mocked(chReport).mockClear();
  vi.mocked(chTrail).mockClear();
  realtime.channel.mockReset();
  realtime.removeChannel.mockReset();
  vi.mocked(getGolfSessionProfile).mockReset();
  vi.mocked(resolveClubhouseTeam).mockReset();
  gate.on = true;
  tables.current = {};
  tables.gate = undefined;
  // The list keeps its filter and scroll in the address and the session: every test starts from none.
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Qualifiers · the standings model', () => {
  const e = (id: string) => ({ playerId: id, name: id.toUpperCase(), classYear: null });
  const rd = (playerId: string, number: number, total: number, toPar: number, holesPlayed: number | null = 18): ChQRound => ({
    id: `${playerId}${number}`,
    playerId,
    number,
    total,
    toPar,
    date: '2026-09-22',
    course: 'Finley GC',
    holesPlayed,
  });
  it('ranks by total to par, then strokes, then more rounds; ties share a T position', () => {
    const b = buildBoard({
      entrants: ['a', 'b', 'c', 'd', 'e'].map(e),
      rounds: [rd('a', 1, 70, -2), rd('b', 1, 71, -1), rd('c', 1, 71, -1), rd('d', 1, 72, 1), rd('d', 2, 71, -1), rd('e', 1, 74, 2)],
      squad: 3,
      picks: 1,
      status: 'in_progress',
      selectionState: 'scoring',
      selections: null,
    });
    expect(b.rows.map((r) => [r.playerId, r.position, r.tied])).toEqual([
      ['a', 1, false],
      ['b', 2, true],
      ['c', 2, true],
      ['d', 4, false],
      ['e', 5, false],
    ]);
    // Two places on score (3 places, 1 pick). B and C are level at the second place, so they share a tie at the cut
    // until the coach chooses (Q-114); D is on the bubble; the rest are out.
    expect(b.rows.map((r) => r.state)).toEqual(['qualifying', 'tie', 'tie', 'bubble', null]);
    expect(b.submitted).toBe(6);
  });
  it('averages full rounds only, and counts the shorter ones it left out', () => {
    const b = buildBoard({ entrants: [e('a')], rounds: [rd('a', 1, 72, 0), rd('a', 2, 38, 2, 9)], squad: 5, picks: 1, status: 'in_progress', selectionState: 'open', selections: null });
    expect(b.rows[0]).toMatchObject({ avg: 72, shortRounds: 1, total: 110, toPar: 2, played: 2 });
  });
  it('a total without a to-par is unknown, not even; a second round in one round slot counts once (§11.2, §11.3)', () => {
    const b = buildBoard({
      entrants: ['a', 'b'].map(e),
      rounds: [rd('a', 1, 75, 3), { ...rd('a', 2, 76, 0), toPar: null }, rd('b', 1, 72, 0), { ...rd('b', 1, 80, 8), id: 'b1-dup' }],
      squad: 2,
      picks: 0,
      status: 'in_progress',
      selectionState: 'scoring',
      selections: null,
    });
    expect(b.rows.find((r) => r.playerId === 'a')).toMatchObject({ played: 1, total: 75, toPar: 3 });
    expect(b.rows.find((r) => r.playerId === 'b')).toMatchObject({ played: 1, total: 72, toPar: 0 });
  });
  it('a completed round with no total is unknown, not a free even round (§11.2)', () => {
    const blank: ChQRound = { ...rd('a', 2, 0, 0), total: null, toPar: null };
    const b = buildBoard({
      entrants: ['a', 'b', 'c'].map(e),
      rounds: [rd('a', 1, 75, 3), blank, rd('b', 1, 74, 2), { ...rd('c', 1, 0, 0), total: null, toPar: null }],
      squad: 3,
      picks: 0,
      status: 'in_progress',
      selectionState: 'scoring',
      selections: null,
    });
    expect(b.rows.map((r) => [r.playerId, r.played, r.total, r.toPar])).toEqual([
      ['b', 1, 74, 2],
      ['a', 1, 75, 3],
    ]);
    // A player whose only round has no score is unranked, never ahead of real scores on a zero.
    expect(b.unscored.map((r) => r.playerId)).toEqual(['c']);
    expect(b.submitted).toBe(2);
  });
  it('a confirmed squad replaces the cut-line states', () => {
    const b = buildBoard({
      entrants: ['a', 'b', 'c'].map(e),
      rounds: [rd('a', 1, 70, -2), rd('b', 1, 71, -1), rd('c', 1, 75, 3)],
      squad: 2,
      picks: 1,
      status: 'completed',
      selectionState: 'selected',
      selections: [
        { playerId: 'a', type: 'top_score', reasoning: null },
        { playerId: 'c', type: 'coach_pick', reasoning: 'Course history' },
      ],
    });
    expect(b.rows.map((r) => r.state)).toEqual(['selected', null, 'pick']);
  });
  it('par per round: the tee first, else what every round agrees on; one par only when all agree', () => {
    const rounds = [rd('a', 1, 72, 0), rd('b', 1, 70, -2), rd('a', 2, 71, 0)];
    expect(roundPars({ numRounds: 3, teePars: new Map([[3, 71]]), rounds })).toEqual({ byRound: [72, 71, 71], single: null });
    expect(roundPars({ numRounds: 2, teePars: new Map(), rounds: [rd('a', 1, 72, 0), rd('a', 2, 73, 1)] })).toEqual({ byRound: [72, 72], single: 72 });
    expect(roundPars({ numRounds: 2, teePars: new Map(), rounds: [rd('a', 1, 72, 0)] }).single).toBeNull();
  });
});

describe('Qualifiers · form rules', () => {
  const good: ChQFormValues = { ...previewCreateForm().initial, name: 'Q', startDate: '2026-10-19' };
  const codes = (v: Partial<ChQFormValues>, min?: number) => validateForm({ ...good, ...v }, { minRounds: min }).map((p) => p.code);
  it('a complete form passes', () => expect(codes({})).toEqual([]));
  it('CH-09101 CH-09102 a name and a start date are required', () => expect(codes({ name: ' ', startDate: '' })).toEqual(['CH-09101', 'CH-09102']));
  it('CH-09103 the end date is before the start', () => expect(codes({ endDate: '2026-10-18' })).toEqual(['CH-09103']));
  it('CH-09104 the entry deadline is after the start', () => expect(codes({ entryDeadline: '2026-10-20' })).toEqual(['CH-09104']));
  it('CH-09105 rounds is 1 to 50, and never below a round with scores', () => {
    expect(codes({ rounds: '0' })).toEqual(['CH-09105']);
    expect(codes({ rounds: '51' })).toEqual(['CH-09105']);
    expect(validateForm({ ...good, rounds: '1', oneRoundAck: true }, { minRounds: 2 })[0]!.text).toMatch(/Round 2 already has scores/);
  });
  it('CH-09106 one round has to be acknowledged', () => {
    expect(codes({ rounds: '1' })).toEqual(['CH-09106']);
    expect(codes({ rounds: '1', oneRoundAck: true })).toEqual([]);
  });
  it('CH-09107 at least one player', () => expect(codes({ playerIds: [] })).toEqual(['CH-09107']));
  it('CH-09108 CH-09109 the squad is 1 to 12, with no more picks than places', () => {
    expect(codes({ squad: '13' })).toEqual(['CH-09108']);
    expect(codes({ squad: '3', picks: '4' })).toEqual(['CH-09109']);
  });
});

describe('Qualifiers · the loader', () => {
  const Q = { id: 'q1', team_id: 't1', name: 'Pinehurst qualifier', description: null, status: 'in_progress', start_date: '2026-09-22', end_date: '2026-10-01', entry_deadline: null, course_name: 'Finley GC', rules: null, num_rounds: 2, selection_slots_total: 3, selection_slots_coach_pick: 1, selection_state: 'selected', is_test: false };
  const player = (id: string, first: string) => ({ id, first_name: first, last_name: 'X', graduation_year: null });
  const entries = [
    { qualifier_id: 'q1', player_id: 'p1', player: player('p1', 'Ann') },
    { qualifier_id: 'q1', player_id: 'p2', player: player('p2', 'Bea') },
  ];
  const rounds = [
    { id: 'r1', qualifier_id: 'q1', player_id: 'p1', qualifier_round_number: 1, total_score: 70, score_to_par: -2, round_date: '2026-09-22', course_name: 'Finley GC', holes_played: 18 },
    { id: 'r2', qualifier_id: 'q1', player_id: 'p2', qualifier_round_number: 1, total_score: 74, score_to_par: 2, round_date: '2026-09-22', course_name: 'Finley GC', holes_played: 18 },
  ];
  const holesFor = (filters: Array<[string, unknown[]]>) => {
    const ids = (filters.find(([k, a]) => k === 'in' && a[0] === 'round_id')?.[1][1] ?? []) as string[];
    return { data: ids.flatMap((id) => [{ round_id: id, hole_number: 1, par: 4, score: 4 }]) };
  };

  it('CH-09201 a failed list read is a notice, never "no qualifiers"', async () => {
    tables.current = { golf_qualifiers: { error: { message: 'boom' } } };
    const data = await loadQualifierList({ role: 'coach', teamId: 't1', playerId: null, mode: 'all' });
    expect(data.listError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('qualifiers', 'list', expect.anything(), 'qualifiers');
    wrap(<QualifiersList data={data} />);
    await expectCode('CH-09201', /The qualifiers didn’t load/);
    expect(code('CH-09301')).toBeNull();
  });

  it('CH-09202 entries that do not load leave counts and leaders out, not zero', async () => {
    tables.current = { golf_qualifiers: { data: [Q] }, golf_qualifier_entries: { error: { message: 'boom' } }, golf_rounds: { data: rounds } };
    const data = await loadQualifierList({ role: 'coach', teamId: 't1', playerId: null, mode: 'all' });
    expect(data.standingsError).toBe(true);
    expect(data.items[0]!.leaders).toEqual([]);
    wrap(<QualifiersList data={data} />);
    await expectCode('CH-09202', /Standings didn’t load/);
    expect(document.querySelector('.ch-qf-lead')).toBeNull();
  });

  it('90106 a player list puts their own qualifiers first, with where they stand; mine keeps only those', async () => {
    const other = { ...Q, id: 'q2', name: 'Other', start_date: '2026-10-01' };
    tables.current = { golf_qualifiers: { data: [other, Q] }, golf_qualifier_entries: { data: entries }, golf_rounds: { data: rounds } };
    const all = await loadQualifierList({ role: 'player', teamId: 't1', playerId: 'p2', mode: 'all' });
    expect(all.items.map((i) => i.id)).toEqual(['q1', 'q2']);
    expect(all.items[0]!.mine).toEqual({ entered: true, position: '2', toPar: 2, played: 1 });
    expect(all.items[1]!.mine?.entered).toBe(false);
    const mine = await loadQualifierList({ role: 'player', teamId: 't1', playerId: 'p2', mode: 'mine' });
    expect(mine.items.map((i) => i.id)).toEqual(['q1']);
  });

  it('90806 90807 a player gets only their own scorecards and never the pick reasoning', async () => {
    tables.current = {
      golf_qualifiers: { data: Q },
      golf_qualifier_entries: { data: entries },
      golf_rounds: { data: rounds },
      golf_qualifier_round_courses: { data: [] },
      // Answers with only the columns asked for, so a player read that asked for the reasoning would carry it.
      golf_qualifier_selections: (filters) => {
        const cols = String(filters.find(([k]) => k === 'select')?.[1][0] ?? '');
        return { data: [{ player_id: 'p2', selection_type: 'coach_pick', ...(cols.includes('coach_reasoning') ? { coach_reasoning: 'Course history' } : {}) }] };
      },
      golf_holes: holesFor,
    };
    const asPlayer = (await loadQualifierDetail({ role: 'player', teamId: 't1', playerId: 'p2', qualifierId: 'q1' }))!;
    expect(Object.keys((await asPlayer.secondary).holes)).toEqual(['r2']);
    expect(asPlayer.selections).toEqual([{ playerId: 'p2', type: 'coach_pick', reasoning: null, name: 'Bea X' }]);
    const asCoach = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(Object.keys((await asCoach.secondary).holes).sort()).toEqual(['r1', 'r2']);
    expect(asCoach.selections![0]!.reasoning).toBe('Course history');
    // Once D-35's migration is applied the column is refused and the coach-gated reader answers.
    tables.current = {
      ...tables.current,
      golf_qualifier_selections: { data: [{ player_id: 'p2', selection_type: 'coach_pick' }] },
      'rpc:golf_qualifier_selection_reasons': { data: [{ player_id: 'p2', coach_reasoning: 'Course history' }] },
    };
    const afterApply = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(afterApply.selections![0]!.reasoning).toBe('Course history');
    expect(asCoach.board!.rows.map((r) => r.state)).toEqual([null, 'pick']);
  });

  it('90805 a qualifier read that fails throws (the route error view retries); another team’s is not found', async () => {
    tables.current = { golf_qualifiers: { error: { message: 'boom' } } };
    await expect(loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' })).rejects.toThrow();
    tables.current = { golf_qualifiers: { data: { ...Q, team_id: 'other' } } };
    expect(await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' })).toBeNull();
    expect(await loadQualifierForm({ teamId: 't1', qualifierId: 'q1' })).toBeNull();
    // A test qualifier is hidden from the list, so a link to one is not found either.
    tables.current = { golf_qualifiers: { data: { ...Q, team_id: 't1', is_test: true } } };
    expect(await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' })).toBeNull();
    expect(await loadQualifierForm({ teamId: 't1', qualifierId: 'q1' })).toBeNull();
  });

  it('CH-09203 CH-09204 the field is never shown without its scores', async () => {
    tables.current = { golf_qualifiers: { data: Q }, golf_qualifier_entries: { data: entries }, golf_rounds: { error: { message: 'boom' } }, golf_qualifier_round_courses: { data: [] } };
    const scores = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(scores.board).toBeNull();
    const { unmount } = wrap(await streamedPage(scores));
    await expectCode('CH-09204', /Scores didn’t load/);
    unmount();
    wrap(<QualifierDetail data={detail('live', 'coach', { entriesError: true, board: null })} writes={fakeWrites()} live={false} />);
    await expectCode('CH-09203', /The field didn’t load/);
  });

  it('90103 a new qualifier opens with the whole active roster ticked, three rounds, a five-player squad and one pick; an existing one opens with its own values', async () => {
    tables.current = { golf_team_members: { data: [{ player: player('p1', 'Ann') }, { player: player('p3', 'Cal') }] } };
    const created = (await loadQualifierForm({ teamId: 't1', qualifierId: null }))!;
    expect(created).toMatchObject({ mode: 'create', id: null, playersError: false, squadLocked: false, minRounds: 1, initial: { name: '', rounds: '3', squad: '5', picks: '1', oneRoundAck: false } });
    expect([...created.initial.playerIds].sort()).toEqual(['p1', 'p3']);
    const { unmount } = wrap(<QualifierForm data={created} writes={fakeWrites()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Create a qualifier' })).toBeTruthy();
    expect((screen.getByLabelText('Rounds') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('Squad size') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Coach’s picks') as HTMLInputElement).value).toBe('1');
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(2);
    unmount();
    wrap(<QualifierForm data={previewEditForm()} writes={fakeWrites()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pinehurst qualifier' })).toBeTruthy();
    expect((screen.getByLabelText('Qualifier name') as HTMLInputElement).value).toBe('Pinehurst qualifier');
    expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe('2026-09-22');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('92101 the list, the detail and the form each read every table once and return the whole screen, so nothing is fetched after first paint', async () => {
    const counts: Record<string, number> = {};
    const asked = async (answers: Record<string, unknown>, load: () => Promise<unknown>) => {
      for (const table of Object.keys(counts)) delete counts[table];
      tables.current = Object.fromEntries(
        Object.entries(answers).map(([table, answer]) => [
          table,
          (filters: Array<[string, unknown[]]>) => {
            counts[table] = (counts[table] ?? 0) + 1;
            return (typeof answer === 'function' ? answer(filters) : answer) as never;
          },
        ]),
      ) as never;
      const loaded = (await load()) as { secondary?: Promise<unknown> } | null;
      // The courses and the cards stream behind the standings: the reads are counted once they have all been made.
      await loaded?.secondary;
      return { ...counts };
    };
    const open = { ...Q, selection_state: 'open' };
    expect(await asked({ golf_qualifiers: { data: [open] }, golf_qualifier_entries: { data: entries }, golf_rounds: { data: rounds } }, () => loadQualifierList({ role: 'coach', teamId: 't1', playerId: null, mode: 'all' }))).toEqual({
      golf_qualifiers: 1,
      golf_qualifier_entries: 1,
      golf_rounds: 1,
    });
    expect(
      await asked({ golf_qualifiers: { data: open }, golf_qualifier_entries: { data: entries }, golf_rounds: { data: rounds }, golf_qualifier_round_courses: { data: [] }, golf_holes: holesFor }, () =>
        loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }),
      ),
    ).toEqual({ golf_qualifiers: 1, golf_qualifier_entries: 1, golf_rounds: 1, golf_qualifier_round_courses: 1, golf_holes: 1 });
    const editAnswers = {
      golf_team_members: { data: [{ player: player('p1', 'Ann') }] },
      golf_qualifiers: { data: open },
      golf_qualifier_entries: { data: entries },
      golf_rounds: { data: [] },
      golf_qualifier_selections: { data: [] },
      golf_qualifier_round_courses: { data: [] },
    };
    expect(await asked(editAnswers, () => loadQualifierForm({ teamId: 't1', qualifierId: 'q1' }))).toEqual({
      golf_team_members: 1,
      golf_qualifiers: 1,
      golf_qualifier_entries: 1,
      golf_rounds: 1,
      golf_qualifier_selections: 1,
      golf_qualifier_round_courses: 1,
    });
    expect(await asked(editAnswers, () => loadQualifierForm({ teamId: 't1', qualifierId: null }))).toEqual({ golf_team_members: 1 });
  });

  it('90513 editing: players with a round or a squad place are locked in, and the round count cannot drop below a scored round', async () => {
    tables.current = {
      golf_team_members: { data: [{ player: player('p1', 'Ann') }, { player: player('p3', 'Cal') }] },
      golf_qualifiers: { data: Q },
      golf_qualifier_entries: { data: entries },
      golf_rounds: { data: [{ player_id: 'p2', qualifier_round_number: 2 }] },
      golf_qualifier_selections: { data: [{ player_id: 'p1' }] },
      golf_qualifier_round_courses: { data: [] },
    };
    const form = (await loadQualifierForm({ teamId: 't1', qualifierId: 'q1' }))!;
    expect(form.minRounds).toBe(2);
    expect(form.squadLocked).toBe(true);
    expect(form.players.find((p) => p.id === 'p2')).toMatchObject({ locked: 'round', inactive: true });
    expect(form.players.find((p) => p.id === 'p1')).toMatchObject({ locked: 'squad', inactive: false });
    expect(form.players.find((p) => p.id === 'p3')?.locked).toBe(false);
    expect(form.initial.playerIds.sort()).toEqual(['p1', 'p2']);
  });
});

describe('Qualifiers · a failed read is never an empty (owner rule 1, 2026-10-01)', () => {
  const Q = { id: 'q1', team_id: 't1', name: 'Pinehurst qualifier', description: null, status: 'in_progress', start_date: '2026-09-22', end_date: '2026-10-01', entry_deadline: null, course_name: 'Finley GC', rules: null, num_rounds: 2, selection_slots_total: 3, selection_slots_coach_pick: 1, selection_state: 'selected', is_test: false };
  const player = (id: string, first: string) => ({ id, first_name: first, last_name: 'X', graduation_year: null });
  const entries = [
    { qualifier_id: 'q1', player_id: 'p1', player: player('p1', 'Ann') },
    { qualifier_id: 'q1', player_id: 'p2', player: player('p2', 'Bea') },
  ];
  const rounds = [{ id: 'r1', qualifier_id: 'q1', player_id: 'p1', qualifier_round_number: 1, total_score: 70, score_to_par: -2, round_date: '2026-09-22', course_name: 'Finley GC', holes_played: 18 }];
  const miss = { error: { message: 'boom' } };

  it('CH-09222 /my-qualifiers: a failed entries read is a notice with Try again, never "You aren’t entered in any qualifiers", and never a count of zero', async () => {
    const user = userEvent.setup();
    tables.current = { golf_qualifiers: { data: [Q] }, golf_qualifier_entries: miss, golf_rounds: { data: rounds } };
    const data = await loadQualifierList({ role: 'player', teamId: 't1', playerId: 'p1', mode: 'mine' });
    expect(data).toMatchObject({ entriesError: true, items: [] });
    wrap(<QualifiersList data={data} />);
    await expectCode('CH-09222', /Your qualifiers didn’t load/);
    expect(code('CH-09306')).toBeNull();
    expect(document.querySelector('.ch-qf-eyebrow')!.textContent).toBe('My qualifiers');
    router.refresh.mockClear();
    await user.click(within(code('CH-09222') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-09306 a player really entered in nothing still reads the empty copy, once the entries read answered', async () => {
    tables.current = { golf_qualifiers: { data: [Q] }, golf_qualifier_entries: { data: [] }, golf_rounds: { data: [] } };
    const data = await loadQualifierList({ role: 'player', teamId: 't1', playerId: 'p1', mode: 'mine' });
    expect(data.entriesError).toBe(false);
    wrap(<QualifiersList data={data} />);
    expect(code('CH-09306')).not.toBeNull();
    expect(code('CH-09222')).toBeNull();
  });

  it('CH-09202 the hero says nothing about where you stand when the standings did not load: not "You aren’t entered", not "no rounds in yet"', async () => {
    const standing = async (failed: 'golf_qualifier_entries' | 'golf_rounds') => {
      tables.current = { golf_qualifiers: { data: [Q] }, golf_qualifier_entries: { data: entries }, golf_rounds: { data: rounds }, [failed]: miss };
      const data = await loadQualifierList({ role: 'player', teamId: 't1', playerId: 'p1', mode: 'all' });
      const view = wrap(<QualifiersList data={data} />);
      await expectCode('CH-09202');
      const hero = document.querySelector('.ch-qf-hero')!;
      expect(hero.querySelector('.ch-qf-mine')).toBeNull();
      expect(document.querySelector('.ch-qf-mine')).toBeNull();
      view.unmount();
    };
    await standing('golf_qualifier_entries');
    await standing('golf_rounds');
  });

  it('CH-09221 the coach’s pick notes that do not load are named, never presented as "no notes"; the squad stays', async () => {
    const user = userEvent.setup();
    tables.current = {
      golf_qualifiers: { data: Q },
      golf_qualifier_entries: { data: entries },
      golf_rounds: { data: rounds },
      golf_qualifier_round_courses: { data: [] },
      golf_holes: { data: [] },
      golf_qualifier_selections: (filters) => {
        const cols = String(filters.find(([k]) => k === 'select')?.[1][0] ?? '');
        return cols.includes('coach_reasoning') ? miss : { data: [{ player_id: 'p2', selection_type: 'coach_pick' }] };
      },
    };
    const data = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(data.reasonsError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('qualifiers', 'reasons', expect.anything(), 'qualifiers');
    wrap(await streamedPage(data));
    await expectCode('CH-09221', /Pick notes didn’t load/);
    expect(within(code('CH-09221')!.closest('section') as HTMLElement).getByText('Bea X')).toBeTruthy();
    router.refresh.mockClear();
    await user.click(within(code('CH-09221') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // A player never asks for the notes, so never sees the notice either.
    tables.current = { ...tables.current, golf_qualifier_selections: { data: [{ player_id: 'p2', selection_type: 'coach_pick' }] } };
    const asPlayer = (await loadQualifierDetail({ role: 'player', teamId: 't1', playerId: 'p1', qualifierId: 'q1' }))!;
    expect(asPlayer.reasonsError).toBe(false);
  });

  it('CH-09207 a confirmed squad whose entries did not load is the squad’s notice, never a row of "A player"', async () => {
    tables.current = {
      golf_qualifiers: { data: Q },
      golf_qualifier_entries: miss,
      golf_rounds: { data: rounds },
      golf_qualifier_round_courses: { data: [] },
      golf_holes: { data: [] },
      golf_qualifier_selections: { data: [{ player_id: 'p1', selection_type: 'top_score' }, { player_id: 'p2', selection_type: 'coach_pick' }] },
      'rpc:golf_qualifier_selection_reasons': { data: [] },
    };
    const data = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(data).toMatchObject({ entriesError: true, selections: null, selectionsError: false });
    wrap(await streamedPage(data));
    await expectCode('CH-09207', /names come with the field/);
    expect(screen.queryByText('A player')).toBeNull();
    expect(code('CH-09203')).not.toBeNull();
  });

  it('CH-09208 no "0 of 0 active players entered" while the roster failed; the count is back when it loads', () => {
    const f = previewCreateForm();
    const view = wrap(<QualifierForm data={{ ...f, players: [], playersError: true }} writes={fakeWrites()} />);
    const head = () => [...document.querySelectorAll('.ch-qf-fs__h')].find((h) => h.querySelector('h2')!.textContent === 'Players')!.textContent;
    expect(head()).not.toMatch(/\d+ of \d+/);
    expect(code('CH-09208')).not.toBeNull();
    view.unmount();
    wrap(<QualifierForm data={f} writes={fakeWrites()} />);
    expect(head()).toMatch(/\d+ of \d+ active players entered/);
  });
});

describe('Qualifiers · list', () => {
  it('90101 the list opens on the live qualifier as the hero, then Active and Concluded, with the counts in the head', () => {
    const data = list();
    wrap(<QualifiersList data={data} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Lineup decisions' })).toBeTruthy();
    expect(document.querySelector('.ch-qf-eyebrow')!.textContent).toBe('Qualifiers · 2 active · 3 concluded');
    expect([...document.querySelectorAll('.ch-qf-pill')].map((b) => b.textContent)).toEqual(['All5', 'Active2', 'Concluded3']);
    expect(screen.getByRole('link', { name: 'Create qualifier' }).getAttribute('href')).toBe('/golf/dashboard/qualifiers/new');
    // The live one leads, with its leaders; the other active one is a card under Active.
    const hero = document.querySelector('.ch-qf-hero') as HTMLAnchorElement;
    expect(hero.getAttribute('href')).toBe(`/golf/dashboard/qualifiers/${data.items[0]!.id}`);
    expect(hero.textContent).toMatch(/Pinehurst qualifier.*View leaderboard/);
    expect(within(hero).getByText('Leaders')).toBeTruthy();
    const titles = (heading: string) =>
      [...(screen.getByRole('heading', { level: 2, name: heading }).closest('section') as HTMLElement).querySelectorAll('h3')].map((h) => h.textContent);
    expect(titles('Active')).toEqual(['Conference qualifier']);
    expect(titles('Concluded')).toEqual(['Fall invitational qualifier', 'Preseason qualifier', 'Spring conference qualifier']);
  });

  it('CH-09301 a team with no qualifiers: the coach can create one, a player is told who does', () => {
    const { unmount } = wrap(<QualifiersList data={list('coach', 'all', { items: [] })} />);
    expect(code('CH-09301')!.textContent).toMatch(/No qualifiers yet/);
    expect(within(code('CH-09301') as HTMLElement).getByRole('link', { name: 'Create qualifier' })).toBeTruthy();
    // One primary per screen: the header's Create qualifier steps aside (D-71).
    expect(screen.getAllByRole('link', { name: 'Create qualifier' })).toHaveLength(1);
    unmount();
    wrap(<QualifiersList data={list('player', 'all', { items: [] })} />);
    expect(code('CH-09301')!.textContent).toMatch(/Your coach’s qualifiers show here/);
    expect(screen.queryByRole('link', { name: 'Create qualifier' })).toBeNull();
  });

  it('CH-09306 a player entered in nothing', () => {
    wrap(<QualifiersList data={list('player', 'mine', { items: [] })} />);
    expect(code('CH-09306')!.textContent).toMatch(/You aren’t entered in any qualifiers/);
  });

  it('CH-09302 CH-09303 CH-09701 filters: no match offers Clear, a search with nothing concluded says so, pills tap', async () => {
    const user = userEvent.setup();
    wrap(<QualifiersList data={list()} />);
    await user.type(screen.getByLabelText('Search qualifiers'), 'Pinehurst');
    expect(code('CH-09303')!.textContent).toMatch(/No concluded qualifiers yet/);
    await user.type(screen.getByLabelText('Search qualifiers'), 'zzz');
    await expectCode('CH-09302', /No qualifiers match your filters/);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(code('CH-09302')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Concluded/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(screen.queryByText('Pinehurst qualifier')).toBeNull();
  });

  it('a player sees where they stand on each card', () => {
    wrap(<QualifiersList data={list('player')} />);
    expect(screen.getByText('You’re 3 · +4 · 2 of 3 rounds')).toBeTruthy();
    expect(screen.getAllByText('You’re entered · no rounds in yet').length).toBeGreaterThan(0);
  });

  it('CH-09211 a crash stays inside the list', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = list();
    wrap(<QualifiersList data={{ ...data, items: data.items.map((i) => (i.status === 'in_progress' ? { ...i, leaders: null as never } : i)) }} />);
    expect(code('CH-09211')!.textContent).toMatch(/The qualifiers couldn’t be shown/);
    expect(screen.getByRole('heading', { name: 'Lineup decisions' })).toBeTruthy();
    quiet.mockRestore();
  });
});

describe('Qualifiers · one qualifier', () => {
  it('90102 the detail opens on its six facts and the leaderboard; the coach also has round-by-round, selections, courses, rules and the controls', () => {
    const d = detail();
    wrap(<QualifierDetail data={d} writes={fakeWrites()} live={false} />);
    const fact = (k: string) => [...document.querySelectorAll('.ch-qf-facts > div')].find((f) => f.querySelector('dt')!.textContent === k)!.textContent;
    expect([...document.querySelectorAll('.ch-qf-facts dt')].map((t) => t.textContent)).toEqual(['Dates', 'Entry deadline', 'Entrants', 'Rounds submitted', 'Course', 'Spots']);
    expect(fact('Dates')).toMatch(/2026 · 3 rounds$/);
    expect(fact('Entrants')).toBe('Entrants8players');
    expect(fact('Rounds submitted')).toBe('Rounds submitted13of 24');
    expect(fact('Course')).toBe('CourseFinley GCPar by round');
    expect(fact('Spots')).toBe('Spots54 on score · 1 pick');
    expect(screen.getByRole('heading', { level: 1, name: 'Pinehurst qualifier' })).toBeTruthy();
    for (const h of ['Leaderboard', 'Round-by-round scores', 'Selections', 'Course per round', 'Scoring rules']) expect(screen.getByRole('heading', { level: 2, name: h })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage selections' }).getAttribute('href')).toBe(`/golf/dashboard/qualifiers/${d.id}/selection`);
    expect(screen.getByRole('link', { name: 'Edit qualifier' }).getAttribute('href')).toBe(`/golf/dashboard/qualifiers/${d.id}/edit`);
    expect(screen.getByRole('button', { name: 'Close qualifier' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Qualifiers' }).getAttribute('href')).toBe('/golf/dashboard/qualifiers');
  });

  it('CH-09501 CH-09003 CH-09702 closing asks first; a failed close keeps it open and says so', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites({ setStatus: vi.fn(fail) });
    wrap(<QualifierDetail data={detail()} writes={writes} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Close qualifier' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await expectCode('CH-09501', /including rounds already started/);
    await user.click(within(code('CH-09501') as HTMLElement).getByRole('button', { name: 'Close qualifier' }));
    await expectCode('CH-09003', /Couldn’t close Pinehurst qualifier/);
    expect(writes.setStatus).toHaveBeenCalledWith(detail().id, 'completed');
    expect(code('CH-09901')).toBeNull();
  });

  it('CH-09405 CH-09901 a close in flight reads Closing; once closed the note tells the coach the rule', async () => {
    const user = userEvent.setup();
    let finish: (v: { success: boolean }) => void = () => {};
    const writes = fakeWrites({ setStatus: vi.fn(() => new Promise((r) => (finish = r))) });
    wrap(<QualifierDetail data={detail()} writes={writes} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Close qualifier' }));
    await user.click(within(code('CH-09501') as HTMLElement).getByRole('button', { name: 'Close qualifier' }));
    await expectCode('CH-09405', /Closing/);
    await act(async () => finish({ success: true }));
    await expectCode('CH-09901', /Players can’t enter or submit rounds in it, including rounds already started, until you reopen it/);
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reopen qualifier' })).toBeTruthy();
  });

  it('CH-09004 CH-09406 Reopen shows on every completed qualifier; a failed reopen says so', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites({ setStatus: vi.fn(never) });
    const { unmount } = wrap(<QualifierDetail data={detail('selected')} writes={writes} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Reopen qualifier' }));
    await expectCode('CH-09406', /Reopening/);
    unmount();
    wrap(<QualifierDetail data={detail('completed')} writes={fakeWrites({ setStatus: vi.fn(fail) })} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Reopen qualifier' }));
    await expectCode('CH-09004', /Couldn’t reopen Preseason qualifier/);
  });

  it('CH-09901 a player reads that the qualifier is closed, and gets no coach controls', () => {
    wrap(<QualifierDetail data={detail('completed', 'player')} writes={fakeWrites()} live={false} />);
    expect(code('CH-09901')!.textContent).toMatch(/This qualifier is closed/);
    expect(screen.queryByRole('button', { name: 'Reopen qualifier' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit qualifier' })).toBeNull();
    expect(screen.queryByText('Round-by-round scores')).toBeNull();
  });

  it('90808 a player never gets a coach control: not Create on the list, and not Manage selections, Edit, Close, Reopen, round-by-round or selections on a qualifier', () => {
    const on = wrap(<QualifiersList data={list('player')} />);
    expect(screen.queryByRole('link', { name: 'Create qualifier' })).toBeNull();
    on.unmount();
    for (const name of ['live', 'completed', 'selected', 'upcoming'] as const) {
      const view = wrap(<QualifierDetail data={detail(name, 'player')} writes={fakeWrites()} live={false} />);
      for (const link of ['Manage selections', 'Edit qualifier']) expect([name, screen.queryByRole('link', { name: link })]).toEqual([name, null]);
      for (const button of ['Close qualifier', 'Reopen qualifier']) expect([name, screen.queryByRole('button', { name: button })]).toEqual([name, null]);
      for (const heading of ['Round-by-round scores', 'Selections']) expect([name, screen.queryByRole('heading', { name: heading })]).toEqual([name, null]);
      view.unmount();
    }
  });

  it('92003 the scorecards open from the keyboard: the row’s button takes Enter and Space, and the row itself is not a tab stop', async () => {
    const user = userEvent.setup();
    wrap(<QualifierDetail data={detail()} writes={fakeWrites()} live={false} />);
    const button = screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull();
    await user.keyboard(' ');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.closest('[role="row"]')!.getAttribute('tabindex')).toBeNull();
  });

  it('CH-09304 no round in yet', () => {
    wrap(<QualifierDetail data={detail('upcoming')} writes={fakeWrites()} live={false} />);
    expect(code('CH-09304')!.textContent).toMatch(/Awaiting first round.*7 players entered/);
  });

  it('CH-09802 90806 the leaderboard is a table; a coach opens any scorecards, a player only their own', async () => {
    const user = userEvent.setup();
    const { unmount } = wrap(<QualifierDetail data={detail()} writes={fakeWrites()} live={false} />);
    const table = screen.getByRole('table', { name: 'Leaderboard' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toContain('To par');
    const open = screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' });
    await user.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('table', { name: /Round 1 scorecard/ })).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('select');
    unmount();
    wrap(<QualifierDetail data={detail('live', 'player')} writes={fakeWrites()} live={false} />);
    expect(screen.queryByRole('button', { name: 'Show Sofia Alvarez’s scorecards' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show your scorecards' }));
    expect(screen.getByRole('table', { name: /Round 2 scorecard/ })).toBeTruthy();
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
  });

  it('CH-09205 CH-09308 scorecards that do not load, and a round with no card', async () => {
    const user = userEvent.setup();
    const d = detail();
    const jonah = d.board!.rows.find((r) => r.playerId === PLAYER_ID.jonah)!;
    const { unmount } = wrap(<QualifierDetail data={{ ...d, holesError: true }} writes={fakeWrites()} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    await expectCode('CH-09205', /Scorecards didn’t load/);
    unmount();
    wrap(<QualifierDetail data={{ ...d, holes: { ...d.holes, [jonah.rounds[0]!.id]: [] } }} writes={fakeWrites()} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    await expectCode('CH-09308', /No hole-by-hole card for this round/);
  });

  it('CH-09206 CH-09207 the round courses and the confirmed squad each fail on their own', () => {
    wrap(<QualifierDetail data={detail('selected', 'coach', { coursesError: true, selectionsError: true, selections: null })} writes={fakeWrites()} live={false} />);
    expect(code('CH-09206')!.textContent).toMatch(/The round courses didn’t load/);
    expect(code('CH-09207')!.textContent).toMatch(/The confirmed squad didn’t load/);
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
  });

  it('90807 the confirmed squad: the coach reads the pick reasoning, a player never does', () => {
    const { unmount } = wrap(<QualifierDetail data={detail('selected')} writes={fakeWrites()} live={false} />);
    expect(screen.getByText(/Two top-10s last spring/)).toBeTruthy();
    unmount();
    wrap(<QualifierDetail data={detail('selected', 'player')} writes={fakeWrites()} live={false} />);
    expect(screen.getByRole('heading', { name: 'Squad' })).toBeTruthy();
    expect(screen.queryByText(/Two top-10s last spring/)).toBeNull();
  });

  it('CH-09212 CH-09213 CH-09214 CH-09215 a crash stays inside its section', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = detail();
    const broken = { ...d, roundCourses: d.roundCourses.map((c) => ({ ...c, course: {} as never })), board: { ...d.board!, rows: d.board!.rows.map((r, i) => (i === 0 ? { ...r, name: null as never, rounds: null as never } : r)) } };
    wrap(<QualifierDetail data={broken} writes={fakeWrites()} live={false} />);
    expect(code('CH-09212')!.textContent).toMatch(/The leaderboard couldn’t be shown/);
    expect(code('CH-09213')!.textContent).toMatch(/Round-by-round scores couldn’t be shown/);
    expect(code('CH-09214')!.textContent).toMatch(/Selections couldn’t be shown/);
    expect(code('CH-09215')!.textContent).toMatch(/Course per round couldn’t be shown/);
    expect(screen.getByRole('heading', { name: 'Pinehurst qualifier' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('CH-09803 a live update is announced', () => {
    const d = detail();
    const { rerender } = wrap(<QualifierDetail data={d} writes={fakeWrites()} live={false} />);
    expect(code('CH-09803')!.textContent).toBe('');
    rerender(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <QualifierDetail data={{ ...d, board: { ...d.board!, submitted: 14 } }} writes={fakeWrites()} live={false} />
          </div>
        </ToastProvider>
      </LazyMotion>,
    );
    expect(code('CH-09803')!.textContent).toBe('Standings updated. 14 rounds submitted.');
  });

  it('91204 the scorecards a coach has open stay open when the standings are re-read', async () => {
    const user = userEvent.setup();
    const d = detail();
    const tree = (data: ChQDetail) => (
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <QualifierDetail data={data} writes={fakeWrites()} live={false} />
          </div>
        </ToastProvider>
      </LazyMotion>
    );
    const { rerender } = render(tree(d));
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    expect(screen.getAllByRole('table', { name: /Round \d scorecard/ })).toHaveLength(2);
    rerender(tree({ ...d, board: { ...d.board!, submitted: 14 } }));
    expect(screen.getByRole('button', { name: 'Hide Jonah Okafor’s scorecards' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('table', { name: /Round \d scorecard/ })).toHaveLength(2);
  });
});

describe('Qualifiers · a refresh that fails keeps the standings it had (owner rule 2, 2026-10-01)', () => {
  const tree = (data: ChQDetail) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <QualifierDetail data={data} writes={fakeWrites()} live={false} />
        </div>
      </ToastProvider>
    </LazyMotion>
  );
  /** What the loader hands back when the rounds read fails on a refresh: no board, and no cards either. */
  const failedRead = (d: ChQDetail): ChQDetail => ({ ...d, board: null, roundsError: true, holes: {}, holesError: true });
  const leaderboard = () => screen.queryByRole('table', { name: 'Leaderboard' });

  it('CH-09220 a failed refresh keeps the last good standings and says they may be out of date; a recovered one clears it; a first load that fails is still the error', async () => {
    const user = userEvent.setup();
    const d = detail();
    const { rerender } = render(tree(d));
    expect(leaderboard()).not.toBeNull();
    expect(code('CH-09220')).toBeNull();
    rerender(tree(failedRead(d)));
    expect(leaderboard()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' })).toBeTruthy();
    await expectCode('CH-09220', /These standings may be out of date/);
    expect(code('CH-09204')).toBeNull();
    // Try again re-reads the page, once.
    router.refresh.mockClear();
    await user.click(within(code('CH-09220') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The read lands: the new standings, no notice.
    rerender(tree({ ...d, board: { ...d.board!, submitted: 14 } }));
    expect(code('CH-09220')).toBeNull();
    expect(code('CH-09803')!.textContent).toBe('Standings updated. 14 rounds submitted.');
  });

  it('CH-09220 CH-09204 a different qualifier never inherits the old board, and a failed first load stays an error', () => {
    const live = detail();
    const { rerender, unmount } = render(tree(live));
    rerender(tree(failedRead(detail('completed'))));
    expect(leaderboard()).toBeNull();
    expect(code('CH-09220')).toBeNull();
    expect(code('CH-09204')).not.toBeNull();
    unmount();
    render(tree(failedRead(live)));
    expect(leaderboard()).toBeNull();
    expect(code('CH-09220')).toBeNull();
    expect(code('CH-09204')).not.toBeNull();
  });

  it('CH-09220 the same on the phone: the cards of the last good standings stay, with the notice', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      const d = detail();
      const { rerender } = render(tree(d));
      const rows = document.querySelectorAll('.ch-qfm-lb__row').length;
      expect(rows).toBeGreaterThan(3);
      rerender(tree(failedRead(d)));
      expect(document.querySelectorAll('.ch-qfm-lb__row')).toHaveLength(rows);
      expect(code('CH-09220')).not.toBeNull();
      expect(code('CH-09204')).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });
});

describe('Qualifiers · the courses and the cards stream behind the standings (owner rule 6, 2026-10-01)', () => {
  const deferred = <T,>() => {
    let resolve: (v: T) => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  /** A whole detail, split the way the loader splits it: the standings and facts, and the part that streams. */
  const split = (d: ChQDetail) => {
    const { holes, holesError, roundCourses, par, coursesError, ...core } = d;
    return { core, secondary: { holes, holesError, roundCourses, par, coursesError } satisfies ChQDetailSecondary };
  };
  const page = (core: ChQDetailCore, secondary: PromiseLike<ChQDetailSecondary>) => <QualifierDetail data={core} secondary={secondary} writes={fakeWrites()} live={false} />;
  /** A page whose courses are still on their way suspends while it renders, so it is rendered where React may wait: in an awaited act. */
  const pending = async (node: ReactElement) => {
    let view: ReturnType<typeof wrap> | undefined;
    await act(async () => {
      view = wrap(node);
    });
    return view!;
  };
  const tree = (node: ReactNode) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>
  );
  const fact = (k: string) => [...document.querySelectorAll('.ch-qf-facts > div')].find((f) => f.querySelector('dt')!.textContent === k)!.textContent;
  const streaming = () => document.querySelectorAll('[data-ch-code="CH-09410"]');

  it('CH-09410 the standings, facts and squad are on screen while the courses and cards are still coming, each streamed place held at its final size; no empty copy stands in for them', async () => {
    const user = userEvent.setup();
    const { core, secondary } = split(detail());
    const later = deferred<ChQDetailSecondary>();
    await pending(page(core, later.promise));
    // The page's own: leaderboard rows, the facts that need no tees, the head of every section.
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' })).toBeTruthy();
    expect(fact('Entrants')).toBe('Entrants8players');
    expect(fact('Course')).toBe('CourseFinley GC');
    expect(document.querySelector('.ch-qf-facts__sub .ch-skel')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Course per round' })).toBeTruthy();
    // The courses are rows on the list's own classes, one per round; the tray's cards are heads over a card-sized block.
    const rows = document.querySelectorAll('ol[data-ch-code="CH-09410"] > li');
    expect(rows).toHaveLength(core.numRounds);
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    const heads = [...document.querySelectorAll('.ch-qf-tray .ch-qf-sc__h b')].map((b) => b.textContent);
    expect(heads).toEqual(['Round 1', 'Round 2']);
    expect(screen.queryByRole('table', { name: /Round \d scorecard/ })).toBeNull();
    for (const empty of ['CH-09308', 'CH-09205', 'CH-09206', 'CH-09304']) expect([empty, code(empty)]).toEqual([empty, null]);
    expect(streaming().length).toBeGreaterThan(1);
    // It lands: the cards, the courses and the par take their places, and the placeholders are gone.
    await act(async () => later.resolve(secondary));
    expect(await screen.findAllByRole('table', { name: /Round \d scorecard/ })).toHaveLength(2);
    expect(fact('Course')).toBe('CourseFinley GCPar by round');
    expect(streaming()).toHaveLength(0);
    expect(document.querySelector('.ch-qf-facts__sub .ch-skel')).toBeNull();
  });

  it('CH-09206 CH-09205 a streamed part that did not load is the section’s notice, not an empty list and not "no card"', async () => {
    const user = userEvent.setup();
    const { core, secondary } = split(detail());
    wrap(page(core, fulfilled({ ...secondary, holes: {}, holesError: true, roundCourses: [], par: null, coursesError: true })));
    await expectCode('CH-09206', /The round courses didn’t load/);
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    await expectCode('CH-09205', /Scorecards didn’t load/);
    expect(code('CH-09308')).toBeNull();
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
  });

  it('CH-09206 a stream that is cut off before the courses arrive is the same notice, and the leaderboard is not replaced by a crash', async () => {
    const { core } = split(detail());
    const cut = deferred<ChQDetailSecondary>();
    await pending(page(core, cut.promise));
    await act(async () => cut.reject(new Error('stream aborted')));
    await expectCode('CH-09206', /The round courses didn’t load/);
    expect(code('CH-09212')).toBeNull();
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
  });

  it('CH-09410 a live refresh keeps the standings on screen and updates them while the courses and cards stream again; only their places show a placeholder', async () => {
    const { core, secondary } = split(detail());
    const { rerender } = render(tree(page(core, fulfilled(secondary))));
    expect(screen.getAllByText('Finley GC', { selector: 'b' })).not.toHaveLength(0);
    expect(streaming()).toHaveLength(0);
    const again = deferred<ChQDetailSecondary>();
    await act(async () => rerender(tree(page({ ...core, board: { ...core.board!, submitted: 14 } }, again.promise))));
    // The standings are the new ones at once and never blank; the streamed places wait.
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
    expect(code('CH-09803')!.textContent).toBe('Standings updated. 14 rounds submitted.');
    expect(code('CH-09204')).toBeNull();
    expect(streaming().length).toBeGreaterThan(0);
    await act(async () => again.resolve(secondary));
    await waitFor(() => expect(streaming()).toHaveLength(0));
    expect(fact('Course')).toBe('CourseFinley GCPar by round');
  });

  it('CH-09410 on the phone the sheet of a round has its head and total at once and the nines when they land', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      const { core, secondary } = split(detail());
      const later = deferred<ChQDetailSecondary>();
      await pending(page(core, later.promise));
      await user.click(screen.getByRole('button', { name: /^Sofia Alvarez, 1/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Sofia Alvarez' });
      expect(within(dialog).getByText('Finley GC', { exact: false })).toBeTruthy();
      expect(within(dialog).queryByRole('table')).toBeNull();
      expect(code('CH-09308')).toBeNull();
      await act(async () => later.resolve(secondary));
      expect(await within(dialog).findByRole('table', { name: /Round 2, front nine/ })).toBeTruthy();
    } finally {
      window.matchMedia = real;
    }
  });

  it('92101 the route sends the standings without waiting for the courses and cards: the page renders while their reads are still open, then fills in', async () => {
    const user = userEvent.setup();
    asCoachSession();
    realtime.channel.mockReturnValue({ on() { return this; }, subscribe() { return this; } });
    const release = deferred<void>();
    const reads: string[] = [];
    tables.gate = async (table) => {
      reads.push(table);
      if (table === 'golf_holes' || table === 'golf_course_tees') await release.promise;
    };
    const Q1 = '10000000-0000-4000-8000-000000000001';
    tables.current = {
      golf_qualifiers: { data: { id: Q1, team_id: 't1', name: 'Pinehurst qualifier', description: null, status: 'in_progress', start_date: '2026-09-22', end_date: null, entry_deadline: null, course_name: 'Finley GC', rules: null, num_rounds: 1, selection_slots_total: 3, selection_slots_coach_pick: 1, selection_state: 'closed', is_test: false } },
      golf_qualifier_entries: { data: [{ qualifier_id: Q1, player_id: 'p1', player: { id: 'p1', first_name: 'Ann', last_name: 'X', graduation_year: null } }] },
      golf_rounds: { data: [{ id: 'r1', qualifier_id: Q1, player_id: 'p1', qualifier_round_number: 1, total_score: 70, score_to_par: -2, round_date: '2026-09-22', course_name: 'Finley GC', holes_played: 18 }] },
      golf_qualifier_round_courses: { data: [{ round_number: 1, course_name: 'Finley GC', tee_id: 'tee1' }] },
      golf_course_tees: { data: [{ id: 'tee1', tee_name: 'Blue', total_par: 72 }] },
      golf_holes: { data: [{ round_id: 'r1', hole_number: 1, par: 4, score: 4 }] },
    };
    const el = (await ClubhouseQualifiersRoute({ view: 'detail', id: Q1 })) as ReactElement<{ data: Record<string, unknown>; secondary: Promise<unknown> }>;
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The route came back with the cards' read still open.
    expect(reads).toEqual(expect.arrayContaining(['golf_course_tees', 'golf_holes']));
    expect(el.props.data).not.toHaveProperty('holes');
    expect(el.props.secondary).toBeInstanceOf(Promise);
    await pending(el);
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show Ann X’s scorecards' }));
    expect(screen.queryByRole('table', { name: /Round 1 scorecard/ })).toBeNull();
    release.resolve();
    expect(await screen.findByRole('table', { name: /Round 1 scorecard/ })).toBeTruthy();
    expect(fact('Course')).toBe('CourseFinley GCPar 72');
  });
});

describe('Qualifiers · the list keeps its filter, search and scroll for the way back (owner rule 8, 2026-10-01)', () => {
  const LIST_URL = '/golf/dashboard/qualifiers';
  const here = () => window.location.pathname + window.location.search;
  const at = (url: string) => window.history.replaceState(null, '', url);
  const pill = (name: RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
  /** The canvas the Clubhouse frame scrolls, which jsdom does not scroll: it says where it is and records where it is sent. */
  const canvas = (top: number) => {
    const el = document.createElement('div');
    el.id = 'ch-canvas';
    Object.defineProperty(el, 'scrollTop', { value: top, configurable: true });
    el.scrollTo = vi.fn() as never;
    document.body.appendChild(el);
    return el;
  };
  afterEach(() => document.getElementById('ch-canvas')?.remove());

  it('CH-09904 the list opens on the filter and the search its address carries, and rewrites the address as they change: replaced, never pushed', async () => {
    const user = userEvent.setup();
    at(`${LIST_URL}?filter=active&q=pine&state=empty`);
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    wrap(<QualifiersList data={list()} />);
    expect(pill(/^Active/)).toBe('true');
    expect((screen.getByLabelText('Search qualifiers') as HTMLInputElement).value).toBe('pine');
    // Nothing changed yet, so the address was not touched.
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^Concluded/ }));
    expect(here()).toBe(`${LIST_URL}?filter=concluded&q=pine&state=empty`);
    await user.clear(screen.getByLabelText('Search qualifiers'));
    expect(here()).toBe(`${LIST_URL}?filter=concluded&state=empty`);
    await user.click(screen.getByRole('button', { name: /^All/ }));
    // The defaults leave the address as it came, and what else it carried (the preview’s state) is never dropped.
    expect(here()).toBe(`${LIST_URL}?state=empty`);
    expect(push).not.toHaveBeenCalled();
    replace.mockRestore();
    push.mockRestore();
  });

  it('CH-09904 the filter and the search survive the list’s own remount: they come from the address, not from a state that is gone', async () => {
    const user = userEvent.setup();
    at(LIST_URL);
    const first = wrap(<QualifiersList data={list()} />);
    await user.click(screen.getByRole('button', { name: /^Concluded/ }));
    await user.type(screen.getByLabelText('Search qualifiers'), 'spring');
    first.unmount();
    const second = wrap(<QualifiersList data={list()} />);
    expect(pill(/^Concluded/)).toBe('true');
    expect((screen.getByLabelText('Search qualifiers') as HTMLInputElement).value).toBe('spring');
    second.unmount();
    // A filter nobody wrote (an edited address) is the default, not an error.
    at(`${LIST_URL}?filter=nonsense`);
    wrap(<QualifiersList data={list()} />);
    expect(pill(/^All/)).toBe('true');
  });

  it('CH-09904 Back from a qualifier returns to the list as it was left: the desktop link, the phone’s top bar and the not-found page all carry its filter and search', async () => {
    const user = userEvent.setup();
    at(LIST_URL);
    const list1 = wrap(<QualifiersList data={list()} />);
    await user.click(screen.getByRole('button', { name: /^Active/ }));
    await user.type(screen.getByLabelText('Search qualifiers'), 'pine');
    list1.unmount();
    at('/golf/dashboard/qualifiers/some-qualifier');
    const detail1 = wrap(<QualifierDetail data={detail()} writes={fakeWrites()} live={false} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Qualifiers' }).getAttribute('href')).toBe(`${LIST_URL}?filter=active&q=pine`));
    detail1.unmount();
    // The not-found page of a qualifier that is not on the team goes the same way.
    asCoachSession();
    tables.current = { golf_qualifiers: { data: null } };
    wrap(await ClubhouseQualifiersRoute({ view: 'detail', id: '10000000-0000-4000-8000-000000000009' }));
    await waitFor(() => expect(within(code('CH-09310') as HTMLElement).getByRole('link', { name: 'Back to qualifiers' }).getAttribute('href')).toBe(`${LIST_URL}?filter=active&q=pine`));
  });

  it('CH-09904 a player’s own list is remembered as its own: Back returns to /my-qualifiers, not to the team’s list', async () => {
    const user = userEvent.setup();
    at('/golf/dashboard/my-qualifiers');
    const mine = wrap(<QualifiersList data={list('player', 'mine')} />);
    await user.click(screen.getByRole('button', { name: /^Active/ }));
    mine.unmount();
    wrap(<QualifierDetail data={detail('live', 'player')} writes={fakeWrites()} live={false} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Qualifiers' }).getAttribute('href')).toBe('/golf/dashboard/my-qualifiers?filter=active'));
  });

  it('CH-09904 with no list visited the Back is the plain list, and a remembered address that is not a list is never followed', async () => {
    const plain = wrap(<QualifierDetail data={detail()} writes={fakeWrites()} live={false} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Qualifiers' }).getAttribute('href')).toBe(LIST_URL));
    plain.unmount();
    window.sessionStorage.setItem('ch.qf.list', 'https://example.com/steal');
    wrap(<QualifierDetail data={detail()} writes={fakeWrites()} live={false} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Qualifiers' }).getAttribute('href')).toBe(LIST_URL));
  });

  it('CH-09904 the phone’s Back goes to the list as it was left', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      window.sessionStorage.setItem('ch.qf.list', `${LIST_URL}?filter=concluded`);
      render(
        <LazyMotion features={domAnimation}>
          <ToastProvider>
            <PhoneChromeProvider>
              <div className="ch-root" data-ui="clubhouse">
                <SlotHostForBack />
                <QualifierDetail data={detail()} writes={fakeWrites()} live={false} />
              </div>
            </PhoneChromeProvider>
          </ToastProvider>
        </LazyMotion>,
      );
      await user.click(within(screen.getByTestId('phone-top-back')).getByRole('button', { name: 'Back to Qualifiers' }));
      expect(router.push).toHaveBeenCalledWith(`${LIST_URL}?filter=concluded`);
      expect(window.sessionStorage.getItem('ch.qf.return')).toBe('1');
    } finally {
      window.matchMedia = real;
    }
  });

  function SlotHostForBack() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top-back" />;
  }

  it('CH-09905 leaving the list for a qualifier keeps where it was scrolled, and coming back restores it once, after the frame’s own scroll to the top', async () => {
    const user = userEvent.setup();
    at(`${LIST_URL}?filter=active`);
    const el = canvas(480);
    const first = wrap(<QualifiersList data={list()} />);
    const link = document.querySelector('a.ch-qf-hero, a.ch-qf-card') as HTMLAnchorElement;
    link.addEventListener('click', (e) => e.preventDefault());
    await user.click(link);
    expect(JSON.parse(window.sessionStorage.getItem('ch.qf.scroll')!)).toEqual({ address: `${LIST_URL}?filter=active`, top: 480 });
    first.unmount();
    // Coming back through a Back control: the mark is set, and the list scrolls itself once a frame has gone by.
    window.sessionStorage.setItem('ch.qf.return', '1');
    wrap(<QualifiersList data={list()} />);
    expect(el.scrollTo).not.toHaveBeenCalled();
    await waitFor(() => expect(el.scrollTo).toHaveBeenCalledWith({ top: 480 }));
    expect(el.scrollTo).toHaveBeenCalledTimes(1);
    // Honoured once: the next visit opens at the top.
    expect(window.sessionStorage.getItem('ch.qf.return')).toBeNull();
  });

  it('CH-09905 a list that is not being returned to opens at the top, and so does one returned to at another filter', async () => {
    // The frames come at once, so a restore that was going to happen has happened by the time the list is on screen.
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
      run(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    try {
      const el = canvas(0);
      window.sessionStorage.setItem('ch.qf.scroll', JSON.stringify({ address: `${LIST_URL}?filter=active`, top: 480 }));
      at(`${LIST_URL}?filter=active`);
      // A fresh visit (the sidebar, a link): no mark, no restore.
      const fresh = wrap(<QualifiersList data={list()} />);
      expect(el.scrollTo).not.toHaveBeenCalled();
      fresh.unmount();
      // A return to a different address than the one that was left.
      window.sessionStorage.setItem('ch.qf.return', '1');
      at(`${LIST_URL}?filter=concluded`);
      const other = wrap(<QualifiersList data={list()} />);
      expect(el.scrollTo).not.toHaveBeenCalled();
      other.unmount();
      // And the same list, returned to, does restore: the stubbed frames make this the control of the two above.
      window.sessionStorage.setItem('ch.qf.return', '1');
      at(`${LIST_URL}?filter=active`);
      wrap(<QualifiersList data={list()} />);
      expect(el.scrollTo).toHaveBeenCalledWith({ top: 480 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('CH-09905 the browser’s own Back from a qualifier is a return too, and Back from the screen is marked before it leaves', async () => {
    const user = userEvent.setup();
    wrap(<QualifierDetail data={detail()} writes={fakeWrites()} live={false} />);
    expect(window.sessionStorage.getItem('ch.qf.return')).toBeNull();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(window.sessionStorage.getItem('ch.qf.return')).toBe('1');
    window.sessionStorage.removeItem('ch.qf.return');
    const back = screen.getByRole('link', { name: 'Qualifiers' });
    back.addEventListener('click', (e) => e.preventDefault());
    await user.click(back);
    expect(window.sessionStorage.getItem('ch.qf.return')).toBe('1');
  });

  it('CH-09904 a session that cannot keep anything leaves the list working: the address still carries the filter, Back is the plain list', async () => {
    const user = userEvent.setup();
    const broken = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      at(LIST_URL);
      wrap(<QualifiersList data={list()} />);
      await user.click(screen.getByRole('button', { name: /^Active/ }));
      expect(here()).toBe(`${LIST_URL}?filter=active`);
    } finally {
      broken.mockRestore();
    }
  });
});

describe('Qualifiers · create and edit', () => {
  const form = (over: Partial<ChQFormData> = {}) => ({ ...previewCreateForm(), ...over });

  it('CH-09101 CH-09110 92001 submitting an empty name: the field says why, focus lands on it, nothing is sent', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    wrap(<QualifierForm data={form()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await expectCode('CH-09101', /Give the qualifier a name/);
    expect(code('CH-09110')!.textContent).toMatch(/Couldn’t create the qualifier.*Fix the 2 highlighted fields/);
    expect(document.activeElement?.id).toBe('qf-name');
    expect(writes.create).not.toHaveBeenCalled();
  });

  it('CH-09106 CH-09107 92001 one round needs its acknowledgement; no players, no qualifier', async () => {
    const user = userEvent.setup();
    wrap(<QualifierForm data={form({ initial: { ...form().initial, name: 'Q', startDate: '2026-10-19', rounds: '1', playerIds: [] } })} writes={fakeWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await expectCode('CH-09106', /meant to have one round/);
    expect(code('CH-09107')!.textContent).toMatch(/Choose at least one player/);
    expect(document.activeElement?.id).toBe('qf-one');
  });

  it('CH-09001 91202 a failed create keeps every field and says so; a good one opens the new qualifier', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites({ create: vi.fn(async () => ({ success: false, error: 'Team not found for your organization' })) });
    wrap(<QualifierForm data={form({ initial: { ...form().initial, name: 'Conference qualifier', startDate: '2026-10-19' } })} writes={writes} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await expectCode('CH-09001', /Couldn’t create the qualifier.*Team not found/);
    expect((screen.getByLabelText('Qualifier name') as HTMLInputElement).value).toBe('Conference qualifier');
    expect(writes.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Conference qualifier', numRounds: 3, selectionSlotsTotal: 5, selectionSlotsCoachPick: 1, playerIds: expect.any(Array) }));
    writes.create.mockImplementation(async () => ({ success: true, data: { qualifierId: 'q-new' } }));
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/golf/dashboard/qualifiers/q-new'));
    // Back from the new qualifier does not return to a form whose Create would make a second one.
    expect(router.push).not.toHaveBeenCalledWith('/golf/dashboard/qualifiers/q-new');
  });

  it('CH-09404 a create in flight reads Creating and cannot be sent twice', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites({ create: vi.fn(never) });
    wrap(<QualifierForm data={form({ initial: { ...form().initial, name: 'Q', startDate: '2026-10-19' } })} writes={writes} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await expectCode('CH-09404', /Creating/);
    expect((code('CH-09404')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(writes.create).toHaveBeenCalledTimes(1);
  });

  it('CH-09002 CH-09902 91202 a partial edit save: the toast says it failed, the form keeps what saved and what to do', async () => {
    const api = {
      details: vi.fn(async () => ({ success: true as const, data: undefined })),
      rounds: vi.fn(async () => ({ success: true as const, data: undefined })),
      squad: vi.fn(async () => ({ success: true as const, data: undefined })),
      entrants: vi.fn(async () => ({ success: false as const, error: 'One player has a round or a squad place in this qualifier and can’t be taken out, so nothing changed.' })),
    };
    const plan = { details: { name: 'Q' }, numRounds: 3, roundCourses: null, squad: { total: 5, coachPicks: 1 }, playerIds: ['p1'] };
    const res = await runEditPlan('q1', plan, api as never);
    expect(res).toEqual({ success: false, error: expect.stringMatching(/^Saved the details and the rounds and courses and the squad size, but not the players\. One player has a round.* Save again to finish\.$/) });
    const user = userEvent.setup();
    const writes = fakeWrites({ saveEdit: vi.fn(async () => res) });
    wrap(<QualifierForm data={previewEditForm()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-09002', /Couldn’t save the qualifier.*Check the form and save again/);
    await expectCode('CH-09902', /Saved the details .* but not the players\. One player has a round.* Save again to finish\./);
    writes.saveEdit.mockImplementation(async () => ({ success: true }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(code('CH-09902')).toBeNull());
  });

  it('90513 editing: a player with a round stays entered; a changed squad and entrants are sent, an unchanged one is not', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    wrap(<QualifierForm data={previewEditForm()} writes={writes} />);
    const jonah = screen.getByRole('checkbox', { name: /Jonah Okafor/ }) as HTMLInputElement;
    expect([jonah.checked, jonah.disabled]).toEqual([true, true]);
    expect(jonah.closest('label')!.textContent).toContain('Has a round in it');
    await user.click(screen.getByRole('checkbox', { name: /Mia Thornton/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes.saveEdit).toHaveBeenCalled());
    const plan = writes.saveEdit.mock.calls[0]![1];
    expect(plan.squad).toBeNull();
    expect(plan.playerIds).not.toContain(PLAYER_ID.mia);
    expect(plan.roundCourses).toHaveLength(3);
  });

  it('CH-09208 CH-09305 CH-09217 when players or courses do not load, and when there is nobody to enter', () => {
    const { unmount } = wrap(<QualifierForm data={form({ playersError: true })} writes={fakeWrites()} />);
    expect(code('CH-09208')!.textContent).toMatch(/The roster didn’t load/);
    expect((screen.getByRole('button', { name: 'Create qualifier' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    const u2 = wrap(<QualifierForm data={form({ players: [], initial: { ...form().initial, playerIds: [] } })} writes={fakeWrites()} />);
    expect(code('CH-09305')!.textContent).toMatch(/No active players on the roster/);
    u2.unmount();
    wrap(<QualifierForm data={{ ...previewEditForm(), coursesError: true, roundCourses: [] }} writes={fakeWrites()} />);
    expect(code('CH-09217')!.textContent).toMatch(/Saving keeps the courses already set/);
  });

  it('CH-09502 leaving with unsaved changes asks first', async () => {
    const user = userEvent.setup();
    wrap(<QualifierForm data={form()} writes={fakeWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/qualifiers');
    router.push.mockClear();
    await user.type(screen.getByLabelText('Qualifier name'), 'Q');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expectCode('CH-09502', /Discard your changes/);
    expect(router.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/qualifiers');
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  it('CH-09216 a crash stays inside the form', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = form();
    wrap(<QualifierForm data={{ ...f, players: f.players.map((p, i) => (i === 0 ? { ...p, name: null as never } : p)) }} writes={fakeWrites()} />);
    expect(code('CH-09216')!.textContent).toMatch(/The qualifier form couldn’t be shown/);
    expect(screen.getByRole('heading', { name: 'Create a qualifier' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('90514 once the squad is confirmed its size and picks are read-only in the form, and a save sends no squad change; before, they can be changed', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    const locked = wrap(<QualifierForm data={{ ...previewEditForm(), squadLocked: true }} writes={writes} />);
    const squad = () => screen.getByLabelText('Squad size') as HTMLInputElement;
    const picks = () => screen.getByLabelText('Coach’s picks') as HTMLInputElement;
    expect([squad().readOnly, picks().readOnly]).toEqual([true, true]);
    expect(screen.getByText('The squad is confirmed, so its size is fixed.')).toBeTruthy();
    await user.type(squad(), '9');
    expect(squad().value).toBe('5');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes.saveEdit).toHaveBeenCalled());
    expect(writes.saveEdit.mock.calls[0]![1].squad).toBeNull();
    locked.unmount();
    wrap(<QualifierForm data={previewEditForm()} writes={fakeWrites()} />);
    expect([squad().readOnly, picks().readOnly]).toEqual([false, false]);
    expect(screen.queryByText('The squad is confirmed, so its size is fixed.')).toBeNull();
    await user.clear(squad());
    await user.type(squad(), '6');
    expect(squad().value).toBe('6');
  });

  it('91804 each problem in the form is an alert tied to its field, the field is marked invalid, and a field with no problem is not', async () => {
    const user = userEvent.setup();
    wrap(<QualifierForm data={{ ...previewCreateForm(), initial: { ...previewCreateForm().initial, rounds: '0' } }} writes={fakeWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    expect(code('CH-09110')!.getAttribute('role')).toBe('alert');
    for (const [label, text] of [
      ['Qualifier name', 'Give the qualifier a name.'],
      ['Start date', 'Add a start date.'],
      ['Rounds', 'Rounds must be a whole number from 1 to 50.'],
    ] as const) {
      const field = screen.getByLabelText(label);
      const help = document.getElementById(field.getAttribute('aria-describedby')!)!;
      expect([label, field.getAttribute('aria-invalid'), help.getAttribute('role'), help.textContent]).toEqual([label, 'true', 'alert', text]);
    }
    expect(screen.getByLabelText('Squad size').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByLabelText('Squad size').closest('.ch-field')!.querySelector('[role="alert"]')).toBeNull();
  });

  it('92002 Enter in a field submits the form, and a form with a problem shows it instead of sending', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    wrap(<QualifierForm data={{ ...previewCreateForm(), initial: { ...previewCreateForm().initial, name: 'Conference qualifier' } }} writes={writes} />);
    await user.type(screen.getByLabelText('Qualifier name'), '{Enter}');
    await expectCode('CH-09102', /Add a start date/);
    expect(writes.create).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Start date'), '2026-10-19');
    await user.type(screen.getByLabelText('Qualifier name'), '{Enter}');
    await waitFor(() => expect(writes.create).toHaveBeenCalledTimes(1));
    expect(writes.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Conference qualifier', startDate: '2026-10-19' }));
  });

  it('92102 the course picker looks courses up when it opens and once after typing stops, not on every key', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    wrap(<QualifierForm data={form()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: /Choose course for round 1/ }));
    await waitFor(() => expect(writes.courses).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText('Search courses'), 'Pine');
    await waitFor(() => expect(writes.courses).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(writes.courses.mock.calls).toEqual([[''], ['Pine']]);
  });

  it('CH-09407 CH-09312 CH-09314 the course picker: loading, no match, no tees, and a pick sets the round', async () => {
    const user = userEvent.setup();
    let release: (v: typeof PREVIEW_COURSES) => void = () => {};
    const writes = fakeWrites({ courses: vi.fn(() => new Promise((r) => (release = r))) });
    wrap(<QualifierForm data={form()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: /Choose course for round 1/ }));
    await expectCode('CH-09407');
    await act(async () => release(PREVIEW_COURSES));
    writes.courses.mockImplementation(async () => []);
    await user.type(screen.getByLabelText('Search courses'), 'Zz');
    await expectCode('CH-09312', /No courses match “Zz”/);
    writes.courses.mockImplementation(async () => PREVIEW_COURSES);
    await user.clear(screen.getByLabelText('Search courses'));
    await user.click(await screen.findByRole('button', { name: /Pine Needles/ }));
    writes.tees.mockImplementation(async () => []);
    await user.click(screen.getByRole('button', { name: 'All courses' }));
    await user.click(await screen.findByRole('button', { name: /Pine Needles/ }));
    await expectCode('CH-09314', /no tee sets yet/);
    writes.tees.mockImplementation(async () => PREVIEW_TEES);
    await user.click(screen.getByRole('button', { name: 'All courses' }));
    await user.click(await screen.findByRole('button', { name: /Hope Valley CC/ }));
    await user.click(await screen.findByRole('button', { name: /Blue/ }));
    await waitFor(() => expect(screen.getByText('Hope Valley CC')).toBeTruthy());
    expect(screen.getByText('Blue · Par 72')).toBeTruthy();
  });

  it('CH-09209 CH-09210 the picker says when courses or tees do not load', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites({ courses: vi.fn(async () => Promise.reject(new Error('x'))) });
    wrap(<QualifierForm data={form()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: /Choose course for round 1/ }));
    await expectCode('CH-09209', /Courses didn’t load/);
    writes.courses.mockImplementation(async () => PREVIEW_COURSES);
    writes.tees.mockImplementation(async () => Promise.reject(new Error('x')));
    await user.click(within(code('CH-09209') as HTMLElement).getByRole('button', { name: /Try again/ }));
    await user.click(await screen.findByRole('button', { name: /Finley GC/ }));
    await expectCode('CH-09210', /Tees didn’t load/);
  });
});

describe('Qualifiers · races and pending scope (owner rules 2 and 4, 2026-10-01)', () => {
  const deferred = <T,>() => {
    let resolve: (v: T) => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  type Tees = Array<{ id: string; name: string; par: number | null; yards: number | null; holes: number }>;
  const cand = (playerId: string, rank: number, onScore: boolean, tiedAtCut = false) => ({ playerId, name: playerId, rank, toPar: rank, total: 70 + rank, rounds: 2, onScore, pick: null, selected: false, tiedAtCut });

  it('92102 two courses chosen one after the other: the tees of the last choice win, whichever answer comes back last', async () => {
    const user = userEvent.setup();
    const a = deferred<Tees>();
    const b = deferred<Tees>();
    const writes = fakeWrites({ tees: vi.fn((id: string) => (id === 'c-finley' ? a.promise : b.promise)) });
    wrap(<QualifierForm data={previewCreateForm()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: /Choose course for round 1/ }));
    await user.click(await screen.findByRole('button', { name: /Finley GC/ }));
    await user.click(screen.getByRole('button', { name: 'All courses' }));
    await user.click(await screen.findByRole('button', { name: /Hope Valley CC/ }));
    expect(writes.tees.mock.calls.map((c) => c[0])).toEqual(['c-finley', 'c-hope']);
    await act(async () => b.resolve([{ id: 't-bravo', name: 'Bravo', par: 71, yards: 6500, holes: 18 }]));
    expect(await screen.findByRole('button', { name: /Bravo/ })).toBeTruthy();
    // The slower answer for the first course arrives after: it is not drawn under the second course.
    await act(async () => a.resolve([{ id: 't-alpha', name: 'Alpha', par: 72, yards: 6800, holes: 18 }]));
    expect(screen.queryByRole('button', { name: /Alpha/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Bravo/ })).toBeTruthy();
  });

  it('92102 CH-09210 a failed answer for a course that is no longer chosen says nothing under the one that is', async () => {
    const user = userEvent.setup();
    const a = deferred<Tees>();
    const writes = fakeWrites({ tees: vi.fn((id: string) => (id === 'c-finley' ? a.promise : Promise.resolve(PREVIEW_TEES))) });
    wrap(<QualifierForm data={previewCreateForm()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: /Choose course for round 1/ }));
    await user.click(await screen.findByRole('button', { name: /Finley GC/ }));
    await user.click(screen.getByRole('button', { name: 'All courses' }));
    await user.click(await screen.findByRole('button', { name: /Hope Valley CC/ }));
    expect(await screen.findByRole('button', { name: /Blue/ })).toBeTruthy();
    // The first course's read fails after the second one's tees are on screen: nothing is said under the course that is chosen.
    await act(async () => a.reject(new Error('late failure')));
    expect(code('CH-09210')).toBeNull();
    expect(screen.getByRole('button', { name: /Blue/ })).toBeTruthy();
  });

  const selectionTree = (data: ChQSelectionData, writes: SelWrites) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <QualifierSelection data={data} writes={writes} />
        </div>
      </ToastProvider>
    </LazyMotion>
  );
  const badge = (name: string) => within(within(code('CH-09318') as HTMLElement).getByText(name, { selector: 'b' }).closest('li') as HTMLElement).getByText(/Tie at cut|Given the place/).textContent;

  it('91301 a refresh that was started before a write landed cannot undo it on screen; once the server shows it the page follows the server again', async () => {
    const user = userEvent.setup();
    const base = previewSelection('picking');
    const at = (...candidates: ReturnType<typeof cand>[]): ChQSelectionData => ({ ...base, selectionState: 'closed', squad: 2, picks: 0, tie: { places: 1, chosen: 0 }, candidates });
    const writes = selWrites();
    const { rerender } = render(selectionTree(at(cand('Ann', 1, true), cand('Ben', 2, false, true), cand('Cal', 2, false, true)), writes));
    await user.click(screen.getByRole('button', { name: 'Give the place Cal' }));
    await screen.findByText('Cal takes the place at the cut');
    expect(badge('Cal')).toBe('Given the place');
    // The late read: it was started before the write and has not seen it.
    rerender(selectionTree(at(cand('Ann', 1, true), cand('Ben', 2, false, true), cand('Cal', 2, false, true)), writes));
    expect(badge('Cal')).toBe('Given the place');
    expect(badge('Ben')).toBe('Tie at cut');
    // The read that has seen it: the same on screen, and the edit is let go.
    rerender(selectionTree(at(cand('Ann', 1, true), cand('Ben', 2, false, true), cand('Cal', 2, true, true)), writes));
    expect(badge('Cal')).toBe('Given the place');
    // Later the server changes (someone took it back): the page follows it, not the old edit.
    rerender(selectionTree(at(cand('Ann', 1, true), cand('Ben', 2, false, true), cand('Cal', 2, false, true)), writes));
    expect(badge('Cal')).toBe('Tie at cut');
  });

  it('91301 a pick that landed stays on screen over a stale read, until the server shows it', async () => {
    const user = userEvent.setup();
    const stale = previewSelection('picking');
    const writes = selWrites();
    const { rerender } = render(selectionTree(stale, writes));
    await user.click(screen.getByRole('button', { name: 'Choose a player' }));
    await user.click(screen.getByRole('radio', { name: /Eli Brandt/ }));
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Best short game on the team');
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    expect(await screen.findByText('1 of 1 chosen')).toBeTruthy();
    rerender(selectionTree({ ...stale, candidates: stale.candidates.map((c) => ({ ...c })) }, writes));
    expect(screen.getByText('1 of 1 chosen')).toBeTruthy();
    const picked = previewSelection('picked');
    const saved = { ...picked, candidates: picked.candidates.map((c) => (c.pick ? { ...c, pick: { reasoning: 'Best short game on the team' } } : c)) };
    rerender(selectionTree(saved, writes));
    expect(screen.getByText('1 of 1 chosen')).toBeTruthy();
    // The server's own word from here on: a pick someone else removed is gone.
    rerender(selectionTree({ ...saved, candidates: saved.candidates.map((c) => ({ ...c, pick: null })) }, writes));
    expect(screen.getByText('0 of 1 chosen')).toBeTruthy();
  });

  it('91301 an edit the server never shows is let go at the second read, so the page ends on the server’s word', async () => {
    const user = userEvent.setup();
    const stale = previewSelection('picking');
    const writes = selWrites();
    const { rerender } = render(selectionTree(stale, writes));
    await user.click(screen.getByRole('button', { name: 'Choose a player' }));
    await user.click(screen.getByRole('radio', { name: /Eli Brandt/ }));
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Best short game on the team');
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    expect(await screen.findByText('1 of 1 chosen')).toBeTruthy();
    // The first read since is the late one; the second is the write's own, and it is the server's word.
    rerender(selectionTree({ ...stale, candidates: stale.candidates.map((c) => ({ ...c })) }, writes));
    expect(screen.getByText('1 of 1 chosen')).toBeTruthy();
    rerender(selectionTree({ ...stale, candidates: stale.candidates.map((c) => ({ ...c })) }, writes));
    expect(screen.getByText('0 of 1 chosen')).toBeTruthy();
  });

  it('CH-09408 CH-09010 giving a place waits on its own row only: the other level players stay available, and the places left count the one in flight', async () => {
    const user = userEvent.setup();
    const base = previewSelection('picking');
    const data: ChQSelectionData = { ...base, selectionState: 'closed', squad: 3, picks: 0, tie: { places: 2, chosen: 0 }, candidates: [cand('Ann', 1, true), cand('Ben', 2, false, true), cand('Cal', 2, false, true), cand('Dee', 2, false, true)] };
    const cal = deferred<{ success: boolean }>();
    const ben = deferred<{ success: boolean }>();
    const writes = selWrites({ chooseTie: vi.fn((_id: string, playerId: string) => (playerId === 'Cal' ? cal.promise : ben.promise)) });
    render(selectionTree(data, writes));
    await user.click(screen.getByRole('button', { name: 'Give the place Cal' }));
    // Cal's row says it is saving; nobody else's does.
    const calRow = screen.getByText('Cal', { selector: 'b' }).closest('li') as HTMLElement;
    expect(within(calRow).getByText('Saving').getAttribute('data-ch-code')).toBe('CH-09408');
    expect(document.querySelectorAll('li [data-ch-code="CH-09408"]')).toHaveLength(1);
    expect((within(calRow).getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Give the place Ben' }) as HTMLButtonElement).disabled).toBe(false);
    // A second give goes through while the first is in flight; with both counted the places are spoken for.
    await user.click(screen.getByRole('button', { name: 'Give the place Ben' }));
    expect(writes.chooseTie.mock.calls.map((c) => c[1])).toEqual(['Cal', 'Ben']);
    expect((screen.getByRole('button', { name: 'Give the place Dee' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      cal.resolve({ success: true });
      ben.resolve({ success: true });
    });
    await screen.findByText('Ben takes the place at the cut');
    expect(document.querySelectorAll('li [data-ch-code="CH-09408"]')).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Take it back Cal' }) as HTMLButtonElement).disabled).toBe(false);
  });

  describe('on the phone', () => {
    const real = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = real;
    });

    it('CH-09406 CH-09004 Reopen keeps its sheet up while the server answers, says Reopening on the control that stays, and closes the sheet only when it landed', async () => {
      const user = userEvent.setup();
      const answer = deferred<{ success: boolean; error?: string }>();
      const writes = fakeWrites({ setStatus: vi.fn(() => answer.promise) });
      const d = detail('completed');
      wrap(<QualifierDetail data={d} writes={writes} live={false} />);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      const sheet = () => screen.getByRole('dialog', { name: d.name });
      await user.click(within(await screen.findByRole('dialog', { name: d.name })).getByRole('button', { name: 'Reopen qualifier' }));
      // In flight: the sheet is still there and its button says what it is doing.
      const busy = within(sheet()).getByText('Reopening');
      expect(busy.getAttribute('data-ch-code')).toBe('CH-09406');
      expect((busy.closest('button') as HTMLButtonElement).disabled).toBe(true);
      // Refused: the sheet stays, the button is back, the toast says so.
      await act(async () => answer.resolve({ success: false, error: 'nope' }));
      await expectCode('CH-09004', /Couldn’t reopen/);
      expect((within(sheet()).getByRole('button', { name: 'Reopen qualifier' }) as HTMLButtonElement).disabled).toBe(false);
      // Landed: the sheet closes.
      writes.setStatus.mockImplementation(async () => ({ success: true }));
      await user.click(within(sheet()).getByRole('button', { name: 'Reopen qualifier' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: d.name })).toBeNull());
      expect(document.querySelector('.ch-qf-status')!.textContent).toBe('Live');
    });
  });
});

describe('Qualifiers · loading', () => {
  it('CH-09401 CH-09402 CH-09403 each address has a skeleton in the page’s shape', () => {
    render(
      <>
        <QualifiersSkeleton />
        <QualifierDetailSkeleton />
        <QualifierFormSkeleton />
      </>,
    );
    expect(code('CH-09401')!.getAttribute('aria-busy')).toBe('true');
    expect(code('CH-09402')!.getAttribute('aria-label')).toBe('Loading the qualifier');
    expect(code('CH-09403')!.getAttribute('aria-label')).toBe('Loading the qualifier form');
  });
});

describe('Qualifiers · Manage selections loads in its own shape (2026-10-01)', () => {
  it('CH-09409 its skeleton is the page’s shape, on the page’s own classes: head, three steps, the note, the lists and the picks, not the qualifier’s facts and leaderboard', () => {
    render(<QualifierSelectionSkeleton />);
    const sk = code('CH-09409') as HTMLElement;
    expect(sk.getAttribute('aria-busy')).toBe('true');
    expect(sk.getAttribute('aria-label')).toBe('Loading Manage selections');
    expect(sk.classList.contains('ch-qfs')).toBe(true);
    expect(sk.querySelectorAll('.ch-qfs-steps > li')).toHaveLength(3);
    expect(sk.querySelector('.ch-qf-note')).not.toBeNull();
    expect(sk.querySelectorAll('.ch-qf-body .ch-qf-panel')).toHaveLength(2);
    expect(sk.querySelector('.ch-qf-facts')).toBeNull();
    // The route's loading file draws it, not the qualifier's skeleton.
    const loading = readFileSync(join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/qualifiers/[id]/selection/loading.tsx'), 'utf8');
    expect(loading).toContain('QualifierSelectionSkeleton');
    expect(loading).not.toContain('QualifierDetailSkeleton');
  });
});

describe('Qualifiers · Manage selections', () => {
  const open = (name: string | RegExp) => screen.getByRole('button', { name });

  it('90104 Manage selections opens on its three steps with the current one marked, the places on score, the rest of the field and the picks', () => {
    const { unmount } = wrap(<QualifierSelection data={previewSelection('standings')} writes={selWrites()} />);
    const steps = () => within(screen.getByRole('list', { name: 'Selection steps' })).getAllByRole('listitem');
    expect(steps().map((s) => s.textContent)).toEqual(['1Standings', '2Coach’s picks', '3Squad confirmed']);
    expect(steps().map((s) => s.getAttribute('aria-current'))).toEqual(['step', null, null]);
    expect(screen.getByRole('heading', { level: 1, name: 'Pinehurst qualifier' })).toBeTruthy();
    expect(document.querySelector('.ch-qf-head p')!.textContent).toBe('5-player squad · 4 on score · 1 coach’s pick');
    expect(screen.getByRole('heading', { level: 2, name: 'On score now' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Rest of the field' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Coach’s picks' })).toBeTruthy();
    expect(screen.getByText('0 of 1 chosen')).toBeTruthy();
    expect(screen.getByText('Opens when you start selecting')).toBeTruthy();
    expect(within(document.querySelector('.ch-qf-head__act') as HTMLElement).getByRole('button', { name: 'Start selecting' })).toBeTruthy();
    expect(document.querySelector('.ch-qfs-foot')).toBeNull();
    unmount();
    wrap(<QualifierSelection data={previewSelection('picking')} writes={selWrites()} />);
    expect(steps().map((s) => s.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(screen.getByText('Choose a player and say why')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm squad' })).toBeTruthy();
  });

  it('CH-09318 Q-114 a tie at the cut waits for the coach: confirm stays off until the place is given, and can be taken back', async () => {
    const base = previewSelection('picking');
    const c = (playerId: string, rank: number, onScore: boolean, tiedAtCut = false) => ({
      playerId,
      name: playerId,
      rank,
      toPar: rank,
      total: 70 + rank,
      rounds: 2,
      onScore,
      pick: null,
      selected: false,
      tiedAtCut,
    });
    const writes = selWrites();
    wrap(
      <QualifierSelection
        data={{ ...base, selectionState: 'closed', squad: 2, picks: 0, tie: { places: 1, chosen: 0 }, candidates: [c('Ann', 1, true), c('Ben', 2, false, true), c('Cal', 2, false, true)] }}
        writes={writes}
      />,
    );
    const confirmBtn = () => screen.getByRole('button', { name: 'Confirm squad' }) as HTMLButtonElement;
    expect(code('CH-09318')).toBeTruthy();
    expect(confirmBtn().disabled).toBe(true);
    expect(screen.getByText(/Give 1 more place to confirm the squad/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Give the place Cal' }));
    expect(writes.chooseTie).toHaveBeenCalledWith(base.id, 'Cal', true);
    await screen.findByText('Cal takes the place at the cut');
    expect(confirmBtn().disabled).toBe(false);
    // The one place is given, so Ben's button waits; Cal's can be taken back.
    expect((screen.getByRole('button', { name: 'Give the place Ben' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Take it back Cal' }));
    expect(writes.chooseTie).toHaveBeenLastCalledWith(base.id, 'Cal', false);
  });

  it('CH-09010 giving a place at a tied cut that fails says so, and confirm stays off', async () => {
    const base = previewSelection('picking');
    const c = (playerId: string, rank: number, onScore: boolean, tiedAtCut = false) => ({
      playerId,
      name: playerId,
      rank,
      toPar: rank,
      total: 70 + rank,
      rounds: 2,
      onScore,
      pick: null,
      selected: false,
      tiedAtCut,
    });
    const writes = selWrites();
    vi.mocked(writes.chooseTie).mockResolvedValue({ success: false, error: 'boom' });
    wrap(
      <QualifierSelection
        data={{ ...base, selectionState: 'closed', squad: 2, picks: 0, tie: { places: 1, chosen: 0 }, candidates: [c('Ann', 1, true), c('Ben', 2, false, true), c('Cal', 2, false, true)] }}
        writes={writes}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Give the place Cal' }));
    await screen.findByText('Couldn’t give Cal the place');
    expect((screen.getByRole('button', { name: 'Confirm squad' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('§11.3 a field smaller than the squad confirms once every player who can be picked is picked', () => {
    const base = previewSelection('picking');
    const c = (playerId: string, rank: number, onScore: boolean, pick: string | null) => ({
      playerId,
      name: playerId,
      rank,
      toPar: rank,
      total: 70 + rank,
      rounds: 1,
      onScore,
      pick: pick ? { reasoning: pick } : null,
      selected: false,
    });
    // Squad 3 with 2 picks, two entrants: one on score, the other already picked. No one is left to pick.
    wrap(<QualifierSelection data={{ ...base, selectionState: 'closed', squad: 3, picks: 2, candidates: [c('Ann', 1, true, null), c('Ben', 2, false, 'Grit')] }} writes={selWrites()} />);
    expect((screen.getByRole('button', { name: 'Confirm squad' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('CH-09503 CH-09703 CH-09005 starting asks first with the warning tap, steps to closed one step at a time, and a refusal says so', async () => {
    const user = userEvent.setup();
    const w = selWrites({ advance: vi.fn(async () => ({ success: false, error: 'The squad moved on since this page loaded. Reload to see where it stands.' })) });
    wrap(<QualifierSelection data={previewSelection('standings')} writes={w} />);
    await user.click(open('Start selecting'));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await expectCode('CH-09503', /can’t be undone/);
    await user.click(inDialog('CH-09503', 'Start selecting'));
    await expectCode('CH-09005', /Couldn’t start selecting.*moved on/);
    // The sample is at "scoring": one step to closed, which was refused.
    expect(w.advance.mock.calls.map((c) => c[1])).toEqual(['closed']);
  });

  it('startSelecting walks open → scoring → closed and stops at the first refusal', async () => {
    const advance = vi.fn().mockResolvedValue({ ok: true });
    await startSelecting('q', 'open', advance);
    expect(advance.mock.calls.map((c) => c[1])).toEqual(['scoring', 'closed']);
    const refused = vi.fn().mockResolvedValueOnce({ success: false, error: 'x' });
    expect((await startSelecting('q', 'open', refused)).success).toBe(false);
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('CH-09112 CH-09111 CH-09701 a pick needs a player and a reason before anything is sent', async () => {
    const user = userEvent.setup();
    const w = selWrites();
    wrap(<QualifierSelection data={previewSelection('picking')} writes={w} />);
    await user.click(open('Choose a player'));
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    await expectCode('CH-09112', /Choose a player/);
    expect(w.setPick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: /Eli Brandt/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    await expectCode('CH-09111', /Say why you picked Eli Brandt/);
    expect(w.setPick).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Best short game on the team');
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    await waitFor(() => expect(w.setPick).toHaveBeenCalledWith(previewSelection().id, expect.any(String), 'Best short game on the team'));
    await screen.findByText('Eli Brandt picked');
    expect(screen.getByText('Best short game on the team')).toBeTruthy();
  });

  it('CH-09006 91203 a refused pick keeps the dialog, the player and the reason', async () => {
    const user = userEvent.setup();
    wrap(<QualifierSelection data={previewSelection('picking')} writes={selWrites({ setPick: vi.fn(async () => ({ success: false, error: 'Every pick is taken. Remove one first.' })) })} />);
    await user.click(open('Choose a player'));
    await user.click(screen.getByRole('radio', { name: /Eli Brandt/ }));
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Form');
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-09006"]')?.textContent).toMatch(/Couldn’t pick Eli Brandt.*Every pick is taken/));
    expect((screen.getByRole('radio', { name: /Eli Brandt/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('textbox', { name: /^Reason/ }) as HTMLTextAreaElement).value).toBe('Form');
  });

  it('CH-09504 CH-09007 removing a pick asks first; a failed remove keeps them', async () => {
    const user = userEvent.setup();
    wrap(<QualifierSelection data={previewSelection('picked')} writes={selWrites({ removePick: vi.fn(fail) })} />);
    await user.click(open('Remove Eli Brandt'));
    await expectCode('CH-09504', /Remove Eli Brandt as a pick/);
    await user.click(inDialog('CH-09504', 'Remove'));
    await expectCode('CH-09007', /Couldn’t remove Eli Brandt as a pick/);
    expect(screen.getAllByText(/Best short game|Two top-ten/).length).toBeGreaterThan(0);
  });

  it('CH-09505 CH-09008 CH-09408 confirming names who makes the trip, shows it is in flight, and a failure confirms nothing', async () => {
    const user = userEvent.setup();
    let settle: (v: { success: boolean; error?: string }) => void = () => {};
    const w = selWrites({ confirm: vi.fn(() => new Promise((r) => (settle = r))) });
    wrap(<QualifierSelection data={previewSelection('picked')} writes={w} />);
    await user.click(open('Confirm squad'));
    await expectCode('CH-09505', /5 players make the trip: Sofia Alvarez, Theo Marchetti, .*Eli Brandt/);
    await user.click(inDialog('CH-09505', 'Confirm squad'));
    await expectCode('CH-09408', /Confirming/);
    await act(async () => settle({ success: false }));
    await expectCode('CH-09008', /nobody was told/);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('confirming that lands opens the qualifier', async () => {
    const user = userEvent.setup();
    wrap(<QualifierSelection data={previewSelection('picked')} writes={selWrites()} />);
    await user.click(open('Confirm squad'));
    await user.click(inDialog('CH-09505', 'Confirm squad'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/golf/dashboard/qualifiers/${previewSelection().id}`));
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('Confirm squad stays off until every pick is made with a reason', () => {
    wrap(<QualifierSelection data={previewSelection('picking')} writes={selWrites()} />);
    expect((open('Confirm squad') as HTMLButtonElement).disabled).toBe(true);
  });

  it('CH-09903 a confirmed squad is read-only', () => {
    wrap(<QualifierSelection data={previewSelection('selected')} writes={selWrites()} />);
    expect(code('CH-09903')!.textContent).toMatch(/squad is confirmed/);
    expect(screen.queryByRole('button', { name: /Confirm squad|Start selecting|Choose a player|Remove/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Qualified on score' })).toBeTruthy();
  });

  it('CH-09315 CH-09316 nobody to pick, and nobody on score yet', async () => {
    const user = userEvent.setup();
    const base = previewSelection('picking');
    const none = { ...base, candidates: base.candidates.map((c) => ({ ...c, rank: null, toPar: null, onScore: false })) };
    wrap(<QualifierSelection data={none} writes={selWrites()} />);
    await expectCode('CH-09316', /Nobody has a score in yet/);
    await user.click(open('Choose a player'));
    await expectCode('CH-09315', /Nobody else can be picked yet/);
  });

  it('CH-09219 a crash in the lists stays inside the section; the head and steps stay', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = previewSelection('picking');
    // A row that throws when drawn: only the lists read a candidate's rounds.
    const broken = Object.defineProperty({ ...base.candidates[0]! }, 'rounds', { get: () => { throw new Error('boom'); } });
    wrap(<QualifierSelection data={{ ...base, candidates: [broken, ...base.candidates.slice(1)] }} writes={selWrites()} />);
    await expectCode('CH-09219');
    expect(screen.getByRole('heading', { level: 1, name: base.name })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Selection steps' })).toBeTruthy();
    spy.mockRestore();
  });

  it('90809 selectionReason turns the server’s refusals into words a coach can act on', () => {
    expect(selectionReason('illegal transition open → selected')).toMatch(/moved on/);
    expect(selectionReason('all 1 coach-pick slots filled')).toMatch(/Every pick is taken/);
    expect(selectionReason('Not a coach of this team')).toMatch(/Only this team’s coaches/);
    expect(selectionReason('cannot confirm: no entrant has a qualifying score and no coach pick was made')).toMatch(/no squad to confirm/);
    expect(selectionReason('Internal error')).toBeNull();
    expect(selectionReason('Unauthorized')).toMatch(/Only this team’s coaches/);
    expect(selectionReason('coach picks locked in state open')).toBe('Picks open once you start selecting.');
    expect(selectionReason('reasoning required for coach-pick')).toBe('Say why you picked this player.');
    expect(selectionReason('That player is not on this team')).toBe('That player isn’t on this team.');
    expect(selectionReason("Couldn't confirm your roster just now. Please try again.")).toBe('The roster couldn’t be checked just now. Try again.');
    expect(selectionReason('could not verify remaining coach-pick slots; please try again')).toBe('The roster couldn’t be checked just now. Try again.');
    expect(selectionReason('cannot confirm: state must be closed, all coach picks chosen with reasoning')).toBe('Choose every pick, each with a reason, before confirming.');
    expect(selectionReason('Qualifier not found')).toMatch(/couldn’t be found/);
    expect(selectionReason('workspace not loadable')).toMatch(/couldn’t be found/);
    expect(selectionReason(undefined)).toBeNull();
  });

  it('91804 the pick dialog’s problems are alerts tied to their fields: the player list, then the reason', async () => {
    const user = userEvent.setup();
    wrap(<QualifierSelection data={previewSelection('picking')} writes={selWrites()} />);
    await user.click(open('Choose a player'));
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    await expectCode('CH-09112', /Choose a player/);
    const who = code('CH-09112')!;
    const group = screen.getByRole('group', { name: 'Player' });
    expect([who.getAttribute('role'), who.textContent, who.id, group.getAttribute('aria-invalid'), group.getAttribute('aria-describedby')]).toEqual(['alert', 'Choose a player.', 'qfs-who-h', 'true', 'qfs-who-h']);
    await user.click(screen.getByRole('radio', { name: /Eli Brandt/ }));
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
    const why = screen.getByRole('textbox', { name: /^Reason/ });
    const help = document.getElementById(why.getAttribute('aria-describedby')!)!;
    expect([why.getAttribute('aria-invalid'), help.getAttribute('role'), help.textContent]).toEqual(['true', 'alert', 'Say why you picked Eli Brandt.']);
  });

  it('90809 92303 a refusal from the server reaches the coach in words they can act on, and the server’s own words go only to the breadcrumb trail', async () => {
    const asks = [
      ['advance', vi.mocked(advanceSelectionState), () => LIVE_SELECTION_WRITES.advance('q', 'closed'), 'illegal transition open → selected', 'The squad moved on since this page loaded. Reload to see where it stands.'],
      ['setPick', vi.mocked(setQualifierCoachPick), () => LIVE_SELECTION_WRITES.setPick('q', 'p', 'why'), 'all 1 coach-pick slots filled', 'Every pick is taken. Remove one first.'],
      ['removePick', vi.mocked(removeQualifierCoachPick), () => LIVE_SELECTION_WRITES.removePick('q', 'p'), 'Not a coach of this team', 'Only this team’s coaches manage its squad.'],
      ['confirm', vi.mocked(confirmQualifierSelection), () => LIVE_SELECTION_WRITES.confirm('q'), 'cannot confirm: state must be closed, all coach picks chosen with reasoning', 'Choose every pick, each with a reason, before confirming.'],
    ] as const;
    for (const [name, action, call, raw, words] of asks) {
      vi.mocked(chTrail).mockClear();
      action.mockResolvedValueOnce({ ok: false, error: raw });
      expect([name, await call()]).toEqual([name, { success: false, error: words }]);
      expect([name, vi.mocked(chTrail).mock.calls]).toEqual([name, [['qualifiers selection refused', { reason: raw }]]]);
    }
    // An error nobody planned for has no words, so the screen’s own hint shows; the trail still has it, cut at 200 characters.
    vi.mocked(chTrail).mockClear();
    const long = `Internal error ${'x'.repeat(300)}`;
    vi.mocked(setQualifierCoachPick).mockResolvedValueOnce({ ok: false, error: long });
    expect(await LIVE_SELECTION_WRITES.setPick('q', 'p', 'why')).toEqual({ success: false, error: undefined });
    expect(chTrail).toHaveBeenCalledWith('qualifiers selection refused', { reason: long.slice(0, 200) });
    // A write that lands passes through and leaves no trail.
    vi.mocked(chTrail).mockClear();
    vi.mocked(confirmQualifierSelection).mockResolvedValueOnce({ ok: true });
    expect(await LIVE_SELECTION_WRITES.confirm('q')).toEqual({ success: true, data: { notified: true } });
    vi.mocked(confirmQualifierSelection).mockResolvedValueOnce({ ok: true, notified: false });
    expect(await LIVE_SELECTION_WRITES.confirm('q')).toEqual({ success: true, data: { notified: false } });
    expect(chTrail).not.toHaveBeenCalled();
    // On the screen, with the live writes: the coach reads the words in the failure toast.
    const user = userEvent.setup();
    vi.mocked(confirmQualifierSelection).mockResolvedValueOnce({ ok: false, error: 'cannot confirm: state must be closed, all coach picks chosen with reasoning' });
    wrap(<QualifierSelection data={previewSelection('picked')} />);
    await user.click(open('Confirm squad'));
    await user.click(inDialog('CH-09505', 'Confirm squad'));
    await expectCode('CH-09008', /Couldn’t confirm the squad.*Choose every pick, each with a reason, before confirming\./);
  });

  it('CH-09218 90805 a failed read is logged and told apart from a qualifier on another team', async () => {
    tables.current = { golf_qualifiers: { error: { message: 'boom' } } };
    expect((await loadQualifierSelection({ teamId: 't1', qualifierId: 'q1' })).kind).toBe('error');
    expect(logServer).toHaveBeenCalledWith('qualifiers', 'selection', expect.anything(), 'qualifiers');
    tables.current = { golf_qualifiers: { data: { id: 'q1', team_id: 'other' } } };
    expect((await loadQualifierSelection({ teamId: 't1', qualifierId: 'q1' })).kind).toBe('missing');
  });
});

describe('Qualifiers · phone (docs/clubhouse/phone/qualifiers.md)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('91901 board 02: facts, the leaderboard as cards, and Manage selections for the coach', () => {
    wrap(<QualifierDetail data={detail('live')} writes={fakeWrites()} live={false} />);
    const facts = document.querySelector('.ch-qfm-facts')!;
    expect([...facts.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Rounds in', 'Spots', 'Deadline']);
    expect(facts.textContent).toMatch(/4\+1/);
    expect(screen.getByRole('link', { name: 'Manage selections' }).getAttribute('href')).toBe(`/golf/dashboard/qualifiers/${detail('live').id}/selection`);
    expect(document.querySelectorAll('.ch-qfm-lb__row').length).toBeGreaterThan(3);
    // Round-by-round stays on desktop (Q-20).
    expect(screen.queryByRole('heading', { name: 'Round-by-round scores' })).toBeNull();
  });

  it('board 03 CH-09701: a row opens that player’s rounds, the latest played round chosen, with Message and Stats', async () => {
    const user = userEvent.setup();
    wrap(<QualifierDetail data={detail('live')} writes={fakeWrites()} live={false} />);
    await user.click(screen.getByRole('button', { name: /^Sofia Alvarez, 1/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    const dialog = await screen.findByRole('dialog', { name: 'Sofia Alvarez' });
    const chips = within(dialog).getAllByRole('button', { name: /^R\d/ });
    expect(chips.map((c) => c.textContent)).toEqual(['R1 · −1', 'R2 · −2', 'R3']);
    expect(chips[1]!.getAttribute('aria-pressed')).toBe('true');
    expect((chips[2] as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByRole('table', { name: /Round 2, front nine/ })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Stats' }).getAttribute('href')).toBe(`/golf/dashboard/stats?player=${PLAYER_ID.sofia}`);
    expect(within(dialog).getByRole('link', { name: 'Message' }).getAttribute('href')).toBe(`/golf/dashboard/messages?player=${PLAYER_ID.sofia}`);
    await user.click(chips[0]!);
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('90806 D-33 on the phone a player opens only their own rounds, and has no Message link to themselves', async () => {
    const user = userEvent.setup();
    wrap(<QualifierDetail data={detail('live', 'player')} writes={fakeWrites()} live={false} />);
    const buttons = [...document.querySelectorAll('button.ch-qfm-lb__row')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toMatch(/Jonah Okafor/);
    await user.click(buttons[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'Jonah Okafor' });
    expect(within(dialog).queryByRole('link', { name: 'Message' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Stats' }).getAttribute('href')).toBe('/golf/dashboard/stats');
    expect(screen.queryByRole('link', { name: 'Manage selections' })).toBeNull();
  });

  it('Q-20 CH-09501: Close sits behind Edit as a sheet action, and still asks first', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(<QualifierDetail data={detail('live')} writes={w} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(await screen.findByRole('button', { name: 'Close qualifier' }));
    await expectCode('CH-09501', /Close this qualifier/);
    expect(w.setStatus).not.toHaveBeenCalled();
  });

  /** The shell's phone top bar, where a page's PhoneTop renders, and a probe for whether the tab bar has stepped aside. */
  function SlotHost() {
    const { setSlot, noTabs } = usePhoneChromeState();
    return (
      <>
        <div ref={setSlot} data-testid="phone-top" />
        <span data-testid="tabs-hidden">{String(noTabs)}</span>
      </>
    );
  }
  const inPhone = (node: ReactNode) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              {node}
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );

  it('91902 the form’s Cancel and Create sit in the phone top bar and the tab bar steps aside; Create checks the form as the page button does, and Cancel asks first once something changed', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    inPhone(<QualifierForm data={previewCreateForm()} writes={writes} />);
    const top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('heading', { level: 1, name: 'New qualifier' })).toBeTruthy();
    expect(screen.getByTestId('tabs-hidden').textContent).toBe('true');
    await user.click(within(top).getByRole('button', { name: 'Create' }));
    await expectCode('CH-09101', /Give the qualifier a name/);
    expect(writes.create).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Qualifier name'), 'Conference qualifier');
    await user.type(screen.getByLabelText('Start date'), '2026-10-19');
    await user.click(within(top).getByRole('button', { name: 'Cancel' }));
    await expectCode('CH-09502', /Discard your changes/);
    await user.click(inDialog('CH-09502', 'Keep editing'));
    await user.click(within(top).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(writes.create).toHaveBeenCalledTimes(1));
    expect(router.push).not.toHaveBeenCalledWith('/golf/dashboard/qualifiers');
  });

  it('91903 Manage selections has its own top bar with a way back to the qualifier, and the one primary action at the foot', async () => {
    const user = userEvent.setup();
    const data = previewSelection('standings');
    inPhone(<QualifierSelection data={data} writes={selWrites()} />);
    const top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('heading', { level: 1, name: 'Selections' })).toBeTruthy();
    await user.click(within(top).getByRole('button', { name: 'Back to Qualifier' }));
    expect(router.push).toHaveBeenCalledWith(`/golf/dashboard/qualifiers/${data.id}`);
    expect(within(document.querySelector('.ch-qfs-foot') as HTMLElement).getByRole('button', { name: 'Start selecting' })).toBeTruthy();
  });

  it('91904 the list is topped by "‹ More" and its title, and a player’s own list reads My qualifiers', async () => {
    const user = userEvent.setup();
    const first = inPhone(<QualifiersList data={list()} />);
    let top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('heading', { level: 1, name: 'Qualifiers' })).toBeTruthy();
    await user.click(within(top).getByRole('button', { name: 'Back to More' }));
    expect(router.back.mock.calls.length + router.push.mock.calls.length).toBe(1);
    first.unmount();
    inPhone(<QualifiersList data={list('player', 'mine')} />);
    top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('heading', { level: 1, name: 'My qualifiers' })).toBeTruthy();
  });

  it('90808 on the phone a player has no Qualifier actions, no Edit and no Manage selections, and the coach has all three', () => {
    const player = inPhone(<QualifierDetail data={detail('live', 'player')} writes={fakeWrites()} live={false} />);
    expect(screen.queryByRole('button', { name: 'Qualifier actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Manage selections' })).toBeNull();
    player.unmount();
    inPhone(<QualifierDetail data={detail('live')} writes={fakeWrites()} live={false} />);
    expect(screen.getByRole('button', { name: 'Qualifier actions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage selections' })).toBeTruthy();
  });

  it('CH-09901 the coach’s closed note on the phone carries the whole rule, as on desktop; a player’s says the qualifier is closed', () => {
    const coach = wrap(<QualifierDetail data={detail('completed')} writes={fakeWrites()} live={false} />);
    expect(code('CH-09901')!.textContent).toBe('Closed to new rounds.Players can’t enter or submit rounds in it, including rounds already started, until you reopen it.');
    coach.unmount();
    wrap(<QualifierDetail data={detail('completed', 'player')} writes={fakeWrites()} live={false} />);
    expect(code('CH-09901')!.textContent).toMatch(/^This qualifier is closed\./);
  });

  it('board 05: a confirmed squad sits above the leaderboard', () => {
    wrap(<QualifierDetail data={detail('selected')} writes={fakeWrites()} live={false} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('Squad')).toBeGreaterThan(-1);
    expect(headings.indexOf('Squad')).toBeLessThan(headings.indexOf('Leaderboard'));
  });
});

describe('Qualifiers · the route (who reaches which address)', () => {
  const QID = '10000000-0000-4000-8000-000000000001';
  const OTHER = '10000000-0000-4000-8000-000000000002';
  const Q = { id: QID, team_id: 't1', name: 'Pinehurst qualifier', description: null, status: 'in_progress', start_date: '2026-09-22', end_date: '2026-10-01', entry_deadline: null, course_name: 'Finley GC', rules: null, num_rounds: 2, selection_slots_total: 3, selection_slots_coach_pick: 1, selection_state: 'closed', is_test: false };
  const player = (id: string, first: string) => ({ id, first_name: first, last_name: 'X', graduation_year: null });
  const entries = [
    { qualifier_id: QID, player_id: 'p1', player: player('p1', 'Ann') },
    { qualifier_id: QID, player_id: 'p2', player: player('p2', 'Bea') },
    { qualifier_id: OTHER, player_id: 'p1', player: player('p1', 'Ann') },
  ];
  const rounds = [{ id: 'r1', qualifier_id: QID, player_id: 'p1', qualifier_round_number: 1, total_score: 70, score_to_par: -2, round_date: '2026-09-22', course_name: 'Finley GC', holes_played: 18 }];
  const workspace = {
    ...Q,
    target_tournament_id: null,
    entries: [
      { player_id: 'p1', total_score: 70, total_to_par: -2, rounds_completed: 1, player: { id: 'p1', first_name: 'Ann', last_name: 'X' } },
      { player_id: 'p2', total_score: null, total_to_par: null, rounds_completed: 0, player: { id: 'p2', first_name: 'Bea', last_name: 'X' } },
    ],
  };
  const asCoach = asCoachSession;
  const asPlayer = () => {
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: 'p2' } } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: 'p2' });
  };
  /** Every table a route can read, answered from what the test seeds; `reads` records the table names asked for. */
  const seed = (over: Partial<Record<string, unknown>> = {}) => {
    const reads: string[] = [];
    const answers: Record<string, unknown> = {
      // The list orders its read; a single qualifier does not.
      golf_qualifiers: (filters: Array<[string, unknown[]]>) => ({ data: filters.some(([k]) => k === 'order') ? [Q] : Q }),
      golf_qualifier_entries: { data: entries.slice(0, 2) },
      golf_rounds: { data: rounds },
      golf_qualifier_round_courses: { data: [] },
      golf_qualifier_selections: { data: [] },
      golf_team_members: { data: [{ player: player('p1', 'Ann') }] },
      golf_holes: { data: [] },
      ...over,
    };
    tables.current = new Proxy({}, { get: (_t, key: string) => (reads.push(key), answers[key]) }) as never;
    return reads;
  };
  const route = async (view: Parameters<typeof ClubhouseQualifiersRoute>[0]['view'], id?: string) => (await ClubhouseQualifiersRoute({ view, id })) as ReactElement<{ data: never }>;

  it('90105 every address renders in place as its own screen, never as a redirect (D-23)', async () => {
    asCoach();
    seed();
    const screens = [
      ['list', QualifiersList],
      ['mine', QualifiersList],
      ['new', QualifierForm],
      ['edit', QualifierForm],
      ['detail', QualifierDetail],
    ] as const;
    for (const [view, component] of screens) {
      const el = await route(view, QID);
      expect([view, el.type]).toEqual([view, component]);
    }
    expect(((await route('detail', QID)).props.data as ChQDetail).id).toBe(QID);
    expect((await route('new')).props.data).toMatchObject({ mode: 'create' });
    expect((await route('edit', QID)).props.data).toMatchObject({ mode: 'edit', id: QID });
    seed({ golf_qualifiers: { data: workspace } });
    const sel = await route('selection', QID);
    expect(sel.type).toBe(QualifierSelection);
    expect((sel.props.data as unknown as ChQSelectionData).candidates.map((c) => c.name)).toEqual(['Ann X', 'Bea X']);
  });

  it('90106 /my-qualifiers lists only the qualifiers a player is entered in, and a coach on it sees the whole list', async () => {
    const twoQualifiers = { golf_qualifiers: { data: [Q, { ...Q, id: OTHER, name: 'Other', start_date: '2026-10-05' }] }, golf_qualifier_entries: { data: [entries[1], entries[2]] } };
    // Bea (p2) is entered in the first only; Ann (p1) in the second.
    asPlayer();
    seed(twoQualifiers);
    const mine = (await route('mine')).props.data as unknown as ChQList;
    expect([mine.mode, mine.items.map((i) => i.id)]).toEqual(['mine', [QID]]);
    const all = (await route('list')).props.data as unknown as ChQList;
    expect([all.mode, all.items.map((i) => i.id)]).toEqual(['all', [QID, OTHER]]);
    asCoach();
    seed(twoQualifiers);
    const coach = (await route('mine')).props.data as unknown as ChQList;
    expect([coach.mode, coach.items.map((i) => i.id).sort()]).toEqual(['all', [QID, OTHER].sort()]);
    // Inside the Clubhouse frame a coach is not offered this address: it is a rebuilt route for players only, so the shell shows its not-rebuilt page (10401).
    expect([isRebuilt('/golf/dashboard/my-qualifiers', 'player'), isRebuilt('/golf/dashboard/my-qualifiers', 'coach')]).toEqual([true, false]);
  });

  it('90803 CH-09311 a player on /new, /edit or /selection gets the coach-only page with a way back, and nothing is read for them', async () => {
    asPlayer();
    const reads = seed();
    const cases = [
      ['new', undefined, 'Only coaches create qualifiers', 'See your qualifiers', '/golf/dashboard/qualifiers'],
      ['edit', QID, 'Only coaches edit qualifiers', 'Back to the qualifier', `/golf/dashboard/qualifiers/${QID}`],
      ['selection', QID, 'Only coaches pick the squad', 'Back to the qualifier', `/golf/dashboard/qualifiers/${QID}`],
      ['selection', 'not-a-link', 'Only coaches pick the squad', 'See your qualifiers', '/golf/dashboard/qualifiers'],
    ] as const;
    for (const [view, id, title, label, href] of cases) {
      const { unmount } = wrap((await route(view, id)) as never);
      expect(code('CH-09311')!.textContent).toContain(title);
      expect(within(code('CH-09311') as HTMLElement).getByRole('link', { name: label }).getAttribute('href')).toBe(href);
      unmount();
    }
    wrap((await route('selection', QID)) as never);
    expect(code('CH-09311')!.textContent).toContain('once your coach confirms it');
    expect(reads).toEqual([]);
  });

  it('90804 CH-09309 a signed-out visitor gets nothing, and someone with no team gets the no-team page on every address; neither reads a qualifier', async () => {
    const reads = seed();
    vi.mocked(getGolfSessionProfile).mockResolvedValue(null);
    expect(await ClubhouseQualifiersRoute({ view: 'list' })).toBeNull();
    expect(resolveClubhouseTeam).not.toHaveBeenCalled();
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    for (const view of ['list', 'mine', 'new', 'edit', 'selection', 'detail'] as const) {
      const { unmount } = wrap((await route(view, QID)) as never);
      expect([view, code('CH-09309')!.textContent]).toEqual([view, 'You aren’t on a team yet' + 'Qualifiers fill in once your team is set up.']);
      unmount();
    }
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: 'p2' } } as never);
    wrap((await route('detail', QID)) as never);
    expect(code('CH-09309')!.textContent).toContain('once a coach adds you to a team roster');
    expect(reads).toEqual([]);
  });

  it('CH-09310 90805 a qualifier on another team, or a malformed link, is "not on your team" on every address, for a coach and a player', async () => {
    const away = { golf_qualifiers: { data: { ...Q, team_id: 'other' } } };
    for (const who of [asCoach, asPlayer]) {
      who();
      seed(away);
      const views = who === asCoach ? (['detail', 'edit', 'selection'] as const) : (['detail'] as const);
      for (const view of views) {
        const { unmount } = wrap((await route(view, QID)) as never);
        expect([view, code('CH-09310')!.textContent]).toEqual([view, 'That qualifier isn’t on your teamIt may have been deleted, or the link is from another team.Back to qualifiers']);
        expect(within(code('CH-09310') as HTMLElement).getByRole('link', { name: 'Back to qualifiers' }).getAttribute('href')).toBe('/golf/dashboard/qualifiers');
        unmount();
      }
    }
    // A link that is not an id never reaches a table.
    asCoach();
    const reads = seed();
    for (const view of ['detail', 'edit', 'selection'] as const) {
      const { unmount } = wrap((await route(view, 'not-a-link')) as never);
      expect(code('CH-09310')).not.toBeNull();
      unmount();
    }
    expect(reads.filter((t) => t === 'golf_qualifiers')).toEqual([]);
  });

  it('90805 the list reads only the viewer’s team, and never a test qualifier', async () => {
    const seen: Array<[string, unknown[]]> = [];
    asPlayer();
    seed({
      golf_qualifiers: (filters: Array<[string, unknown[]]>) => {
        seen.push(...filters);
        return { data: [Q] };
      },
    });
    await route('list');
    expect(seen).toContainEqual(['eq', ['team_id', 't1']]);
    expect(seen).toContainEqual(['eq', ['is_test', false]]);
  });

  it('90107 outside the Clubhouse /selection sends a coach to the CoachHelm workspace and a player to the qualifier; signed out goes to login; inside, the route gets the address', async () => {
    const page = (id = QID) => QualifierSelectionPage({ params: Promise.resolve({ id }) });
    gate.on = false;
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
    await expect(page()).rejects.toThrow(`redirect:/golf/dashboard/coachhelm/qualifying/${QID}`);
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: 'p2' } } as never);
    await expect(page()).rejects.toThrow(`redirect:/golf/dashboard/qualifiers/${QID}`);
    vi.mocked(getGolfSessionProfile).mockResolvedValue(null);
    await expect(page()).rejects.toThrow('redirect:/golf/login');
    gate.on = true;
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
    const el = (await page()) as ReactElement<{ view: string; id: string }>;
    expect([el.type, el.props.view, el.props.id]).toEqual([ClubhouseQualifiersRoute, 'selection', QID]);
  });
});

describe('Qualifiers · live standings (background refresh)', () => {
  /** A Realtime channel that hands the test the two callbacks the page gave it. */
  function openChannel() {
    const handle = { change: () => {}, status: (_s: string) => {} };
    const chan: { on: Mock; subscribe: Mock } = {
      on: vi.fn((_kind: string, _filter: unknown, cb: () => void) => {
        handle.change = cb;
        return chan;
      }),
      subscribe: vi.fn((cb?: (s: string) => void) => {
        if (cb) handle.status = cb;
        return chan;
      }),
    };
    realtime.channel.mockReturnValue(chan);
    return { chan, handle };
  }
  afterEach(() => vi.useRealTimers());

  it('90304 a live qualifier listens for signed rounds, a burst of them re-reads the page once, and a dropped feed is reported rather than shown', () => {
    vi.useFakeTimers();
    const { chan, handle } = openChannel();
    const { unmount } = renderHook(() => useLiveStandings('q1', true));
    expect(realtime.channel).toHaveBeenCalledWith('ch-qualifier-q1');
    expect(chan.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'golf_rounds', filter: 'qualifier_id=eq.q1' }, expect.any(Function));
    handle.change();
    handle.change();
    handle.change();
    act(() => vi.advanceTimersByTime(799));
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    handle.status('SUBSCRIBED');
    expect(chReport).not.toHaveBeenCalled();
    handle.status('CHANNEL_ERROR');
    expect(chReport).toHaveBeenCalledWith(expect.objectContaining({ message: 'qualifier realtime channel error' }), { surface: 'qualifiers.live', severity: 'low' });
    // Leaving the page drops the channel and any re-read still waiting.
    handle.change();
    unmount();
    expect(realtime.removeChannel).toHaveBeenCalledWith(chan);
    act(() => vi.advanceTimersByTime(5000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('90304 only a live qualifier is listened to: not an upcoming or a closed one, and not once it is closed from this page', async () => {
    const user = userEvent.setup();
    openChannel();
    for (const name of ['upcoming', 'completed'] as const) {
      const { unmount } = wrap(<QualifierDetail data={detail(name)} writes={fakeWrites()} />);
      unmount();
    }
    const off = wrap(<QualifierDetail data={detail('live')} writes={fakeWrites()} live={false} />);
    off.unmount();
    expect(realtime.channel).not.toHaveBeenCalled();
    const { chan } = openChannel();
    wrap(<QualifierDetail data={detail('live')} writes={fakeWrites()} />);
    expect(realtime.channel).toHaveBeenCalledWith(`ch-qualifier-${detail('live').id}`);
    expect(realtime.removeChannel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close qualifier' }));
    await user.click(inDialog('CH-09501', 'Close qualifier'));
    await waitFor(() => expect(realtime.removeChannel).toHaveBeenCalledWith(chan));
  });
});

describe('Qualifiers · every write', () => {
  type Ctx = { w: FakeWrites; s: SelWrites };
  type User = ReturnType<typeof userEvent.setup>;
  interface Scenario {
    name: string;
    /** The write the screen sends. */
    write: (c: Ctx) => Mock;
    render: (c: Ctx) => ReactNode;
    act: (user: User) => Promise<void>;
    /** The toast that names what landed, and the toast that names what failed. */
    done: string;
    failed: string;
    /** Where the page goes once it lands, or null when it stays put. */
    goes: string | null;
    /** How it gets there: a form that has done its job is replaced (Back does not return to it), a step on is pushed. */
    via?: 'replace';
    /** Whether the server is asked to read the page again once it lands. */
    reads: boolean;
    /** What the screen shows once it has landed. */
    landed: () => void;
  }
  const filled = () => {
    const f = previewCreateForm();
    return { ...f, initial: { ...f.initial, name: 'Conference qualifier', startDate: '2026-10-19' } };
  };
  const detailHref = `/golf/dashboard/qualifiers/${previewSelection().id}`;
  const press = async (user: User, name: string | RegExp) => user.click(screen.getByRole('button', { name }));
  const navigated = (sc: Scenario) => (sc.via === 'replace' ? router.replace : router.push);
  const clearNav = () => {
    router.push.mockClear();
    router.replace.mockClear();
    router.refresh.mockClear();
  };
  const scenarios: Scenario[] = [
    {
      name: 'create',
      write: (c) => c.w.create,
      render: (c) => <QualifierForm data={filled()} writes={c.w} />,
      act: (user) => press(user, 'Create qualifier'),
      done: 'Qualifier created · 7 players entered',
      failed: 'Couldn’t create the qualifier',
      goes: '/golf/dashboard/qualifiers/q-new',
      via: 'replace',
      reads: false,
      landed: () => {},
    },
    {
      name: 'save',
      write: (c) => c.w.saveEdit,
      render: (c) => <QualifierForm data={previewEditForm()} writes={c.w} />,
      act: (user) => press(user, 'Save changes'),
      done: 'Qualifier saved',
      failed: 'Couldn’t save the qualifier',
      goes: `/golf/dashboard/qualifiers/${previewEditForm().id}`,
      via: 'replace',
      reads: true,
      landed: () => expect(code('CH-09902')).toBeNull(),
    },
    {
      name: 'close',
      write: (c) => c.w.setStatus,
      render: (c) => <QualifierDetail data={detail('live')} writes={c.w} live={false} />,
      act: async (user) => {
        await press(user, 'Close qualifier');
        await user.click(inDialog('CH-09501', 'Close qualifier'));
      },
      done: 'Qualifier closed · no new rounds accepted',
      failed: 'Couldn’t close Pinehurst qualifier',
      goes: null,
      reads: true,
      landed: () => {
        expect(document.querySelector('.ch-qf-status')!.textContent).toBe('Completed');
        expect(screen.queryByText('Close this qualifier?')).toBeNull();
      },
    },
    {
      name: 'reopen',
      write: (c) => c.w.setStatus,
      render: (c) => <QualifierDetail data={detail('completed')} writes={c.w} live={false} />,
      act: (user) => press(user, 'Reopen qualifier'),
      done: 'Qualifier reopened · players can enter rounds',
      failed: 'Couldn’t reopen Preseason qualifier',
      goes: null,
      reads: true,
      landed: () => expect(document.querySelector('.ch-qf-status')!.textContent).toBe('Live'),
    },
    {
      name: 'start selecting',
      write: (c) => c.s.advance,
      render: (c) => <QualifierSelection data={previewSelection('standings')} writes={c.s} />,
      act: async (user) => {
        await press(user, 'Start selecting');
        await user.click(inDialog('CH-09503', 'Start selecting'));
      },
      done: 'Selecting is open · choose your picks',
      failed: 'Couldn’t start selecting',
      goes: null,
      reads: true,
      landed: () => {
        expect(screen.queryByText('Start selecting?')).toBeNull();
        expect(within(screen.getByRole('list', { name: 'Selection steps' })).getAllByRole('listitem').map((step) => step.getAttribute('aria-current'))).toEqual([null, 'step', null]);
      },
    },
    {
      name: 'pick',
      write: (c) => c.s.setPick,
      render: (c) => <QualifierSelection data={previewSelection('picking')} writes={c.s} />,
      act: async (user) => {
        await press(user, 'Choose a player');
        await user.click(screen.getByRole('radio', { name: /Eli Brandt/ }));
        await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Best short game on the team');
        await press(user, 'Save pick');
      },
      done: 'Eli Brandt picked',
      failed: 'Couldn’t pick Eli Brandt',
      goes: null,
      reads: true,
      landed: () => {
        expect(screen.queryByText('Choose a coach’s pick')).toBeNull();
        expect(screen.getByText('1 of 1 chosen')).toBeTruthy();
      },
    },
    {
      name: 'remove a pick',
      write: (c) => c.s.removePick,
      render: (c) => <QualifierSelection data={previewSelection('picked')} writes={c.s} />,
      act: async (user) => {
        await press(user, 'Remove Eli Brandt');
        await user.click(inDialog('CH-09504', 'Remove'));
      },
      done: 'Eli Brandt removed as a pick',
      failed: 'Couldn’t remove Eli Brandt as a pick',
      goes: null,
      reads: true,
      landed: () => {
        expect(screen.queryByText('Remove Eli Brandt as a pick?')).toBeNull();
        expect(screen.getByText('0 of 1 chosen')).toBeTruthy();
      },
    },
    {
      name: 'confirm the squad',
      write: (c) => c.s.confirm,
      render: (c) => <QualifierSelection data={previewSelection('picked')} writes={c.s} />,
      act: async (user) => {
        await press(user, 'Confirm squad');
        await user.click(inDialog('CH-09505', 'Confirm squad'));
      },
      done: 'Squad confirmed · 5 players',
      failed: 'Couldn’t confirm the squad',
      goes: detailHref,
      reads: true,
      landed: () => expect(screen.queryByText('Confirm the squad?')).toBeNull(),
    },
  ];
  /** Render a scenario and do what the person does; `before` sets up its write (to fail, say). */
  async function drive(sc: Scenario, before?: (write: Mock) => void) {
    const c: Ctx = { w: fakeWrites(), s: selWrites() };
    before?.(sc.write(c));
    const view = wrap(sc.render(c));
    await sc.act(userEvent.setup());
    return { c, view };
  }
  const refuse = (write: Mock) => write.mockImplementation(async () => ({ success: false, error: 'nope' }));

  it('CH-09009 a squad confirmed while telling the players failed says so (Q-116)', async () => {
    const sc = scenarios.find((x) => x.name === 'confirm the squad')!;
    const { view } = await drive(sc, (write) => write.mockImplementation(async () => ({ success: true, data: { notified: false } })));
    await screen.findByText('The players weren’t all told');
    expect(screen.getByText('Squad confirmed · 5 players')).toBeTruthy();
    view.unmount();
  });

  it('90901 every write that lands says what landed in a toast and fires the success haptic', async () => {
    for (const sc of scenarios) {
      hapticSpy.mockClear();
      const { view } = await drive(sc);
      await screen.findByText(sc.done);
      expect([sc.name, hapticSpy.mock.calls.some(([kind]) => kind === 'success'), hapticSpy.mock.calls.some(([kind]) => kind === 'error')]).toEqual([sc.name, true, false]);
      view.unmount();
    }
  });

  it('90902 a create, a save and a confirm move on to the qualifier; every other write leaves the coach where they are', async () => {
    for (const sc of scenarios) {
      clearNav();
      const { view } = await drive(sc);
      await waitFor(() => expect(sc.goes ? navigated(sc) : router.refresh).toHaveBeenCalled());
      expect([sc.name, navigated(sc).mock.calls.map(([to]) => to)]).toEqual([sc.name, sc.goes ? [sc.goes] : []]);
      // A create and a save replace the form, so Back from the qualifier does not return to it; the other write that moves on is a step forward.
      if (sc.via === 'replace') expect([sc.name, router.push.mock.calls.length]).toEqual([sc.name, 0]);
      view.unmount();
    }
  });

  it('91501 a write that lands has the server read the page again (a create opens the new qualifier instead), and one that fails re-reads nothing', async () => {
    for (const sc of scenarios) {
      clearNav();
      const landed = await drive(sc);
      await waitFor(() => expect(sc.reads ? router.refresh : navigated(sc)).toHaveBeenCalled());
      expect([sc.name, router.refresh.mock.calls.length > 0]).toEqual([sc.name, sc.reads]);
      landed.view.unmount();
      clearNav();
      const refused = await drive(sc, refuse);
      await screen.findByText(sc.failed);
      expect([sc.name, router.refresh.mock.calls.length, router.push.mock.calls.length, router.replace.mock.calls.length]).toEqual([sc.name, 0, 0, 0]);
      refused.view.unmount();
    }
  });

  it('91401 Retry in a failure toast runs the same write again with the same arguments, and everything a landed write does follows this time too', async () => {
    for (const sc of scenarios) {
      clearNav();
      const { c, view } = await drive(sc, (write) => write.mockResolvedValueOnce({ success: false, error: 'nope' }));
      await screen.findByText(sc.failed);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(sc.write(c)).toHaveBeenCalledTimes(2));
      expect([sc.name, sc.write(c).mock.calls[1]]).toEqual([sc.name, sc.write(c).mock.calls[0]]);
      await screen.findByText(sc.done);
      await waitFor(() => expect(sc.goes ? navigated(sc) : router.refresh).toHaveBeenCalled());
      expect([sc.name, navigated(sc).mock.calls.map(([to]) => to)]).toEqual([sc.name, sc.goes ? [sc.goes] : []]);
      await waitFor(sc.landed);
      view.unmount();
    }
  });

  it('90702 offline, no write is sent: the shell’s offline toast names what did not happen, the error haptic fires, and nothing moves on', async () => {
    const offline = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      for (const sc of scenarios) {
        hapticSpy.mockClear();
        clearNav();
        const { c, view } = await drive(sc);
        await expectCode('CH-1903', new RegExp(`^${sc.failed}: you're offline`));
        expect([sc.name, sc.write(c).mock.calls.length, hapticSpy.mock.calls.some(([kind]) => kind === 'error')]).toEqual([sc.name, 0, true]);
        expect([sc.name, router.push.mock.calls.length, router.replace.mock.calls.length, router.refresh.mock.calls.length]).toEqual([sc.name, 0, 0, 0]);
        view.unmount();
      }
    } finally {
      offline.mockRestore();
    }
  });
});

describe('Qualifiers · when a write is slow or refused, and when a read did not load', () => {
  const chooseEli = async (user: ReturnType<typeof userEvent.setup>, reason = 'Best short game on the team') => {
    await user.click(screen.getByRole('button', { name: 'Choose a player' }));
    await user.click(screen.getByRole('radio', { name: /Eli Brandt/ }));
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), reason);
    await user.click(screen.getByRole('button', { name: 'Save pick' }));
  };

  it('91301 nothing on the page moves before the server answers, and a refused write moves nothing', async () => {
    const user = userEvent.setup();
    // Close: the pill stays Live and the closed note stays away, in flight and once refused.
    let settleClose: (v: { success: boolean; error?: string }) => void = () => {};
    const writes = fakeWrites({ setStatus: vi.fn(() => new Promise((r) => (settleClose = r))) });
    const first = wrap(<QualifierDetail data={detail()} writes={writes} live={false} />);
    const pill = () => document.querySelector('.ch-qf-status')!.textContent;
    await user.click(screen.getByRole('button', { name: 'Close qualifier' }));
    await user.click(inDialog('CH-09501', 'Close qualifier'));
    await expectCode('CH-09405', /Closing/);
    expect([pill(), code('CH-09901')]).toEqual(['Live', null]);
    await act(async () => settleClose({ success: false, error: 'nope' }));
    expect([pill(), code('CH-09901')]).toEqual(['Live', null]);
    first.unmount();
    // A pick: nobody is a pick while the write is in flight.
    let settlePick: (v: { success: boolean }) => void = () => {};
    const second = wrap(<QualifierSelection data={previewSelection('picking')} writes={selWrites({ setPick: vi.fn(() => new Promise((r) => (settlePick = r))) })} />);
    await chooseEli(user);
    await expectCode('CH-09408', /Saving/);
    expect(screen.getByText('0 of 1 chosen')).toBeTruthy();
    await act(async () => settlePick({ success: true }));
    expect(await screen.findByText('1 of 1 chosen')).toBeTruthy();
    second.unmount();
    // A removal: the pick stays a pick while the write is in flight, and when it is refused.
    let settleRemove: (v: { success: boolean; error?: string }) => void = () => {};
    wrap(<QualifierSelection data={previewSelection('picked')} writes={selWrites({ removePick: vi.fn(() => new Promise((r) => (settleRemove = r))) })} />);
    await user.click(screen.getByRole('button', { name: 'Remove Eli Brandt' }));
    await user.click(inDialog('CH-09504', 'Remove'));
    await expectCode('CH-09408', /Removing/);
    expect(screen.getByText('1 of 1 chosen')).toBeTruthy();
    await act(async () => settleRemove({ success: false, error: 'nope' }));
    expect(screen.getByText('1 of 1 chosen')).toBeTruthy();
  });

  it('91402 Try again on a section that did not load has the server read the page again; the course picker retries on its own, and the round courses in the form have no retry', async () => {
    const user = userEvent.setup();
    const tryAgain = async (c: string) => {
      router.refresh.mockClear();
      await user.click(within(code(c) as HTMLElement).getByRole('button', { name: /Try again/ }));
      expect([c, router.refresh.mock.calls.length]).toEqual([c, 1]);
    };
    const shown = (node: ReactNode) => wrap(node).unmount;
    // The list.
    let unmount = shown(<QualifiersList data={list('coach', 'all', { items: [], listError: true })} />);
    await tryAgain('CH-09201');
    unmount();
    unmount = shown(<QualifiersList data={list('coach', 'all', { standingsError: true })} />);
    await tryAgain('CH-09202');
    unmount();
    // The detail: the field, the scores, the scorecards, the courses and the confirmed squad.
    unmount = shown(<QualifierDetail data={detail('live', 'coach', { entriesError: true, board: null })} writes={fakeWrites()} live={false} />);
    await tryAgain('CH-09203');
    unmount();
    unmount = shown(<QualifierDetail data={detail('live', 'coach', { roundsError: true, board: null })} writes={fakeWrites()} live={false} />);
    await tryAgain('CH-09204');
    unmount();
    unmount = shown(<QualifierDetail data={detail('live', 'coach', { holesError: true })} writes={fakeWrites()} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    await tryAgain('CH-09205');
    unmount();
    unmount = shown(<QualifierDetail data={detail('selected', 'coach', { coursesError: true, selectionsError: true, selections: null })} writes={fakeWrites()} live={false} />);
    await tryAgain('CH-09206');
    await tryAgain('CH-09207');
    unmount();
    // The form: the roster or the entrants.
    unmount = shown(<QualifierForm data={{ ...previewCreateForm(), playersError: true }} writes={fakeWrites()} />);
    await tryAgain('CH-09208');
    unmount();
    // Manage selections: the route's own notice.
    asCoachSession();
    tables.current = { golf_qualifiers: { error: { message: 'boom' } } };
    unmount = shown((await ClubhouseQualifiersRoute({ view: 'selection', id: '10000000-0000-4000-8000-000000000001' })) as never);
    await tryAgain('CH-09218');
    unmount();
    // The picker retries only itself.
    router.refresh.mockClear();
    const courses = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(PREVIEW_COURSES);
    unmount = shown(<QualifierForm data={previewCreateForm()} writes={fakeWrites({ courses })} />);
    await user.click(screen.getByRole('button', { name: /Choose course for round 1/ }));
    await expectCode('CH-09209', /Courses didn’t load/);
    await user.click(within(code('CH-09209') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('button', { name: /Finley GC/ })).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
    unmount();
    // The edit form's round courses say what is kept and offer no retry, because a re-read would drop the coach's changes.
    shown(<QualifierForm data={{ ...previewEditForm(), coursesError: true, roundCourses: [] }} writes={fakeWrites()} />);
    expect(within(code('CH-09217') as HTMLElement).queryByRole('button')).toBeNull();
  });
});

describe('Qualifiers · what is reported', () => {
  const player = (id: string) => ({ id, first_name: 'Ann', last_name: 'X', graduation_year: null });

  it('92301 a refused write is reported low and a thrown one at the default, under the qualifiers surface and the write’s name; a crash is reported high under its section; a failed picker read under the picker; a failed server read is logged with its read', async () => {
    const user = userEvent.setup();
    const refused = wrap(<QualifierDetail data={detail()} writes={fakeWrites({ setStatus: vi.fn(fail) })} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Close qualifier' }));
    await user.click(inDialog('CH-09501', 'Close qualifier'));
    await expectCode('CH-09003');
    expect(chReport).toHaveBeenCalledWith(expect.objectContaining({ message: 'nope' }), { surface: 'qualifiers', action: 'qualifiers.close', severity: 'low' });
    refused.unmount();
    const boom = new Error('network down');
    const thrown = wrap(<QualifierDetail data={detail('completed')} writes={fakeWrites({ setStatus: vi.fn(async () => { throw boom; }) })} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Reopen qualifier' }));
    await expectCode('CH-09004');
    expect(chReport).toHaveBeenCalledWith(boom, { surface: 'qualifiers', action: 'qualifiers.reopen' });
    thrown.unmount();
    // A crash in a section, reported high under the section's own surface.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = detail();
    wrap(<QualifierDetail data={{ ...d, board: { ...d.board!, rows: d.board!.rows.map((r, i) => (i === 0 ? { ...r, name: null as never, rounds: null as never } : r)) } }} writes={fakeWrites()} live={false} />);
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'qualifiers.leaderboard', severity: 'high' }));
    quiet.mockRestore();
    // A picker read that fails.
    const picker = wrap(<QualifierForm data={previewCreateForm()} writes={fakeWrites({ courses: vi.fn(async () => Promise.reject(new Error('x'))) })} />);
    await user.click(screen.getByRole('button', { name: /Choose course for round 1/ }));
    await expectCode('CH-09209');
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), { surface: 'qualifiers.picker', action: 'courses', severity: 'low' });
    picker.unmount();
    // Server reads: each failure is logged with the screen and the read, and the page still comes back.
    const Q = { id: 'q1', team_id: 't1', name: 'Pinehurst qualifier', description: null, status: 'in_progress', start_date: '2026-09-22', end_date: null, entry_deadline: null, course_name: null, rules: null, num_rounds: 1, selection_slots_total: 3, selection_slots_coach_pick: 1, selection_state: 'open', is_test: false };
    tables.current = { golf_qualifiers: { data: Q }, golf_qualifier_entries: { error: { message: 'e' } }, golf_rounds: { error: { message: 'r' } }, golf_qualifier_round_courses: { error: { message: 'c' } } };
    const data = await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' });
    expect([data!.entriesError, data!.roundsError, (await data!.secondary).coursesError]).toEqual([true, true, true]);
    for (const read of ['entries', 'rounds', 'roundCourses']) expect(logServer).toHaveBeenCalledWith('qualifiers', read, expect.anything(), 'qualifiers');
    tables.current = { golf_team_members: { error: { message: 'm' }, data: [{ player: player('p1') }] } };
    expect((await loadQualifierForm({ teamId: 't1', qualifierId: null }))!.playersError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('qualifiers', 'roster', expect.anything(), 'qualifiers');
  });

  it('92304 each intent leaves a breadcrumb before anything is sent: a filter, the scorecards, Close, Create, Save, the two questions on Manage selections, and the write itself by name', async () => {
    const user = userEvent.setup();
    const trail = () => vi.mocked(chTrail).mock.calls;
    const list1 = wrap(<QualifiersList data={list()} />);
    await user.click(screen.getByRole('button', { name: /^Active/ }));
    expect(trail()).toContainEqual(['qualifiers filter', { filter: 'active' }]);
    list1.unmount();
    const detail1 = wrap(<QualifierDetail data={detail()} writes={fakeWrites()} live={false} />);
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    expect(trail()).toContainEqual(['qualifiers open scorecards']);
    await user.click(screen.getByRole('button', { name: 'Close qualifier' }));
    expect(trail()).toContainEqual(['qualifiers close ask']);
    await user.click(inDialog('CH-09501', 'Close qualifier'));
    await waitFor(() => expect(trail()).toContainEqual(['action qualifiers.close']));
    detail1.unmount();
    const create = wrap(<QualifierForm data={previewCreateForm()} writes={fakeWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    expect(trail()).toContainEqual(['qualifiers create']);
    create.unmount();
    wrap(<QualifierForm data={previewEditForm()} writes={fakeWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(trail()).toContainEqual(['qualifiers save']);
    await waitFor(() => expect(trail()).toContainEqual(['action qualifiers.save']));
  });

  it('92304 the two questions on Manage selections leave a breadcrumb too', async () => {
    const user = userEvent.setup();
    const first = wrap(<QualifierSelection data={previewSelection('standings')} writes={selWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Start selecting' }));
    expect(vi.mocked(chTrail).mock.calls).toContainEqual(['qualifiers start ask']);
    first.unmount();
    wrap(<QualifierSelection data={previewSelection('picked')} writes={selWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Confirm squad' }));
    expect(vi.mocked(chTrail).mock.calls).toContainEqual(['qualifiers confirm ask']);
  });
});

describe('Qualifiers · this file', () => {
  it('92401 every catalog row of kinds 0 to 5 that is not marked preview is named by a test here, and so is every Bridge ID this page proves', () => {
    const root = process.cwd();
    const read = (file: string) => readFileSync(join(root, file), 'utf8');
    const own = read('src/clubhouse/__tests__/qualifiers.test.tsx');
    const rows = [...read('docs/clubhouse/catalog/qualifiers.md').matchAll(/^\|\s*(CH-09[0-5]\d\d)\s*\|.*$/gm)]
      .filter((m) => !/\|\s*preview\s*\|\s*$/.test(m[0].trim()) && !/retired/i.test(m[0]))
      .map((m) => m[1]!);
    // A floor, so an unreadable catalog can't pass by finding nothing.
    expect(rows.length).toBeGreaterThanOrEqual(66);
    expect(rows.filter((c) => !own.includes(c))).toEqual([]);
    // Every hand contract the registry marks implemented is named in a test title of one of the files it lists.
    const bridge = JSON.parse(read('config/clubhouse/bridge-contracts.json')) as Array<{ id: number; page: string; chCode?: string; status: string; tests?: string[] }>;
    const titles = (file: string) => read(file).split('\n').filter((l) => /^\s*(it|describe|test)(\.each\(.*\))?\(/.test(l));
    const unnamed = bridge.filter((r) => r.page === 'P009' && !r.chCode && r.status === 'implemented').filter((r) => !(r.tests ?? []).some((f) => titles(f).some((l) => l.includes(String(r.id)))));
    expect(unnamed.map((r) => r.id)).toEqual([]);
  });
});
