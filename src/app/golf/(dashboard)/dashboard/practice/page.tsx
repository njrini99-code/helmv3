import { PracticeHomeRoute } from '@/clubhouse/routes/practice';
import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';

/** Practice, the tab. `?new=1` opens New plan. */
export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string; template?: string; event?: string }> }) {
  await redirectUnlessClubhousePractice();
  const { new: open, template, event } = await searchParams;
  return <PracticeHomeRoute newPlan={open === '1'} template={template} event={event} />;
}
