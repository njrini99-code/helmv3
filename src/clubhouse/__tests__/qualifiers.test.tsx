import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/** Qualifiers: every numbered state in docs/clubhouse/catalog/qualifiers.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }) }));
vi.mock('@/app/golf/actions/golf', () => ({
  createGolfQualifier: vi.fn(),
  setQualifierRoundCourses: vi.fn(),
  updateGolfQualifierDetails: vi.fn(),
  updateQualifierStatus: vi.fn(),
}));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: vi.fn(), setQualifierSquadSize: vi.fn() }));
vi.mock('@/app/golf/actions/course-library', () => ({ getCourseDetail: vi.fn(), getTeamSavedCourses: vi.fn(), listCoursesStrict: vi.fn() }));

import { loadQualifierDetail, loadQualifierForm, loadQualifierList, type ChQDetail, type ChQFormData, type ChQList } from '../data/qualifiers';
import { QualifiersList } from '../screens/qualifiers/QualifiersList';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import { QualifierDetailSkeleton, QualifierFormSkeleton, QualifiersSkeleton } from '../screens/qualifiers/QualifiersSkeleton';
import { buildBoard, roundPars, validateForm, type ChQFormValues, type ChQRound } from '../screens/qualifiers/model';
import { runEditPlan, type ChQWrites } from '../screens/qualifiers/writes';
import { DETAIL_INDEX, PLAYER_ID, PREVIEW_COURSES, PREVIEW_TEES, previewCreateForm, previewDetail, previewEditForm, previewList } from '../preview/fixtures-qualifiers';
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

beforeEach(() => {
  hapticSpy.mockClear();
  router.push.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
  tables.current = {};
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
    // Two qualify on score (3 places, 1 pick); the next two are on the bubble; the rest are out.
    expect(b.rows.map((r) => r.state)).toEqual(['qualifying', 'qualifying', 'bubble', 'bubble', null]);
    expect(b.submitted).toBe(6);
  });
  it('averages full rounds only, and counts the shorter ones it left out', () => {
    const b = buildBoard({ entrants: [e('a')], rounds: [rd('a', 1, 72, 0), rd('a', 2, 38, 2, 9)], squad: 5, picks: 1, status: 'in_progress', selectionState: 'open', selections: null });
    expect(b.rows[0]).toMatchObject({ avg: 72, shortRounds: 1, total: 110, toPar: 2, played: 2 });
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

  it('a player list puts their own qualifiers first, with where they stand; mine keeps only those', async () => {
    const other = { ...Q, id: 'q2', name: 'Other', start_date: '2026-10-01' };
    tables.current = { golf_qualifiers: { data: [other, Q] }, golf_qualifier_entries: { data: entries }, golf_rounds: { data: rounds } };
    const all = await loadQualifierList({ role: 'player', teamId: 't1', playerId: 'p2', mode: 'all' });
    expect(all.items.map((i) => i.id)).toEqual(['q1', 'q2']);
    expect(all.items[0]!.mine).toEqual({ entered: true, position: '2', toPar: 2, played: 1 });
    expect(all.items[1]!.mine?.entered).toBe(false);
    const mine = await loadQualifierList({ role: 'player', teamId: 't1', playerId: 'p2', mode: 'mine' });
    expect(mine.items.map((i) => i.id)).toEqual(['q1']);
  });

  it('a player gets only their own scorecards and never the pick reasoning', async () => {
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
    expect(Object.keys(asPlayer.holes)).toEqual(['r2']);
    expect(asPlayer.selections).toEqual([{ playerId: 'p2', type: 'coach_pick', reasoning: null, name: 'Bea X' }]);
    const asCoach = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(Object.keys(asCoach.holes).sort()).toEqual(['r1', 'r2']);
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

  it('a qualifier read that fails throws (the route error view retries); another team’s is not found', async () => {
    tables.current = { golf_qualifiers: { error: { message: 'boom' } } };
    await expect(loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' })).rejects.toThrow();
    tables.current = { golf_qualifiers: { data: { ...Q, team_id: 'other' } } };
    expect(await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' })).toBeNull();
    expect(await loadQualifierForm({ teamId: 't1', qualifierId: 'q1' })).toBeNull();
  });

  it('CH-09203 CH-09204 the field is never shown without its scores', async () => {
    tables.current = { golf_qualifiers: { data: Q }, golf_qualifier_entries: { data: entries }, golf_rounds: { error: { message: 'boom' } }, golf_qualifier_round_courses: { data: [] } };
    const scores = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(scores.board).toBeNull();
    const { unmount } = wrap(<QualifierDetail data={scores} writes={fakeWrites()} live={false} />);
    await expectCode('CH-09204', /Scores didn’t load/);
    unmount();
    wrap(<QualifierDetail data={detail('live', 'coach', { entriesError: true, board: null })} writes={fakeWrites()} live={false} />);
    await expectCode('CH-09203', /The field didn’t load/);
  });

  it('editing: players with a round or a squad place are locked in, and the round count cannot drop below a scored round', async () => {
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

describe('Qualifiers · list', () => {
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

  it('CH-09304 no round in yet', () => {
    wrap(<QualifierDetail data={detail('upcoming')} writes={fakeWrites()} live={false} />);
    expect(code('CH-09304')!.textContent).toMatch(/Awaiting first round.*7 players entered/);
  });

  it('CH-09802 the leaderboard is a table; a coach opens any scorecards, a player only their own', async () => {
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

  it('the confirmed squad: the coach reads the pick reasoning, a player never does', () => {
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
});

describe('Qualifiers · create and edit', () => {
  const form = (over: Partial<ChQFormData> = {}) => ({ ...previewCreateForm(), ...over });

  it('CH-09101 CH-09110 submitting an empty name: the field says why, focus lands on it, nothing is sent', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    wrap(<QualifierForm data={form()} writes={writes} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await expectCode('CH-09101', /Give the qualifier a name/);
    expect(code('CH-09110')!.textContent).toMatch(/Couldn’t create the qualifier.*Fix the 2 highlighted fields/);
    expect(document.activeElement?.id).toBe('qf-name');
    expect(writes.create).not.toHaveBeenCalled();
  });

  it('CH-09106 CH-09107 one round needs its acknowledgement; no players, no qualifier', async () => {
    const user = userEvent.setup();
    wrap(<QualifierForm data={form({ initial: { ...form().initial, name: 'Q', startDate: '2026-10-19', rounds: '1', playerIds: [] } })} writes={fakeWrites()} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await expectCode('CH-09106', /meant to have one round/);
    expect(code('CH-09107')!.textContent).toMatch(/Choose at least one player/);
    expect(document.activeElement?.id).toBe('qf-one');
  });

  it('CH-09001 a failed create keeps every field and says so; a good one opens the new qualifier', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites({ create: vi.fn(async () => ({ success: false, error: 'Team not found for your organization' })) });
    wrap(<QualifierForm data={form({ initial: { ...form().initial, name: 'Conference qualifier', startDate: '2026-10-19' } })} writes={writes} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await expectCode('CH-09001', /Couldn’t create the qualifier.*Team not found/);
    expect((screen.getByLabelText('Qualifier name') as HTMLInputElement).value).toBe('Conference qualifier');
    expect(writes.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Conference qualifier', numRounds: 3, selectionSlotsTotal: 5, selectionSlotsCoachPick: 1, playerIds: expect.any(Array) }));
    writes.create.mockImplementation(async () => ({ success: true, data: { qualifierId: 'q-new' } }));
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/dashboard/qualifiers/q-new'));
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

  it('CH-09002 CH-09902 a partial edit save: the toast says it failed, the form keeps what saved and what to do', async () => {
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

  it('editing: a player with a round stays entered; a changed squad and entrants are sent, an unchanged one is not', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    wrap(<QualifierForm data={previewEditForm()} writes={writes} />);
    const jonah = screen.getByRole('checkbox', { name: /Jonah Okafor/ }) as HTMLInputElement;
    expect(jonah.disabled).toBe(true);
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
