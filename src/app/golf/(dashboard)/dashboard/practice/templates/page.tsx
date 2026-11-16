import type { Metadata } from 'next';
import { PracticeTemplatesRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

export const metadata: Metadata = { title: 'Templates' };

/** Practice is Clubhouse's: a Fairway user goes to the Calendar. */
export default async function Page() {
  await redirectUnlessClubhousePractice();
  return <PracticeTemplatesRoute />;
}
