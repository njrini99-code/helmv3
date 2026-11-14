import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { classPast, classUnset, yearLineOf, type RosterClock } from '../format';
import { RosterTeamCard } from '../RosterTeamCard';

/*
 * F-0022 (audit 2026-11-13): Jackson and Dylan have graduation_year 2026, set and past (a fifth year, or a row not moved on). The
 * season card counted them "2 not set" and their rows lost the class line. A past year is a year: they read "Class of 2026", on their
 * rows and in the class mix, and "not set" keeps meaning no year (or one too far out to be a class).
 */

afterEach(cleanup);
// The class year turns on 1 August: hold the clock on the audit's day so 2027 stays the Seniors.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T15:00:00Z'));
});
afterAll(() => vi.useRealTimers());
const CLOCK: RosterClock = { tz: 'America/New_York', day: '2026-11-13' };
const DEMO = [2027, 2027, 2027, 2028, 2028, 2029, 2026, 2026].map((gradYear) => ({ gradYear }));

describe('F-0022 a past class year is named, not "not set"', () => {
  it('classUnset counts only a missing or far year; classPast groups the past ones by year', () => {
    expect(classUnset(DEMO, CLOCK)).toBe(0);
    expect(classUnset([...DEMO, { gradYear: null }, { gradYear: 2040 }], CLOCK)).toBe(2);
    expect(classPast(DEMO, CLOCK)).toEqual([{ year: 2026, count: 2, label: 'Class of 2026' }]);
    expect(classPast([{ gradYear: 2026 }, { gradYear: 2025 }, { gradYear: 2027 }], CLOCK)).toEqual([
      { year: 2025, count: 1, label: 'Class of 2025' },
      { year: 2026, count: 1, label: 'Class of 2026' },
    ]);
  });

  it("a past year's row reads its class; a missing year still reads nothing", () => {
    expect(yearLineOf(2026, CLOCK)).toBe('Class of 2026');
    expect(yearLineOf(2027, CLOCK)).toBe('Senior · Class of 2027');
    expect(yearLineOf(null, CLOCK)).toBeNull();
  });

  it('the season card names the class of 2026 and no "not set"; its label still adds up to the roster', () => {
    const { container } = render(<RosterTeamCard viewer="player" season="2026–27" players={DEMO} clock={CLOCK} />);
    const legend = container.querySelector('.ch-rs-mix__lg')!.textContent!;
    expect(legend).toMatch(/2\s*Class of 2026/);
    expect(legend).not.toMatch(/not set/);
    const label = container.querySelector('.ch-rs-mix')!.getAttribute('aria-label')!;
    expect(label).toBe('3 Seniors, 2 Juniors, 1 Sophomore, 2 Class of 2026');
    expect(container.querySelectorAll('.ch-rs-mix i[data-year="none"]')).toHaveLength(1);
  });

  it('past years of two classes each get their own entry, and a missing year still reads "not set"', () => {
    const players = [{ gradYear: 2027 }, { gradYear: 2025 }, { gradYear: 2026 }, { gradYear: null }];
    const { container } = render(<RosterTeamCard viewer="player" season="2026–27" players={players} clock={CLOCK} />);
    const label = container.querySelector('.ch-rs-mix')!.getAttribute('aria-label')!;
    expect(label).toBe('1 Senior, 1 Class of 2025, 1 Class of 2026, 1 not set');
    const sum = [...label.matchAll(/(?:^|, )(\d+) /g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(sum).toBe(players.length);
  });
});
