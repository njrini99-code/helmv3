import { describe, expect, it } from 'vitest';
import {
  BASEBALL_STATS_GAME_CREATE_LEGACY_PATH,
  BASEBALL_STATS_GAME_CREATE_PATH,
  BASEBALL_STATS_ROUTE_ALIASES,
  getBaseballStatsGameCreateHref,
} from '@/lib/baseball/stats-route-aliases';

describe('stats-route-aliases (#378)', () => {
  it('canonical create path is /stats/games/create', () => {
    expect(getBaseballStatsGameCreateHref()).toBe(BASEBALL_STATS_GAME_CREATE_PATH);
    expect(BASEBALL_STATS_GAME_CREATE_PATH).toBe('/baseball/dashboard/stats/games/create');
  });

  it('legacy /new redirects to canonical create', () => {
    expect(BASEBALL_STATS_ROUTE_ALIASES[BASEBALL_STATS_GAME_CREATE_LEGACY_PATH]).toBe(
      BASEBALL_STATS_GAME_CREATE_PATH,
    );
  });
});
