import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard, HairlineRule } from '@/components/baseball/living-annual';
import { cn } from '@/lib/utils';

/**
 * Public player profile loading skeleton — mirrors the rebuilt
 * PlayerProfileClient's hero passport (PaperCard, not a bg-cream-50/shadow-xl
 * ad-hoc card), pill tab strip, and Overview grid so the loading → loaded
 * transition is a fade, not a re-skin. Classes below are pulled literally
 * from PlayerProfileClient.tsx — keep them in sync if that file's layout
 * changes (the pairing-regression this file previously fell into).
 */
export default function PublicPlayerProfileLoading() {
  // Approximate widths of the five real tab labels (Overview / Videos /
  // Stats & Metrics / Team History / Awards).
  const tabWidths = ['w-20', 'w-20', 'w-32', 'w-28', 'w-20'];

  return (
    <div className="min-h-dvh bg-[var(--paper-canvas)]">
      {/* Banner skeleton */}
      <div className="h-52 md:h-64 relative overflow-hidden">
        <Skeleton className="absolute inset-0 rounded-none" />
      </div>

      {/* Passport card skeleton — overlapping the banner, PaperCard-shaped */}
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 -mt-28 md:-mt-32 relative z-10">
        <PaperCard registrationTick className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <Skeleton
              variant="circular"
              className="w-32 h-32 md:w-40 md:h-40 shrink-0 ring-4 ring-[color:var(--paper)]"
            />

            {/* Masthead + info */}
            <div className="flex-1 min-w-0 space-y-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-10 w-64 md:h-12 md:w-80" />
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap items-end gap-6 md:gap-10">
              {['Views', 'Watchlists', 'Videos'].map((label) => (
                <div key={label} className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-7 w-10" />
                </div>
              ))}
            </div>
          </div>

          <HairlineRule ink="hairline" className="my-6" />

          {/* Tab strip skeleton — pill tabs matching the new tab bar, not the
              old bordered/square "border-t bg-warm-50/50" row. */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {tabWidths.map((w, i) => (
              <Skeleton key={i} className={cn('h-9 rounded-fw-lg', w)} />
            ))}
          </div>
        </PaperCard>
      </div>

      {/* Tab content skeleton — mirrors the default Overview tab's grid */}
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* About */}
            <PaperCard className="p-6">
              <Skeleton className="h-3 w-16 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </PaperCard>

            {/* Physical & Metrics */}
            <PaperCard className="p-6">
              <div className="mb-5 flex items-center gap-2">
                <Skeleton variant="circular" className="h-[18px] w-[18px]" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-7 w-12" />
                  </div>
                ))}
              </div>
            </PaperCard>

            {/* Featured Videos */}
            <PaperCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Skeleton variant="circular" className="h-[18px] w-[18px]" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="aspect-[16/10] rounded-card" />
                <Skeleton className="aspect-[16/10] rounded-card" />
              </div>
            </PaperCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact */}
            <PaperCard className="p-6">
              <Skeleton className="h-3 w-16 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-11 w-full rounded-fw-md" />
                <Skeleton className="h-11 w-full rounded-fw-md" />
              </div>
            </PaperCard>

            {/* Schools of Interest */}
            <PaperCard className="p-6">
              <Skeleton className="h-3 w-32 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-14 w-full rounded-fw-md" />
                <Skeleton className="h-14 w-full rounded-fw-md" />
              </div>
            </PaperCard>

            {/* Profile Activity */}
            <PaperCard className="p-6">
              <Skeleton className="h-3 w-32 mb-4" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-10" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-10" />
                </div>
                <HairlineRule ink="hairline" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            </PaperCard>
          </div>
        </div>
      </div>
    </div>
  );
}
