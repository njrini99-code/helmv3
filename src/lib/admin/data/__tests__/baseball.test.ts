import { describe, it, expect } from 'vitest';
import { weekStart } from '@/lib/admin/data/baseball';

describe('weekStart', () => {
  it('buckets a date-only string to its Monday (mirrors Postgres date_trunc(\'week\', ...))', () => {
    // Wednesday 2026-07-08 -> Monday 2026-07-06.
    expect(weekStart('2026-07-08')).toBe('2026-07-06');
  });

  it('a Monday buckets to itself', () => {
    expect(weekStart('2026-07-06')).toBe('2026-07-06');
  });

  it('a Sunday buckets to the Monday that started its week, not the next one', () => {
    // Sunday 2026-07-12 belongs to the week that started Monday 2026-07-06.
    expect(weekStart('2026-07-12')).toBe('2026-07-06');
  });

  it('accepts a full timestamp string, not just a date-only string', () => {
    expect(weekStart('2026-07-08T23:59:59.000Z')).toBe('2026-07-06');
  });
});
