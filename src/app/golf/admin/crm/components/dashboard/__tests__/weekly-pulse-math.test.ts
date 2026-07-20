import { describe, expect, it } from 'vitest';
import { deltaFor, sparkPoints } from '../weekly-pulse-math';
import type { WeeklyKpiRow } from '@/app/golf/actions/crm-kpis';

function row(weekStart: string, sent: number): WeeklyKpiRow {
  return {
    week_start: weekStart,
    sent,
    calls: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    stage_advances: 0,
  };
}

describe('deltaFor', () => {
  it('reports "up" when the current (last) week is greater than the previous week', () => {
    const rows = [row('2026-07-06', 10), row('2026-07-13', 25)];
    const result = deltaFor(rows, 'sent');
    expect(result).toEqual({ current: 25, previous: 10, direction: 'up' });
  });

  it('reports "down" when the current week is less than the previous week', () => {
    const rows = [row('2026-07-06', 40), row('2026-07-13', 12)];
    const result = deltaFor(rows, 'sent');
    expect(result).toEqual({ current: 12, previous: 40, direction: 'down' });
  });

  it('reports "flat" when the current week equals the previous week', () => {
    const rows = [row('2026-07-06', 18), row('2026-07-13', 18)];
    const result = deltaFor(rows, 'sent');
    expect(result).toEqual({ current: 18, previous: 18, direction: 'flat' });
  });

  it('treats a single-row array as current vs an implicit 0 previous', () => {
    const rows = [row('2026-07-13', 7)];
    const result = deltaFor(rows, 'sent');
    expect(result).toEqual({ current: 7, previous: 0, direction: 'up' });
  });

  it('returns all-zero/flat for an empty array', () => {
    const result = deltaFor([], 'sent');
    expect(result).toEqual({ current: 0, previous: 0, direction: 'flat' });
  });
});

describe('sparkPoints', () => {
  it('centers a flat line vertically when every value in the series is equal', () => {
    const rows = [row('2026-06-01', 5), row('2026-06-08', 5), row('2026-06-15', 5)];
    const points = sparkPoints(rows, 'sent', 100, 20);
    const parsed = points.split(' ').map((p) => p.split(',').map(Number));
    expect(parsed).toHaveLength(3);
    for (const [, y] of parsed) {
      expect(y).toBe(10); // height / 2, no divide-by-zero NaN
    }
    // x coordinates spread evenly across the full width
    expect(parsed[0]?.[0]).toBe(0);
    expect(parsed[2]?.[0]).toBe(100);
  });

  it('normalizes a varying series to fill [0,height] with the max value at y=0 (top)', () => {
    const rows = [row('2026-06-01', 0), row('2026-06-08', 5), row('2026-06-15', 10)];
    const points = sparkPoints(rows, 'sent', 100, 20);
    const parsed = points.split(' ').map((p) => p.split(',').map(Number));
    expect(parsed[0]?.[1]).toBe(20); // min value -> bottom
    expect(parsed[2]?.[1]).toBe(0); // max value -> top
    expect(parsed[1]?.[1]).toBe(10); // midpoint value -> vertical middle
  });

  it('returns an empty string for an empty row array', () => {
    expect(sparkPoints([], 'sent', 100, 20)).toBe('');
  });

  it('centers a single point horizontally without dividing by zero', () => {
    const rows = [row('2026-07-13', 9)];
    const points = sparkPoints(rows, 'sent', 100, 20);
    const parsed = points.split(',').map(Number);
    expect(parsed[0]).toBe(50); // width / 2
  });
});
