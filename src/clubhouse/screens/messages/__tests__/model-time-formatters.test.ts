import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { railTime } from '../inbox/model';
import { clock, dayLabel, parts, sectionOf, untilLabel } from '../model-time';

/**
 * F-0010 (route-switch frame cost): the Messages time helpers run once per bubble, per rail row and per day separator in the first frame
 * after a route switch. A date formatter is expensive to build (it resolves the zone), so each kind is built once per zone and reused:
 * the label for an instant is the same string it always was, and a thousand labels build no more formatters than one does.
 */

const NOW = '2026-11-13T15:00:00.000Z';
const ZONE = 'America/New_York';
const Real = Intl.DateTimeFormat;
let built = 0;

beforeEach(() => {
  built = 0;
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

/** Every helper once, over instants that reach each branch (today, yesterday, this week, earlier). */
function sweep(offsetDays: number) {
  const out: string[] = [];
  for (const back of [0, 1, 3, 10]) {
    const iso = new Date(Date.parse(NOW) - (back * 86_400_000 + offsetDays * 60_000)).toISOString();
    out.push(parts(iso, ZONE), clock(iso, ZONE), clock(iso, ZONE, '24'), dayLabel(iso, NOW, ZONE), sectionOf(iso, NOW, ZONE), railTime(iso, NOW, ZONE), railTime(iso, NOW, ZONE, '24'));
    out.push(untilLabel(new Date(Date.parse(NOW) + back * 86_400_000).toISOString(), NOW, ZONE));
  }
  return out;
}

describe('F-0010 the Messages time helpers reuse their formatters', () => {
  it('builds no formatter after the first sweep, however many labels it makes', () => {
    sweep(0);
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    for (let i = 1; i <= 250; i++) sweep(i);
    expect(built).toBe(afterFirst);
  });

  it('is bounded by the kinds of label and the zones, not by the number of messages', () => {
    for (let i = 0; i < 100; i++) sweep(i);
    // parts, 12- and 24-hour clock, weekday long and short, month and day: at most a handful per zone.
    expect(built).toBeLessThanOrEqual(8);
  });

  it('keeps zones apart: the same instant is a different day in a different zone', () => {
    const iso = '2026-11-13T03:30:00.000Z';
    expect(parts(iso, 'America/New_York')).toBe('2026-11-12');
    expect(parts(iso, 'Asia/Tokyo')).toBe('2026-11-13');
    expect(clock(iso, 'America/New_York')).toBe('10:30 PM');
    expect(clock(iso, 'Asia/Tokyo')).toBe('12:30 PM');
  });

  it('says what it always said', () => {
    const at = (back: number) => new Date(Date.parse(NOW) - back * 86_400_000).toISOString();
    expect(clock(NOW, ZONE)).toBe('10:00 AM');
    expect(clock(NOW, ZONE, '24')).toBe('10:00');
    expect(dayLabel(at(0), NOW, ZONE)).toBe('Today');
    expect(dayLabel(at(1), NOW, ZONE)).toBe('Yesterday');
    expect(dayLabel(at(3), NOW, ZONE)).toBe('Tuesday');
    expect(dayLabel(at(10), NOW, ZONE)).toBe('Nov 3');
    expect(railTime(at(0), NOW, ZONE)).toBe('10:00 AM');
    expect(railTime(at(1), NOW, ZONE)).toBe('Yesterday');
    expect(railTime(at(3), NOW, ZONE)).toBe('Tue');
    expect(railTime(at(10), NOW, ZONE)).toBe('Nov 3');
    expect(untilLabel(new Date(Date.parse(NOW) + 86_400_000).toISOString(), NOW, ZONE)).toBe('tomorrow');
    expect(untilLabel(new Date(Date.parse(NOW) + 3 * 86_400_000).toISOString(), NOW, ZONE)).toBe('Monday');
    expect(sectionOf(at(0), NOW, ZONE)).toBe('today');
    expect(sectionOf(at(3), NOW, ZONE)).toBe('week');
    expect(sectionOf(at(10), NOW, ZONE)).toBe('earlier');
    expect(sectionOf(null, NOW, ZONE)).toBe('earlier');
  });

  it('an unknown zone fails as it always did, every time, and is never cached as a formatter', () => {
    expect(() => clock(NOW, 'Not/AZone')).toThrow(RangeError);
    expect(() => clock(NOW, 'Not/AZone')).toThrow(RangeError);
    expect(clock(NOW, ZONE)).toBe('10:00 AM');
  });
});
