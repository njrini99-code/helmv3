/**
 * Moving an event's start DATE must carry its end date along — the twin of
 * event-editor-time-shift.test.ts, for the field that had no such helper.
 *
 * MEASURED IN PRODUCTION 2026-09-01. The Guilford head coach rescheduled an
 * existing event and got back "End date must be on or after the start date"
 * (02:36:24Z), then "Date must be YYYY-MM-DD" three minutes later (02:39:34Z).
 * Neither was bad input.
 *
 * Editing ALWAYS prefills a concrete endDate — every read-side mapper falls
 * back `end_time || start_time`, so even a single-day event opens with
 * endDate === startDate, behind a placeholder reading "Same day" that never
 * shows because the value is populated. Moving the start date alone therefore
 * pushed it past a stale end, and the server's refineEventEndAfterStart
 * (golf.ts) was the first thing to notice.
 *
 * The second message came from react-day-picker's single-select mode: clicking
 * the selected day again DESELECTS it, which arrives as null and becomes ''.
 * Nothing guarded it, so an empty string reached zod's dateString regex and the
 * coach was told their cleared field was the wrong format.
 */
import { describe, it, expect } from 'vitest';
import { shiftStartDate } from '@/components/fairway/pages/calendar/FairwayEventEditor';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';

const base: GolfEventFormData = {
  title: 'Practice',
  eventType: 'practice',
  startDate: '2026-08-14',
  endDate: '2026-08-14',
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

describe('shiftStartDate', () => {
  it('carries a same-day event forward instead of stranding the end date', () => {
    // THE PRODUCTION REGRESSION. Before this, endDate stayed at 2026-08-14
    // while startDate moved to 2026-09-05 — an inversion the server rejected.
    const next = shiftStartDate(base, '2026-09-05');
    expect(next.startDate).toBe('2026-09-05');
    expect(next.endDate).toBe('2026-09-05');
  });

  it('preserves a multi-day span exactly', () => {
    const trip = { ...base, startDate: '2026-08-14', endDate: '2026-08-17' }; // 3 days
    const next = shiftStartDate(trip, '2026-09-01');
    expect(next.startDate).toBe('2026-09-01');
    expect(next.endDate).toBe('2026-09-04');
  });

  it('preserves a span across a month boundary', () => {
    const trip = { ...base, startDate: '2026-08-30', endDate: '2026-09-02' }; // 3 days
    const next = shiftStartDate(trip, '2026-10-30');
    expect(next.endDate).toBe('2026-11-02');
  });

  it('moves the start alone when there is no end date to carry', () => {
    // Guessing an end the coach never entered would be worse than leaving it.
    const next = shiftStartDate({ ...base, endDate: null }, '2026-09-05');
    expect(next.startDate).toBe('2026-09-05');
    expect(next.endDate).toBeNull();
  });

  it('clears the start date when the picker deselects, without inventing an end', () => {
    // react-day-picker hands back null on a deselect. The empty string is what
    // handleSubmit now refuses BEFORE the server sees it.
    const next = shiftStartDate(base, null);
    expect(next.startDate).toBe('');
  });

  it('repairs an already-inverted pair rather than preserving the inversion', () => {
    const inverted = { ...base, startDate: '2026-08-20', endDate: '2026-08-14' };
    const next = shiftStartDate(inverted, '2026-09-05');
    expect(next.startDate).toBe('2026-09-05');
    expect(next.endDate).toBe('2026-09-05');
  });

  it('never produces an end before the start, across a sweep of moves', () => {
    for (const target of ['2026-01-01', '2026-02-28', '2026-06-15', '2026-12-31', '2027-03-01']) {
      for (const span of [0, 1, 3, 10]) {
        const form = { ...base, startDate: '2026-08-14', endDate: `2026-08-${String(14 + span).padStart(2, '0')}` };
        const next = shiftStartDate(form, target);
        expect(next.endDate === null || next.endDate >= next.startDate).toBe(true);
      }
    }
  });
});
