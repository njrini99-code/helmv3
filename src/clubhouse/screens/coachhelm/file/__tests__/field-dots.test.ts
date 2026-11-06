import { describe, expect, it } from 'vitest';
import { dotRows } from '../cards';

describe('dotRows', () => {
  it('leaves clear dots on the line', () => {
    expect(dotRows([1, 6, 10], 3.5, 0, 12)).toEqual([0, 0, 0]);
  });

  it('moves a dot off the line when it would touch the player or another dot', () => {
    // 3.6 is the player; 3.9 touches it, 8 and 8.2 touch each other.
    const rows = dotRows([3.9, 8, 8.2, 11], 3.6, 0, 12);
    expect(rows[0]).toBe(1);
    expect(rows[1]).toBe(0);
    expect(rows[2]).toBe(1);
    expect(rows[3]).toBe(0);
  });

  it('keeps every dot, at any field size, even when all three rows are full', () => {
    const rows = dotRows([5, 5, 5, 5, 5], 5, 0, 12);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r >= 0 && r <= 2)).toBe(true);
  });
});
