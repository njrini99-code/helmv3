import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Route-level loading skeleton for My Profile (player-only edit surface).
 * Mirrors ProfilePage's real shell — the `mx-auto w-full max-w-[820px]`
 * column, its SectionMasthead (eyebrow + title + accent rule + a right-
 * aligned "View Public Profile" action), and the tabbed editor card
 * (CollegeProfileEditor / ProfileEditor both render one PaperCard with a
 * pill tab bar over a field grid) — instead of the generic, differently-
 * shaped <PageLoading/> that used to render here.
 */
export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* SectionMasthead — eyebrow + title + accent rule + action */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-56" />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36 rounded-fw-md" />
        </div>
        <Skeleton className="h-[3px] w-16 rounded-full" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Tabbed editor card */}
      <PaperCard className="p-6" grain={false}>
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-fw-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Skeleton className="h-9 w-28 rounded-fw-md" />
        </div>
      </PaperCard>
    </div>
  );
}
