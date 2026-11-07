import { redirect } from 'next/navigation';
import { PracticeBuilderRoute } from '@/clubhouse/routes/practice';
import { practiceAvailable } from '@/clubhouse/gate';

/** The practice builder. Flag off: Calendar, never a 404 (N-00 §0.2). `?fill=1`: arriving from New plan's Ask CoachHelm, the helper starts at once. */
export default async function Page({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ fill?: string }> }) {
  if (!(await practiceAvailable())) redirect('/golf/dashboard/calendar');
  const [{ planId }, { fill }] = await Promise.all([params, searchParams]);
  return <PracticeBuilderRoute planId={planId} fill={fill === '1'} />;
}
