/**
 * P219 — semester selector must NEVER ship a hard-coded year list that goes
 * stale. generateSemesterOptions() derives the term list from `now`, so the
 * current term (the value detectSemester('') pre-selects) is always present and
 * thus selectable — otherwise the <select> renders blank and silently misplaces
 * every synced class calendar event.
 */
import { describe, it, expect } from 'vitest';
import { generateSemesterOptions, isClassFormSubmittable } from './AddClassModal';
import { detectSemester } from '@/lib/utils/schedule-parser';

describe('generateSemesterOptions (P219)', () => {
  it('always includes the current term detectSemester() pre-selects (2026-06-21 = Summer 2026)', () => {
    const now = new Date('2026-06-21T12:00:00');
    const options = generateSemesterOptions(now);
    // Regression for the exact reported defect: Summer 2026 was missing.
    expect(options).toContain('Summer 2026');
    // The form pre-selects detectSemester(''); that value MUST be in the list.
    // (detectSemester reads real `now`; assert membership for the buggy month.)
    expect(options).toContain(detectSemester('summer 2026'));
  });

  it('returns prev / current / next-3 terms in chronological order', () => {
    const now = new Date('2026-06-21T12:00:00'); // Summer 2026
    expect(generateSemesterOptions(now)).toEqual([
      'Spring 2026', // previous
      'Summer 2026', // current
      'Fall 2026',
      'Spring 2027',
      'Summer 2027',
    ]);
  });

  it('rolls the year correctly across the Fall -> Spring boundary', () => {
    const now = new Date('2026-11-15T12:00:00'); // Fall 2026
    expect(generateSemesterOptions(now)).toEqual([
      'Summer 2026', // previous
      'Fall 2026', // current
      'Spring 2027',
      'Summer 2027',
      'Fall 2027',
    ]);
  });

  it('handles the Spring window (start of academic year math)', () => {
    const now = new Date('2026-02-01T12:00:00'); // Spring 2026
    expect(generateSemesterOptions(now)).toEqual([
      'Fall 2025', // previous
      'Spring 2026', // current
      'Summer 2026',
      'Fall 2026',
      'Spring 2027',
    ]);
  });
});

/**
 * Semester is required in fact and was not required in form.
 *
 * `semester` drives `parseSemesterDates`, which sets the date range the class's
 * calendar series is generated over. A class with no term cannot sync its
 * meetings correctly — it is not a cosmetic label.
 *
 * `handleSubmit` validated `course_code` and `course_name` and nothing else, and
 * the Semester field carried no `required` marker. So a class could be saved
 * with an empty term, silently, and 43 of 59 production classes are in exactly
 * that state (#1473).
 *
 * WHAT I FIRST CLAIMED, AND WHY IT WAS WRONG. I reported that editing one of
 * those 43 would "silently re-date the class to Fall 2026", because
 * `semesterOptions` only splices the stored term in when it is truthy:
 *
 *     if (formData.semester && !options.includes(formData.semester)) ...
 *
 * That guard does skip an empty value — but `ui/select.tsx` is a custom
 * listbox, not a native <select>. Its `selectedOption` is
 * `options.find(o => o.value === value)`, and when that misses it renders the
 * PLACEHOLDER and fires no onChange. So an untouched field stays '' and the
 * class stays null. Bad, but not a re-date. Checked before building on it.
 *
 * The remedy is the same either way: make the field say it is required and
 * refuse the submit without it, so the state that produced these 43 rows cannot
 * be reached again. Same shape as the three unmarked-required-field fixes
 * earlier in this sweep (d5f579935, 9ccd9b84f, 54fea01a3).
 */
describe('semester is a required field, not an optional label', () => {
  it('rejects a submit with no term chosen', () => {
    expect(isClassFormSubmittable({ course_code: 'BUAD 123', course_name: 'Business', semester: '' })).toBe(false);
  });

  it('rejects whitespace as a term', () => {
    expect(isClassFormSubmittable({ course_code: 'BUAD 123', course_name: 'Business', semester: '   ' })).toBe(false);
  });

  it('accepts a real term', () => {
    expect(isClassFormSubmittable({ course_code: 'BUAD 123', course_name: 'Business', semester: 'Fall 2026' })).toBe(true);
  });

  it('still rejects the two fields that were already required', () => {
    expect(isClassFormSubmittable({ course_code: '', course_name: 'Business', semester: 'Fall 2026' })).toBe(false);
    expect(isClassFormSubmittable({ course_code: 'BUAD 123', course_name: '', semester: 'Fall 2026' })).toBe(false);
  });
});
