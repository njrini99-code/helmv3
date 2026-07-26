// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { applyDayVerification, type ScheduleExtraction } from './schedule-vision';

type Cls = ScheduleExtraction['classes'][number];

function cls(overrides: Partial<Cls> & Pick<Cls, 'course_name' | 'days'>): Cls {
  return {
    course_code: '',
    section_kind: 'lecture',
    start_time: '13:00',
    end_time: '14:15',
    location: 'King Hall 222',
    instructor: '',
    confidence: 0.9,
    note: '',
    ...overrides,
  };
}

function extraction(classes: Cls[]): ScheduleExtraction {
  return {
    is_class_schedule: true,
    document_kind: 'Banner list view',
    term: 'Fall 2026',
    classes,
    warnings: [],
    image_quality: 'good',
  };
}

describe('applyDayVerification', () => {
  it('keeps days both reads agree on, regardless of order', () => {
    const before = extraction([cls({ course_name: 'Financial Management', days: ['MON', 'WED', 'FRI'] })]);

    const after = applyDayVerification(before, [
      { course_name: 'Financial Management', days: ['FRI', 'MON', 'WED'] },
    ]);

    expect(after.classes[0]!.days).toEqual(['MON', 'WED', 'FRI']);
    expect(after.warnings).toEqual([]);
    expect(after.image_quality).toBe('good');
  });

  /**
   * The real case. On the Guilford Fall 2026 screenshot the day-only pass reads
   * Marketing Management as Wed/Fri — dropping the Monday pill — in every run,
   * while the main pass reads it correctly. Shipping either one as truth means
   * a coach believes the player is free at 1pm Monday when she is in class.
   */
  it('blanks a class the second read disagrees about and names it in a warning', () => {
    const before = extraction([
      cls({ course_name: 'Financial Management', days: ['MON', 'WED', 'FRI'] }),
      cls({ course_name: 'Marketing Management', days: ['MON', 'WED', 'FRI'] }),
    ]);

    const after = applyDayVerification(before, [
      { course_name: 'Financial Management', days: ['MON', 'WED', 'FRI'] },
      { course_name: 'Marketing Management', days: ['WED', 'FRI'] },
    ]);

    expect(after.classes[0]!.days).toEqual(['MON', 'WED', 'FRI']);
    expect(after.classes[1]!.days).toEqual([]);
    expect(after.classes[1]!.confidence).toBeLessThanOrEqual(0.4);
    expect(after.classes[1]!.note).not.toBe('');
    expect(after.warnings).toHaveLength(1);
    expect(after.warnings[0]).toContain('Marketing Management');
    expect(after.image_quality).toBe('fair');
  });

  it('never resolves a disagreement to the intersection or the union', () => {
    const before = extraction([cls({ course_name: 'Marketing Management', days: ['MON', 'WED', 'FRI'] })]);

    const after = applyDayVerification(before, [
      { course_name: 'Marketing Management', days: ['WED', 'FRI', 'SAT'] },
    ]);

    // Intersection would be WED/FRI, union would add SAT. Both are guesses.
    expect(after.classes[0]!.days).toEqual([]);
  });

  it('treats a missing second-read row as silence, not disagreement', () => {
    const before = extraction([
      cls({ course_name: 'Financial Management', days: ['MON', 'WED', 'FRI'] }),
      cls({ course_name: 'Leadership across Cultures', days: ['TUE', 'THU'] }),
    ]);

    const after = applyDayVerification(before, [
      { course_name: 'Financial Management', days: ['MON', 'WED', 'FRI'] },
    ]);

    expect(after.classes[1]!.days).toEqual(['TUE', 'THU']);
    expect(after.warnings).toEqual([]);
  });

  it('matches rows across punctuation and casing drift between the two reads', () => {
    const before = extraction([cls({ course_name: 'Leadership across Cultures', days: ['TUE', 'THU'] })]);

    const after = applyDayVerification(before, [
      { course_name: 'LEADERSHIP ACROSS CULTURES ', days: ['TUE', 'WED'] },
    ]);

    // Matched despite the casing/whitespace difference, so the dispute fires.
    expect(after.classes[0]!.days).toEqual([]);
    expect(after.warnings).toHaveLength(1);
  });

  it('leaves an already-blank class alone rather than reporting it as disputed', () => {
    const before = extraction([cls({ course_name: 'Independent Study', days: [], start_time: '', end_time: '' })]);

    const after = applyDayVerification(before, [{ course_name: 'Independent Study', days: ['MON'] }]);

    expect(after.classes[0]!.days).toEqual([]);
    expect(after.warnings).toEqual([]);
  });

  it('does not downgrade image_quality below what the first read already reported', () => {
    const before = { ...extraction([cls({ course_name: 'Marketing Management', days: ['MON'] })]), image_quality: 'poor' as const };

    const after = applyDayVerification(before, [{ course_name: 'Marketing Management', days: ['TUE'] }]);

    expect(after.image_quality).toBe('poor');
  });

  it('preserves an existing note instead of overwriting it', () => {
    const before = extraction([
      cls({ course_name: 'Marketing Management', days: ['MON'], note: 'second half of semester only' }),
    ]);

    const after = applyDayVerification(before, [{ course_name: 'Marketing Management', days: ['TUE'] }]);

    expect(after.classes[0]!.note).toBe('second half of semester only');
  });
});
