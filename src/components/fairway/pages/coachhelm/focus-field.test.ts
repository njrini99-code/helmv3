/**
 * The instrument's geometry. Everything here is pure: it decides where a mark
 * lands, and a mark in the wrong place is a lie told in pixels.
 */
import { describe, it, expect } from 'vitest';

import {
  dateFraction,
  fieldFloor,
  fieldY,
  focusFieldTicks,
  type FocusFieldRow,
} from './focus-field';

const DOMAIN = { start: '2026-06-01', end: '2026-09-01' };

function row(raws: number[], id = 'a'): FocusFieldRow {
  return {
    id,
    title: id,
    metricLabel: 'metric',
    state: {
      kind: 'plot',
      marks: raws.map((raw, i) => ({
        day: `2026-06-0${i + 1}`,
        value: raw,
        raw,
        pct: Math.max(0, Math.min(100, raw)),
      })),
    },
    readout: { kind: 'pct', pct: 50 },
    currentDisplay: null,
    trend: null,
  };
}

describe('dateFraction', () => {
  it('puts the domain start at 0 and the end at 100', () => {
    expect(dateFraction('2026-06-01', DOMAIN)).toBe(0);
    expect(dateFraction('2026-09-01', DOMAIN)).toBe(100);
  });

  it('clamps a reading outside the domain instead of drawing it off the track', () => {
    expect(dateFraction('2026-01-01', DOMAIN)).toBe(0);
    expect(dateFraction('2027-01-01', DOMAIN)).toBe(100);
  });

  it('survives a single-day domain rather than dividing by zero', () => {
    const x = dateFraction('2026-06-01', { start: '2026-06-01', end: '2026-06-01' });
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBe(0);
  });

  it('returns 0 for an unparseable date rather than NaN', () => {
    expect(dateFraction('not-a-date', DOMAIN)).toBe(0);
  });
});

describe('fieldFloor', () => {
  it('is the baseline when nobody has slipped below their starting value', () => {
    expect(fieldFloor([row([10, 40, 80])])).toBe(0);
  });

  it('follows the deepest slip so a backslide is legible', () => {
    expect(fieldFloor([row([10, -25], 'a'), row([40, 60], 'b')])).toBe(-25);
  });

  it('is shared across rows, because rows that share an axis must be comparable', () => {
    const floor = fieldFloor([row([-30], 'a'), row([50], 'b')]);
    // Row b is measured on row a's scale, not on its own.
    expect(fieldY(0, floor)).toBeLessThan(100);
    expect(fieldY(0, floor)).toBe(fieldY(0, fieldFloor([row([-30], 'a')])));
  });

  it('stops following a collapse that would flatten every other row', () => {
    expect(fieldFloor([row([-400])])).toBe(-60);
  });

  it('ignores rows with nothing plotted', () => {
    const empty: FocusFieldRow = { ...row([]), state: { kind: 'no-readings' } };
    expect(fieldFloor([empty])).toBe(0);
  });
});

describe('fieldY', () => {
  it('puts the target rule at the top and the floor at the bottom', () => {
    expect(fieldY(100, -20)).toBe(0);
    expect(fieldY(-20, -20)).toBe(100);
  });

  it('places the baseline below the middle when the floor follows a slip', () => {
    // floor -20, span 120: the baseline at 0 sits 100/120 of the way down.
    expect(fieldY(0, -20)).toBeCloseTo(83.33, 1);
  });

  it('puts the baseline at the very bottom when nothing slipped', () => {
    expect(fieldY(0, 0)).toBe(100);
    expect(fieldY(100, 0)).toBe(0);
  });

  it('plots a slip BELOW the baseline rule, which is the whole point', () => {
    const floor = -30;
    expect(fieldY(-15, floor)).toBeGreaterThan(fieldY(0, floor));
  });

  it('clamps beyond the floor rather than escaping the track', () => {
    expect(fieldY(-500, -30)).toBe(100);
    expect(fieldY(500, -30)).toBe(0);
  });
});

describe('focusFieldTicks', () => {
  it('is weekly for a short window', () => {
    const ticks = focusFieldTicks({ start: '2026-06-01', end: '2026-07-06' });
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks[0]!.label).toBe('Jun 1');
  });

  it('is monthly for a long one', () => {
    const ticks = focusFieldTicks({ start: '2026-01-01', end: '2026-09-01' });
    expect(ticks.every((t) => !/\d{1,2}$/.test(t.label) || t.label.startsWith('Jan'))).toBe(true);
  });

  it('yields the right edge so no tick prints under the Today marker', () => {
    for (const tick of focusFieldTicks({ start: '2026-06-01', end: '2026-09-01' })) {
      expect(tick.x).toBeLessThanOrEqual(88);
    }
  });

  it('thins a crowded axis but never blanks the tick carrying the year', () => {
    const ticks = focusFieldTicks({ start: '2024-01-01', end: '2026-09-01' });
    expect(ticks.length).toBeGreaterThan(8);
    const january = ticks.filter((t) => t.key.slice(5, 7) === '01');
    expect(january.length).toBeGreaterThan(0);
    for (const t of january) expect(t.label).not.toBe('');
  });

  it('returns nothing for an unparseable domain rather than throwing', () => {
    expect(focusFieldTicks({ start: 'nope', end: 'also-nope' })).toEqual([]);
  });
});
