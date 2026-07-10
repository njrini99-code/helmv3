import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Game detail / box score loading skeleton — mirrors the real layout:
 * breadcrumb → game header card → batting table → pitching section.
 *
 * Card shells use the same `PaperCard` primitive as the real page.tsx
 * (flat `--paper` + `--hairline`, letterpress inset shadow) instead of a
 * frosted-glass panel, so the skeleton doesn't flash a different surface
 * treatment than the content it's standing in for.
 */
export default function GameDetailLoading() {
  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-40" />

      {/* Game header card */}
      <PaperCard className="p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-16 rounded-xl" />
            <Skeleton className="h-7 w-4" />
            <Skeleton className="h-14 w-16 rounded-xl" />
          </div>
        </div>
      </PaperCard>

      {/* Tab strip */}
      <Skeleton className="h-9 w-44 rounded-xl" />

      {/* Table skeleton */}
      <PaperCard className="shadow-sm">
        <div className="p-4 border-b border-warm-100">
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
      </PaperCard>
    </div>
  );
}
