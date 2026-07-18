import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * P032 — Fairway-scoped route skeleton for the redesigned Signals workspace
 * (/alerts). Replaces the legacy `AlertsPageSkeleton` (surface-matte / warm-200
 * / max-w-5xl), which did not match the redesign layout and reshaped the page
 * when the real Fairway feed mounted (CLS). This reserves the ACTUAL Fairway
 * layout: 3 MetricCard tiles + the toolbar row + a hero InsightCard + compact
 * card rows — all in Fairway tokens (bg-canvas / rounded-card / Skeleton's
 * matte sweep) so the live feed lands without a content jump.
 *
 * #947 fix: eyebrow + h1 are real static text (matching
 * `FairwayCoachHelmSignals.tsx`'s `CoachHelmShell` call for this route —
 * default eyebrow "CoachHelm AI", `title={title ?? 'Signals'}` and this route
 * never passes a `title` override), not `<Skeleton>` blocks — see
 * `dashboard/intelligence/loading.tsx`'s doc comment for why this fallback,
 * not the final render, is what was showing a blank/ghost title.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient px-4 py-6 md:px-6')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex max-w-5xl flex-col gap-6"
      >
        <span className="sr-only">Loading signals…</span>

        {/* title row */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-accent-700">
              CoachHelm AI
            </p>
            <h1 className="min-w-0 font-fw-display text-h1 font-medium tracking-[-0.008em] text-text-primary [text-wrap:balance]">
              Signals
            </h1>
          </div>
          <Skeleton className="h-4 w-72" />
        </div>

        {/* 3 metric tiles */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>

        {/* toolbar */}
        <Skeleton className="h-12 w-full rounded-card" />

        {/* hero card + 3 compact rows */}
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-card" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
