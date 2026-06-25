import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';

/**
 * Route-level loading skeleton for the Saved Comparisons surface.
 * Mirrors the real page layout (header + grid of comparison cards) so there is
 * no layout shift when data lands. The Suspense fallback inside the page covers
 * list-level streaming; this skeleton covers the entire page shell.
 */
export default function ComparisonsLoading() {
  return (
    <>
      <Header title="Saved Comparisons" subtitle="View and manage your saved player comparisons" />
      <div className="p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-warm-200 p-6"
            >
              <Skeleton className="h-4 w-3/4 mb-3" />
              <Skeleton className="h-3 w-1/2 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
