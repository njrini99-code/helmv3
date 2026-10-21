import { describe, expect, it } from 'vitest';
import {
  orderStaleRefreshCandidates,
  rotateForNight,
  roundInsideEngineWindow,
  rowRefreshedAtMs,
  selectStaleRefreshPlayers,
  STALE_REFRESH_CAP,
  type StaleAnchorRow,
} from '../stale-refresh';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-21T02:00:00Z');
/** 02:00 UTC on the night whose index is `dayIndex` (rotation offset (dayIndex * cap) mod n). */
const nightOf = (dayIndex: number) => dayIndex * DAY + 2 * 3_600_000;
/** The first night from NOW's on whose rotation offset (dayIndex * cap) mod n is `offset`. */
function nightWithOffset(n: number, cap: number, offset: number): number {
  for (let d = Math.floor(NOW / DAY); ; d++) if ((d * cap) % n === offset) return nightOf(d);
}
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const row = (player: string, createdDaysAgo: number, refreshedDaysAgo?: number): StaleAnchorRow => ({
  player_id: player,
  created_at: daysAgo(createdDaysAgo),
  metadata: refreshedDaysAgo === undefined ? {} : { last_refreshed_at: daysAgo(refreshedDaysAgo) },
});

describe('selectStaleRefreshPlayers', () => {
  it('picks an idle player whose newest analysis is 14+ days old', () => {
    const picks = selectStaleRefreshPlayers(['p1'], [row('p1', 60, 20)], new Map(), NOW);
    expect(picks).toEqual([{ playerId: 'p1', staleDays: 20 }]);
  });

  it('anchors on the newest read: one fresh read keeps the player out', () => {
    const picks = selectStaleRefreshPlayers(['p1'], [row('p1', 60, 40), row('p1', 3)], new Map(), NOW);
    expect(picks).toEqual([]);
  });

  it('a 13-day-old analysis is not stale', () => {
    expect(selectStaleRefreshPlayers(['p1'], [row('p1', 13)], new Map(), NOW)).toEqual([]);
  });

  it('an engine run inside the window keeps the player out even when the rows were not re-stamped', () => {
    const runs = new Map([['p1', Date.parse(daysAgo(2))]]);
    expect(selectStaleRefreshPlayers(['p1'], [row('p1', 50)], runs, NOW)).toEqual([]);
  });

  it('a player with no open read is never picked', () => {
    expect(selectStaleRefreshPlayers(['p1'], [], new Map(), NOW)).toEqual([]);
  });

  it('ignores rows of players outside the candidate list', () => {
    expect(selectStaleRefreshPlayers(['p1'], [row('p2', 50)], new Map(), NOW)).toEqual([]);
  });

  it('holds the cap and starts tonight\'s window in the oldest-first list', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const rows = ids.map((id, i) => row(id, 20 + i * 5));
    const oldestFirst = ['p9', 'p8', 'p7', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1', 'p0'];
    // A night whose offset is 0: the oldest six.
    const tonight = selectStaleRefreshPlayers(ids, rows, new Map(), nightWithOffset(10, 6, 0));
    expect(tonight).toHaveLength(STALE_REFRESH_CAP);
    expect(tonight.map((p) => p.playerId)).toEqual(oldestFirst.slice(0, 6));
    // The full order holds every stale candidate, rotated, with stale days.
    const order = orderStaleRefreshCandidates(ids, rows, new Map(), NOW);
    expect(new Set(order.map((p) => p.playerId))).toEqual(new Set(ids));
    expect(order.find((p) => p.playerId === 'p9')?.staleDays).toBe(65);
  });

  it('rotates: an unproductive oldest player does not hold a slot every night', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const rows = ids.map((id, i) => row(id, 200 + i * 5));
    // Offset 6: the window wraps to p3..p0, p9, p8; the next night's offset is 2.
    const night = nightWithOffset(10, 6, 6);
    const picks = selectStaleRefreshPlayers(ids, rows, new Map(), night);
    expect(picks.map((p) => p.playerId)).toEqual(['p3', 'p2', 'p1', 'p0', 'p9', 'p8']);
    const next = selectStaleRefreshPlayers(ids, rows, new Map(), night + DAY);
    expect(next.map((p) => p.playerId)).not.toContain('p9');
  });

  it('breaks ties on player id', () => {
    const picks = selectStaleRefreshPlayers(['b', 'a'], [row('b', 30), row('a', 30)], new Map(), NOW, { cap: 2 });
    expect(picks.map((p) => p.playerId)).toEqual(['a', 'b']);
  });
});

describe('rotateForNight', () => {
  const list = Array.from({ length: 13 }, (_, i) => i);

  it('covers every candidate within ceil(n / cap) nights', () => {
    for (const start of [0, 1, 7, 20_000]) {
      const seen = new Set<number>();
      for (let night = start; night < start + Math.ceil(list.length / 6); night++) {
        for (const x of rotateForNight(list, nightOf(night), 6).slice(0, 6)) seen.add(x);
      }
      expect(seen.size).toBe(list.length);
    }
  });

  it('is deterministic within one UTC day and moves on the next', () => {
    const early = rotateForNight(list, nightOf(400) - 2 * 3_600_000, 6);
    const late = rotateForNight(list, nightOf(400) + 21 * 3_600_000, 6);
    expect(late).toEqual(early);
    expect(rotateForNight(list, nightOf(401), 6)[0]).not.toBe(early[0]);
    // A rotation keeps every entry exactly once.
    expect([...early].sort((a, b) => a - b)).toEqual(list);
  });

  it('starts at (dayIndex * cap) mod n and wraps', () => {
    expect(rotateForNight(list, nightOf(3), 6)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 0, 1, 2, 3, 4]);
  });

  it('returns every candidate, oldest first, when n <= cap', () => {
    expect(rotateForNight([1, 2, 3], nightOf(5), 6)).toEqual([1, 2, 3]);
    expect(rotateForNight([1, 2, 3, 4, 5, 6], nightOf(5), 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rotateForNight([], nightOf(5), 6)).toEqual([]);
  });

  it('a cap below one keeps the order', () => {
    expect(rotateForNight([1, 2, 3], nightOf(5), 0)).toEqual([1, 2, 3]);
  });
});

describe('rowRefreshedAtMs', () => {
  it('takes the newest of created_at, last_refreshed_at and redetected_at', () => {
    const r: StaleAnchorRow = {
      player_id: 'p',
      created_at: daysAgo(90),
      metadata: { last_refreshed_at: daysAgo(30), redetected_at: daysAgo(10) },
    };
    expect(rowRefreshedAtMs(r)).toBe(Date.parse(daysAgo(10)));
  });
});

describe('roundInsideEngineWindow', () => {
  it('accepts a round inside 90 days and rejects an older one or none', () => {
    expect(roundInsideEngineWindow('2026-09-01', NOW)).toBe(true);
    expect(roundInsideEngineWindow('2026-06-01', NOW)).toBe(false);
    expect(roundInsideEngineWindow(null, NOW)).toBe(false);
  });
});
