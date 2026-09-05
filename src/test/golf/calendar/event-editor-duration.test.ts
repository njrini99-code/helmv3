/**
 * Quick-duration chips (S5).
 *
 * "This practice is two hours" is how a coach thinks about an event; the end
 * time is the arithmetic. The chips make that one tap — and because a
 * duration is a fact about the WHOLE span, they own the end DATE as well as
 * the end time. A 4-hour event starting at 10 PM ends tomorrow; leaving the
 * end date on the start day would produce exactly the "End date must be on or
 * after the start date" rejection that golf.ts's refineEventEndAfterStart
 * already answers with (and the 23514 CHECK behind it).
 *
 * Same discipline as event-editor-time-shift.test.ts, which pins the other
 * half of the start/end relationship.
 */

import { describe, it, expect } from 'vitest';
import {
  applyDuration,
  eventSpanMinutes,
} from '@/components/fairway/pages/calendar/FairwayEventEditor';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';

const base: GolfEventFormData = {
  title: 'Practice',
  eventType: 'practice',
  startDate: '2026-08-14',
  endDate: null,
  startTime: '09:00',
  endTime: '11:00',
  allDay: false,
  location: null,
  courseName: null,
  description: null,
  isMandatory: false,
  requiresRsvp: false,
  rsvpDeadline: null,
  maxAttendees: null,
  attendeeIds: [],
  recurrence: 'none',
  recurrenceCount: 10,
  recurrenceWeekdays: [],
  recurrenceEndMode: 'count',
  recurrenceUntil: null,
};

describe('applyDuration', () => {
  it('sets the end from the start and lands the end date on the same day', () => {
    const next = applyDuration(base, 180);
    expect(next.startTime).toBe('09:00'); // the start is never moved
    expect(next.endTime).toBe('12:00');
    expect(next.endDate).toBe('2026-08-14');
  });

  it('rolls the end DATE forward when the span crosses midnight', () => {
    const late = { ...base, startTime: '22:00', endTime: '23:00' };
    const next = applyDuration(late, 240); // 10 PM + 4h = 2 AM tomorrow
    expect(next.endTime).toBe('02:00');
    expect(next.endDate).toBe('2026-08-15');
  });

  // The chips are not OFFERED for a multi-day event (see the render guard in
  // FairwayEventEditor) precisely because this is what applying one would do;
  // the function's own contract is still "make the span exactly N long".
  it('would collapse a multi-day end onto the real span, which is why the chips hide there', () => {
    const stale = { ...base, endDate: '2026-08-20' };
    const next = applyDuration(stale, 60);
    expect(next.endTime).toBe('10:00');
    expect(next.endDate).toBe('2026-08-14');
  });

  it('is a no-op without a start time (an all-day event has none)', () => {
    const allDay = { ...base, allDay: true, startTime: null, endTime: null };
    expect(applyDuration(allDay, 120)).toEqual(allDay);
  });

  it('leaves every other field alone', () => {
    const next = applyDuration({ ...base, title: 'Qualifier', attendeeIds: ['p1'] }, 120);
    expect(next.title).toBe('Qualifier');
    expect(next.attendeeIds).toEqual(['p1']);
    expect(next.allDay).toBe(false);
  });
});

describe('eventSpanMinutes', () => {
  it('measures a same-day span', () => {
    expect(eventSpanMinutes(base)).toBe(120);
  });

  it('measures forward across midnight when the dates say so', () => {
    const overnight = { ...base, startTime: '22:00', endTime: '02:00', endDate: '2026-08-15' };
    expect(eventSpanMinutes(overnight)).toBe(240);
  });

  it('does not report a multi-day event as a few hours', () => {
    const trip = { ...base, startTime: '09:00', endTime: '11:00', endDate: '2026-08-16' };
    expect(eventSpanMinutes(trip)).toBe(2 * 1440 + 120);
  });

  it('is null when either end is unset', () => {
    expect(eventSpanMinutes({ ...base, endTime: null })).toBeNull();
    expect(eventSpanMinutes({ ...base, startTime: null })).toBeNull();
  });

  it('round-trips with applyDuration, which is what lights the chip', () => {
    for (const minutes of [60, 120, 180, 240]) {
      expect(eventSpanMinutes(applyDuration(base, minutes))).toBe(minutes);
    }
  });
});
