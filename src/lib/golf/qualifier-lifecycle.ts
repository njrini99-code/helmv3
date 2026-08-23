import { todayIsoInZone } from '@/lib/golf/timezone';

/**
 * A qualifier's `end_date` is a DATE-only, inclusive calendar boundary in the
 * team's timezone. Comparing it to a timestamp parses the date as UTC midnight
 * and can close an East Coast qualifier during the preceding local evening.
 */
export function hasQualifierEndDatePassed(
  endDate: string | null | undefined,
  teamTimezone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!endDate && endDate < todayIsoInZone(teamTimezone, now);
}
