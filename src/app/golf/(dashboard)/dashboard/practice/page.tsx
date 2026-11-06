import { redirect } from 'next/navigation';
import { PracticeHomeRoute } from '@/clubhouse/routes/practice';
import { isPracticeTabEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';

/** Practice, the tab. Flag off: Calendar, never a 404 (N-00 §0.2). `?new=1` opens New plan. */
export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string; template?: string; event?: string }> }) {
  if (!isPracticeTabEnabled()) redirect('/golf/dashboard/calendar');
  const { new: open, template, event } = await searchParams;
  return <PracticeHomeRoute newPlan={open === '1'} template={template} event={event} />;
}
