import { PracticeDrillRoute } from '@/clubhouse/routes/practice';

/** */
export default async function Page({ params }: { params: Promise<{ drillId: string }> }) {
  const { drillId } = await params;
  return <PracticeDrillRoute drillId={drillId} />;
}
