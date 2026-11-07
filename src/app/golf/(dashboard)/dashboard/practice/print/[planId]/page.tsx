import { PracticePrintRoute } from '@/clubhouse/routes/practice';

/** */
export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return <PracticePrintRoute planId={planId} />;
}
