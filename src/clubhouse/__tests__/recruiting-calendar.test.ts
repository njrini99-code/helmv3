import { describe, expect, it } from 'vitest';
import {
  RECRUITING_CALENDARS,
  calendarLine,
  localDay,
  parseDivision,
  periodAt,
  remoteContactHint,
  type ChPeriod,
} from '../data/recruiting-calendar';

/** P014 C2: the recruiting calendar, looked up by date, from the 2026-27 rule books. Noon Eastern unless a test says otherwise. */
const ET = 'America/New_York';
const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00-05:00`);
const line = (div: Parameters<typeof calendarLine>[0], g: Parameters<typeof calendarLine>[1], day: string, time?: string) =>
  calendarLine(div, g, at(day, time), ET)?.text ?? null;

describe('recruiting calendar · Division I golf', () => {
  it('Oct 8 is a contact period that runs to the day before the signing-week dead period', () => {
    expect(line('ncaa-d1', 'mens', '2026-10-08')).toBe('Contact period · in-person contact allowed through Nov 8');
    expect(line('ncaa-d1', 'womens', '2026-10-08')).toBe('Contact period · in-person contact allowed through Nov 8');
  });

  it('signing week (Mon Nov 9 to Thu Nov 12, the week of the Nov 11 signing date) is dead, then contact resumes to Thanksgiving eve', () => {
    expect(line('ncaa-d1', 'mens', '2026-11-10')).toBe('Dead period · no in-person contact or visits through Nov 12');
    expect(line('ncaa-d1', 'mens', '2026-11-13')).toBe('Contact period · in-person contact allowed through Nov 25');
  });

  it('Thanksgiving through the Sunday after (Nov 26 to 29) is dead for both', () => {
    expect(line('ncaa-d1', 'mens', '2026-11-27')).toBe('Dead period · no in-person contact or visits through Nov 29');
    expect(line('ncaa-d1', 'womens', '2026-11-27')).toBe('Dead period · no in-person contact or visits through Nov 29');
  });

  it('Dec 1: men are in a quiet period, women in a contact period, each with its convention caveat', () => {
    expect(line('ncaa-d1', 'mens', '2026-12-01')).toBe('Quiet period · in-person contact on campus only, through Dec 22 (dead during the GCAA convention)');
    expect(line('ncaa-d1', 'womens', '2026-12-01')).toBe('Contact period · in-person contact allowed through Dec 23 (dead during the WGCA convention)');
  });

  it('with the program gender unknown, a day the two calendars disagree says nothing; a day they agree says it', () => {
    expect(line('ncaa-d1', null, '2026-12-01')).toBeNull();
    expect(line('ncaa-d1', null, '2026-11-10')).toBe('Dead period · no in-person contact or visits through Nov 12');
  });

  it('Dec 25 is dead for both, to Jan 1 (men) and Dec 27 (women); Jan 2 is contact for both', () => {
    expect(line('ncaa-d1', 'mens', '2026-12-25')).toBe('Dead period · no in-person contact or visits through Jan 1');
    expect(line('ncaa-d1', 'womens', '2026-12-25')).toBe('Dead period · no in-person contact or visits through Dec 27');
    expect(line('ncaa-d1', 'mens', '2027-01-02')).toBe('Contact period · in-person contact allowed through Jul 31');
    expect(line('ncaa-d1', 'womens', '2027-01-02')).toBe('Contact period · in-person contact allowed through Jul 31');
  });

  it('a day outside the covered season has no answer, never the nearest period', () => {
    expect(line('ncaa-d1', 'mens', '2027-08-01')).toBeNull();
    expect(line('ncaa-d1', 'mens', '2026-07-31')).toBeNull();
  });

  it('the day is the coach’s own: 11 p.m. Pacific on Nov 8 is still the contact period', () => {
    const lateNov8Pacific = new Date('2026-11-09T07:00:00Z');
    expect(calendarLine('ncaa-d1', 'mens', lateNov8Pacific, 'America/Los_Angeles')?.kind).toBe('contact');
    expect(calendarLine('ncaa-d1', 'mens', lateNov8Pacific, 'UTC')?.kind).toBe('dead');
  });

  it('every Division I calendar covers the whole season with no gaps or overlaps', () => {
    for (const g of ['mens', 'womens'] as const) {
      const cal = RECRUITING_CALENDARS['ncaa-d1'][g];
      if (cal?.calendar !== 'periods') throw new Error('expected periods');
      const ps: ChPeriod[] = cal.periods;
      expect(ps[0]!.from).toBe('2026-08-01');
      expect(ps.at(-1)!.to).toBe('2027-07-31');
      for (let i = 1; i < ps.length; i++) {
        const next = new Date(Date.parse(`${ps[i - 1]!.to}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
        expect(ps[i]!.from).toBe(next);
      }
      for (const p of ps) expect(p.source).toMatch(/^https:\/\/web3\.ncaa\.org\/lsdbi\//);
    }
  });
});

describe('recruiting calendar · Division II, III, NAIA, NJCAA', () => {
  it('Division II: the signing dead period runs 7 a.m. Nov 9 to 7 a.m. Nov 11; outside it, no golf periods', () => {
    expect(line('ncaa-d2', 'mens', '2026-11-09', '06:59')).toBe('No golf recruiting periods in Division II');
    expect(line('ncaa-d2', 'mens', '2026-11-09', '07:00')).toBe('Dead period · no in-person contact or visits until 7 a.m. Nov 11');
    expect(line('ncaa-d2', 'womens', '2026-11-10')).toBe('Dead period · no in-person contact or visits until 7 a.m. Nov 11');
    expect(line('ncaa-d2', 'mens', '2026-11-11', '06:30')).toBe('Dead period · no in-person contact or visits until 7 a.m. Nov 11');
    expect(line('ncaa-d2', 'mens', '2026-11-11', '15:00')).toBe('No golf recruiting periods in Division II');
    expect(line('ncaa-d2', 'mens', '2026-10-08')).toBe('No golf recruiting periods in Division II');
  });

  it('Division III, the NAIA and the NJCAA have no recruiting calendar, and say so, with their sources', () => {
    expect(calendarLine('ncaa-d3', 'mens', at('2026-11-10'), ET)).toMatchObject({ kind: 'none', text: 'No recruiting calendar in Division III' });
    expect(calendarLine('naia', 'womens', at('2026-12-25'), ET)).toMatchObject({ kind: 'none', text: 'No recruiting calendar in the NAIA', source: expect.stringContaining('naia.org') });
    expect(calendarLine('njcaa', null, at('2027-01-02'), ET)).toMatchObject({ kind: 'none', text: 'No recruiting calendar in the NJCAA' });
  });

  it('periodAt honours clock edges and returns null between periods', () => {
    const d2 = RECRUITING_CALENDARS['ncaa-d2'].all;
    if (d2?.calendar !== 'periods') throw new Error('expected periods');
    expect(periodAt(d2.periods, { day: '2026-11-11', minutes: 6 * 60 + 59 })?.kind).toBe('dead');
    expect(periodAt(d2.periods, { day: '2026-11-11', minutes: 7 * 60 })).toBeNull();
    expect(localDay(new Date('2026-11-09T12:30:00Z'), 'America/New_York')).toEqual({ day: '2026-11-09', minutes: 7 * 60 + 30 });
  });
});

describe('recruiting calendar · Email and Call, and the division', () => {
  it('Division I: no calls or email before June 15 at the end of sophomore year (class of Y: June 15 of Y − 2)', () => {
    expect(remoteContactHint('ncaa-d1', 2029, at('2026-10-08'), ET)).toBe('Division I: no calls or email before June 15, 2027, the end of sophomore year');
    expect(remoteContactHint('ncaa-d1', 2028, at('2026-10-08'), ET)).toBeNull();
    expect(remoteContactHint('ncaa-d1', 2029, at('2027-06-15'), ET)).toBeNull();
    expect(remoteContactHint('ncaa-d1', null, at('2026-10-08'), ET)).toBeNull();
    // No sourced period in any division restricts phone or email, so no other division gets a hint.
    for (const d of ['ncaa-d2', 'ncaa-d3', 'naia', 'njcaa', null] as const) expect(remoteContactHint(d, 2030, at('2026-10-08'), ET)).toBeNull();
  });

  it('reads the organization’s free-text division conservatively', () => {
    expect(parseDivision('NCAA D1')).toBe('ncaa-d1');
    expect(parseDivision('Division I')).toBe('ncaa-d1');
    expect(parseDivision('NCAA Division II')).toBe('ncaa-d2');
    expect(parseDivision('D3')).toBe('ncaa-d3');
    expect(parseDivision('Div. III')).toBe('ncaa-d3');
    expect(parseDivision('NAIA')).toBe('naia');
    expect(parseDivision('NJCAA D1')).toBe('njcaa');
    expect(parseDivision('JUCO D1')).toBeNull();
    expect(parseDivision('CCCAA')).toBeNull();
    expect(parseDivision('ACC')).toBeNull();
    expect(parseDivision('')).toBeNull();
    expect(parseDivision(null)).toBeNull();
  });
});
