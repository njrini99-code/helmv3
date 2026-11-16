import type { Metadata } from 'next';
import { PlanFormatRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

export const metadata: Metadata = { title: 'Plan format' };

/** Practice › Plan format. */
export default async function Page() {
  await redirectUnlessClubhousePractice();
  return <PlanFormatRoute />;
}
