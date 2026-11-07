import { redirect } from 'next/navigation';
import { PracticeDrillRoute } from '@/clubhouse/routes/practice';
import { practiceAvailable } from '@/clubhouse/gate';

/** Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page({ params }: { params: Promise<{ drillId: string }> }) {
  if (!(await practiceAvailable())) redirect('/golf/dashboard/calendar');
  const { drillId } = await params;
  return <PracticeDrillRoute drillId={drillId} />;
}
