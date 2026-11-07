import { PracticeHomeRoute } from '@/clubhouse/routes/practice';

/** Practice, the tab. `?new=1` opens New plan. */
export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string; template?: string; event?: string }> }) {
  const { new: open, template, event } = await searchParams;
  return <PracticeHomeRoute newPlan={open === '1'} template={template} event={event} />;
}
