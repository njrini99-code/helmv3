import { describe, expect, it } from 'vitest';
import { compareLeaderRows } from '../model';

const row = (name: string, avg: number, rounds: number, status = 'steady') => ({ name, avg, rounds, status });

describe('compareLeaderRows (parity with Fairway Top performers)', () => {
  it('puts an early read last whatever its average', () => {
    const rows = [row('Early', 70.1, 2, 'early'), row('Steady', 76, 20)];
    expect(rows.sort(compareLeaderRows).map((r) => r.name)).toEqual(['Steady', 'Early']);
  });

  it('treats equal printed averages as level: more rounds first, then name', () => {
    // 74.84 and 74.76 both print 74.8; the 29-round player ranks ahead of the 19-round one.
    const rows = [row('B', 74.76, 19), row('A', 74.84, 29)];
    expect(rows.sort(compareLeaderRows).map((r) => r.name)).toEqual(['A', 'B']);
    expect([row('Zed', 75, 10), row('Amy', 75, 10)].sort(compareLeaderRows).map((r) => r.name)).toEqual(['Amy', 'Zed']);
  });

  it('still orders by the printed average first', () => {
    expect([row('A', 74.9, 40), row('B', 74.8, 5)].sort(compareLeaderRows).map((r) => r.name)).toEqual(['B', 'A']);
  });
});
