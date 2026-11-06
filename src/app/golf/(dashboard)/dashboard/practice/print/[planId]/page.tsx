import { redirect } from 'next/navigation';
import { PracticePrintRoute } from '@/clubhouse/routes/practice';
import { isPracticeTabEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';

/** Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  if (!isPracticeTabEnabled()) redirect('/golf/dashboard/calendar');
  const { planId } = await params;
  return <PracticePrintRoute planId={planId} />;
}
