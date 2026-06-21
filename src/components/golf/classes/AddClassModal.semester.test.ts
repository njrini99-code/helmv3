/**
 * P219 — semester selector must NEVER ship a hard-coded year list that goes
 * stale. generateSemesterOptions() derives the term list from `now`, so the
 * current term (the value detectSemester('') pre-selects) is always present and
 * thus selectable — otherwise the <select> renders blank and silently misplaces
 * every synced class calendar event.
 */
import { describe, it, expect } from 'vitest';
import { generateSemesterOptions } from './AddClassModal';
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
