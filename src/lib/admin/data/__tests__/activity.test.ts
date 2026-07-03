import { describe, it, expect } from 'vitest';
import {
  clampActivityLimit,
  parseActivityCursor,
  fullName,
  formatToPar,
  mergeActivityPage,
  type ActivitySourceResult,
  type ActivityItem,
} from '@/lib/admin/data/activity';

describe('clampActivityLimit', () => {
  it('defaults to 50 when undefined or non-finite', () => {
    expect(clampActivityLimit(undefined)).toBe(50);
    expect(clampActivityLimit(Number.NaN)).toBe(50);
  });
  it('clamps to [1, 200]', () => {
    expect(clampActivityLimit(0)).toBe(1);
    expect(clampActivityLimit(-5)).toBe(1);
    expect(clampActivityLimit(9999)).toBe(200);
  });
  it('truncates fractional values', () => {
    expect(clampActivityLimit(10.7)).toBe(10);
  });
});

describe('parseActivityCursor', () => {
  it('drops undefined/empty', () => {
    expect(parseActivityCursor(undefined)).toBeUndefined();
    expect(parseActivityCursor('')).toBeUndefined();
  });
  it('drops a cursor that does not parse as a timestamp', () => {
    expect(parseActivityCursor('not-a-date')).toBeUndefined();
  });
  it('keeps a valid ISO timestamp', () => {
    expect(parseActivityCursor('2026-07-01T00:00:00Z')).toBe('2026-07-01T00:00:00Z');
  });
});

describe('fullName', () => {
  it('joins first + last', () => {
    expect(fullName('Jane', 'Doe')).toBe('Jane Doe');
  });
  it('returns null when both are missing/blank', () => {
    expect(fullName(null, null)).toBeNull();
    expect(fullName(undefined, undefined)).toBeNull();
    expect(fullName('', '')).toBeNull();
  });
  it('handles one side missing', () => {
    expect(fullName('Jane', null)).toBe('Jane');
    expect(fullName(null, 'Doe')).toBe('Doe');
  });
});

describe('formatToPar', () => {
  it('formats null as an em dash', () => {
    expect(formatToPar(null)).toBe('—');
  });
  it('formats even par as E', () => {
    expect(formatToPar(0)).toBe('E');
  });
  it('formats over/under par with a sign', () => {
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe('-2');
  });
});

describe('mergeActivityPage', () => {
  const item = (over: Partial<ActivityItem>): ActivityItem => ({
    id: 'x:1', kind: 'round_submitted', ts: '2026-07-01T00:00:00Z', title: 't', detail: null, href: null,
    ...over,
  });

  it('merges multiple sources sorted by ts descending', () => {
    const sources: ActivitySourceResult[] = [
      { kind: 'round_submitted', items: [item({ id: 'a', ts: '2026-07-01T10:00:00Z' })] },
      { kind: 'sign_in', items: [item({ id: 'b', ts: '2026-07-01T12:00:00Z' }), item({ id: 'c', ts: '2026-07-01T08:00:00Z' })] },
    ];
    const { items } = mergeActivityPage(sources, 50);
    expect(items.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('slices to the page limit', () => {
    const sources: ActivitySourceResult[] = [
      {
        kind: 'round_submitted',
        items: [
          item({ id: 'a', ts: '2026-07-01T10:00:00Z' }),
          item({ id: 'b', ts: '2026-07-01T09:00:00Z' }),
          item({ id: 'c', ts: '2026-07-01T08:00:00Z' }),
        ],
      },
    ];
    const { items } = mergeActivityPage(sources, 2);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('sets nextCursor to the last page item\'s ts when any source may have more', () => {
    const sources: ActivitySourceResult[] = [
      { kind: 'round_submitted', items: [item({ id: 'a', ts: '2026-07-01T10:00:00Z' }), item({ id: 'b', ts: '2026-07-01T09:00:00Z' })] },
    ];
    const { nextCursor } = mergeActivityPage(sources, 2);
    expect(nextCursor).toBe('2026-07-01T09:00:00Z');
  });

  it('returns nextCursor null when every source is exhausted (fewer rows than the limit)', () => {
    const sources: ActivitySourceResult[] = [
      { kind: 'round_submitted', items: [item({ id: 'a', ts: '2026-07-01T10:00:00Z' })] },
      { kind: 'sign_in', items: [] },
    ];
    const { nextCursor } = mergeActivityPage(sources, 50);
    expect(nextCursor).toBeNull();
  });

  it('returns nextCursor null on an empty page', () => {
    const { items, nextCursor } = mergeActivityPage([], 50);
    expect(items).toEqual([]);
    expect(nextCursor).toBeNull();
  });
});
