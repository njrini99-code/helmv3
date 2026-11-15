import { redirect } from 'next/navigation';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { isClubhouseFor } from '../gate';

/** Where a user who is not on Clubhouse lands instead of a Practice page: Fairway's Calendar, never a 404 (N-00 §0.2). */
export const PRACTICE_FAIRWAY_FALLBACK = '/golf/dashboard/calendar';

/**
 * Every Practice page asks this first. Practice is a Clubhouse page and Fairway has no screen for it, so a user for whom
 * Clubhouse is not on (the `golf_clubhouse_ui` flag and, with an allowlist, their team) goes to the Calendar, as they did
 * when the practice flags were off. It runs in each page, not only a layout: a layout does not run again when a user
 * navigates between its pages.
 */
export async function redirectUnlessClubhousePractice(): Promise<void> {
  if (!(await isClubhouseFor(await getGolfDashboardRole()))) redirect(PRACTICE_FAIRWAY_FALLBACK);
}
