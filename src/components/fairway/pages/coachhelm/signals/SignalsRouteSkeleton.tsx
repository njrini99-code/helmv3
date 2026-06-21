/**
 * ============================================================================
 * Fairway · CoachHelm · Signals · SignalsRouteSkeleton (route-level fallback)
 * ----------------------------------------------------------------------------
 * The Fairway-scoped Suspense fallback for the Signals routes (/alerts,
 * /insights). It reserves the ACTUAL redesign layout — 3 MetricCard tiles, the
 * toolbar row, and 4 InsightCard-sized rows — so the route doesn't jump (CLS)
 * when the live workspace mounts. Tokens only (no legacy `surface-matte` /
 * `warm-*` / `cream-*` / `skeleton-shimmer`); renders inside `.fairway-ds` on a
 * `bg-canvas` page exactly like the real surface.
 *
 * Used ONLY in the redesign branch of the route `loading.tsx` (gated on
 * `isRedesignEnabled()`); the legacy fallbacks are untouched.
 * ========================================================================== */

import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

export function SignalsRouteSkeleton() {
  return (
    <div
      className={fairwayScope(
        'min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary',
      )}
    >
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <span className="sr-only">Loading signals…</span>

        {/* page title block (the shell large title + description) */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40 rounded-fw-md" />
          <Skeleton className="h-4 w-72 rounded-full" />
        </div>

        {/* 3-up KPI tiles — matches the MetricCard grid */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>

        {/* toolbar row */}
        <Skeleton className="h-12 w-full rounded-card" />

        {/* hero card + compact rows — InsightCard-sized */}
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
