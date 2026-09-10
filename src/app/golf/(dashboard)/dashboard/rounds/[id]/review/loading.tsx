import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/[id]/review.
 *
 * The page is a CLIENT component (page.tsx has no server data fetching to
 * suspend on), and it mounts with `loadingRound`/`loadingStoredReview` both
 * starting `true`. So the instant this route boundary resolves and the page
 * mounts, what actually paints is the page's OWN "Fairway loading surface"
 * (P203/P216 — see page.tsx's `if (isLoading)` return), not the eventual
 * FilmstripReview/ReviewHero content. This fallback reproduces THAT branch
 * exactly: the same `max-w-6xl` container, the same ViewHeader silhouette
 * (eyebrow + title + description + one Refresh `IconButton` — a facelift
 * icon-only action, not a labeled pill), then the same
 * `mt-8 flex flex-col gap-6` status region with its TWO children — the
 * centered card (icon/title/value stack, a 3-up mini-stat row, two stacked
 * h-16 rows) and, immediately after it, the always-present status line
 * (only its inner content branches on `isGenerating`, the element itself is
 * unconditional while `isLoading`) — so the route fallback hands off to
 * the page's own loading state with no shape change and no added/removed row.
 *
 * Previously this used a `max-w-2xl` two-pane "filmstrip hero" shape mirroring
 * the LOADED FilmstripReview/ReviewHero — which is neither loading state the
 * page actually renders. Both `isLoading` and the final content return use
 * `max-w-6xl`; `max-w-2xl` only appears on the error/no-data branches. That
 * mismatch meant every ordinary load narrowed from 6xl to 2xl and back,
 * shifting the whole page horizontally twice per visit.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
        {/* Masthead — ViewHeader silhouette (eyebrow + title + description + one action) */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        </div>

        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="mt-8 flex flex-col gap-6"
        >
          <span className="sr-only">Loading review…</span>

          {/* The page's own isLoading card: icon + title + value stack,
              3-up mini-stats, two stacked rows. */}
          <div className="rounded-card border border-border-subtle bg-surface p-6">
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-fw-md" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-9 w-20" />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2 rounded-fw-md bg-surface-sunken p-3"
                >
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full rounded-fw-md" />
              <Skeleton className="h-16 w-full rounded-fw-md" />
            </div>
          </div>

          {/* The page's always-present status line below the card
              (page.tsx:596-605) — only its text branches on isGenerating,
              the row itself renders unconditionally while isLoading. */}
          <div className="flex items-center justify-center gap-2">
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
