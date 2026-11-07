import { PracticeGroupsRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** Practice is Clubhouse's: a Fairway user goes to the Calendar. */
export default async function Page() {
  await redirectUnlessClubhousePractice();
  return <PracticeGroupsRoute />;
}
