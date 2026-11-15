// @vitest-environment jsdom
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/qualifiers/q1/selection' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/app/golf/actions/v3/qualifying', () => ({ advanceSelectionState: vi.fn(), chooseQualifierTiePlace: vi.fn(), confirmQualifierSelection: vi.fn(), removeQualifierCoachPick: vi.fn(), setQualifierCoachPick: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import type { ChQCandidate, ChQSelectionData } from '../../../data/qualifiers';
import { ToastProvider } from '../../../ui/Toast';
import { buildBoard, type ChQEntrant, type ChQRound } from '../model';
import { QualifierSelection } from '../QualifierSelection';
import type { ChQSelectionWrites } from '../writes';

afterEach(cleanup);

/**
 * The owner's two rules for the leaderboard and Manage selections (audit P009, "the first thing to test next"):
 *   1. a card a round short ranks below every full card, whatever its to par;
 *   2. Confirm squad saves the squad in the board's order.
 * The order itself is decided once (lib/coachhelm/v3/qualifying/ranking.ts, tested there and on the server's confirm).
 * These tests hold the Clubhouse end of it: the board places with that order, and the workspace draws and confirms the
 * candidates as given, never re-sorted.
 */

/** Four entrants over two rounds. Bea skipped round 2 and has the best to par of anyone. */
const FIELD: Array<{ id: string; name: string; rounds: Array<[total: number, toPar: number]> }> = [
  { id: 'ana', name: 'Ana Ortiz', rounds: [[74, 2], [74, 2]] },
  { id: 'bea', name: 'Bea Lund', rounds: [[70, -2]] },
  { id: 'cy', name: 'Cy Marsh', rounds: [[75, 3], [75, 3]] },
  { id: 'dee', name: 'Dee Park', rounds: [[77, 5], [76, 4]] },
];
const entrants: ChQEntrant[] = FIELD.map((p) => ({ playerId: p.id, name: p.name, classYear: null }));
const rounds: ChQRound[] = FIELD.flatMap((p) => p.rounds.map(([total, toPar], i) => ({ id: `${p.id}-${i + 1}`, playerId: p.id, number: i + 1, total, toPar, date: `2026-10-0${i + 1}`, course: null, holesPlayed: 18 })));
const board = (status: 'in_progress' | 'completed' = 'in_progress') => buildBoard({ entrants, rounds, squad: 3, picks: 1, status, selectionState: 'scoring', selections: null, numRounds: 2 });

/** Manage selections as the server hands it over: the candidates in the board's order, the top two on score. */
function selection(state: ChQSelectionData['selectionState'], pick?: string): ChQSelectionData {
  const candidates: ChQCandidate[] = board().rows.map((r, i) => ({
    playerId: r.playerId,
    name: r.name,
    rank: i + 1,
    toPar: r.toPar,
    total: r.total,
    rounds: r.played,
    onScore: i < 2,
    pick: r.playerId === pick ? { reasoning: 'Steady in the wind' } : null,
    selected: false,
  }));
  return { id: 'q1', name: 'Order qualifier', status: 'in_progress', selectionState: state, squad: 3, picks: 1, candidates };
}

const ok = async () => ({ success: true });
const writes = (): ChQSelectionWrites => ({ advance: vi.fn(ok), setPick: vi.fn(ok), removePick: vi.fn(ok), chooseTie: vi.fn(ok), confirm: vi.fn(ok) }) as unknown as ChQSelectionWrites;
const draw = (data: ChQSelectionData, w: ChQSelectionWrites) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <QualifierSelection data={data} writes={w} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
const names = (region: HTMLElement) => within(region).getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent);

describe('a card a round short ranks below full cards', () => {
  it('on the board: Bea’s one round at −2 is the best to par and still stands last, outside the places on score', () => {
    const b = board();
    expect(b.rows.map((r) => r.playerId)).toEqual(['ana', 'cy', 'dee', 'bea']);
    expect(b.rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    const bea = b.rows[3]!;
    expect(bea.toPar).toBeLessThan(Math.min(...b.rows.slice(0, 3).map((r) => r.toPar as number)));
    expect(bea.played).toBe(1);
    // The two places on score are full cards; the short card is on neither side of a line by its to par.
    expect(b.rows.filter((r) => r.state === 'qualifying').map((r) => r.playerId)).toEqual(['ana', 'cy']);
    expect(bea.state).not.toBe('qualifying');
  });

  it('once the qualifier is closed the short card is still last, and says it missed a round', () => {
    const b = board('completed');
    expect(b.rows.map((r) => r.playerId)).toEqual(['ana', 'cy', 'dee', 'bea']);
    expect(b.rows.filter((r) => r.state === 'qualified').map((r) => r.playerId)).toEqual(['ana', 'cy']);
    expect(b.rows.map((r) => r.missed)).toEqual([false, false, false, true]);
  });

  it('in Manage selections: the lists keep the order given, so the short card stays under the full cards it out-scores', () => {
    draw(selection('scoring'), writes());
    expect(names(screen.getByRole('region', { name: 'On score now' }))).toEqual(['Ana Ortiz', 'Cy Marsh']);
    const rest = screen.getByRole('region', { name: 'Rest of the field' });
    expect(names(rest)).toEqual(['Dee Park', 'Bea Lund']);
    // Her row says why: one round, and the best figure on the page.
    const bea = within(rest).getAllByRole('listitem')[1]!;
    expect(bea.textContent).toContain('1 round');
    expect(bea.textContent).toContain('−2');
  });
});

describe('Confirm squad saves in the board’s order', () => {
  it('sends the places on score as ranked, then the picks, and never the short card that out-scores them', async () => {
    const user = userEvent.setup();
    const w = writes();
    draw(selection('closed', 'dee'), w);
    await user.click(screen.getByRole('button', { name: 'Confirm squad' }));
    // The question names the same squad in the same order before anything is written.
    const dialog = await waitFor(() => {
      const d = document.querySelector('[data-ch-code="CH-09505"]');
      expect(d).not.toBeNull();
      return d as HTMLElement;
    });
    expect(dialog.textContent).toMatch(/3 players make the trip: Ana Ortiz, Cy Marsh.*Dee Park/);
    expect(dialog.textContent).not.toContain('Bea Lund');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm squad' }));
    await waitFor(() => expect(w.confirm).toHaveBeenCalledTimes(1));
    expect(w.confirm).toHaveBeenCalledWith('q1', ['ana', 'cy', 'dee']);
  });

  it('keeps the order it was given even when that is not the order of the figures', async () => {
    // The server's order is the only one: handed the candidates with the short card ranked second (as no board would),
    // the page still confirms them as given. Nothing on this side sorts by to par.
    const user = userEvent.setup();
    const w = writes();
    const given = selection('closed', 'dee');
    const [ana, cy, dee, bea] = given.candidates as [ChQCandidate, ChQCandidate, ChQCandidate, ChQCandidate];
    const data: ChQSelectionData = { ...given, candidates: [{ ...cy, rank: 1 }, { ...ana, rank: 2 }, { ...dee, rank: 3 }, { ...bea, rank: 4 }] };
    draw(data, w);
    expect(names(screen.getByRole('region', { name: 'On score now' }))).toEqual(['Cy Marsh', 'Ana Ortiz']);
    await user.click(screen.getByRole('button', { name: 'Confirm squad' }));
    const dialog = await waitFor(() => {
      const d = document.querySelector('[data-ch-code="CH-09505"]');
      expect(d).not.toBeNull();
      return d as HTMLElement;
    });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm squad' }));
    await waitFor(() => expect(w.confirm).toHaveBeenCalledWith('q1', ['cy', 'ana', 'dee']));
  });
});
