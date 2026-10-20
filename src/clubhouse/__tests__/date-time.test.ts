import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, clampDate, formatDate, formatTime, localToday, monthGrid, moveDay, parseDateInput, parseHm, parseIso, parseTimeInput, timeSlots,
} from '../ui/date-time';

// Thursday 15 October 2026.
const today = '2026-10-15';
const d = (text: string, extra: { min?: string; max?: string } = {}) => parseDateInput(text, { today, ...extra });

describe('calendar days', () => {
  it('reads only real days', () => {
    expect(parseIso('2026-02-28')).toEqual({ y: 2026, m: 2, d: 28 });
    expect(parseIso('2026-02-30')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
    expect(parseIso('10/15/2026')).toBeNull();
    expect(parseIso('')).toBeNull();
  });

  it('adds days and months across the edges without the clock', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
  });

  it('writes a day in the app voice', () => {
    expect(formatDate('2026-10-15')).toBe('Thu 15 Oct 2026');
    expect(formatDate('2027-01-01')).toBe('Fri 1 Jan 2027');
    expect(formatDate('')).toBe('');
  });

  it('takes today from the device calendar, not UTC', () => {
    // 22:30 on the 14th in New York is already the 15th in UTC: the local day is the 14th.
    const late = new Date(2026, 9, 14, 22, 30);
    expect(localToday(late)).toBe('2026-10-14');
  });

  it('lays the month out in whole weeks, week start first', () => {
    const weeks = monthGrid('2026-10-15');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]).toEqual({ date: '2026-09-27', inMonth: false });
    expect(weeks[0]![4]).toEqual({ date: '2026-10-01', inMonth: true });
    expect(weeks[4]![6]).toEqual({ date: '2026-10-31', inMonth: true });
    expect(monthGrid('2026-10-15', 1)[0]![0]!.date).toBe('2026-09-28');
  });
});

describe('keyboard movement in the grid', () => {
  it('moves by day, week, month and year', () => {
    expect(moveDay(today, 'ArrowRight')).toBe('2026-10-16');
    expect(moveDay(today, 'ArrowLeft')).toBe('2026-10-14');
    expect(moveDay(today, 'ArrowDown')).toBe('2026-10-22');
    expect(moveDay(today, 'ArrowUp')).toBe('2026-10-08');
    expect(moveDay(today, 'PageDown')).toBe('2026-11-15');
    expect(moveDay(today, 'PageUp')).toBe('2026-09-15');
    expect(moveDay(today, 'PageDown', { shift: true })).toBe('2027-10-15');
    expect(moveDay(today, 'Home')).toBe('2026-10-11');
    expect(moveDay(today, 'End')).toBe('2026-10-17');
    expect(moveDay(today, 'a')).toBeNull();
  });

  it('stops at min and max', () => {
    expect(moveDay(today, 'ArrowLeft', { min: '2026-10-15' })).toBe('2026-10-15');
    expect(moveDay(today, 'PageDown', { max: '2026-10-20' })).toBe('2026-10-20');
    expect(clampDate('2026-01-01', '2026-10-01', '2026-10-31')).toBe('2026-10-01');
  });
});

describe('typed dates', () => {
  it('reads numeric forms, month first', () => {
    expect(d('10/15')).toBe('2026-10-15');
    expect(d('10/15/26')).toBe('2026-10-15');
    expect(d('10-15-2026')).toBe('2026-10-15');
    expect(d('2026-10-15')).toBe('2026-10-15');
    expect(d('15/10')).toBe('2026-10-15');
    expect(d('2/30')).toBeNull();
    expect(d('13/45')).toBeNull();
  });

  it('reads month names either way round, and its own words back', () => {
    expect(d('oct 15')).toBe('2026-10-15');
    expect(d('15 oct')).toBe('2026-10-15');
    expect(d('October 15, 2027')).toBe('2027-10-15');
    expect(d('15 Oct 2026')).toBe('2026-10-15');
    expect(d('Thu 15 Oct 2026')).toBe('2026-10-15');
    expect(d('sept 3')).toBe('2026-09-03');
    expect(d('oct 15th')).toBe('2026-10-15');
    expect(d('smarch 3')).toBeNull();
  });

  it('reads relative words and weekdays', () => {
    expect(d('today')).toBe(today);
    expect(d('tomorrow')).toBe('2026-10-16');
    expect(d('yesterday')).toBe('2026-10-14');
    expect(d('fri')).toBe('2026-10-16');
    expect(d('Friday')).toBe('2026-10-16');
    expect(d('next mon')).toBe('2026-10-19');
    expect(d('thu')).toBe('2026-10-22'); // never today: that is "today"
    expect(d('last fri')).toBe('2026-10-09');
  });

  it('takes the weekday back when max rules the next one out', () => {
    expect(d('fri', { max: today })).toBe('2026-10-09');
    expect(d('mon', { max: today })).toBe('2026-10-12');
  });

  it('fills a missing year from the range', () => {
    expect(d('1/5')).toBe('2026-01-05');
    expect(d('1/5', { min: today })).toBe('2027-01-05');
    expect(d('12/25', { max: today })).toBe('2025-12-25');
    expect(d('2/29')).toBeNull();
  });

  it('does not judge the range: an out-of-range day still parses', () => {
    expect(d('11/30', { max: today })).toBe('2025-11-30'); // last year fits
    expect(d('10/20/2026', { max: today })).toBe('2026-10-20'); // an explicit year is kept, the form's message speaks
  });

  it('rejects what is not a date', () => {
    expect(d('')).toBeNull();
    expect(d('soon')).toBeNull();
    expect(d('10')).toBeNull();
    expect(d('2026-1')).toBeNull();
  });
});

describe('times', () => {
  const t = parseTimeInput;
  it('reads am and pm as said', () => {
    expect(t('3p')).toBe('15:00');
    expect(t('3 PM')).toBe('15:00');
    expect(t('3:30pm')).toBe('15:30');
    expect(t('3:30 P.M.')).toBe('15:30');
    expect(t('9a')).toBe('09:00');
    expect(t('12a')).toBe('00:00');
    expect(t('12p')).toBe('12:00');
    expect(t('13pm')).toBeNull();
  });

  it('reads 24-hour forms as written', () => {
    expect(t('15:30')).toBe('15:30');
    expect(t('1530')).toBe('15:30');
    expect(t('0730')).toBe('07:30');
    expect(t('07:30')).toBe('07:30');
    expect(t('06:00')).toBe('06:00');
    expect(t('23:45')).toBe('23:45');
    expect(t('00:00')).toBe('00:00');
    expect(t('15')).toBe('15:00');
  });

  it('puts a bare hour where a tee sheet would', () => {
    expect(t('3')).toBe('15:00');
    expect(t('7')).toBe('07:00');
    expect(t('11')).toBe('11:00');
    expect(t('12')).toBe('12:00');
    expect(t('930')).toBe('09:30');
    expect(t('330')).toBe('15:30');
    expect(t('7:30')).toBe('07:30');
    expect(t('3:30')).toBe('15:30');
    expect(t('noon')).toBe('12:00');
    expect(t('midnight')).toBe('00:00');
  });

  it('rejects what is not a time', () => {
    expect(t('')).toBeNull();
    expect(t('25:00')).toBeNull();
    expect(t('10:75')).toBeNull();
    expect(t('2460')).toBeNull();
    expect(t('later')).toBeNull();
  });

  it('writes the calendar wording', () => {
    expect(formatTime('15:30')).toBe('3:30 PM');
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('07:05')).toBe('7:05 AM');
    expect(formatTime('')).toBe('');
    expect(parseHm('24:00')).toBeNull();
  });

  it('lists the day by the quarter hour and keeps an off-grid value in place', () => {
    const slots = timeSlots(15);
    expect(slots).toHaveLength(96);
    expect(slots[0]).toBe('00:00');
    expect(slots[95]).toBe('23:45');
    const off = timeSlots(15, '15:05');
    expect(off).toHaveLength(97);
    expect(off[off.indexOf('15:05') - 1]).toBe('15:00');
    expect(off[off.indexOf('15:05') + 1]).toBe('15:15');
  });
});
