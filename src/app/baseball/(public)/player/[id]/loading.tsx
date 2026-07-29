import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard, HairlineRule } from '@/components/baseball/living-annual';
import { cn } from '@/lib/utils';

/**
 * Public player profile loading skeleton.
 *
 * The contract this file has to hold is narrow and easy to break: the shapes
 * below must land where PlayerProfileClient's FIRST PAINT lands, at every
 * breakpoint, or the loading → loaded transition is a jump instead of a fade.
 * The two files had drifted apart on exactly the axis that matters most here —
 * mobile, which is how a shared profile link is overwhelmingly opened:
 *
 *   banner height   was h-52 md:h-64   → real: h-32 sm:h-36 md:h-64
 *   card overlap    was -mt-28 md:-mt-32 → real: -mt-2 sm:-mt-10 md:-mt-32
 *   avatar          was w-32 h-32      → real: w-20 h-20
 *
 * At 375px that put the passport card ~190px too high and the avatar 48px too
 * large, so the whole page snapped downward the moment real data arrived.
 * The literals below are copied from PlayerProfileClient.tsx — keep them in
 * sync when that file's layout changes, and prefer changing both in one edit.
 *
 * `@/components/ui/skeleton` (not a Fairway skeleton) is deliberate: CLAUDE.md
 * scopes the Fairway loading bar to golf dashboard routes, and this is a public
 * baseball route whose real chrome is the Living Annual kit.
 */
export default function PublicPlayerProfileLoading() {
  // Approximate widths of the five real tab labels (Overview / Videos /
  // Stats & Metrics / Team History / Awards).
  const tabWidths = ['w-20', 'w-20', 'w-32', 'w-28', 'w-20'];

  return (
    <div className="min-h-dvh bg-[var(--paper-canvas)]">
      {/* Banner skeleton — matches the real hero's h-32 sm:h-36 md:h-64 */}
      <div className="h-32 sm:h-36 md:h-64 relative overflow-hidden">
        <Skeleton className="absolute inset-0 rounded-none" />
      </div>

      {/* Passport card skeleton — same overlap ladder as the real card, which
          is derived from the hero-height/safe-area arithmetic documented in
          PlayerProfileClient.tsx (HERO_SAFE_TOP_STYLE). */}
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 -mt-2 sm:-mt-10 md:-mt-32 relative z-10">
        <PaperCard registrationTick className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <Skeleton
              variant="circular"
              className="w-20 h-20 md:w-40 md:h-40 shrink-0 ring-4 ring-[color:var(--paper)]"
            />

            {/* Masthead + quick stats. The real layout stacks these on mobile
                and puts them side by side from md, so the skeleton does too. */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  {/* dateline eyebrow, given name, SURNAME, accent rule */}
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-8 w-32 md:h-9 md:w-40" />
                  <Skeleton className="h-11 w-56 md:h-16 md:w-80" />
                  <Skeleton className="h-[3px] w-16 rounded-full" />
                </div>

                {/* Views / Watchlists / Videos */}
                <div className="flex flex-wrap items-end gap-x-6 gap-y-4 md:gap-10">
                  {['Views', 'Watchlists', 'Videos'].map((label) => (
                    <div key={label} className="flex flex-col gap-1">
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-9 w-10" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Identity chips row (school · teams · hometown) */}
              <div className="flex flex-wrap items-center gap-4 mt-5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>

          <HairlineRule ink="hairline" className="my-6" />

          {/* Tab strip skeleton — pill tabs matching the real tab bar */}
          <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1">
            {tabWidths.map((w, i) => (
              <Skeleton key={i} className={cn('h-9 shrink-0 rounded-fw-lg', w)} />
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

            {/* Physical & Metrics — ten measurables on the real 2 / sm:3 /
                lg:4 track ladder, so the card's height lands within a row of
                the loaded one instead of a screen away. */}
            <PaperCard className="p-6">
              <div className="mb-5 flex items-center gap-2">
                <Skeleton variant="circular" className="h-[18px] w-[18px]" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-10 w-12" />
                  </div>
                ))}
              </div>
            </PaperCard>

            {/* Featured Videos */}
            <PaperCard className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
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
