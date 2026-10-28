import { describe, expect, it } from 'vitest';
import { tourFixture } from '../../../preview/fixtures-tournaments';
import { byTotal, costliest, deskRows, holeAverages, holeRows, notCounted, roundSets, scoreWords, sumHoles } from '../desk-model';

const oak = tourFixture('ready').desks.e33!;

describe('desk model', () => {
  it('orders lineup by slot, then individuals, with each player’s own total and rounds counted', () => {
    const rows = deskRows(oak.event, oak.players);
    expect(rows.map((r) => r.entry.playerId)).toEqual(['theo', 'sofia', 'ava', 'jonah', 'eli', 'priya']);
    const jonah = rows.find((r) => r.entry.playerId === 'jonah')!;
    expect([jonah.total, jonah.counted, jonah.played]).toEqual([220, 1, 3]);
    expect(rows.find((r) => r.individual)?.entry.playerId).toBe('priya');
  });

  it('sorts flat by total, lowest first, and keeps ties in entry order', () => {
    expect(byTotal(deskRows(oak.event, oak.players)).map((r) => r.entry.playerId)).toEqual(['theo', 'ava', 'eli', 'sofia', 'jonah', 'priya']);
  });

  it('ranks a card a round short below every full card, however low its total', () => {
    const rows = deskRows(oak.event, oak.players);
    // Theo leads on total; with his last round gone, his two-round total is the lowest on the sheet.
    const short = rows.map((r) => {
      if (r.entry.playerId !== 'theo') return r;
      const cells = r.cells.map((c, i) => (i === r.cells.length - 1 ? null : c));
      return { ...r, cells, total: cells.reduce((s, c) => s + (c?.total ?? 0), 0) };
    });
    const theo = short.find((r) => r.entry.playerId === 'theo')!;
    const full = short.filter((r) => r.entry.playerId !== 'theo' && r.cells.every((c) => c?.total != null));
    expect(full.length).toBeGreaterThan(0);
    expect(full.every((r) => (r.total ?? 0) > (theo.total ?? 0))).toBe(true);
    const order = byTotal(short).map((r) => r.entry.playerId);
    for (const r of full) expect(order.indexOf(r.entry.playerId)).toBeLessThan(order.indexOf('theo'));
  });

  it('ranks a DQ or WD card that carries strokes as a card a round short, and leaves its strokes out of the total', () => {
    const rows = deskRows(oak.event, oak.players);
    for (const status of ['dq', 'wd', 'dq_pending'] as const) {
      const event = {
        ...oak.event,
        playerRounds: oak.event.playerRounds.map((p) => (p.playerId === 'theo' && p.roundNumber === oak.event.rounds.length ? { ...p, status } : p)),
      };
      const marked = deskRows(event, oak.players);
      const theo = marked.find((r) => r.entry.playerId === 'theo')!;
      const before = rows.find((r) => r.entry.playerId === 'theo')!;
      const last = before.cells[before.cells.length - 1]!;
      expect(last.total).not.toBeNull();
      expect(theo.total).toBe((before.total ?? 0) - (last.total ?? 0));
      const order = byTotal(marked).map((r) => r.entry.playerId);
      const full = marked.filter((r) => r.entry.playerId !== 'theo' && r.cells.every((c) => c?.status === 'ok' && c.total != null));
      expect(full.length).toBeGreaterThan(0);
      for (const r of full) expect(order.indexOf(r.entry.playerId)).toBeLessThan(order.indexOf('theo'));
    }
  });

  it('writes a score or why there is none, and marks only dropped scores NC', () => {
    const [first] = oak.event.playerRounds;
    expect(scoreWords(first!)).toBe(String(first!.total));
    expect(scoreWords(null)).toBe('—');
    expect(scoreWords({ ...first!, status: 'wd' })).toBe('WD');
    expect(scoreWords({ ...first!, status: 'dq' })).toBe('DQ');
    expect(scoreWords({ ...first!, status: 'dq_pending' })).toBe('DQ?');
    expect(scoreWords({ ...first!, total: null })).toBe('—');
    expect(notCounted({ ...first!, count: 'dropped' })).toBe(true);
    expect(notCounted({ ...first!, count: 'tie' })).toBe(true);
    expect(notCounted({ ...first!, count: 'counted' })).toBe(false);
    expect(notCounted({ ...first!, count: 'individual' })).toBe(false);
    expect(notCounted(null)).toBe(false);
  });

  it('reads a round’s counted and dropped sets off the team round, with their scores', () => {
    const r3 = roundSets(oak.event, 3);
    expect(r3.counted.map((x) => x.total).sort()).toEqual([69, 71, 72, 73]);
    expect(r3.dropped).toEqual([{ id: 'sofia', total: 74 }]);
    expect(roundSets(oak.event, 9)).toEqual({ counted: [], dropped: [], tied: [] });
  });

  it('sums a run of holes only when every hole has a score', () => {
    expect(sumHoles([4, 5, 3])).toBe(12);
    expect(sumHoles([4, null, 3])).toBeNull();
    expect(sumHoles([])).toBeNull();
  });

  it('builds a round’s cards with nine sums that add up, and averages the team against par per hole', () => {
    const ledger = oak.holes!;
    const rows = holeRows(oak.event, ledger, 3);
    expect(rows).toHaveLength(6);
    for (const r of rows) expect((r.out ?? 0) + (r.inn ?? 0)).toBe(r.total);
    expect(rows.find((r) => r.playerId === 'jonah')?.total).toBe(69);
    const team = rows.filter((r) => r.count !== 'individual');
    const avgs = holeAverages(team, ledger.pars);
    expect(avgs).toHaveLength(18);
    // The average of every hole lands on the team’s own strokes against par.
    expect(avgs.reduce<number>((a, v) => a + (v ?? 0), 0) * team.length).toBeCloseTo(team.reduce((a, r) => a + ((r.total ?? 0) - 72), 0), 6);
  });

  it('picks the costliest holes only where they cost something, largest first, ties to the earlier hole', () => {
    expect(costliest([0.4, -0.2, 1.2, 0, 1.2, 0.8])).toEqual([2, 4, 5]);
    expect(costliest([-1, 0, null, 0.2])).toEqual([3]);
    expect(costliest([0.1, 0.2], 1)).toEqual([1]);
  });
});
