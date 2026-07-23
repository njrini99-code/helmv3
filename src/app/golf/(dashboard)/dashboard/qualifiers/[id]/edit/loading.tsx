import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/qualifiers/[id]/edit.
 *
 * Shape-matches the redesigned FairwayEditQualifier form: a max-w-[760px]
 * column with a ViewHeader silhouette (eyebrow, title, "← Back to qualifier"
 * meta link) followed by the three roomy FormSections it actually renders —
 * Basics, Schedule, Course & rules — closing with the Cancel / Save changes
 * action row. Replaces the legacy `FormPageSkeleton` (`surface-matte` /
 * `warm-*` / `skeleton-shimmer` chrome at max-w-2xl), which reshaped the page
 * (CLS) when the Fairway form mounted.
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
        <span className="sr-only">Loading qualifier edit form…</span>

        {/* ViewHeader — eyebrow + title + description + back-link meta */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-sm" />
          <Skeleton className="mt-0.5 h-4 w-32" />
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
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between gap-3 pt-2">
          <Skeleton className="h-10 w-20 rounded-fw-md" />
          <Skeleton className="h-10 w-[140px] rounded-fw-md" />
        </div>
      </div>
    </div>
  );
}
