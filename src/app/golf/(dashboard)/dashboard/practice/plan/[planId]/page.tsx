import { redirect } from 'next/navigation';
import { PracticePlanRoute } from '@/clubhouse/routes/practice';
import { practiceAvailable } from '@/clubhouse/gate';

/** The deep link from a push, a bell row or Documents. Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  if (!(await practiceAvailable())) redirect('/golf/dashboard/calendar');
  const { planId } = await params;
  return <PracticePlanRoute planId={planId} />;
}
