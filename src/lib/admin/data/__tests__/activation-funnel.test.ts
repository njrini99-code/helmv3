import { describe, it, expect } from 'vitest';
import { medianHours } from '@/lib/admin/data/activation-funnel';

describe('medianHours', () => {
  it('no pairs → null (never a fabricated 0)', () => {
    expect(medianHours([])).toBeNull();
  });

  it('single pair → that pair\'s own delta', () => {
    expect(
      medianHours([{ start: '2026-07-01T00:00:00Z', end: '2026-07-01T02:00:00Z' }]),
    ).toBe(2);
  });

  it('odd count → the middle value', () => {
    const pairs = [
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T01:00:00Z' }, // 1h
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T05:00:00Z' }, // 5h
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T03:00:00Z' }, // 3h
    ];
    expect(medianHours(pairs)).toBe(3);
  });

  it('even count → average of the two middle values', () => {
    const pairs = [
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T01:00:00Z' }, // 1h
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T05:00:00Z' }, // 5h
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T03:00:00Z' }, // 3h
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T07:00:00Z' }, // 7h
    ];
    expect(medianHours(pairs)).toBe(4); // (3 + 5) / 2
  });

  it('drops negative deltas (data anomalies) instead of clamping to 0', () => {
    const pairs = [
      { start: '2026-07-01T05:00:00Z', end: '2026-07-01T00:00:00Z' }, // -5h, dropped
      { start: '2026-07-01T00:00:00Z', end: '2026-07-01T02:00:00Z' }, // 2h, kept
    ];
    expect(medianHours(pairs)).toBe(2);
  });

  it('all-negative pairs → null, not a fabricated median', () => {
    expect(
      medianHours([{ start: '2026-07-01T05:00:00Z', end: '2026-07-01T00:00:00Z' }]),
    ).toBeNull();
  });
});
