import { PracticeDrillRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** Practice is Clubhouse's: a Fairway user goes to the Calendar. */
export default async function Page({ params }: { params: Promise<{ drillId: string }> }) {
  await redirectUnlessClubhousePractice();
  const { drillId } = await params;
  return <PracticeDrillRoute drillId={drillId} />;
}
