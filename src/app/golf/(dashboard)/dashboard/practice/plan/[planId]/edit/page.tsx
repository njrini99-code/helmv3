import { PracticeBuilderRoute } from '@/clubhouse/routes/practice';

/** The practice builder. `?fill=1`: arriving from New plan's Ask CoachHelm, the helper starts at once. */
export default async function Page({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ fill?: string }> }) {
  const [{ planId }, { fill }] = await Promise.all([params, searchParams]);
  return <PracticeBuilderRoute planId={planId} fill={fill === '1'} />;
}
