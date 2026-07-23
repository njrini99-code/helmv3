import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for /baseball/dashboard/college-interest.
 * Mirrors CollegeInterestClient's real DOM: the `max-w-[1536px]` PAGE_SHELL
 * (not full-bleed/uncentered), a SectionMasthead-shaped header, a bare
 * 4-column `RuledStatLine`-style stat strip (no card/icon wrapper), the
 * filter-row header, and the list matching its own `InterestListSkeleton` —
 * each player as its own top-level `PaperCard`, not rows nested in one card.
 */
export default function CollegeInterestLoading() {
  return (
    <div className={`${PAGE_SHELL} space-y-8`}>
      {/* SectionMasthead */}
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={220} height={11} />
        <Skeleton variant="text" width={200} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
        <Skeleton variant="text" width={280} height={14} className="mt-1" />
      </div>

      {/* Contents strip — bare RuledStatLine placeholders, 4-up */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4 lg:gap-x-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-14" />
            <Skeleton className="h-[1.5px] w-full" />
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex flex-col gap-4 border-t border-[color:var(--hairline)] pt-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="hidden h-3.5 w-64 lg:block" />
        </div>
        <Skeleton className="h-9 w-52 rounded-fw-md" />
      </div>

      {/* Interest list — one top-level PaperCard per player, matching
          InterestListSkeleton exactly. */}
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <PaperCard key={i} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="40%" height={16} />
                <Skeleton variant="text" width="30%" height={11} />
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-[color:var(--hairline)] pt-3">
              <Skeleton variant="text" width={110} height={10} />
              <Skeleton variant="text" width="80%" height={14} />
              <Skeleton variant="text" width="65%" height={14} />
            </div>
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
