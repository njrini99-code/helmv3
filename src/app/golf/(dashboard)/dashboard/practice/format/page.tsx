import { PlanFormatRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** Practice › Plan format. */
export default async function Page() {
  await redirectUnlessClubhousePractice();
  return <PlanFormatRoute />;
}
