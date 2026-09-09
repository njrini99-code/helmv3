import { describe, it, expect } from 'vitest';
import { getChangedFieldKeys, buildChangeSummary, isMoveOnlyChange } from '../changeDetection';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';

function makeForm(overrides: Partial<GolfEventFormData> = {}): GolfEventFormData {
  return {
    title: 'Practice',
    eventType: 'practice',
    startDate: '2026-06-15',
    endDate: '2026-06-15',
    startTime: '09:00',
    endTime: '11:00',
    allDay: false,
    location: 'Range',
    courseName: null,
    description: null,
    isMandatory: false,
    requiresRsvp: false,
    rsvpDeadline: null,
    maxAttendees: null,
    attendeeIds: ['p1', 'p2'],
    recurrence: 'none',
    recurrenceCount: 10,
    recurrenceWeekdays: [],
    recurrenceEndMode: 'count',
    recurrenceUntil: null,
    ...overrides,
  };
}

describe('changeDetection', () => {
  it('reports no changes with no pristine snapshot (create mode)', () => {
    expect(getChangedFieldKeys(null, makeForm())).toEqual([]);
    expect(isMoveOnlyChange(null, makeForm())).toBe(false);
    expect(buildChangeSummary(null, makeForm())).toEqual([]);
  });

  it('reports no changes when the form is unchanged', () => {
    const pristine = makeForm();
    const current = makeForm();
    expect(getChangedFieldKeys(pristine, current)).toEqual([]);
    expect(isMoveOnlyChange(pristine, current)).toBe(false);
  });

  it('ignores attendeeIds — that has its own added/removed summary', () => {
    const pristine = makeForm({ attendeeIds: ['p1'] });
    const current = makeForm({ attendeeIds: ['p1', 'p2', 'p3'] });
    expect(getChangedFieldKeys(pristine, current)).toEqual([]);
  });

  it('treats an unordered weekday reshuffle as unchanged', () => {
    const pristine = makeForm({ recurrenceWeekdays: [1, 3, 5] });
    const current = makeForm({ recurrenceWeekdays: [5, 1, 3] });
    expect(getChangedFieldKeys(pristine, current)).toEqual([]);
  });

  it('is move-only when every changed field is a time field', () => {
    const pristine = makeForm();
    const current = makeForm({ startDate: '2026-06-16', endDate: '2026-06-16', startTime: '10:00', endTime: '12:00' });
    expect(isMoveOnlyChange(pristine, current)).toBe(true);
    const changed = getChangedFieldKeys(pristine, current);
    expect(changed.sort()).toEqual(['endDate', 'endTime', 'startDate', 'startTime'].sort());
  });

  it('is not move-only once a non-time field changes too', () => {
    const pristine = makeForm();
    const current = makeForm({ startTime: '10:00', location: 'West range' });
    expect(isMoveOnlyChange(pristine, current)).toBe(false);
  });

  it('is not move-only when nothing changed', () => {
    expect(isMoveOnlyChange(makeForm(), makeForm())).toBe(false);
  });

  it('builds a human-readable before/after diff', () => {
    const pristine = makeForm({ title: 'Practice', location: 'Range' });
    const current = makeForm({ title: 'Morning practice', location: 'Range', allDay: true });
    const summary = buildChangeSummary(pristine, current);
    const byKey = Object.fromEntries(summary.map((s) => [s.key, s]));
    expect(byKey.title).toMatchObject({ label: 'Title', before: 'Practice', after: 'Morning practice' });
    expect(byKey.allDay).toMatchObject({ label: 'All day', before: 'No', after: 'Yes' });
    expect(byKey.location).toBeUndefined();
  });
});
