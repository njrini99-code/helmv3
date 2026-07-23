import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/qualifiers/new.
 *
 * Shape-matches the redesigned FairwayNewQualifier form: a max-w-[760px]
 * column with a ViewHeader silhouette (eyebrow, title, description), then the
 * five roomy FormSections it actually renders — Basics, Schedule, Course &
 * rules, Travel squad (with its live read-out Surface), and Players (roster
 * checkbox grid) — closing with the Cancel / Create qualifier action row.
 * Replaces the legacy `FormPageSkeleton` (`surface-matte` / `warm-*` /
 * `skeleton-shimmer` chrome at max-w-2xl), which reshaped the page (CLS) when
 * the Fairway form mounted.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24"
      >
        <span className="sr-only">Loading new qualifier form…</span>

        {/* ViewHeader — eyebrow + title + description */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        <div className="mt-8 flex flex-col gap-8">
          {/* Basics */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <div className="flex flex-col gap-5">
              <Skeleton className="h-10 w-full rounded-fw-md" />
              <Skeleton className="h-20 w-full rounded-fw-md" />
            </div>
          </div>

          {/* Schedule */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </div>
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Skeleton className="h-10 w-full rounded-fw-md" />
                <Skeleton className="h-10 w-full rounded-fw-md" />
              </div>
              <Skeleton className="h-10 w-full rounded-fw-md" />
            </div>
          </div>

          {/* Course & rules */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-56 max-w-full" />
            </div>
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Skeleton className="h-10 w-full rounded-fw-md" />
                <Skeleton className="h-10 w-full rounded-fw-md" />
              </div>
              <Skeleton className="h-16 w-full rounded-fw-md" />
            </div>
          </div>

          {/* Travel squad — includes the live read-out Surface */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Skeleton className="h-10 w-full rounded-fw-md" />
                <Skeleton className="h-10 w-full rounded-fw-md" />
              </div>
              <Surface elevation="border" padding="md" className="bg-surface-sunken" aria-hidden="true">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-1.5 h-4 w-3/4 max-w-full" />
              </Surface>
            </div>
          </div>

          {/* Players */}
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-8 w-20 rounded-fw-md" />
                <Skeleton className="h-8 w-16 rounded-fw-md" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-3.5 py-3"
                >
                  <Skeleton className="h-5 w-5 rounded-sm" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between gap-3 pt-2">
          <Skeleton className="h-10 w-20 rounded-fw-md" />
          <Skeleton className="h-10 w-[170px] rounded-fw-md" />
        </div>
      </div>
    </div>
  );
}
