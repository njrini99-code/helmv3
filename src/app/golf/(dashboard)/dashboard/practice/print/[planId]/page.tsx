import { redirect } from 'next/navigation';
import { PracticePrintRoute } from '@/clubhouse/routes/practice';
import { practiceAvailable } from '@/clubhouse/gate';

/** Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  if (!(await practiceAvailable())) redirect('/golf/dashboard/calendar');
  const { planId } = await params;
  return <PracticePrintRoute planId={planId} />;
}
