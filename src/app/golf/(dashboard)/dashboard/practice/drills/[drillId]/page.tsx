import { redirect } from 'next/navigation';
import { PracticeDrillRoute } from '@/clubhouse/routes/practice';
import { isPracticeTabEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';

/** Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page({ params }: { params: Promise<{ drillId: string }> }) {
  if (!isPracticeTabEnabled()) redirect('/golf/dashboard/calendar');
  const { drillId } = await params;
  return <PracticeDrillRoute drillId={drillId} />;
}
