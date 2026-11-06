import { redirect } from 'next/navigation';
import { PracticePlanRoute } from '@/clubhouse/routes/practice';
import { isPracticePlansEnabled, isPracticeTabEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';

/** The deep link from a push, a bell row or Documents. Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  if (!isPracticeTabEnabled() || !isPracticePlansEnabled()) redirect('/golf/dashboard/calendar');
  const { planId } = await params;
  return <PracticePlanRoute planId={planId} />;
}
