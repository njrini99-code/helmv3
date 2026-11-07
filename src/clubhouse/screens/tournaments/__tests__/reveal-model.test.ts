import { describe, expect, it } from 'vitest';
import { cardOf, countingIn, revealOf, type FinalScore, type MyLineupRow } from '../reveal-model';
import type { ChTourPlayer, ChTourRound, TourFormat } from '../types';

const F: TourFormat = { kind: '5c4', players: 5, counting: 4, holes: 18 };
const round = (status: ChTourRound['status'], id = 'r1'): ChTourRound => ({ roundEventId: id, eventId: 'e', number: 1, date: '2026-11-12', courseId: 'c', startType: 'tee_times', firstTeeAt: null, status, par: 72, thirtySix: false });
const lineupRow = (myRole: 'lineup' | 'alternate' | 'individual' | null = 'lineup'): MyLineupRow['rounds'][number] => ({
  round_event_id: 'r1',
  round_number: 1,
  my_role: myRole,
  my_slot: myRole === 'lineup' ? 2 : null,
  players: ['a', 'b', 'c', 'd', 'e'].map((p, i) => ({ player_id: p, slot: i + 1 })),
});
const scores = (totals: Record<string, number | null>): Map<string, FinalScore> => new Map(Object.entries(totals).map(([k, v]) => [k, { total: v, status: 'ok' as const }]));

describe('countingIn (did my score count, by the scoring engine’s rule)', () => {
  it('counts the best four of five and drops the fifth', () => {
    const s = scores({ a: 70, b: 72, c: 73, d: 75, e: 78 });
    expect(countingIn('b', lineupRow(), s, F, 72)).toBe('counted');
    expect(countingIn('e', lineupRow(), s, F, 72)).toBe('dropped');
  });

  it('says tied at the line when two scores share the last counting place', () => {
    const s = scores({ a: 70, b: 72, c: 73, d: 75, e: 75 });
    expect(countingIn('d', lineupRow(), s, F, 72)).toBe('tie');
  });

  it('is pending until the round has enough scores, never a guess', () => {
    expect(countingIn('b', lineupRow(), scores({ a: 70, b: 72, c: null, d: null, e: null }), F, 72)).toBe('pending');
    expect(countingIn('b', { ...lineupRow(), players: [] }, scores({}), F, 72)).toBe('pending');
  });

  it('a withdrawn player cannot count', () => {
    const s = scores({ a: 70, b: 72, c: 73, d: 75, e: 78 });
    s.set('a', { total: 70, status: 'wd' });
    expect(countingIn('a', lineupRow(), s, F, 72)).toBe('dropped');
  });

  it('only a lineup player counts: the alternate and an individual have their own words', () => {
    expect(countingIn('x', lineupRow('alternate'), scores({}), F, 72)).toBe('not_playing');
    expect(countingIn('x', lineupRow('individual'), scores({}), F, 72)).toBe('individual');
    expect(countingIn('x', lineupRow(null), scores({}), F, 72)).toBe('not_playing');
  });
});

describe('cardOf (the player’s own card for the round in play)', () => {
  const holes = Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4 }));
  const mine = (role: 'lineup' | 'alternate' | 'individual' | null) => ({ ...lineupRow(role), my_role: role });

  it('is the course’s holes with what is scored, for a live round the player plays', () => {
    const card = cardOf(round('live'), mine('lineup'), holes, 18, new Map([[1, 4], [2, null]]), false)!;
    expect(card.holes).toHaveLength(18);
    expect(card.holes[0]).toEqual({ n: 1, par: 4, strokes: 4 });
    expect(card.holes[1]!.strokes).toBeNull();
    expect(cardOf(round('live'), mine('individual'), holes, 18, new Map(), false)).not.toBeNull();
  });

  it('is nothing unless the round is live, they play it, the holes are known and no total is entered', () => {
    expect(cardOf(round('upcoming'), mine('lineup'), holes, 18, new Map(), false)).toBeNull();
    expect(cardOf(round('final'), mine('lineup'), holes, 18, new Map(), false)).toBeNull();
    expect(cardOf(round('live'), mine('alternate'), holes, 18, new Map(), false)).toBeNull();
    expect(cardOf(round('live'), undefined, holes, 18, new Map(), false)).toBeNull();
    expect(cardOf(round('live'), mine('lineup'), holes.slice(0, 12), 18, new Map(), false)).toBeNull();
    expect(cardOf(round('live'), mine('lineup'), holes, 18, new Map(), true)).toBeNull();
  });

  it('a nine-hole event takes the first nine holes', () => {
    expect(cardOf(round('live'), mine('lineup'), holes, 9, new Map(), false)!.holes).toHaveLength(9);
  });
});

describe('revealOf', () => {
  const players: ChTourPlayer[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `${id.toUpperCase()} Name`, first: id, initials: id, year: 'Junior', avatarUrl: null, alumni: false, availability: 'available' }));
  const row = (role: MyLineupRow['role']): MyLineupRow => ({ published_at: '2026-11-10T12:00:00Z', locked_at: null, role, slot: role === 'lineup' ? 2 : null, rounds: [lineupRow(role === 'not_travelling' ? null : (role as 'lineup'))] });
  const ctx = (status: ChTourRound['status'], by: Map<string, FinalScore> = scores({ a: 70, b: 72, c: 73, d: 75, e: 78 })) => ({ playerId: 'b', format: F, rounds: [round(status)], players, scoresByRound: new Map([['r1', by]]) });

  it('is nothing until the coach publishes (the function answered nothing)', () => {
    expect(revealOf(null, ctx('final'))).toBeNull();
  });

  it('names the player’s spot and the lineup in spot order, with counting once the round is final', () => {
    const r = revealOf(row('lineup'), ctx('final'))!;
    expect(r).toMatchObject({ status: 'lineup', slot: 2, of: 5 });
    expect(r.lineup).toEqual(['A Name', 'B Name', 'C Name', 'D Name', 'E Name']);
    expect(r.counting).toEqual([{ roundNumber: 1, state: 'counted' }]);
  });

  it('counting is pending while the round is still being played', () => {
    expect(revealOf(row('lineup'), ctx('live'))!.counting).toEqual([{ roundNumber: 1, state: 'pending' }]);
  });

  it('an alternate sees their role, no lineup and no counting', () => {
    const r = revealOf({ ...row('alternate'), rounds: [{ ...lineupRow('alternate'), players: [] }] }, ctx('final'))!;
    expect(r).toMatchObject({ status: 'alternate', slot: null, lineup: [] });
    expect(r.counting).toEqual([{ roundNumber: 1, state: 'not_playing' }]);
  });

  it('a player who is not travelling is told so', () => {
    expect(revealOf({ ...row('not_travelling'), rounds: [{ ...lineupRow(null), players: [] }] }, ctx('final'))!.status).toBe('not_travelling');
  });
});
