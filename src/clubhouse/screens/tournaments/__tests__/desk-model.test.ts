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
