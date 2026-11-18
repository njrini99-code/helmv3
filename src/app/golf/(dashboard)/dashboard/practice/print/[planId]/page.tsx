import type { Metadata } from 'next';
import { PracticePrintRoute, practicePlanTitle } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** GAP-R-08: the tab names the plan being printed ("Print · Tuesday short game"). */
export async function generateMetadata({ params }: { params: Promise<{ planId: string }> }): Promise<Metadata> {
  const { planId } = await params;
  const title = await practicePlanTitle(planId, '');
  return { title: title ? `Print · ${title}` : 'Print plan' };
}

/** Practice is Clubhouse's: a Fairway user goes to the Calendar. */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  await redirectUnlessClubhousePractice();
  const { planId } = await params;
  return <PracticePrintRoute planId={planId} />;
}
