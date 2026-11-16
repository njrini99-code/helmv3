import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/**
 * Qualifier counting rounds (launch readiness F-06): a qualifier can count each player's best N rounds, dropping the
 * worst. The board, the selection workspace and the caption use one helper, and the form chooses it.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/qualifiers' }));
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

import { countedRoundIndexes } from '@/lib/coachhelm/v3/qualifying/ranking';
import { rankCandidates } from '@/lib/coachhelm/v3/qualifying/loader';
import { countBestSentence } from '@/lib/golf/qualifier-rules';
import { boardCaption, buildBoard, nextRoundPairings, validateForm, type ChQRound } from '../screens/qualifiers/model';
import { Pairings } from '../screens/qualifiers/QualifierSections';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import type { ChQWrites } from '../screens/qualifiers/writes';
import { previewCreateForm, previewEditForm } from '../preview/fixtures-qualifiers';
import { ToastProvider } from '../ui/Toast';

afterEach(cleanup);

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

const rd = (playerId: string, number: number, total: number): ChQRound => ({
  id: `${playerId}-${number}`,
  playerId,
  number,
  total,
  toPar: total - 72,
  date: `2026-10-0${number}`,
  course: 'Finley GC',
  holesPlayed: 18,
});
const entrants = [
  { playerId: 'ann', name: 'Ann', classYear: null },
  { playerId: 'bea', name: 'Bea', classYear: null },
];
// Ann: 70, 71, 85 (one blow-up). Bea: 73, 73, 73. Every round: Bea 219 beats Ann 226. Best 2 of 3: Ann 141 beats Bea 146.
const rounds = [rd('ann', 1, 70), rd('ann', 2, 71), rd('ann', 3, 85), rd('bea', 1, 73), rd('bea', 2, 73), rd('bea', 3, 73)];
const board = (countBest?: number | null) =>
  buildBoard({ entrants, rounds, squad: 1, picks: 0, status: 'completed', selectionState: 'closed', selections: null, numRounds: 3, tieRule: 'last_round', countBest });

describe('Qualifier counting rounds · the shared helper (F-06)', () => {
  it('keeps the best N by to par, then strokes, then the earlier round, in input order', () => {
    const r = [
      { toPar: 2, total: 74 },
      { toPar: -1, total: 71 },
      { toPar: 13, total: 85 },
      { toPar: 2, total: 74 },
    ];
    expect(countedRoundIndexes(r, 2)).toEqual([0, 1]);
    expect(countedRoundIndexes(r, null)).toEqual([0, 1, 2, 3]);
    expect(countedRoundIndexes(r.slice(0, 2), 2)).toEqual([0, 1]);
  });

  it('says the rule only when it drops a round', () => {
    expect(countBestSentence(2, 3)).toBe('Counts each player’s best 2 of 3 rounds: the worst round is dropped.');
    expect(countBestSentence(2, 4)).toBe('Counts each player’s best 2 of 4 rounds: the worst 2 rounds are dropped.');
    expect(countBestSentence(3, 3)).toBeNull();
    expect(countBestSentence(null, 3)).toBeNull();
  });
});

describe('Qualifier counting rounds · the board (F-06)', () => {
  it('90182 every round counts by default; best 2 of 3 drops Ann’s 85 and reorders the board', () => {
    const all = board();
    expect(all.rows.map((r) => [r.name, r.total])).toEqual([
      ['Bea', 219],
      ['Ann', 226],
    ]);
    expect(all.countBest).toBeUndefined();
    const best = board(2);
    expect(best.rows.map((r) => [r.name, r.total, r.toPar])).toEqual([
      ['Ann', 141, -3],
      ['Bea', 146, 2],
    ]);
    expect(best.rows[0]!.dropped).toEqual(['ann-3']);
    expect(best.rows[0]!.played).toBe(3);
    expect(best.rows[0]!.counting).toBe(2);
    // Bea's three rounds are level: the last one is dropped, so the earlier two stand.
    expect(best.rows[1]!.dropped).toEqual(['bea-3']);
    expect(best.rows[0]!.state).toBe('qualified');
    expect(best.countBest).toBe(2);
  });

  it('a player with only N rounds in is not short against one with more (both count N)', () => {
    const b = buildBoard({
      entrants,
      rounds: rounds.filter((r) => r.id !== 'bea-3'),
      squad: 1,
      picks: 0,
      status: 'completed',
      selectionState: 'closed',
      selections: null,
      numRounds: 3,
      countBest: 2,
    });
    expect(b.rows.map((r) => [r.name, r.total, r.missed])).toEqual([
      ['Ann', 141, false],
      ['Bea', 146, false],
    ]);
  });

  it('the caption states the counting rule before the tie rule', () => {
    expect(boardCaption(board(2), 0, 3, 'completed', true)).toContain('Counts each player’s best 2 of 3 rounds: the worst round is dropped.');
    expect(boardCaption(board(), 0, 3, 'completed', true)).not.toContain('Counts each player’s best');
  });
});

describe('Qualifier counting rounds · the selection workspace (F-06)', () => {
  it('ranks on the counted rounds, as the board does', () => {
    const ranked = rankCandidates([
      { player_id: 'ann', player_first_name: 'Ann', player_last_name: 'A', rounds_completed: 3, rounds_counted: 2, total_score: 141, total_to_par: -3 },
      { player_id: 'bea', player_first_name: 'Bea', player_last_name: 'B', rounds_completed: 2, total_score: 146, total_to_par: 2 },
    ]);
    expect(ranked.map((c) => [c.player_id, c.leaderboard_position])).toEqual([
      ['ann', 1],
      ['bea', 2],
    ]);
  });
});

describe('Qualifier counting rounds · the form (F-06)', () => {
  const count = () => screen.getByLabelText('Rounds that count') as HTMLSelectElement;
  const base = { ...previewCreateForm().initial, name: 'Fall qualifier', startDate: '2026-10-19', rounds: '3' };

  it('CH-09180 best N must drop a round', () => {
    expect(validateForm({ ...base, playerIds: ['p1'], countBest: 3 }).map((p) => p.code)).toContain('CH-09180');
    expect(validateForm({ ...base, playerIds: ['p1'], countBest: 2 }).map((p) => p.code)).not.toContain('CH-09180');
  });

  it('offers Every round and Best 1 or 2 of 3, and saves the choice with the new qualifier', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    wrap(<QualifierForm data={{ ...previewCreateForm(), initial: base }} writes={writes} />);
    expect([...count().options].map((o) => o.textContent)).toEqual(['Every round', 'Best 1 of 3 rounds', 'Best 2 of 3 rounds']);
    expect(count().value).toBe('all');
    await user.selectOptions(count(), '2');
    expect(document.getElementById(count().getAttribute('aria-describedby')!)!.textContent).toMatch(/best 2 rounds add up; their worst round is dropped/);
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await waitFor(() => expect(writes.saveRules).toHaveBeenCalledWith('q-new', { tieRule: 'last_round', countBest: 2 }));
  });

  it('an edit sends the rules when only the counting changed; locked when the store is held', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    const { unmount } = wrap(<QualifierForm data={previewEditForm()} writes={writes} />);
    await user.selectOptions(count(), '1');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes.saveEdit).toHaveBeenCalledTimes(1));
    expect(writes.saveEdit.mock.calls[0]![1]).toMatchObject({ rules: { countBest: 1 } });
    unmount();
    wrap(<QualifierForm data={{ ...previewEditForm(), rulesState: 'missing' }} writes={fakeWrites()} />);
    expect(count().disabled).toBe(true);
  });
});

describe('Qualifier exemptions · the form (F-06)', () => {
  const base = { ...previewCreateForm().initial, name: 'Fall qualifier', startDate: '2026-10-19', rounds: '3', squad: '5', picks: '1' };

  it('CH-09181 never more exempt than picks; CH-09182 each needs a reason; a player taken out is no longer exempt', () => {
    const two = [
      { playerId: 'p1', reason: 'x' },
      { playerId: 'p2', reason: 'y' },
    ];
    expect(validateForm({ ...base, playerIds: ['p1', 'p2'], exempt: two }).map((p) => p.code)).toContain('CH-09181');
    expect(validateForm({ ...base, playerIds: ['p1'], exempt: two }).map((p) => p.code)).not.toContain('CH-09181');
    expect(validateForm({ ...base, playerIds: ['p1'], exempt: [{ playerId: 'p1', reason: ' ' }] }).map((p) => p.code)).toContain('CH-09182');
  });

  it('90183 90982 exempts an entrant with a reason and saves it with the new qualifier', async () => {
    const user = userEvent.setup();
    const writes = fakeWrites();
    const save = vi.fn<NonNullable<ChQWrites['saveExemptions']>>(async () => ({ success: true }));
    const data = previewCreateForm();
    const first = data.players[0]!;
    wrap(<QualifierForm data={{ ...data, initial: { ...data.initial, ...base, playerIds: data.initial.playerIds } }} writes={{ ...writes, saveExemptions: save }} />);
    await user.click(screen.getByRole('checkbox', { name: `Exempt ${first.name}` }));
    await user.type(screen.getByLabelText(`Why ${first.name} is exempt`), 'Conference champion');
    await user.click(screen.getByRole('button', { name: 'Create qualifier' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('q-new', [{ playerId: first.id, reason: 'Conference champion' }]));
  });

  it('CH-09282 exemptions that did not load are said in words; with no store yet the field is not offered', () => {
    const { unmount } = wrap(<QualifierForm data={{ ...previewEditForm(), exemptState: 'error' }} writes={fakeWrites()} />);
    expect(document.querySelector('[data-ch-code="CH-09282"]')!.textContent).toMatch(/Exemptions didn’t load/);
    unmount();
    wrap(<QualifierForm data={{ ...previewCreateForm(), exemptState: 'missing' }} writes={fakeWrites()} />);
    expect(screen.queryByText('Exempt players')).toBeNull();
  });
});

describe('Next round groups (F-06)', () => {
  const field = Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, classYear: null }));
  // After round 1: p0 shoots 70, p1 71 … p8 78; p9 has no score yet.
  const r1 = field.slice(0, 9).map((e, i) => rd(e.playerId, 1, 70 + i));
  const board1 = buildBoard({ entrants: field, rounds: r1, squad: 5, picks: 0, status: 'in_progress', selectionState: 'open', selections: null, numRounds: 3 });

  it('groups as evenly as the field allows, leaders off last and players with no score off first', () => {
    const p = nextRoundPairings(board1, 3, 4)!;
    expect(p.round).toBe(2);
    expect(p.groups.map((g) => g.players.map((x) => x.playerId))).toEqual([
      ['p7', 'p8', 'p9'],
      ['p4', 'p5', 'p6'],
      ['p0', 'p1', 'p2', 'p3'],
    ]);
    expect(nextRoundPairings(board1, 3, 3)!.groups.map((g) => g.players.length)).toEqual([2, 2, 3, 3]);
  });

  it('none before round 1 is in or once every round is in', () => {
    const empty = buildBoard({ entrants: field, rounds: [], squad: 5, picks: 0, status: 'upcoming', selectionState: 'open', selections: null, numRounds: 3 });
    expect(nextRoundPairings(empty, 3, 3)).toBeNull();
    expect(nextRoundPairings(board1, 1, 3)).toBeNull();
  });

  it('90184 the coach sees Round 2 groups and switches to fours', async () => {
    const user = userEvent.setup();
    wrap(<Pairings board={board1} numRounds={3} status="in_progress" />);
    const section = screen.getByRole('region', { name: 'Round 2 groups' });
    expect(section.querySelectorAll('li')).toHaveLength(4);
    await user.click(screen.getByRole('radio', { name: 'Fours' }));
    expect(section.querySelectorAll('li')).toHaveLength(3);
    expect(section.querySelectorAll('li')[2]!.textContent).toContain('P0, P1, P2, P3');
  });
});
