/**
 * Academic-term date maths, shared by everything that has to answer "when does
 * this class actually meet?".
 *
 * Extracted from calendar-sync.ts so the availability layer can reuse it: that
 * file is a `'use server'` module, and exporting a non-async helper from one
 * registers it as a server action (the class of bug that killed golf messaging).
 * Term parsing is pure, so it belongs here.
 */

export interface SemesterWindow {
  /** Inclusive first day, YYYY-MM-DD. */
  start: string;
  /** Inclusive last day, YYYY-MM-DD. */
  end: string;
}

/**
 * A caller-supplied semester start must be a real calendar date inside the
 * term's own window — on or after 1 January of the term year, and on or before
 * the term end. DS-B4: it was previously used verbatim, so a year-0001 start on
 * a "Fall 9999" term produced a five-century occurrence walk.
 */
function isValidCustomStart(customStartDate: string, termYear: number, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(customStartDate)) return false;
  const start = new Date(customStartDate + 'T00:00:00Z').getTime();
  const lowerBound = new Date(`${termYear}-01-01T00:00:00Z`).getTime();
  const upperBound = new Date(endDate + 'T00:00:00Z').getTime();
  if (!Number.isFinite(start)) return false;
  return start >= lowerBound && start <= upperBound;
}

/**
 * Parse semester string to get start and end dates
 * Format: "Fall 2025", "Spring 2026", etc.
 * If customStartDate is provided, use it instead of the default start date
 *
 * DS-B4: both inputs are caller-controlled, so the term year is bounded to a
 * plausible range and a custom start is range-checked against the term. An
 * unusable value returns null, which callers surface as the existing
 * "Could not determine semester dates" error.
 */
export function parseSemesterDates(
  semester: string | null | undefined,
  customStartDate?: string,
): SemesterWindow | null {
  if (typeof semester !== 'string') return null;

  const match = semester.match(/(Fall|Spring|Summer|Winter)\s+(\d{4})/i);
  if (!match || !match[1] || !match[2]) return null;

  const term = match[1];
  const year = match[2];
  const yearNum = parseInt(year, 10);
  // Anything outside this window is not a real academic term, and it is what
  // made the generated range unbounded ("Fall 9999").
  if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) return null;

  let defaultStartDate: string;
  let endDate: string;

  switch (term.toLowerCase()) {
    case 'spring':
      defaultStartDate = `${yearNum}-01-15`; // Mid-January
      endDate = `${yearNum}-05-15`;   // Mid-May
      break;
    case 'summer':
      defaultStartDate = `${yearNum}-06-01`; // Early June
      endDate = `${yearNum}-08-15`;   // Mid-August
      break;
    case 'fall':
      defaultStartDate = `${yearNum}-08-20`; // Late August
      endDate = `${yearNum}-12-15`;   // Mid-December
      break;
    case 'winter':
      defaultStartDate = `${yearNum}-12-15`; // Mid-December
      endDate = `${yearNum + 1}-01-15`; // Mid-January next year
      break;
    default:
      return null;
  }

  if (customStartDate) {
    if (!isValidCustomStart(customStartDate, yearNum, endDate)) return null;
    return { start: customStartDate, end: endDate };
  }

  return { start: defaultStartDate, end: endDate };
}
