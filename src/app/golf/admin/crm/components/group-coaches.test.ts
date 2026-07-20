import { describe, it, expect } from 'vitest';
import { groupBy, pruneSelection } from './group-coaches';

interface Item {
  id: string;
  school: string | null;
}

function item(id: string, school: string | null): Item {
  return { id, school };
}

describe('groupBy', () => {
  it('merges keys that only differ by whitespace/case into ONE group, labeled with the first-seen raw string', () => {
    const items = [
      item('1', 'UNC Chapel Hill'),
      item('2', 'unc chapel hill '),
      item('3', '  UNC   Chapel Hill'),
    ];

    const groups = groupBy(items, (i) => i.school, { emptyLabel: 'No school' });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('UNC Chapel Hill'); // first-seen, verbatim
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['1', '2', '3']);
  });

  it('keeps distinct schools in distinct groups', () => {
    const items = [item('1', 'Duke'), item('2', 'UNC')];
    const groups = groupBy(items, (i) => i.school, { emptyLabel: 'No school' });
    expect(groups.map((g) => g.label).sort()).toEqual(['Duke', 'UNC']);
  });

  it('pools null, undefined, empty-string, and whitespace-only keys into ONE empty group with the given label', () => {
    const items: Array<{ id: string; school: string | null | undefined }> = [
      { id: '1', school: null },
      { id: '2', school: undefined },
      { id: '3', school: '' },
      { id: '4', school: '   ' },
    ];

    const groups = groupBy(items, (i) => i.school, { emptyLabel: 'No school' });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('No school');
    expect(groups[0]!.isEmptyGroup).toBe(true);
    expect(groups[0]!.items).toHaveLength(4);
  });

  it('never produces a blank-labeled group even when the empty bucket is the largest', () => {
    const items = [
      item('1', null as unknown as string),
      item('2', null as unknown as string),
      item('3', null as unknown as string),
      item('4', 'Duke'),
    ];

    const groups = groupBy(items, (i) => i.school, {
      emptyLabel: 'No school',
      sort: (a, b) => b.items.length - a.items.length,
    });

    for (const g of groups) {
      expect(g.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('sorts the empty/null bucket last regardless of the sort comparator or its own size', () => {
    const items = [
      item('1', null as unknown as string),
      item('2', null as unknown as string),
      item('3', null as unknown as string),
      item('4', 'Duke'),
      item('5', 'UNC'),
      item('6', 'UNC'),
    ];

    // Sort by count desc — the null bucket (3 items) would otherwise outrank
    // "Duke" (1 item) and "UNC" (2 items).
    const groups = groupBy(items, (i) => i.school, {
      emptyLabel: 'No school',
      sort: (a, b) => b.items.length - a.items.length,
    });

    expect(groups.map((g) => g.label)).toEqual(['UNC', 'Duke', 'No school']);
  });

  it('derives group membership and counts ONLY from the items passed in (already-filtered set)', () => {
    const allItems = [item('1', 'Duke'), item('2', 'Duke'), item('3', 'UNC')];
    // Simulate an upstream filter that already dropped item 3.
    const filtered = allItems.filter((i) => i.id !== '3');

    const groups = groupBy(filtered, (i) => i.school, { emptyLabel: 'No school' });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('Duke');
    expect(groups[0]!.items).toHaveLength(2);
  });

  it('returns an empty array for an empty input list', () => {
    expect(groupBy([], (i: Item) => i.school, { emptyLabel: 'No school' })).toEqual([]);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are not present in visibleItems', () => {
    const visible = [item('1', 'Duke'), item('2', 'UNC')];
    const selected = new Set(['1', '2', '3']);

    const pruned = pruneSelection(selected, visible);

    expect(pruned).toEqual(new Set(['1', '2']));
  });

  it('returns the SAME Set reference when nothing needs pruning', () => {
    const visible = [item('1', 'Duke'), item('2', 'UNC')];
    const selected = new Set(['1', '2']);

    const pruned = pruneSelection(selected, visible);

    expect(pruned).toBe(selected);
  });

  it('returns an empty Set (not the original) when every selected id is now hidden', () => {
    const visible = [item('1', 'Duke')];
    const selected = new Set(['9', '10']);

    const pruned = pruneSelection(selected, visible);

    expect(pruned).not.toBe(selected);
    expect(pruned.size).toBe(0);
  });

  it('handles an empty selection', () => {
    const visible = [item('1', 'Duke')];
    const selected = new Set<string>();

    const pruned = pruneSelection(selected, visible);

    expect(pruned).toBe(selected);
    expect(pruned.size).toBe(0);
  });
});
