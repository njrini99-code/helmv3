import { describe, it, expect } from 'vitest';
import { buildPerPlayerSparkline } from '../per-player-sparkline';

const r = (player_id: string, value: number | null) => ({ player_id, value });

describe('buildPerPlayerSparkline', () => {
  it('compares each player with themselves, not whoever posted last', () => {
    // Newest first. A (68s) and B (81s) alternate: the team's last 5 rounds
    // would zig-zag 13 strokes; per-player every point is the same 74.5.
    const rounds = [
      r('A', 68), r('B', 81), r('A', 68), r('B', 81), r('A', 68), r('B', 81),
      r('A', 68), r('B', 81), r('A', 68), r('B', 81),
    ];
    expect(buildPerPlayerSparkline(rounds)).toEqual([74.5, 74.5, 74.5, 74.5, 74.5]);
  });

  it('orders points oldest → newest and tracks a real improvement', () => {
    const rounds = [r('A', 70), r('A', 72), r('A', 74), r('B', 76), r('B', 78), r('B', 80)];
    expect(buildPerPlayerSparkline(rounds)).toEqual([77, 75, 73]);
  });

  it('ignores players under the minimum and null values', () => {
    const rounds = [r('A', 70), r('A', null), r('A', 72), r('A', 74), r('C', 60), r('C', 61)];
    expect(buildPerPlayerSparkline(rounds)).toEqual([74, 72, 70]);
    expect(buildPerPlayerSparkline([r('C', 60), r('C', 61)])).toEqual([]);
  });
});
