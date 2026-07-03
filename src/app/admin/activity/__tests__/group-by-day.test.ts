import { describe, it, expect } from 'vitest';
import { groupActivityByDay } from '../group-by-day';

const NOW = new Date('2026-07-02T18:00:00.000Z');

function item(ts: string) {
  return { ts };
}

describe('groupActivityByDay', () => {
  it('buckets contiguous same-day items and labels Today/Yesterday', () => {
    const items = [
      item('2026-07-02T17:00:00.000Z'),
      item('2026-07-02T09:00:00.000Z'),
      item('2026-07-01T22:00:00.000Z'),
      item('2026-06-28T08:00:00.000Z'),
    ];
    const groups = groupActivityByDay(items, NOW);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Jun 28']);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[1]!.items).toHaveLength(1);
    expect(groups[2]!.items).toHaveLength(1);
  });

  it('includes the year for a date outside the current year', () => {
    const groups = groupActivityByDay([item('2025-12-31T12:00:00.000Z')], NOW);
    expect(groups[0]!.label).toBe('Dec 31, 2025');
  });

  it('returns an empty array for an empty feed', () => {
    expect(groupActivityByDay([], NOW)).toEqual([]);
  });

  it('merges same-day items into one group even if the input is out of order (documents actual behavior)', () => {
    // fetchGolfActivity always returns newest-first, so this input shape never
    // occurs in production — the Map-keyed grouping coalesces by day key
    // regardless of position, which is the more robust behavior anyway.
    const groups = groupActivityByDay(
      [item('2026-07-02T10:00:00.000Z'), item('2026-07-01T10:00:00.000Z'), item('2026-07-02T09:00:00.000Z')],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday']);
    expect(groups[0]!.items).toHaveLength(2);
  });
});
