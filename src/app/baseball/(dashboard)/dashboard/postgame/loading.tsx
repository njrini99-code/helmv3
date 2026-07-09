import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

export default function PostgameReviewLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>

        {/* Game picker chips */}
        <div className="mb-6 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-lg" />
          ))}
        </div>

        {/* Review header card */}
        <PaperCard className="mb-6 p-6 space-y-2" grain={false}>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-40" />
        </PaperCard>

        {/* Item cards */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <PaperCard key={i} className="p-4 space-y-2" grain={false}>
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-6 w-32" />
            </PaperCard>
          ))}
        </div>
      </div>
    </div>
  );
}
