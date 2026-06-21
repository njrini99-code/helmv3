import { Shimmer, ShimmerCard } from '@/components/ui/shimmer';
import { Surface, Skeleton } from '@/components/fairway';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading skeleton for the coach What's New feed.
 *
 * Must shape-match whichever fork whats-new/page.tsx renders so the
 * skeleton→content handoff is a quiet fade, not a chrome swap:
 *   • flag ON  → mirrors <FairwayWhatsNew/> inside fairwayScope('min-h-full
 *     bg-canvas'): max-w-[720px], a ViewHeader-shaped block, and matte
 *     Surface(elevation="border") day-groups divided by border-subtle.
 *   • flag OFF → the legacy glass + warm-chrome layout (unchanged).
 */
export default function Loading() {
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6 md:py-8 pb-24"
        >
          <span className="sr-only">Loading activity…</span>

          {/* ViewHeader placeholder: eyebrow · title · description · meta */}
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-3/4 max-w-[420px]" />
            <Skeleton className="h-4 w-full max-w-[560px]" />
            <Skeleton className="h-3 w-40" />
          </div>

          {/* Day groups — matte Surface rows on border-subtle dividers */}
          <div className="mt-8 flex flex-col gap-6">
            {[
              { label: 'h-3 w-16', rows: 3 },
              { label: 'h-3 w-20', rows: 1 },
            ].map((group, gi) => (
              <section key={gi} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2 px-1">
                  <Skeleton className={group.label} />
                  <Skeleton className="h-3 w-6" />
                </div>
                <Surface elevation="border" padding="none">
                  <ul className="divide-y divide-border-subtle">
                    {Array.from({ length: group.rows }).map((_, ri) => (
                      <li key={ri} className="flex items-start gap-3 px-4 py-3">
                        <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Surface>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-transparent">
      {/* Header placeholder */}
      <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-warm-200/30 pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-[720px] mx-auto px-4 md:px-6 py-5">
          <Shimmer className="h-7 w-44 rounded-lg" />
          <Shimmer className="h-3 w-72 mt-2" />
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* Day group 1 */}
        <section>
          <Shimmer className="h-4 w-24 mb-2" />
          <ShimmerCard className="px-5 py-1 rounded-2xl">
            <div className="divide-y divide-warm-100">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 py-3">
                  <Shimmer staggerIndex={i} className="w-9 h-9 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Shimmer staggerIndex={i} className="h-3 w-40" />
                    <Shimmer staggerIndex={i} className="h-4 w-3/4" />
                    <Shimmer staggerIndex={i} className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </ShimmerCard>
        </section>

        {/* Day group 2 */}
        <section>
          <Shimmer className="h-4 w-20 mb-2" />
          <ShimmerCard className="px-5 py-1 rounded-2xl">
            <div className="flex items-start gap-3 py-3">
              <Shimmer className="w-9 h-9 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3 w-40" />
                <Shimmer className="h-4 w-2/3" />
              </div>
            </div>
          </ShimmerCard>
        </section>
      </div>
    </div>
  );
}
