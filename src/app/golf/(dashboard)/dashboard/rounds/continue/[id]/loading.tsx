import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for Continue Round.
 *
 * Keep this sequence aligned with the settled view: the resume context owns
 * the top safe-area inset and the round-type editor slot, followed by the
 * scorecard and shot-entry skeleton. Matching that geometry prevents a jump
 * when the server-rendered editor arrives.
 */
export default function Loading() {
  return (
    <>
      {/* Resume context and the server-provided editor share one inset-aware header. */}
      <header className={fairwayScope('bg-surface border-b border-border-subtle px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]')}>
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-fw-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <div className="shrink-0 space-y-1 rounded-fw-sm bg-surface-sunken px-2.5 py-1.5">
            <Skeleton className="ml-auto h-3 w-8" />
            <Skeleton className="ml-auto h-3 w-10" />
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-[720px]">
          <Skeleton className="h-9 w-40 rounded-full [@media(pointer:coarse)]:h-11" />
        </div>
      </header>

      <div
        className={fairwayScope('min-h-full bg-canvas')}
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading round…</span>

        {/* Scorecard chrome and shot progress. */}
        <div className="bg-elevated shadow-flat">
          {/* Mobile control row. */}
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-9 w-[4.5rem] rounded-full" />
              <Skeleton className="h-9 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-[4.5rem] rounded-full" />
          </div>

          {/* Horizontally scrollable hole strip. */}
          <div className="flex items-stretch overflow-x-auto border-b border-border-subtle">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-border-subtle px-2 py-2.5"
              >
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-2 w-9" />
                <Skeleton className="h-2 w-9" />
                <Skeleton className="mt-1 h-5 w-5" />
              </div>
            ))}
            <div className="flex min-w-[78px] shrink-0 flex-col items-center gap-1.5 border-r border-border-strong bg-surface-sunken px-2 py-2.5">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-2 w-9" />
              <Skeleton className="h-2 w-9" />
              <Skeleton className="mt-1 h-5 w-6" />
            </div>
          </div>

          {/* Shot progress row. */}
          <div className="px-3 py-2.5">
            <Skeleton className="mb-1.5 h-2.5 w-12" />
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-fw-md" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-1.5 w-1.5 shrink-0 rounded-full" />
              ))}
            </div>
          </div>
        </div>

        {/* Hole hero and shot-entry skeleton. */}
        <div className="mx-auto max-w-[720px] px-4 py-4">
          <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <Skeleton className="ml-auto h-8 w-16" />
                <Skeleton className="ml-auto h-3 w-12" />
              </div>
            </div>
            <div className="px-3 pb-3 pt-4">
              <Skeleton className="aspect-[8/3] w-full rounded-fw-md" />
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-card bg-surface shadow-soft">
            <div className="px-5 py-5">
              <Skeleton className="mb-3 h-3 w-24" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[52px] w-full rounded-fw-md" />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-1 space-y-2">
            <Skeleton className="h-11 w-full rounded-fw-md" />
            <div className="flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-fw-md" />
              <Skeleton className="h-11 flex-1 rounded-fw-md" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
