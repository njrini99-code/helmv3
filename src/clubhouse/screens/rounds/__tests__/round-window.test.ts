import { describe, expect, it } from 'vitest';
import { firstWindow, ROUNDS_PAGE, windowGroups } from '../round-window';

/** MAC-01 and PMAC-02 (production audit 2026-11-15): a rounds list draws its newest two months, at most a page of rows. */
const group = (key: string, n: number) => ({ key, rounds: Array.from({ length: n }, (_, i) => `${key}-${i}`) });

describe('the rounds window', () => {
  it('opens on the newest two months, at most a page of rows; any other grouping on a page', () => {
    expect(firstWindow([group('Nov', 6), group('Oct', 9), group('Sep', 30)], true)).toBe(15);
    expect(firstWindow([group('Nov', 30), group('Oct', 30)], true)).toBe(ROUNDS_PAGE);
    expect(firstWindow([group('Ava', 3), group('Ben', 3)], false)).toBe(ROUNDS_PAGE);
    expect(firstWindow([], true)).toBe(1);
  });

  it('keeps whole groups, cuts at most one short, and counts what it left out', () => {
    const groups = [group('Nov', 6), group('Oct', 9), group('Sep', 30)];
    const { shown, hidden } = windowGroups<string, (typeof groups)[number]>(groups, 20);
    expect(shown.map((s) => [s.group.key, s.rows.length])).toEqual([
      ['Nov', 6],
      ['Oct', 9],
      ['Sep', 5],
    ]);
    // A group cut short keeps every round for its heading's count and average.
    expect(shown[2]!.group.rounds).toHaveLength(30);
    expect(hidden).toBe(25);
  });

  it('shows everything once the window passes the end', () => {
    const groups = [group('Nov', 2), group('Oct', 3)];
    const { shown, hidden } = windowGroups<string, (typeof groups)[number]>(groups, 40);
    expect(shown.map((s) => s.rows.length)).toEqual([2, 3]);
    expect(hidden).toBe(0);
  });
});
