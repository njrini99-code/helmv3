import { describe, expect, it } from 'vitest';
import { isoDaysBefore, recentWindowStart, recentlyActivePlayerIds } from './recent-players';

const round = (player_id: string, round_date: string, total_score = 75) => ({
  player_id,
  round_date,
  status: 'completed',
  holes_played: 18,
  total_score,
  front_nine: Math.floor(total_score / 2),
  back_nine: Math.ceil(total_score / 2),
  total_putts: 30,
});

describe('recent-players', () => {
  it('computes the window start in UTC days', () => {
    expect(isoDaysBefore('2026-03-01', 1)).toBe('2026-02-28');
    expect(recentWindowStart('2026-09-28')).toBe('2026-07-30');
  });

  it('counts only countable rounds inside the window', () => {
    const since = '2026-07-30';
    const ids = recentlyActivePlayerIds(
      [round('a', '2026-09-01'), round('b', '2026-07-01'), round('c', '2026-09-10', 37), round('d', '2026-07-30')],
      since,
    );
    expect([...ids].sort()).toEqual(['a', 'd']);
  });
});
