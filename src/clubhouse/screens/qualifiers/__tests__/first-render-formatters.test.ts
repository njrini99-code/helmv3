import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-0010 (route-switch frame cost): the Qualifiers page's chunk is evaluated in the first frame after a switch, and its modules built
 * their date formatters when they loaded, used or not. They are built on first use now, once.
 */

const Real = Intl.DateTimeFormat;
let built = 0;
beforeEach(() => {
  built = 0;
  vi.resetModules();
  class Counting extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args);
      built += 1;
    }
  }
  Intl.DateTimeFormat = Counting as unknown as typeof Intl.DateTimeFormat;
});
afterEach(() => {
  Intl.DateTimeFormat = Real;
});

describe('F-0010 Qualifiers builds no formatter when its modules load', () => {
  it('the model', async () => {
    const m = await import('../model');
    expect(built).toBe(0);
    expect(m.dayLabel('2026-09-22')).toBe('Sep 22');
    expect(m.rangeLabel('2026-09-22', '2026-10-01')).toBe('Sep 22 – Oct 1, 2026');
    expect(m.rangeLabel('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
    const afterFirst = built;
    for (let i = 0; i < 100; i++) m.rangeLabel('2026-09-22', '2026-10-01');
    expect(built).toBe(afterFirst);
  });

  it('the sections', async () => {
    await import('../QualifierSections');
    expect(built).toBe(0);
  });
});
