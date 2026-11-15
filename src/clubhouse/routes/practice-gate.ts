import { redirect } from 'next/navigation';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { isClubhouseFor } from '../gate';

/** Where a user with no dashboard role lands instead of a Practice page: the Calendar, never a 404 (N-00 §0.2). */
export const PRACTICE_FAIRWAY_FALLBACK = '/golf/dashboard/calendar';

/**
 * Every Practice page asks this first: a coach or a player gets the page, anyone else goes to the Calendar. It runs in
 * each page, not only a layout: a layout does not run again when a user navigates between its pages.
 */
export async function redirectUnlessClubhousePractice(): Promise<void> {
  if (!(await isClubhouseFor(await getGolfDashboardRole()))) redirect(PRACTICE_FAIRWAY_FALLBACK);
}
