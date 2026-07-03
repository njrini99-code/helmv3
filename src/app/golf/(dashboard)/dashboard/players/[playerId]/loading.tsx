import { Shimmer, ShimmerCard } from '@/components/ui/shimmer';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P106 — Fairway-native loading state for the coach Player Insight surface.
 * ----------------------------------------------------------------------------
 * The live page (FairwayPlayerInsight) is a single centered max-w-[860px]
 * narrative column: a back/cross-link row, a Surface hero (avatar + eyebrow +
 * title + meta + status pill + composite circle + verdict), then stacked
 * narrative sections (Standing, etc.) — NOT the legacy 12-col grid. The legacy
 * Shimmer skeleton (max-w-[1536px], lg:grid-cols-12, bg-white/70 sticky header,
 * warm tokens) only matches the flag-off page, so it stays behind the flag.
 * This reserves the 860px column's real slots with Fairway tokens to eliminate
 * the shape/token swap on hydrate (CLS / gate B3).
 */
function FairwayPlayerInsightLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading player insight…</span>

        {/* Back + sibling cross-links row */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-8 w-20 rounded-fw-md" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-8 w-32 rounded-fw-md" />
            <Skeleton className="h-8 w-24 rounded-fw-md" />
          </div>
        </div>

        <div className="space-y-12">
          {/* A · WHO + VERDICT hero */}
          <Surface elevation="shadow" padding="lg">
            <div className="flex items-start gap-5">
              <Skeleton className="h-16 w-16 flex-shrink-0 rounded-2xl md:h-20 md:w-20" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-9 w-48 max-w-full" />
                <Skeleton className="mt-2 h-3.5 w-32" />
                <Skeleton className="mt-2.5 h-6 w-28 rounded-full" />
              </div>
              <Skeleton circle className="h-[88px] w-[88px] flex-shrink-0" />
            </div>
            <div className="mt-5 border-l-2 border-border-subtle pl-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </div>
          </Surface>

          {/* B · STANDING — eyebrow + bar rows */}
          <section>
            <Skeleton className="h-3 w-20" />
            <div className="mt-3 flex flex-col gap-3 rounded-card bg-surface-sunken p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3.5 w-24 flex-shrink-0" />
                  <Skeleton className="h-2.5 flex-1 rounded-full" />
                  <Skeleton className="h-3.5 w-8 flex-shrink-0" />
                </div>
              ))}
            </div>
          </section>

          {/* C · narrative sections (insights / focus / rounds) */}
          {Array.from({ length: 2 }).map((_, i) => (
            <section key={i}>
              <Skeleton className="h-3 w-28" />
              <div className="mt-3 flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Surface key={j} elevation="border" padding="md">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="mt-2.5 h-3.5 w-full" />
                    <Skeleton className="mt-2 h-3.5 w-2/3" />
                  </Surface>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Legacy (flag-off) shimmer skeleton — kept verbatim. */
function LegacyPlayerInsightLoading() {
  return (
    <div className="min-h-full bg-transparent">
      {/* Header skeleton */}
      <div className="sticky top-0 z-20 border-b border-warm-200/30 glass-standard pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-3 md:py-5">
          <div className="flex items-center gap-3">
            <Shimmer className="h-5 w-16" />
            <div className="space-y-1.5">
              <Shimmer className="h-6 w-36" />
              <Shimmer className="h-4 w-24" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column skeleton */}
          <div className="lg:col-span-5 space-y-6">
            {/* Player header card */}
            <ShimmerCard className="rounded-3xl p-6">
              <div className="flex items-start gap-4">
                <Shimmer className="w-14 h-14 rounded-2xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Shimmer className="h-6 w-40" />
                  <Shimmer className="h-4 w-32" />
                  <Shimmer className="h-5 w-20 rounded-full" />
                </div>
                <Shimmer variant="circle" className="w-[88px] flex-shrink-0" />
              </div>
            </ShimmerCard>

            {/* Category breakdown */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-40 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Shimmer staggerIndex={i} className="h-4 w-20 flex-shrink-0" />
                    <Shimmer staggerIndex={i} className="flex-1 h-2.5 rounded-full" />
                    <Shimmer staggerIndex={i} className="h-4 w-8 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Trend summary */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-32 mb-4" />
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-3 space-y-2">
                    <Shimmer staggerIndex={i} className="h-3 w-full" />
                    <Shimmer staggerIndex={i} className="h-6 w-12 mx-auto" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Patterns */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-32 mb-4" />
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Shimmer staggerIndex={i} variant="circle" className="w-2" />
                      <Shimmer staggerIndex={i} className="h-4 w-36" />
                    </div>
                    <Shimmer staggerIndex={i} className="h-3 w-full" />
                    <Shimmer staggerIndex={i} className="h-3 w-24" />
                  </div>
                ))}
              </div>
            </ShimmerCard>
          </div>

          {/* Right column skeleton */}
          <div className="lg:col-span-7 space-y-6">
            {/* Insights */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-24 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Shimmer staggerIndex={i} className="h-4 w-16" />
                      <Shimmer staggerIndex={i} className="h-4 w-40" />
                    </div>
                    <Shimmer staggerIndex={i} className="h-3 w-full" />
                    <Shimmer staggerIndex={i} className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Focus areas */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-28 mb-4" />
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <Shimmer staggerIndex={i} className="h-4 w-36" />
                    <Shimmer staggerIndex={i} className="h-1.5 w-full rounded-full" />
                    <Shimmer staggerIndex={i} className="h-3 w-20" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Rounds */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-32 mb-4" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-3.5 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <Shimmer staggerIndex={i} className="h-4 w-36" />
                      <Shimmer staggerIndex={i} className="h-3 w-24" />
                    </div>
                    <div className="space-y-1 text-right">
                      <Shimmer staggerIndex={i} className="h-6 w-10 ml-auto" />
                      <Shimmer staggerIndex={i} className="h-3 w-8 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            </ShimmerCard>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  if (isRedesignEnabled()) return <FairwayPlayerInsightLoading />;
  return <LegacyPlayerInsightLoading />;
}
