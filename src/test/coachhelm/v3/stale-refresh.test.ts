/**
 * Stale-insight refresh selection for the roster sweep (owner decision
 * 2026-09-25): players whose visible v3 insights were all last refreshed
 * 14+ days ago are re-analyzed, capped per run, oldest first.
 */
import { describe, it, expect } from 'vitest';
import {
  rowRefreshedAtMs,
  selectStaleRefreshPlayers,
  STALE_REFRESH_CAP,
  STALE_REFRESH_DAYS,
  type RefreshAnchorRow,
} from '@/lib/coachhelm/v3/engine/stale-refresh';

const NOW = Date.parse('2026-09-25T02:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const row = (player: string, created: number, refreshed?: number, redetected?: number): RefreshAnchorRow => ({
  player_id: player,
  created_at: daysAgo(created),
  metadata: {
    ...(refreshed !== undefined ? { last_refreshed_at: daysAgo(refreshed) } : {}),
    ...(redetected !== undefined ? { redetected_at: daysAgo(redetected) } : {}),
  },
});

describe('rowRefreshedAtMs', () => {
  it('is the newest of created_at, last_refreshed_at, redetected_at; malformed fields ignored', () => {
    expect(rowRefreshedAtMs(row('p', 60, 20, 5))).toBe(Date.parse(daysAgo(5)));
    expect(rowRefreshedAtMs({ player_id: 'p', created_at: daysAgo(60), metadata: { last_refreshed_at: 'nope' } })).toBe(
      Date.parse(daysAgo(60)),
    );
  });
});

describe('selectStaleRefreshPlayers', () => {
  it('uses the newest refresh per player: one stale row does not make a recently analyzed player stale', () => {
    const picks = selectStaleRefreshPlayers([row('a', 90, 30), row('a', 90, 20), row('b', 90, 40), row('b', 90, 1)], NOW);
    expect(picks).toEqual([{ playerId: 'a', staleDays: 20 }]);
  });

  it('the threshold is inclusive at STALE_REFRESH_DAYS', () => {
    expect(selectStaleRefreshPlayers([row('a', STALE_REFRESH_DAYS)], NOW)).toHaveLength(1);
    expect(selectStaleRefreshPlayers([row('a', STALE_REFRESH_DAYS - 1)], NOW)).toHaveLength(0);
  });

  it('caps per run, oldest first, with a total order', () => {
    const rows = Array.from({ length: STALE_REFRESH_CAP + 4 }, (_, i) => row(`p${String(i).padStart(2, '0')}`, 20 + i));
    rows.push(row('tie-b', 200), row('tie-a', 200));
    const picks = selectStaleRefreshPlayers(rows, NOW);
    expect(picks).toHaveLength(STALE_REFRESH_CAP);
    expect(picks.slice(0, 2).map((p) => p.playerId)).toEqual(['tie-a', 'tie-b']);
    for (let i = 1; i < picks.length; i++) expect(picks[i - 1]!.staleDays).toBeGreaterThanOrEqual(picks[i]!.staleDays);
  });

  it('honours explicit options and ignores rows without a player', () => {
    const rows = [row('a', 10), row('b', 30), { player_id: '', created_at: daysAgo(99), metadata: null }];
    expect(selectStaleRefreshPlayers(rows, NOW, { staleDays: 7, cap: 1 })).toEqual([{ playerId: 'b', staleDays: 30 }]);
    expect(selectStaleRefreshPlayers(rows, NOW, { cap: 0 })).toEqual([]);
  });
});
