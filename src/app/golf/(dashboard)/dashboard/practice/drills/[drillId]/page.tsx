import type { Metadata } from 'next';
import { PracticeDrillRoute, practiceDrillTitle } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** GAP-R-08: the tab names the drill, not "Drill" on every one. */
export async function generateMetadata({ params }: { params: Promise<{ drillId: string }> }): Promise<Metadata> {
  const { drillId } = await params;
  return { title: await practiceDrillTitle(drillId) };
}

/** Practice is Clubhouse's: a Fairway user goes to the Calendar. */
export default async function Page({ params }: { params: Promise<{ drillId: string }> }) {
  await redirectUnlessClubhousePractice();
  const { drillId } = await params;
  return <PracticeDrillRoute drillId={drillId} />;
}
