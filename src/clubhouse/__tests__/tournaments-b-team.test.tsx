import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { LineupBuilder } from '../screens/tournaments/LineupBuilder';
import { draftOf, entriesOf, nextOpen, place, sameDraft, whereIs, whereWords } from '../screens/tournaments/lineup-model';
import type { ChTourLineupData } from '../screens/tournaments/types';
import './dialog-polyfill';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const setEntries = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments', () => ({ setTournamentEntries: setEntries, publishTournamentLineup: vi.fn(), lockTournamentLineup: vi.fn() }));
vi.mock('../ui/Toast', async (orig) => ({ ...(await orig<typeof import('../ui/Toast')>()), useToast: () => vi.fn(), useDelayedToast: () => () => () => {} }));

beforeEach(() => {
  setEntries.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

/**
 * F-05 in the lineup builder: a B team (160180), stored as individuals of squad B so it never counts in the team's record
 * (D-92), and an honest lock time (160181, CH-16382): nothing locks the lineup at its lock time, so the head says
 * "Lock by", and once it has passed, says so.
 */
const fx = tourFixture('ready').lineup;
const bench = fx.players.filter((p) => !p.alumni && !fx.slots.some((s) => s.playerId === p.id) && fx.alternate !== p.id && !fx.individuals.includes(p.id));
const withB = (over: Partial<ChTourLineupData> = {}): ChTourLineupData => ({ ...fx, bTeam: { slots: [], alternate: null }, ...over });
const draw = (d: ChTourLineupData) => render(<LineupBuilder data={d} load="ready" phone={false} />).container;

describe('B team (F-05)', () => {
  it('160180 the model keeps one role a player, swaps within the B spots, and sends B players as squad B individuals', () => {
    const d0 = draftOf(withB());
    expect(d0.b?.slots).toHaveLength(fx.slots.length);
    const [p, q] = [bench[0]!.id, bench[1]!.id];
    let d = place(d0, p, { kind: 'bslot', slot: 1 });
    d = place(d, q, { kind: 'bslot', slot: 2 });
    expect(whereWords(whereIs(d, p))).toBe('B spot 1');
    // A reorder swaps, losing nobody.
    d = place(d, p, { kind: 'bslot', slot: 2 });
    expect(d.b?.slots.slice(0, 2)).toEqual([q, p]);
    // Moving a B player into the A lineup takes them off the B team.
    const a = place(d, q, { kind: 'slot', slot: 5 });
    expect(a.b?.slots[0]).toBeNull();
    expect(nextOpen(a, 'B')).toEqual({ kind: 'bslot', slot: 1 });
    expect(entriesOf(d).filter((e) => e.squad === 'B')).toEqual([
      { playerId: q, role: 'individual', slot: 1, squad: 'B' },
      { playerId: p, role: 'individual', slot: 2, squad: 'B' },
    ]);
    // No A entry carries a squad: a save with no B team is the payload it always was.
    expect(entriesOf(d).filter((e) => e.squad !== 'B').every((e) => !('squad' in e))).toBe(true);
    expect(sameDraft(d0, draftOf(withB()))).toBe(true);
    expect(sameDraft(d0, d)).toBe(false);
  });

  it('a saved B player with no spot takes the first free one; with no B team read, the draft holds none', () => {
    const d = draftOf(withB({ bTeam: { slots: [{ playerId: bench[0]!.id, slot: null }], alternate: bench[1]!.id } }));
    expect(d.b?.slots[0]).toBe(bench[0]!.id);
    expect(d.b?.alternate).toBe(bench[1]!.id);
    expect(draftOf(fx).b).toBeUndefined();
  });

  it('160180 the builder offers the B team only when the event can hold one, says it never counts, and saves it', async () => {
    draw(fx);
    expect(screen.queryByRole('radiogroup', { name: 'Team' })).toBeNull();
    cleanup();
    setEntries.mockResolvedValue({ success: true, data: { version: (fx.version ?? 0) + 1 } });
    const c = draw(withB());
    fireEvent.click(screen.getByRole('radio', { name: 'B team' }));
    expect(c.textContent).toContain('The B team plays as individuals: its scores never count in the team’s record.');
    fireEvent.change(screen.getByLabelText('B spot 1'), { target: { value: bench[0]!.id } });
    expect(c.textContent).toContain('B team 1 of');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(setEntries).toHaveBeenCalledTimes(1));
    expect(setEntries.mock.calls[0]![1]).toContainEqual({ playerId: bench[0]!.id, role: 'individual', slot: 1, squad: 'B' });
  });

  it('160181 the head says "Lock by", and CH-16382 says so once the lock time has passed', () => {
    expect(fx.lineup.status).toBe('draft');
    const before = draw({ ...fx, now: '2026-10-19T12:00:00-04:00' });
    expect(before.textContent).toMatch(/Lock by /);
    expect(before.querySelector('[data-ch-code="CH-16382"]')).toBeNull();
    cleanup();
    const after = draw({ ...fx, now: '2026-10-20T08:00:00-04:00' });
    expect(after.querySelector('[data-ch-code="CH-16382"]')?.textContent).toMatch(/has passed\. Lock the lineup now; it locks itself when round 1 starts\.$/);
  });
});
