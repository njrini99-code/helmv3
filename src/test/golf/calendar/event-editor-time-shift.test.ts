/**
 * Moving an event's start time must carry its end time along.
 *
 * Start and end were two independent `<input type="time">`s with no relation
 * between them: dragging a 9–11am practice to 2pm left the end at 11am, so the
 * coach submitted an inverted window. Nothing client-side caught it — the first
 * objection came from the server (zod superRefine in golf.ts, with a 23514
 * CHECK behind it) and surfaced as a banner at the top of the modal.
 *
 * recurring-events.ts documents the same defect server-side: "nothing between
 * the calendar form and this action checks it".
 */

import { describe, it, expect } from 'vitest';
import { shiftStartTime } from '@/components/fairway/pages/calendar/FairwayEventEditor';
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

describe('shiftStartTime', () => {
  it('preserves duration when the start moves later', () => {
    const next = shiftStartTime(base, '14:00');
    expect(next.startTime).toBe('14:00');
    expect(next.endTime).toBe('16:00'); // 2h preserved, not stranded at 11:00
  });

  it('preserves duration when the start moves earlier', () => {
    const next = shiftStartTime(base, '07:30');
    expect(next.startTime).toBe('07:30');
    expect(next.endTime).toBe('09:30');
  });

  it('keeps a non-round duration exact', () => {
    const next = shiftStartTime({ ...base, startTime: '09:05', endTime: '09:55' }, '13:20');
    expect(next.endTime).toBe('14:10'); // 50 minutes
  });

  /**
   * An event already crossing midnight keeps its length rather than collapsing
   * to a negative span — duration is measured forward, modulo a day.
   */
  it('handles a window that crosses midnight', () => {
    const next = shiftStartTime({ ...base, startTime: '23:00', endTime: '01:00' }, '22:00');
    expect(next.endTime).toBe('00:00'); // still 2h
  });

  it('wraps past midnight rather than producing an invalid clock time', () => {
    const next = shiftStartTime({ ...base, startTime: '09:00', endTime: '11:00' }, '23:30');
    expect(next.endTime).toBe('01:30');
  });

  /**
   * Non-vacuity / do-no-harm guards. The shift must NOT invent an end time the
   * coach never entered, and must leave all-day events alone.
   */
  it('leaves the end alone when there is no end time', () => {
    const next = shiftStartTime({ ...base, endTime: null }, '14:00');
    expect(next.startTime).toBe('14:00');
    expect(next.endTime).toBeNull();
  });

  it('does not touch times on an all-day event', () => {
    const next = shiftStartTime({ ...base, allDay: true }, '14:00');
    expect(next.startTime).toBe('14:00');
    expect(next.endTime).toBe('11:00');
  });

  it('clearing the start does not fabricate an end', () => {
    const next = shiftStartTime(base, null);
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBe('11:00');
  });

  it('changes nothing else on the form', () => {
    const next = shiftStartTime(base, '14:00');
    expect({ ...next, startTime: base.startTime, endTime: base.endTime }).toEqual(base);
  });
});
