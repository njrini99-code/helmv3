import { describe, expect, it } from 'vitest';
import {
  BASEBALL_STATS_GAME_CREATE_PATH,
  getBaseballStatsGameCreateHref,
} from '@/lib/baseball/stats-route-aliases';

describe('stats-route-aliases (#378)', () => {
  it('canonical create path is /stats/games/create', () => {
    expect(getBaseballStatsGameCreateHref()).toBe(BASEBALL_STATS_GAME_CREATE_PATH);
    expect(BASEBALL_STATS_GAME_CREATE_PATH).toBe('/baseball/dashboard/stats/games/create');
  });

  it('does not expose the removed /stats/games/new alias', () => {
    expect(getBaseballStatsGameCreateHref()).not.toContain('/stats/games/new');
  });
});
