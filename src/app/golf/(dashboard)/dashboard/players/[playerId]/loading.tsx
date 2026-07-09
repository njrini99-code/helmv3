import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P106 — Fairway-native loading state for the coach Player Insight surface.
 * ----------------------------------------------------------------------------
 * The live page (FairwayPlayerInsight) is a single centered max-w-[860px]
 * narrative column: a back/cross-link row, a Surface hero (avatar + eyebrow +
 * title + meta + status pill + composite circle + verdict), then stacked
 * narrative sections (Standing, etc.). This reserves the 860px column's real
 * slots with Fairway tokens to eliminate the shape/token swap on hydrate
 * (CLS / gate B3).
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

export default function Loading() {
  return <FairwayPlayerInsightLoading />;
}
