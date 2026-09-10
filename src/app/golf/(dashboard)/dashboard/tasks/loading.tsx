import { fairwayScope } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P433 — purpose-built loading state for the Tasks board. Shape-matches the
 * page's own first paint: this Suspense fallback covers only the gap until
 * GolfTasksPage mounts, then that 'use client' page's OWN loading branch
 * (page.tsx's `if (loading)` return — the SAME masthead → StatMatrix →
 * toolbar → seam-row list shape) takes over until useTaskRealtime resolves,
 * so the board paints in place with no layout swap / CLS.
 *
 * Facelift (docs/design/fairway-facelift/screens/tasks.md): reshaped to
 * mirror FairwayTasks' composition (ViewHeader → StatMatrix → Toolbar → one
 * matte Surface of seam rows) instead of the retired filter-pills + card-list
 * + Templates-rail shape.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading tasks…</span>

        {/* Masthead — ViewHeader (eyebrow · title · description · meta) +
            primary CTA + the header overflow (From template). */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-52 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Skeleton className="h-10 w-32 rounded-fw-md" />
            <Skeleton circle className="h-9 w-9" />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {/* StatMatrix — Open · Active · Completed · Overdue (2×2 on phone,
              one row of 4 from `sm`), the same inset-well seams the real
              component draws. */}
          <div className="grid grid-cols-2 overflow-hidden rounded-fw-md bg-surface-sunken sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center gap-1.5 border-border-subtle px-3 py-3',
                  i % 2 === 1 && 'border-l',
                  i >= 2 && 'border-t sm:border-t-0',
                  i !== 0 && 'sm:border-l',
                )}
              >
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>

          {/* Toolbar — search · status Segmented · category filter, one row. */}
          <div className="flex min-h-11 flex-wrap items-center gap-3 rounded-card border border-border-subtle bg-surface px-3 py-2">
            <Skeleton className="h-10 w-full rounded-fw-md sm:min-w-[180px] sm:max-w-sm sm:flex-1 lg:w-72 lg:flex-none" />
            <Skeleton className="h-9 w-48 rounded-fw-sm" />
            <Skeleton className="ml-auto h-8 w-28 rounded-full" />
          </div>

          {/* The task list — ONE matte Surface of seam rows. */}
          <Surface
            elevation="border"
            padding="none"
            className="divide-y divide-border-subtle overflow-hidden"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
                <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - (i % 3) * 8}%` }} />
                <Skeleton className="hidden h-8 w-28 flex-shrink-0 sm:block" />
                <Skeleton className="h-4 w-12 flex-shrink-0 sm:w-16" />
                <Skeleton className="hidden h-6 w-20 flex-shrink-0 rounded-full sm:block" />
                <Skeleton className="hidden h-4 w-4 flex-shrink-0 sm:block" />
              </div>
            ))}
          </Surface>
        </div>
      </div>
    </div>
  );
}
