import { ListSkeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';

/**
 * Loading skeleton for the Practice Planner route.
 * Mirrors the real layout (header + card list) so there is no layout shift
 * when data lands. Uses the shared ListSkeleton (not a raw spinner).
 */
export default function Loading() {
  return (
    <>
      <Header
        title="Practice Planner"
        subtitle="Plan timed practices, stations &amp; attendance"
      />
      <div className="p-6 lg:p-8">
        <ListSkeleton items={3} />
      </div>
    </>
  );
}
