import { describe, expect, it } from 'vitest';
import {
  roundInsideEngineWindow,
  rowRefreshedAtMs,
  selectStaleRefreshPlayers,
  STALE_REFRESH_CAP,
  type StaleAnchorRow,
} from '../stale-refresh';

const NOW = Date.parse('2026-10-21T02:00:00Z');
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

  it('holds the cap and takes the oldest first', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const rows = ids.map((id, i) => row(id, 20 + i * 5));
    const picks = selectStaleRefreshPlayers(ids, rows, new Map(), NOW);
    expect(picks).toHaveLength(STALE_REFRESH_CAP);
    expect(picks.map((p) => p.playerId)).toEqual(['p9', 'p8', 'p7', 'p6', 'p5', 'p4']);
    expect(picks.map((p) => p.staleDays)).toEqual([65, 60, 55, 50, 45, 40]);
  });

  it('breaks ties on player id', () => {
    const picks = selectStaleRefreshPlayers(['b', 'a'], [row('b', 30), row('a', 30)], new Map(), NOW, { cap: 1 });
    expect(picks.map((p) => p.playerId)).toEqual(['a']);
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
