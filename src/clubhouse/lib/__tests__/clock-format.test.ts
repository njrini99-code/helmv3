import { describe, expect, it } from 'vitest';
import { parseChClock } from '../clock-cookie';
import { clockFromHour, clockFromMinutes, clockHourLabel, meridiemOfHour, restyleClock } from '../clock-format';

describe('parseChClock', () => {
  it('reads only "24" as 24-hour; anything else is the app\'s 12-hour voice', () => {
    expect(parseChClock('24')).toBe('24');
    expect(parseChClock('12')).toBe('12');
    expect(parseChClock(undefined)).toBe('12');
    expect(parseChClock(null)).toBe('12');
    expect(parseChClock('')).toBe('12');
    expect(parseChClock('24h')).toBe('12');
  });
});

describe('clockFromMinutes', () => {
  it('writes 12 hours as the calendar always has, 24 with a leading zero', () => {
    expect(clockFromMinutes(15 * 60 + 30, '12')).toBe('3:30 PM');
    expect(clockFromMinutes(15 * 60 + 30, '24')).toBe('15:30');
    expect(clockFromMinutes(7 * 60 + 5, '24')).toBe('07:05');
    expect(clockFromMinutes(0, '12')).toBe('12:00 AM');
    expect(clockFromMinutes(0, '24')).toBe('00:00');
    expect(clockFromMinutes(12 * 60, '12')).toBe('12:00 PM');
    expect(clockFromMinutes(12 * 60, '24')).toBe('12:00');
  });

  it('drops the half in 12 hours on request, and has none to drop in 24', () => {
    expect(clockFromMinutes(15 * 60 + 30, '12', false)).toBe('3:30');
    expect(clockFromMinutes(15 * 60 + 30, '24', false)).toBe('15:30');
  });

  it('reads an end at midnight as the next day\'s 00:00 in 24 hours', () => {
    expect(clockFromMinutes(24 * 60, '24')).toBe('00:00');
  });
});

describe('clockFromHour', () => {
  it('is the calendar\'s decimal hour in either clock', () => {
    expect(clockFromHour(14.5, '12')).toBe('2:30 PM');
    expect(clockFromHour(14.5, '24')).toBe('14:30');
    expect(clockFromHour(9.25, '12', false)).toBe('9:15');
    expect(clockFromHour(9.25, '24', false)).toBe('09:15');
  });
});

describe('meridiemOfHour and clockHourLabel', () => {
  it('names the half beside a bare time in 12 hours only', () => {
    expect(meridiemOfHour(8, '12')).toBe(' AM');
    expect(meridiemOfHour(15, '12')).toBe(' PM');
    expect(meridiemOfHour(15, '24')).toBe('');
  });

  it('labels a grid hour', () => {
    expect(clockHourLabel(7, '12')).toBe('7 AM');
    expect(clockHourLabel(12, '12')).toBe('12 PM');
    expect(clockHourLabel(21, '12')).toBe('9 PM');
    expect(clockHourLabel(7, '24')).toBe('07:00');
    expect(clockHourLabel(21, '24')).toBe('21:00');
  });
});

describe('restyleClock', () => {
  it('returns 12-hour text exactly as it came', () => {
    for (const t of ['3:30 PM', 'Thu 16 · 7:30 PM · Carolina Inn', '3:00–4:15 PM', 'No times here', '']) {
      expect(restyleClock(t, '12')).toBe(t);
    }
  });

  it('rewrites a time and keeps the words around it', () => {
    expect(restyleClock('3:30 PM', '24')).toBe('15:30');
    expect(restyleClock('Thu 16 · 7:30 PM · Carolina Inn', '24')).toBe('Thu 16 · 19:30 · Carolina Inn');
    expect(restyleClock('Tomorrow · 8:42 AM', '24')).toBe('Tomorrow · 08:42');
    expect(restyleClock('Today 2:28 PM', '24')).toBe('Today 14:28');
    expect(restyleClock('as of 3:05 PM', '24')).toBe('as of 15:05');
  });

  it('reads midnight and noon right', () => {
    expect(restyleClock('12:00 AM', '24')).toBe('00:00');
    expect(restyleClock('12:30 AM', '24')).toBe('00:30');
    expect(restyleClock('12:00 PM', '24')).toBe('12:00');
    expect(restyleClock('12:45 PM', '24')).toBe('12:45');
  });

  it('gives a range\'s start the half of its end when it has none', () => {
    expect(restyleClock('3:00–4:15 PM', '24')).toBe('15:00–16:15');
    expect(restyleClock('9:00 – 10:15 AM', '24')).toBe('09:00 – 10:15');
    expect(restyleClock('Mon 3:00–4:15 PM', '24')).toBe('Mon 15:00–16:15');
    expect(restyleClock('Mon, Wed 3:00–4:15 PM', '24')).toBe('Mon, Wed 15:00–16:15');
    expect(restyleClock('3:30 to 5:00 PM', '24')).toBe('15:30 to 17:00');
  });

  it('puts a start that crosses noon or midnight in the half before its end\'s', () => {
    expect(restyleClock('11:30 – 12:45 PM', '24')).toBe('11:30 – 12:45');
    expect(restyleClock('Mon 11:00–12:30 PM', '24')).toBe('Mon 11:00–12:30');
    expect(restyleClock('11:30–12:45 AM', '24')).toBe('23:30–00:45');
    expect(restyleClock('12:00–1:15 PM', '24')).toBe('12:00–13:15');
    expect(restyleClock('12:30–12:45 PM', '24')).toBe('12:30–12:45');
  });

  it('rewrites both ends when each says its half', () => {
    expect(restyleClock('11:30 AM–12:45 PM', '24')).toBe('11:30–12:45');
    expect(restyleClock('3:30 PM – 5:00 PM', '24')).toBe('15:30 – 17:00');
    expect(restyleClock('Mon · 12:00 PM', '24')).toBe('Mon · 12:00');
  });

  it('rewrites lowercase halves and Intl\'s narrow no-break space', () => {
    expect(restyleClock('3:30 pm', '24')).toBe('15:30');
    expect(restyleClock('3:30pm', '24')).toBe('15:30');
    expect(restyleClock('3:30 PM', '24')).toBe('15:30');
    expect(restyleClock('3:30 PM', '24')).toBe('15:30');
  });

  it('rewrites an hour that names its half', () => {
    expect(restyleClock('No open window between 7 AM and 8 PM.', '24')).toBe('No open window between 07:00 and 20:00.');
  });

  it('leaves a bare h:mm that is not a clock time, and longer numbers, alone', () => {
    expect(restyleClock('A 2:1 ratio', '24')).toBe('A 2:1 ratio');
    expect(restyleClock('Pace 3:45 per hole', '24')).toBe('Pace 3:45 per hole');
    expect(restyleClock('Version 1.3:30 PM', '24')).toBe('Version 1.3:30 PM');
    expect(restyleClock('Held 12:34:56 PM', '24')).toBe('Held 12:34:56 PM');
    expect(restyleClock('Room 12 AMBER', '24')).toBe('Room 12 AMBER');
    expect(restyleClock('I am 3pm', '24')).toBe('I am 15:00');
  });

  it('does not touch an impossible time', () => {
    expect(restyleClock('13:30 PM', '24')).toBe('13:30 PM');
    expect(restyleClock('3:75 PM', '24')).toBe('3:75 PM');
  });

  it('handles several times in one label', () => {
    expect(restyleClock('Depart Mon · 12:00 PM, back Wed · 5:00 PM', '24')).toBe('Depart Mon · 12:00, back Wed · 17:00');
  });
});
