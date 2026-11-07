import { PracticePlanRoute } from '@/clubhouse/routes/practice';

/** The deep link from a push, a bell row or Documents. */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return <PracticePlanRoute planId={planId} />;
}
