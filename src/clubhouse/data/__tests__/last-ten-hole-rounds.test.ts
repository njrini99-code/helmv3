import { describe, expect, it } from 'vitest';
import { lastTenHoleRounds, lastTenRounds } from '../figure-window';

// Prod audit 2026-11-15, N13P-64: Home's Your game read the newest ten rounds that had holes, reaching back past the ten, while My stats'
// Last 10 read the ones with holes among the newest ten: 42% fairways against 43% under the same "Last 10". One definition now.
const round = (i: number, totalOnly = false) => ({
  id: `r${String(i).padStart(2, '0')}`,
  round_date: `2026-10-${String(i).padStart(2, '0')}`,
  round_type: 'tournament',
  status: 'completed',
  holes_played: 18,
  total_score: 72,
  total_only: totalOnly,
});

describe('lastTenHoleRounds', () => {
  it('is the rounds with holes among the newest ten, never an older round that has holes', () => {
    // Fourteen rounds; two of the newest ten were posted as a total only.
    const rounds = Array.from({ length: 14 }, (_, i) => round(i + 1, i + 1 === 12 || i + 1 === 9));
    const ten = lastTenRounds(rounds).map((r) => r.id);
    const holes = lastTenHoleRounds(rounds).map((r) => r.id);
    expect(ten).toHaveLength(10);
    expect(holes).toHaveLength(8);
    expect(holes.every((id) => ten.includes(id))).toBe(true);
    expect(holes).not.toContain('r04');
  });
});
