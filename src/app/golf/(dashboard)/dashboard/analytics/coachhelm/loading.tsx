import { Skeleton, InstrumentPanel, InstrumentCluster } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/analytics/coachhelm.
 *
 * Shape-matches FairwayEffectiveness's INSTRUMENT COCKPIT (CoachHelmShell's
 * masthead + persistent sub-nav strip, then a raised focal Readout+Ribbon hero,
 * a secondary rail of two base instruments — Outcomes / Calibration — a
 * tertiary 3-up micro-readout row, the pattern-impact + error-mix decks below,
 * and the "Go deeper" drill-down row) on `fairwayScope` `bg-canvas`. Replaces
 * the legacy `glass-standard` header + `Shimmer`/`ShimmerCard` tab UI, which
 * matched neither the redesigned cockpit layout nor its tokens (CLS + a
 * wrong-chrome flash on mount).
 *
 * #947 fix: eyebrow + h1 are real static text (matching
 * `FairwayEffectiveness.tsx`'s `CoachHelmShell` call — default eyebrow
 * "CoachHelm AI", `title="Is CoachHelm helping?"`), not `<Skeleton>` blocks.
 * The description (`Last ${days} days…`) stays a Skeleton — it's the one
 * piece that varies with the selected date range.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
        {/* Masthead — ViewHeader silhouette (eyebrow + title + description + actions) */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-accent-700">
              CoachHelm AI
            </p>
            <h1 className="min-w-0 font-fw-display text-h1 font-medium tracking-[-0.008em] text-text-primary [text-wrap:balance]">
              Is CoachHelm helping?
            </h1>
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          {/* range Segmented + Refresh action cluster */}
          <Skeleton className="h-9 w-64 max-w-full rounded-full" />
        </div>

        {/* CoachHelmSubNav strip — Brief · Signals · Players · Effectiveness · Ask */}
        <nav
          aria-hidden="true"
          className="flex w-full items-center gap-1 border-b border-border-subtle"
        >
          {[48, 60, 56, 84, 40].map((w, i) => (
            <div key={i} className="px-3.5 pb-3 pt-2.5">
              <Skeleton className="h-4" style={{ width: w }} />
            </div>
          ))}
        </nav>
      </div>

      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading effectiveness…</span>

        {/* The instrument cluster — focal hero, outcomes + calibration rail, tertiary row */}
        <InstrumentCluster
          ariaLabel="CoachHelm effectiveness instrument cluster (loading)"
          tertiaryColumns={3}
          primary={
            <InstrumentPanel depth="raised" padding="lg" className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-16 w-40" />
              </div>
              <Skeleton className="h-44 w-full rounded-fw-md" />
            </InstrumentPanel>
          }
          secondary={[
            <InstrumentPanel key="outcomes" depth="base" className="flex h-full flex-col gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-full rounded-full" />
              <Skeleton className="h-4 w-32" />
            </InstrumentPanel>,
            <InstrumentPanel key="calibration" depth="base" className="flex h-full flex-col gap-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-10 w-20" />
              <InstrumentPanel depth="inset" padding="sm" className="w-full">
                <Skeleton className="h-6 w-16" />
              </InstrumentPanel>
            </InstrumentPanel>,
          ]}
          tertiary={[
            <InstrumentPanel key="surfaced" depth="base" padding="md" className="h-full">
              <Skeleton className="h-8 w-16" />
            </InstrumentPanel>,
            <InstrumentPanel key="mae" depth="base" padding="md" className="h-full">
              <Skeleton className="h-8 w-16" />
            </InstrumentPanel>,
            <InstrumentPanel key="resolved" depth="base" padding="md" className="h-full">
              <Skeleton className="h-8 w-16" />
            </InstrumentPanel>,
          ]}
        />

        {/* Pattern impact — diverging tornado deck */}
        <InstrumentPanel depth="base" padding="lg" className="flex flex-col gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-40 w-full rounded-fw-md" />
        </InstrumentPanel>

        {/* Error mix — compact matte read */}
        <InstrumentPanel depth="base" padding="md" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full rounded-fw-md" />
        </InstrumentPanel>

        {/* "Go deeper" — quiet secondary drill-down switch */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-64 max-w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
