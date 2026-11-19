import { describe, expect, it } from 'vitest';
import { formatters } from '../hub';

/**
 * Audit 2026-11-18 (P1): Team Hub read "Overdue · Wed 22" for a task due 22 July, read in November. A due day within a
 * week either side is named by its weekday; further out it carries the month, as `ago` and lib/dates relativeTime do.
 */
describe('Team Hub due label', () => {
  const f = formatters('America/New_York', new Date('2026-11-18T15:00:00Z'));
  const today = '2026-11-18';

  it('keeps the words for the nearest days', () => {
    expect(f.due('2026-11-18', today)).toBe('Today');
    expect(f.due('2026-11-19', today)).toBe('Tomorrow');
    expect(f.due('2026-11-17', today)).toBe('Yesterday');
  });

  it('names a day within the week by its weekday and date', () => {
    expect(f.due('2026-11-13', today)).toBe('Fri 13');
    expect(f.due('2026-11-24', today)).toBe('Tue 24');
  });

  it('gives the month to a day outside the week, earlier this month or months ago', () => {
    expect(f.due('2026-07-22', today)).toBe('Jul 22');
    expect(f.due('2026-11-03', today)).toBe('Nov 3');
    expect(f.due('2026-12-25', today)).toBe('Dec 25');
  });
});
