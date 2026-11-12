import { PracticePlanRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** The deep link from a push, a bell row or Documents. */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  await redirectUnlessClubhousePractice();
  const { planId } = await params;
  return <PracticePlanRoute planId={planId} />;
}
