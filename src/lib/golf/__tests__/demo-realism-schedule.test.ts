import { describe, it, expect } from 'vitest';
import {
  addDaysIso,
  computeEventSchedule,
  computeMessageSchedule,
  computeRoundDateShift,
  daysBetween,
  localToUtcIso,
  naturalTimeForIndex,
  todayIsoInTz,
  tzOffsetHours,
  type EventDef,
} from '../demo-realism-schedule';

const TZ = 'America/New_York';

describe('demo-realism-schedule', () => {
  describe('tzOffsetHours / localToUtcIso', () => {
    it('uses EDT (-4) in summer and EST (-5) in winter for America/New_York', () => {
      expect(tzOffsetHours('2026-07-17', TZ)).toBe(-4);
      expect(tzOffsetHours('2026-01-15', TZ)).toBe(-5);
    });

    it('converts a 7am ET tee time to 11:00 UTC in summer, not a raw 07:00 UTC', () => {
      // This is the exact regression #910 flagged: "Coastal Collegiate
      // Invitational" showing a 3:00 AM start because 07:00 was written to
      // the DB as a raw UTC hour instead of an ET-local hour.
      const iso = localToUtcIso('2026-06-12', 7, 0, TZ);
      expect(iso).toBe('2026-06-12T11:00:00.000Z');
    });

    it('converts an 8am ET time to 13:00 UTC in winter (EST)', () => {
      const iso = localToUtcIso('2026-01-15', 8, 0, TZ);
      expect(iso).toBe('2026-01-15T13:00:00.000Z');
    });
  });

  describe('addDaysIso / daysBetween', () => {
    it('adds and subtracts days across month boundaries', () => {
      expect(addDaysIso('2026-07-30', 5)).toBe('2026-08-04');
      expect(addDaysIso('2026-07-05', -10)).toBe('2026-06-25');
    });

    it('is the inverse of daysBetween', () => {
      expect(daysBetween(addDaysIso('2026-07-17', 42), '2026-07-17')).toBe(42);
      expect(daysBetween('2026-07-17', '2026-07-17')).toBe(0);
    });
  });

  describe('naturalTimeForIndex', () => {
    it('never a flat hourly progression like the stale seed (08,09,10,...)', () => {
      const hours = Array.from({ length: 15 }, (_, i) => naturalTimeForIndex(i).hour);
      // The stale bug was hours[i] === 8 + i for every i. Assert that never holds.
      expect(hours.some((h, i) => h !== 8 + i)).toBe(true);
    });

    it('every hour falls in the 7-9am or 3-6pm window', () => {
      for (let i = 0; i < 30; i++) {
        const { hour, minute } = naturalTimeForIndex(i);
        const inMorning = hour >= 7 && hour <= 9;
        const inAfternoon = hour >= 15 && hour <= 18;
        expect(inMorning || inAfternoon).toBe(true);
        expect(minute).toBeGreaterThanOrEqual(0);
        expect(minute).toBeLessThan(60);
      }
    });

    it('minutes are varied, not all :00', () => {
      const minutes = Array.from({ length: 10 }, (_, i) => naturalTimeForIndex(i).minute);
      expect(minutes.some((m) => m !== 0)).toBe(true);
    });
  });

  describe('computeMessageSchedule', () => {
    it('returns [] for an empty list', () => {
      expect(computeMessageSchedule([], '2026-07-17', TZ)).toEqual([]);
    });

    it('preserves relative day-spacing (same-day pairs stay same-day)', () => {
      const original = [
        '2026-05-28T08:00:00+00:00',
        '2026-05-29T09:00:00+00:00',
        '2026-05-29T10:00:00+00:00', // same day as previous
        '2026-06-10T12:00:00+00:00', // 13 days after the first
      ];
      const result = computeMessageSchedule(original, '2026-07-17', TZ);
      expect(result).toHaveLength(4);
      const dates = result.map((iso) => iso.slice(0, 10));
      // message 1 and 2 remain on the same calendar day
      expect(dates[1]).toBe(dates[2]);
      // spacing between message 0 and message 3 is preserved (13 days)
      expect(daysBetween(dates[3]!, dates[0]!)).toBe(13);
    });

    it('always lands the most recent message on "yesterday", never in the future', () => {
      const original = ['2026-01-01T08:00:00+00:00', '2026-01-02T09:00:00+00:00'];
      const today = '2026-07-17';
      const result = computeMessageSchedule(original, today, TZ);
      const lastDate = result[result.length - 1]!.slice(0, 10);
      expect(lastDate).toBe(addDaysIso(today, -1));
      for (const iso of result) {
        expect(Date.parse(iso)).toBeLessThan(Date.parse(`${today}T23:59:59Z`));
      }
    });

    it('is idempotent: re-running on its own output (same "today") is a no-op', () => {
      const original = [
        '2026-05-28T08:00:00+00:00',
        '2026-05-29T09:00:00+00:00',
        '2026-06-10T12:00:00+00:00',
      ];
      const today = '2026-07-17';
      const once = computeMessageSchedule(original, today, TZ);
      const twice = computeMessageSchedule(once, today, TZ);
      expect(twice).toEqual(once);
    });
  });

  describe('computeEventSchedule', () => {
    const defs: EventDef[] = [
      { title: 'Past Practice', startOffsetDays: -7, endOffsetDays: -7, startHour: 14, startMinute: 0, endHour: 17, endMinute: 0 },
      { title: 'Coastal Collegiate Invitational', startOffsetDays: -35, endOffsetDays: -34, startHour: 7, startMinute: 0, endHour: 18, endMinute: 0 },
      { title: 'Future Practice', startOffsetDays: 2, endOffsetDays: 2, startHour: 14, startMinute: 0, endHour: 17, endMinute: 0 },
    ];

    it('marks negative-offset events completed and positive-offset events scheduled', () => {
      const result = computeEventSchedule('2026-07-17', defs, TZ);
      expect(result.find((e) => e.title === 'Past Practice')?.status).toBe('completed');
      expect(result.find((e) => e.title === 'Coastal Collegiate Invitational')?.status).toBe('completed');
      expect(result.find((e) => e.title === 'Future Practice')?.status).toBe('scheduled');
    });

    it('produces a sane (non-3am) local start time for the invitational tee-off', () => {
      const result = computeEventSchedule('2026-07-17', defs, TZ);
      const invitational = result.find((e) => e.title === 'Coastal Collegiate Invitational')!;
      // 2026-07-17 - 35d = 2026-06-12 (EDT, offset -4) → 07:00 local = 11:00 UTC
      expect(invitational.startTime).toBe('2026-06-12T11:00:00.000Z');
    });

    it('rolls forward with "today" — the same defs always land on the correct side of now', () => {
      const dayA = computeEventSchedule('2026-07-17', defs, TZ);
      const dayB = computeEventSchedule('2026-08-17', defs, TZ);
      for (const day of [dayA, dayB]) {
        expect(day.find((e) => e.title === 'Future Practice')?.status).toBe('scheduled');
        expect(day.find((e) => e.title === 'Past Practice')?.status).toBe('completed');
      }
      // Absolute dates shift with "today" — this is the whole point of a
      // rolling schedule instead of frozen seed-time offsets.
      expect(dayA.find((e) => e.title === 'Future Practice')?.startTime).not.toBe(
        dayB.find((e) => e.title === 'Future Practice')?.startTime,
      );
    });
  });

  describe('computeRoundDateShift', () => {
    it('returns null when the newest round is within the stale threshold', () => {
      const dates = ['2026-07-10', '2026-07-14', '2026-07-15'];
      expect(computeRoundDateShift(dates, '2026-07-17', 5, 1)).toBeNull();
    });

    it('returns null for an empty list', () => {
      expect(computeRoundDateShift([], '2026-07-17', 5, 1)).toBeNull();
    });

    it('shifts forward so the newest round lands at the target offset', () => {
      const dates = ['2026-04-08', '2026-06-29', '2026-07-11'];
      const shift = computeRoundDateShift(dates, '2026-07-17', 5, 1);
      expect(shift).not.toBeNull();
      const newest = addDaysIso('2026-07-11', shift!);
      expect(newest).toBe(addDaysIso('2026-07-17', -1));
    });

    it('preserves relative spacing between rounds under a uniform shift', () => {
      const dates = ['2026-04-08', '2026-06-29', '2026-07-11'];
      const shift = computeRoundDateShift(dates, '2026-07-17', 5, 1)!;
      const shifted = dates.map((d) => addDaysIso(d, shift));
      expect(daysBetween(shifted[2]!, shifted[0]!)).toBe(daysBetween(dates[2]!, dates[0]!));
      expect(daysBetween(shifted[1]!, shifted[0]!)).toBe(daysBetween(dates[1]!, dates[0]!));
    });
  });

  describe('todayIsoInTz', () => {
    it('formats as YYYY-MM-DD', () => {
      const iso = todayIsoInTz(TZ, new Date('2026-07-17T12:00:00Z'));
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(iso).toBe('2026-07-17');
    });
  });
});
