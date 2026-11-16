import type { Metadata } from 'next';
import { PracticePlanRoute, practicePlanTitle } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** GAP-R-08: the tab names the plan, not "Practice plan" on every one. */
export async function generateMetadata({ params }: { params: Promise<{ planId: string }> }): Promise<Metadata> {
  const { planId } = await params;
  return { title: await practicePlanTitle(planId) };
}

/** The deep link from a push, a bell row or Documents. */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  await redirectUnlessClubhousePractice();
  const { planId } = await params;
  return <PracticePlanRoute planId={planId} />;
}
