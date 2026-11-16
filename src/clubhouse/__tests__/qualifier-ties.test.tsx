import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/**
 * Qualifier ties (launch readiness F-04): a qualifier's stated tie rule ranks its board, its loaders read it tolerantly
 * (the store is a held migration), the standings say the rule in words, and the form chooses it.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/qualifiers' }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }) }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({
  createGolfQualifier: vi.fn(),
  setQualifierRoundCourses: vi.fn(),
  updateGolfQualifierDetails: vi.fn(),
  updateQualifierStatus: vi.fn(),
}));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: vi.fn(), setQualifierSquadSize: vi.fn() }));
vi.mock('@/app/golf/actions/qualifier-rules', () => ({ saveQualifierRules: vi.fn() }));
vi.mock('@/app/golf/actions/course-library', () => ({ getCourseDetail: vi.fn(), getTeamSavedCourses: vi.fn(), listCoursesStrict: vi.fn() }));

import { loadQualifierDetail, loadQualifierForm, type ChQFormData } from '../data/qualifiers';
import { boardCaption, buildBoard, type ChQRound } from '../screens/qualifiers/model';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import type { ChQWrites } from '../screens/qualifiers/writes';
import { previewCreateForm, previewEditForm } from '../preview/fixtures-qualifiers';
import { ToastProvider } from '../ui/Toast';

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
const fakeWrites = () => ({
  create: vi.fn<ChQWrites['create']>(async () => ({ success: true, data: { qualifierId: 'q-new' } })),
  saveEdit: vi.fn<ChQWrites['saveEdit']>(async () => ({ success: true })),
  saveRules: vi.fn<ChQWrites['saveRules']>(async () => ({ success: true })),
  setStatus: vi.fn<ChQWrites['setStatus']>(async () => ({ success: true })),
  courses: vi.fn<ChQWrites['courses']>(async () => []),
  tees: vi.fn<ChQWrites['tees']>(async () => []),
});

beforeEach(() => {
  router.replace.mockReset();
  router.push.mockReset();
});
afterEach(cleanup);

// Ann leads; Bea and Cal are level on 142 (even par over two rounds of par 71). Bea's last round is the lower.
const rd = (playerId: string, number: number, total: number): ChQRound => ({
  id: `${playerId}-${number}`,
  playerId,
  number,
  total,
  toPar: total - 71,
  date: '2026-09-2' + number,
  course: 'Finley GC',
  holesPlayed: 18,
});
const entrants = [
  { playerId: 'ann', name: 'Ann', classYear: null },
  { playerId: 'bea', name: 'Bea', classYear: null },
  { playerId: 'cal', name: 'Cal', classYear: null },
];
const rounds = [rd('ann', 1, 68), rd('ann', 2, 68), rd('bea', 1, 72), rd('bea', 2, 70), rd('cal', 1, 70), rd('cal', 2, 72)];
const board = (tieRule?: 'coach' | 'last_round') =>
  buildBoard({ entrants, rounds, squad: 2, picks: 0, status: 'in_progress', selectionState: 'open', selections: null, numRounds: 2, tieRule });

describe('Qualifier ties · the board (F-04)', () => {
  it('90180 the last-round rule separates players level on to par and strokes, so a tie at the cut is settled on the board', () => {
    const coach = board('coach');
    expect(coach.rows.map((r) => [r.name, r.position, r.tied, r.state])).toEqual([
      ['Ann', 1, false, 'qualifying'],
      ['Bea', 2, true, 'tie'],
      ['Cal', 2, true, 'tie'],
    ]);
    const last = board('last_round');
    expect(last.tieRule).toBe('last_round');
    expect(last.rows.map((r) => [r.name, r.position, r.tied, r.state])).toEqual([
      ['Ann', 1, false, 'qualifying'],
      ['Bea', 2, false, 'qualifying'],
      ['Cal', 3, false, null],
    ]);
    // No rule given is the rule every qualifier had before F-04.
    expect(board().rows.map((r) => r.state)).toEqual(['qualifying', 'tie', 'tie']);
  });

  it('90180 level in every round they both played, they still share a place and the cut waits for the coach', () => {
    const same = [rd('ann', 1, 68), rd('ann', 2, 68), rd('bea', 1, 71), rd('bea', 2, 71), rd('cal', 1, 71), rd('cal', 2, 71)];
    const b = buildBoard({
      entrants,
      rounds: same,
      squad: 2,
      picks: 0,
      status: 'in_progress',
      selectionState: 'open',
      selections: null,
      numRounds: 2,
      tieRule: 'last_round',
    });
    expect(b.rows.map((r) => [r.name, r.position, r.state])).toEqual([
      ['Ann', 1, 'qualifying'],
      ['Bea', 2, 'tie'],
      ['Cal', 2, 'tie'],
    ]);
  });

  it('90180 the standings say the rule in words, to the coach and to a player', () => {
    expect(boardCaption(board('last_round'), 0, 2, 'in_progress', true)).toContain(
      'Ties: players level on to par and strokes are separated by the lower last round, then the round before. Still level, they share a place, and you decide a tie at the cut.',
    );
    expect(boardCaption(board('last_round'), 0, 2, 'in_progress', false)).toContain('and your coach decides a tie at the cut.');
    expect(boardCaption(board('coach'), 0, 2, 'in_progress', true)).toContain(
      'Ties: players level on to par and strokes share a place, and you decide a tie at the cut.',
    );
  });
});

describe('Qualifier ties · the loaders (F-04)', () => {
  const Q = {
    id: 'q1',
    team_id: 't1',
    name: 'Pinehurst qualifier',
    description: null,
    status: 'in_progress',
    start_date: '2026-09-22',
    end_date: '2026-10-01',
    entry_deadline: null,
    course_name: 'Finley GC',
    rules: null,
    num_rounds: 2,
    selection_slots_total: 2,
    selection_slots_coach_pick: 0,
    selection_state: 'open',
    is_test: false,
  };
  const player = (id: string, first: string) => ({ id, first_name: first, last_name: 'X', graduation_year: null });
  const entries = ['ann', 'bea', 'cal'].map((id) => ({ qualifier_id: 'q1', player_id: id, player: player(id, id[0]!.toUpperCase() + id.slice(1)) }));
  const rows = rounds.map((r) => ({
    id: r.id,
    qualifier_id: 'q1',
    player_id: r.playerId,
    qualifier_round_number: r.number,
    total_score: r.total,
    score_to_par: r.toPar,
    round_date: r.date,
    course_name: 'Finley GC',
    holes_played: 18,
  }));
  const base = {
    golf_qualifiers: { data: Q },
    golf_qualifier_entries: { data: entries },
    golf_rounds: { data: rows },
    golf_qualifier_round_courses: { data: [] },
  };

  it('90180 the detail ranks by the stored rule; a qualifier with no row, or before the store exists, ranks as before', async () => {
    tables.current = { ...base, golf_qualifier_rules: { data: { tie_rule: 'last_round' } } };
    const stored = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(stored.board!.tieRule).toBe('last_round');
    expect(stored.board!.rows.map((r) => r.state)).toEqual(['qualifying', 'qualifying', null]);
    tables.current = { ...base, golf_qualifier_rules: { data: null } };
    expect((await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!.board!.tieRule).toBe('coach');
    tables.current = { ...base, golf_qualifier_rules: { error: { message: 'relation "golf_qualifier_rules" does not exist', code: '42P01' } } };
    const missing = (await loadQualifierDetail({ role: 'coach', teamId: 't1', playerId: null, qualifierId: 'q1' }))!;
    expect(missing.board!.tieRule).toBe('coach');
    expect(missing.board!.rows.map((r) => r.state)).toEqual(['qualifying', 'tie', 'tie']);
  });

  it('90181 the form starts a new qualifier on the last round; an existing one opens on its own rule; no store or a failed read locks it', async () => {
    const roster = { golf_team_members: { data: [{ player: player('ann', 'Ann') }] } };
    tables.current = { ...roster, golf_qualifier_rules: { data: null } };
    expect((await loadQualifierForm({ teamId: 't1', qualifierId: null }))!).toMatchObject({ rulesState: 'ok', initial: { tieRule: 'last_round' } });
    tables.current = { ...roster, golf_qualifier_rules: { error: { message: 'missing', code: 'PGRST205' } } };
    expect((await loadQualifierForm({ teamId: 't1', qualifierId: null }))!).toMatchObject({ rulesState: 'missing', initial: { tieRule: 'coach' } });
    tables.current = { ...roster, golf_qualifier_rules: { error: { message: 'boom' } } };
    expect((await loadQualifierForm({ teamId: 't1', qualifierId: null }))!).toMatchObject({ rulesState: 'error', initial: { tieRule: 'coach' } });
  });
});

describe('Qualifier ties · the form (F-04)', () => {
  const tie = () => screen.getByLabelText('Ties') as HTMLSelectElement;

  it('90181 a new qualifier offers Last round, then the one before, and says what it does', () => {
    wrap(<QualifierForm data={previewCreateForm()} writes={fakeWrites()} />);
    expect(tie().value).toBe('last_round');
    expect(tie().disabled).toBe(false);
    expect([...tie().options].map((o) => o.textContent)).toEqual(['Last round, then the one before', 'You decide']);
    expect(document.getElementById(tie().getAttribute('aria-describedby')!)!.textContent).toMatch(/separated by the lower last round, then the round before/);
  });

  it('90981 creating saves the chosen rule with the new qualifier; a rule that does not save is said in the done toast', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    const data: ChQFormData = { ...previewCreateForm(), initial: { ...previewCreateForm().initial, name: 'Conference qualifier', startDate: '2026-10-19' } };
    const { unmount } = wrap(<QualifierForm data={data} writes={writes} />);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await waitFor(() => expect(writes.saveRules).toHaveBeenCalledWith('q-new', { tieRule: 'last_round' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/golf/dashboard/qualifiers/q-new'));
    unmount();
    const failing = fakeWrites();
    failing.saveRules.mockImplementation(async () => ({ success: false, error: 'nope' }));
    wrap(<QualifierForm data={data} writes={failing} />);
    await user.selectOptions(tie(), 'coach');
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await screen.findByText('Qualifier created, but its tie rule didn’t save. Open Edit to set it.');
    expect(failing.saveRules).toHaveBeenCalledWith('q-new', { tieRule: 'coach' });
  });

  it('90981 an edit sends the rule only when it changed', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    const { unmount } = wrap(<QualifierForm data={previewEditForm()} writes={writes} />);
    expect(tie().value).toBe('coach');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes.saveEdit).toHaveBeenCalledTimes(1));
    expect(writes.saveEdit.mock.calls[0]![1]).toMatchObject({ rules: null });
    unmount();
    wrap(<QualifierForm data={previewEditForm()} writes={writes} />);
    await user.selectOptions(tie(), 'last_round');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes.saveEdit).toHaveBeenCalledTimes(2));
    expect(writes.saveEdit.mock.calls[1]![1]).toMatchObject({ rules: { tieRule: 'last_round' } });
  });

  it('CH-09281 a rule that did not load is shown locked and said in words; before the store exists it is locked without a code', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    const { unmount } = wrap(<QualifierForm data={{ ...previewEditForm(), rulesState: 'error' }} writes={writes} />);
    expect(tie().disabled).toBe(true);
    const help = document.querySelector('[data-ch-code="CH-09281"]')!;
    expect(help.textContent).toBe('The tie rule didn’t load, so it can’t be changed here now. The qualifier keeps the rule it has.');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes.saveEdit).toHaveBeenCalled());
    expect(writes.saveEdit.mock.calls[0]![1]).toMatchObject({ rules: null });
    unmount();
    wrap(
      <QualifierForm
        data={{ ...previewCreateForm(), rulesState: 'missing', initial: { ...previewCreateForm().initial, tieRule: 'coach' } }}
        writes={fakeWrites()}
      />,
    );
    expect(tie().disabled).toBe(true);
    expect(tie().value).toBe('coach');
    expect(document.querySelector('[data-ch-code="CH-09281"]')).toBeNull();
    expect(screen.getByText(/Choosing another rule arrives with the next update/)).toBeTruthy();
  });
});
