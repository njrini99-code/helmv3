import { describe, expect, it } from 'vitest';
import { defaultNewPractice, newPracticeEvent, newPracticeMinutes, newPracticeProblem, nextWeekday, withStart } from '../new-practice';

const NY = 'America/New_York';

/**
 * Q7 (owner, 12 Nov): New plan creates the practice itself. The coach picks the day, start and end in the sheet, and
 * Create puts the practice on the calendar through the Calendar's own create, then plans it.
 */
describe('a new practice from the New plan sheet', () => {
  it('defaults to the next weekday after today in the team’s zone, 3:00 to 5:00 PM, no place', () => {
    // Thursday 12 Nov, 11 PM in New York (already Friday in UTC): the next weekday is Friday 13.
    expect(defaultNewPractice(new Date('2026-11-13T04:00:00Z'), NY)).toEqual({ date: '2026-11-13', start: '15:00', end: '17:00', place: '' });
    // Friday: the weekend is skipped.
    expect(nextWeekday(new Date('2026-11-13T15:00:00Z'), NY)).toBe('2026-11-16');
    // Saturday and Sunday: Monday.
    expect(nextWeekday(new Date('2026-11-14T15:00:00Z'), NY)).toBe('2026-11-16');
    expect(nextWeekday(new Date('2026-11-15T15:00:00Z'), NY)).toBe('2026-11-16');
  });

  it('builds the Calendar’s practice: timed (never all-day), in the team’s offset on that day, the team on it, no replies asked', () => {
    // Daylight time: 240 minutes west of UTC, which the server writes as -04:00.
    expect(newPracticeEvent({ date: '2026-10-20', start: '15:00', end: '17:00', place: ' Lakeside ' }, NY, ['p1', 'p2'])).toEqual({
      title: 'Practice',
      eventType: 'practice',
      startDate: '2026-10-20',
      startTime: '15:00',
      endTime: '17:00',
      allDay: false,
      location: 'Lakeside',
      requiresRsvp: false,
      attendeeIds: ['p1', 'p2'],
      timezoneOffset: 240,
    });
    // After the clock change: 300.
    const nov = newPracticeEvent({ date: '2026-11-17', start: '15:00', end: '17:00', place: '' }, NY);
    expect(nov.timezoneOffset).toBe(300);
    expect(nov.location).toBeUndefined();
    // No roster read: nobody is put on it rather than an empty list.
    expect(nov).not.toHaveProperty('attendeeIds');
  });

  it('says what is wrong before anything is sent: no day, or an end not after the start', () => {
    expect(newPracticeProblem({ date: '2026-11-17', start: '15:00', end: '17:00', place: '' })).toBeNull();
    expect(newPracticeProblem({ date: '', start: '15:00', end: '17:00', place: '' })).toBe('Pick a day.');
    expect(newPracticeProblem({ date: '2026-11-17', start: '17:00', end: '17:00', place: '' })).toBe('End the practice after it starts.');
    expect(newPracticeProblem({ date: '2026-11-17', start: '17:00', end: '15:00', place: '' })).toBe('End the practice after it starts.');
  });

  it('a new start keeps the length; one that would end past midnight leaves the end for the coach to fix', () => {
    expect(withStart({ date: '2026-11-17', start: '15:00', end: '17:00', place: '' }, '14:30')).toMatchObject({ start: '14:30', end: '16:30' });
    expect(withStart({ date: '2026-11-17', start: '15:00', end: '17:00', place: '' }, '22:30')).toMatchObject({ start: '22:30', end: '17:00' });
    // An end already before the start: the default two hours.
    expect(withStart({ date: '2026-11-17', start: '17:00', end: '15:00', place: '' }, '09:00')).toMatchObject({ start: '09:00', end: '11:00' });
  });

  it('gives Ask CoachHelm the window in minutes', () => {
    expect(newPracticeMinutes({ date: '2026-11-17', start: '15:00', end: '17:30', place: '' })).toBe(150);
    expect(newPracticeMinutes({ date: '2026-11-17', start: '17:00', end: '15:00', place: '' })).toBeNull();
  });
});
