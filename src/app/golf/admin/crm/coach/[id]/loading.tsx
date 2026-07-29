import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/admin/crm/coach/[id].
 *
 * Shape-matches ./page.tsx: breadcrumb, CoachPageHeader, then the 1-col/3-col
 * body (info + attachments on the left, the timeline card on the right).
 * Replaces the pre-Fairway `DetailPageSkeleton`, whose single centered column
 * jumped into this grid on hydration.
 */
export default function Loading() {
  return (
    <main
      className={fairwayScope('min-h-dvh bg-canvas font-fw-sans')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading coach…</span>
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <Skeleton className="h-4 w-56" />

        {/* CoachPageHeader */}
        <div className="rounded-card border border-border-subtle bg-surface p-5 [box-shadow:var(--fw-shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-48" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-11 w-28 rounded-fw-md" />
              <Skeleton className="h-11 w-28 rounded-fw-md" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-1">
            <Skeleton className="h-80 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-[520px] w-full rounded-card" />
          </div>
        </div>
      </div>
    </main>
  );
}
