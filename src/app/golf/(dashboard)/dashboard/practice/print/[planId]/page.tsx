import type { Metadata } from 'next';
import { PracticePrintRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

export const metadata: Metadata = { title: 'Print plan' };

/** Practice is Clubhouse's: a Fairway user goes to the Calendar. */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  await redirectUnlessClubhousePractice();
  const { planId } = await params;
  return <PracticePrintRoute planId={planId} />;
}
