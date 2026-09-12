import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/[id]/review.
 *
 * The page is a CLIENT component (page.tsx has no server data fetching to
 * suspend on) and it mounts with `loadingRound`/`loadingStoredReview` both
 * starting `true`. So the instant this route boundary resolves and the page
 * mounts, what actually paints is the page's OWN "Fairway loading surface"
 * (page.tsx's `if (isLoading)` return), not the field sheet. This fallback
 * reproduces THAT branch exactly — the same `PAGE_SHELL` container, the same
 * masthead silhouette (eyebrow, title, two verdict lines) and the same single
 * stage block — so the handoff from route fallback to page loading state
 * changes no shape and shifts nothing.
 *
 * It deliberately does NOT draw a centred card with a 3-up mini-stat row: the
 * v3 screen has no cards, and a fallback that invents one makes every
 * navigation flash a layout the page never renders.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-6 pb-[calc(var(--golf-mobile-bottom-nav-offset)+1rem)] md:px-8 md:pt-8 lg:pb-16">
        <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
          <span className="sr-only">Loading review…</span>
          {/* Masthead: eyebrow, player name, the verdict's two lines. */}
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-full max-w-[48ch]" />
          <Skeleton className="h-5 w-full max-w-[36ch]" />
          {/* The stage — the only Surface on the page. */}
          <div className="mt-7 rounded-card border border-border-subtle bg-surface p-5 md:p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-16 w-full" />
            <Skeleton className="mt-3 h-3 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
