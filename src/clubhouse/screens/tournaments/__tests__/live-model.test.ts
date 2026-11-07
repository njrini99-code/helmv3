import { describe, expect, it } from 'vitest';
import { buildLive, progressOf, type LiveHoleRow } from '../live-model';
import { emptyForm, formOf, validateScore } from '../score-entry';
import type { ChTourEvent, ChTourPlayerRound, ChTourRound } from '../types';

const round: ChTourRound = { roundEventId: 're1', eventId: 'e1', number: 1, date: '2026-11-07', courseId: 'c', startType: 'tee_times', firstTeeAt: '2026-11-07T08:00:00-05:00', status: 'live', par: 72, thirtySix: false };
const pr = (playerId: string, role: 'lineup' | 'individual', slot: number | null, total: number | null, over: Partial<ChTourPlayerRound> = {}): ChTourPlayerRound =>
  ({ eventId: 'e1', roundEventId: 're1', roundNumber: 1, playerId, role, slot, squad: 'A', total, toPar: total == null ? null : total - 72, status: 'ok', source: 'coach', trust: 'live', roundId: null, holesKnown: false, shotData: false, officialTotal: null, count: 'none', ...over }) as ChTourPlayerRound;
const event = (playerRounds: ChTourPlayerRound[]): ChTourEvent =>
  ({ id: 'e1', format: { kind: '5c4', players: 5, counting: 4, holes: 18 }, rounds: [round], entries: [], playerRounds }) as unknown as ChTourEvent;
const hole = (roundId: string, n: number, par: number, score: number | null): LiveHoleRow => ({ roundId, hole: n, par, score });

describe('progressOf (holes a linked round has scored so far)', () => {
  it('counts only scored holes, in hole order, and sums to par', () => {
    const p = progressOf([hole('g', 3, 4, 5), hole('g', 1, 4, 3), hole('g', 2, 3, 3), hole('g', 4, 5, null)]);
    expect(p.thru).toBe(3);
    expect(p.holes.map((h) => h.n)).toEqual([1, 2, 3]);
    expect(p.toPar).toBe(0);
  });

  it('has no to-par when a scored hole has no par (never a guess)', () => {
    expect(progressOf([{ roundId: 'g', hole: 1, par: null, score: 4 }]).toPar).toBeNull();
    expect(progressOf([]).thru).toBe(0);
  });
});

describe('buildLive (the lanes and the team line)', () => {
  it('counts the best four of five to par from finished totals, and says who counts', () => {
    const e = event([pr('a', 'lineup', 1, 70), pr('b', 'lineup', 2, 72), pr('c', 'lineup', 3, 73), pr('d', 'lineup', 4, 75), pr('e', 'lineup', 5, 78)]);
    const { lanes, team } = buildLive(e, round);
    expect(team.kind).toBe('complete');
    expect(team.total).toBe(70 + 72 + 73 + 75);
    expect(team.toPar).toBe(70 + 72 + 73 + 75 - 72 * 4);
    expect(lanes.find((l) => l.playerId === 'e')!.count).toBe('dropped');
    expect(lanes.find((l) => l.playerId === 'a')).toMatchObject({ count: 'counted', thru: 18, toPar: -2 });
    expect(lanes.map((l) => l.slot)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is live while a linked round is on the course, from its holes, and says how many counting scores are in', () => {
    const e = event([pr('a', 'lineup', 1, null, { roundId: 'ga' }), pr('b', 'lineup', 2, null, { roundId: 'gb' }), pr('c', 'lineup', 3, 71), pr('d', 'lineup', 4, null)]);
    const holes = new Map([
      ['ga', [hole('ga', 1, 4, 3), hole('ga', 2, 4, 4), hole('ga', 3, 3, 2)]],
      ['gb', [hole('gb', 1, 4, 5)]],
    ]);
    const { lanes, team } = buildLive(e, round, holes);
    expect(team.kind).toBe('live');
    // a is -2 through 3, c finished at -1, b is +1 through 1; d has not started: three are in.
    expect(team.toPar).toBe(-2 + -1 + 1);
    expect(team.counting).toEqual(['a', 'c', 'b']);
    expect(team.short).toBe(1);
    expect(lanes.find((l) => l.playerId === 'a')).toMatchObject({ thru: 3, toPar: -2, count: 'counted' });
    expect(lanes.find((l) => l.playerId === 'd')).toMatchObject({ thru: null, toPar: null });
    expect(lanes.find((l) => l.playerId === 'a')!.holes).toHaveLength(3);
  });

  it('keeps the holes of a finished linked card on its lane (so they can be corrected), and does not call it live', () => {
    const e = event([pr('a', 'lineup', 1, 74, { roundId: 'ga' }), pr('b', 'lineup', 2, 72), pr('c', 'lineup', 3, 73), pr('d', 'lineup', 4, 75)]);
    const holes = new Map([['ga', Array.from({ length: 18 }, (_, i) => hole('ga', i + 1, 4, i === 0 ? 6 : 4))]]);
    const { lanes, team } = buildLive(e, round, holes);
    expect(lanes.find((l) => l.playerId === 'a')).toMatchObject({ thru: 18, toPar: 2 });
    expect(lanes.find((l) => l.playerId === 'a')!.holes).toHaveLength(18);
    expect(team.kind).toBe('complete');
  });

  it('keeps a withdrawn or disqualified player out of the count and says so', () => {
    const e = event([pr('a', 'lineup', 1, 70), pr('b', 'lineup', 2, 72), pr('c', 'lineup', 3, 73), pr('d', 'lineup', 4, 74), pr('e', 'lineup', 5, 76, { status: 'dq' })]);
    const { lanes, team } = buildLive(e, round);
    expect(team.counting).not.toContain('e');
    expect(lanes.find((l) => l.playerId === 'e')).toMatchObject({ status: 'dq', count: 'dropped' });
  });

  it('shows an individual apart from the team and never counts them', () => {
    const e = event([pr('a', 'lineup', 1, 70), pr('b', 'lineup', 2, 71), pr('c', 'lineup', 3, 72), pr('d', 'lineup', 4, 73), pr('i', 'individual', null, 60)]);
    const { lanes, team } = buildLive(e, round);
    expect(team.counting).not.toContain('i');
    expect(lanes.find((l) => l.playerId === 'i')).toMatchObject({ role: 'individual', count: 'individual' });
    expect(lanes[lanes.length - 1]!.playerId).toBe('i');
  });

  it('has a lane for everyone in the lineup before any score, and no team line', () => {
    const e = { ...event([]), entries: [{ playerId: 'a', role: 'lineup', slot: 1, squad: 'A' }, { playerId: 'b', role: 'alternate', slot: null, squad: 'A' }, { playerId: 'c', role: 'lineup', slot: 2, squad: 'A' }] } as unknown as ChTourEvent;
    const { lanes, team } = buildLive(e, { ...round, status: 'upcoming' });
    expect(lanes.map((l) => l.playerId)).toEqual(['a', 'c']);
    expect(lanes.every((l) => l.thru === null && l.toPar === null)).toBe(true);
    expect(team.kind).toBe('none');
  });
});

describe('validateScore (the Enter score sheet)', () => {
  const form = (over: Partial<ReturnType<typeof emptyForm>>) => ({ ...emptyForm(), ...over });

  it('turns a total into the action’s input', () => {
    expect(validateScore(form({ total: '71' }))).toEqual({ ok: true, clears: false, input: { total: 71, front: null, back: null, status: 'ok', wdAfterHole: null, note: null } });
  });

  it('keeps the nines only when they add to the total', () => {
    expect(validateScore(form({ total: '71', front: '35', back: '36' }))).toMatchObject({ ok: true });
    expect(validateScore(form({ total: '71', front: '35', back: '37' }))).toEqual({ ok: false, errors: { total: 'The nines add to 72, not 71.' } });
  });

  it('refuses a total outside 20 to 200 and words that are not numbers', () => {
    expect(validateScore(form({ total: '19' }))).toMatchObject({ ok: false, errors: { total: 'Enter the round total, from 20 to 200.' } });
    expect(validateScore(form({ total: '201' }))).toMatchObject({ ok: false });
    expect(validateScore(form({ total: 'seventy' }))).toMatchObject({ ok: false });
  });

  it('wants the total when only a nine is given', () => {
    expect(validateScore(form({ front: '35' }))).toMatchObject({ ok: false, errors: { total: 'Enter the round total as well.' } });
  });

  it('lets a withdrawal go without a total, and keeps the hole', () => {
    const r = validateScore(form({ status: 'wd', wdAfterHole: '11' }));
    expect(r).toMatchObject({ ok: true, input: { total: null, status: 'wd', wdAfterHole: 11 } });
    expect(validateScore(form({ status: 'wd', wdAfterHole: '19' }))).toMatchObject({ ok: false });
    expect(validateScore(form({ status: 'ok', wdAfterHole: '11', total: '70' }))).toMatchObject({ ok: true, input: { wdAfterHole: null } });
  });

  it('an empty form is a clear (no total, played)', () => {
    expect(validateScore(emptyForm())).toMatchObject({ ok: true, clears: true });
  });

  it('starts from the saved score', () => {
    expect(formOf({ total: 74, status: 'dq_pending' })).toMatchObject({ total: '74', status: 'dq_pending' });
    expect(formOf(null)).toEqual(emptyForm());
  });
});
