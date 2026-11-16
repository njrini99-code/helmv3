import { describe, expect, it } from 'vitest';
import { advancesAfter, cellKey, gridCards, gridErrors, gridFor, readCell, rowHoles, rowSum, shownHoles } from '../grid';
import type { ChTourHoleLedger } from '../../types';
import { COURSE, PARS, ROSTER, card, event, pr } from './fixtures';

const ledger = (cards: ChTourHoleLedger['cards']): ChTourHoleLedger => ({ courseId: 'pin', pars: PARS, handicaps: [], totalsOnly: [], cards });
const holes = (strokes: Array<number | null>) => strokes.map((s, i) => ({ n: i + 1, par: PARS[i]!, strokes: s, source: 'card' as const, disputed: false }));

describe('hole grid: the rows', () => {
  it('lists the round’s players, lineup by slot, never the alternate, with what is saved and what is locked', () => {
    const ev = event({
      playerRounds: [
        pr({ playerId: 'theo', roundNumber: 1, roundId: 'g2', total: 73, holesKnown: true, cardOpen: false }),
        pr({ playerId: 'sofia', roundNumber: 1, total: 74 }),
        pr({ playerId: 'ava', roundNumber: 1, roundId: 'g1', holesKnown: true, cardOpen: true }),
      ],
    });
    const g = gridFor(ev, ROSTER, ledger([{ playerId: 'ava', roundNumber: 1, roundEventId: 'r1', startHole: 1, holes: holes([4, 5, ...Array(16).fill(null)]) }]), { pin: COURSE }, 1);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.grid.rows.map((r) => r.playerId)).toEqual(['ava', 'theo', 'sofia', 'jonah', 'eli']);
    expect(g.grid.rows[0]!.saved.slice(0, 3)).toEqual([4, 5, null]);
    expect(g.grid.rows[1]!.locked).toBe('submitted');
    expect(g.grid.rows[2]!.entered).toBe(74);
    expect(g.grid.pars).toEqual(PARS);
  });

  it('says why there is no grid: a round the event lacks, a course without hole pars', () => {
    expect(gridFor(event(), ROSTER, null, { pin: COURSE }, 3)).toEqual({ ok: false, why: 'no_round' });
    expect(gridFor(event(), ROSTER, null, { pin: { ...COURSE, holes: [] } }, 1)).toEqual({ ok: false, why: 'no_pars' });
    expect(gridFor(event({ entries: [] }), ROSTER, null, { pin: COURSE }, 1)).toEqual({ ok: false, why: 'no_players' });
  });
});

describe('hole grid: cells and the save', () => {
  it('reads a cell: a score, nothing, or why not', () => {
    expect(readCell('4', null)).toEqual({ value: 4 });
    expect(readCell(' ', null)).toEqual({ value: null });
    expect(readCell('', 5)).toEqual({ error: 'cleared' });
    expect(readCell('0', null)).toEqual({ error: 'not_a_score' });
    expect(readCell('x', null)).toEqual({ error: 'not_a_score' });
    expect(readCell('16', null)).toEqual({ error: 'too_many' });
  });

  it('moves on after a whole score and waits after a 1', () => {
    expect(advancesAfter('4')).toBe(true);
    expect(advancesAfter('1')).toBe(false);
    expect(advancesAfter('12')).toBe(true);
    expect(advancesAfter('')).toBe(false);
  });

  it('sends only rows that changed, as cards, replacing an entered total, never a submitted round', () => {
    const ev = event({ playerRounds: [pr({ playerId: 'theo', roundNumber: 1, roundId: 'g2', total: 73, holesKnown: true, cardOpen: false }), pr({ playerId: 'sofia', roundNumber: 1, total: 74 })] });
    const g = gridFor(ev, ROSTER, ledger([{ playerId: 'ava', roundNumber: 1, roundEventId: 'r1', startHole: 1, holes: holes(card(0)) }]), { pin: COURSE }, 1);
    if (!g.ok) throw new Error('no grid');
    const edits = {
      // Ava's saved card typed the same: no change.
      [cellKey('ava', 1)]: '4',
      [cellKey('theo', 1)]: '5',
      [cellKey('sofia', 1)]: '5',
      [cellKey('sofia', 2)]: '4',
      [cellKey('jonah', 1)]: '1',
    };
    const cards = gridCards(g.grid, edits);
    expect(cards.map((c) => c.playerId)).toEqual(['sofia', 'jonah']);
    expect(cards[0]).toMatchObject({ roundEventId: 'r1', holes: [5, 4, ...Array(16).fill(null)], pars: PARS, total: null, status: 'ok', replace: true });
    expect(cards[1]!.replace).toBe(false);
  });

  it('a hole typed for a WD or DQ player keeps their status: it corrects strokes, never reinstates them', () => {
    const ev = event({ playerRounds: [pr({ playerId: 'sofia', roundNumber: 1, total: 74, status: 'wd' }), pr({ playerId: 'jonah', roundNumber: 1, status: 'dq_pending' })] });
    const g = gridFor(ev, ROSTER, null, { pin: COURSE }, 1);
    if (!g.ok) throw new Error('no grid');
    const cards = gridCards(g.grid, { [cellKey('sofia', 1)]: '5', [cellKey('jonah', 1)]: '4', [cellKey('eli', 1)]: '4' });
    expect(Object.fromEntries(cards.map((c) => [c.playerId, c.status]))).toEqual({ sofia: 'wd', jonah: 'dq_pending', eli: 'ok' });
  });

  it('holds back a row with a cell it can’t read, and names the cell', () => {
    const g = gridFor(event(), ROSTER, ledger([{ playerId: 'ava', roundNumber: 1, roundEventId: 'r1', startHole: 1, holes: holes(card(0)) }]), { pin: COURSE }, 1);
    if (!g.ok) throw new Error('no grid');
    const edits = { [cellKey('ava', 3)]: '', [cellKey('eli', 2)]: 'x' };
    expect(gridErrors(g.grid, edits)).toEqual([
      { playerId: 'ava', hole: 3, error: 'cleared' },
      { playerId: 'eli', hole: 2, error: 'not_a_score' },
    ]);
    expect(rowHoles(g.grid.rows[0]!, edits)).toBeNull();
    expect(gridCards(g.grid, edits)).toEqual([]);
    // The sums keep going while the coach fixes it: the bad cell counts as what is saved there.
    const eli = g.grid.rows.find((r) => r.playerId === 'eli')!;
    expect(shownHoles(eli, { ...edits, [cellKey('eli', 1)]: '4' }).slice(0, 3)).toEqual([4, null, null]);
    expect(shownHoles(g.grid.rows[0]!, edits)[2]).toBe(card(0)[2]);
  });

  it('sums what is there, and to par over those holes', () => {
    expect(rowSum([4, 5, null, 5], PARS)).toEqual({ strokes: 14, toPar: 2, played: 3 });
  });
});
