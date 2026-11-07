import { redirect } from 'next/navigation';
import { PlanFormatRoute } from '@/clubhouse/routes/practice';
import { isPracticePlansEnabled, isPracticeTabEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';

/** Practice › Plan format. Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page() {
  if (!isPracticePlansEnabled() || !isPracticeTabEnabled()) redirect('/golf/dashboard/calendar');
  return <PlanFormatRoute />;
}
