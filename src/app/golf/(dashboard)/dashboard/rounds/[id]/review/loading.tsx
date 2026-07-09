import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/[id]/review.
 *
 * Shape-matches page.tsx's own Fairway `isLoading` surface (the ViewHeader
 * masthead + the bordered card with a centered icon/title/value, a 3-up
 * evidence grid, and two note blocks) at the SAME `max-w-2xl` container the
 * live page uses — so the route-level Suspense fallback and the client
 * component's own "Loading review…" state read as one continuous surface,
 * never the legacy `@/components/ui/skeleton` GenericPageSkeleton (wrong
 * width, wrong tokens).
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-2xl px-5 py-8 md:px-8 md:py-10">
        {/* Masthead — ViewHeader silhouette (eyebrow + title + description + action) */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>

        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="mt-8 flex flex-col gap-6"
        >
          <span className="sr-only">Loading review…</span>

          <Surface>
            <Surface.Body>
              <div className="flex flex-col items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-fw-md" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-9 w-20" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 rounded-fw-md bg-surface-sunken p-3"
                  >
                    <Skeleton className="h-6 w-10" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full rounded-fw-md" />
                <Skeleton className="h-16 w-full rounded-fw-md" />
              </div>
            </Surface.Body>
          </Surface>

          <Skeleton className="mx-auto h-4 w-40" />
        </div>
      </div>
    </div>
  );
}
