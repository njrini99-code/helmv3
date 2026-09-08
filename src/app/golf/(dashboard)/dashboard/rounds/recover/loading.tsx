import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/recover.
 *
 * page.tsx (page.tsx:23-26) renders `<FairwayRecoverRound playerId={...} />`
 * directly inside `<div className={fairwayScope('min-h-full bg-canvas')}>`
 * with no intervening Suspense boundary of its own, so this fallback is
 * replaced by FairwayRecoverRound's OWN first paint, not by its eventual
 * resolved list. That component initializes `loading` to `true`
 * (FairwayRecoverRound.tsx:357) and the offline-storage scan it awaits
 * (legacy + modern IndexedDB stores plus a recovery-cache read, settled via
 * `Promise.allSettled`) is genuinely async, so the `if (loading)` branch
 * (FairwayRecoverRound.tsx:590-601) is real, visible interstitial content —
 * not a negligible microtask flash. That branch renders a single
 * vertically-centered block (`mx-auto flex min-h-full w-full max-w-lg
 * items-center justify-center px-4 py-12`) holding three pulsing dots above
 * one line of "Scanning offline storage…" text — no ViewHeader, no cards, no
 * CTA. This fallback reproduces that exact container shape and reserves the
 * same two shapes (a row of 3 small circles, one text-width block) as
 * Skeleton primitives rather than duplicating the literal dot/copy, per the
 * Skeleton-block convention (see stats/loading.tsx, which does the same for
 * StatsSpineStage's own loading branch) — so there is no flash between this
 * route fallback and the in-component fallback it hands off to.
 */
export default function RecoverRoundLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex min-h-full w-full max-w-lg items-center justify-center px-4 py-12"
      >
        <span className="sr-only">Loading recoverable rounds…</span>
        <div className="flex flex-col items-center text-center" aria-hidden="true">
          <div className="mb-4 flex items-center justify-center gap-2">
            <Skeleton circle className="h-2.5 w-2.5" />
            <Skeleton circle className="h-2.5 w-2.5" />
            <Skeleton circle className="h-2.5 w-2.5" />
          </div>
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
    </div>
  );
}
