/**
 * ============================================================================
 * Fairway · Roster · FairwayRosterSkeleton (P246)
 * ----------------------------------------------------------------------------
 * The route-level loading state for /roster under the redesign flag. It mirrors
 * the LIVE Fairway roster layout so there is no layout swap / CLS on hydrate
 * (DESIGN-SYSTEM §7.3 — skeletons reserve the final slot).
 *
 * The live coach surface (FairwayCoachRoster) and player surface
 * (FairwayPlayerRoster) BOTH render the same structural shell:
 *   • an eyebrow + large title + meta line header
 *   • a responsive 2-column card grid (`md:grid-cols-2`)
 *   • each card = an avatar (68–76px) + name/year row + status/intent chips,
 *     and (coach) a single Avg Score plinth + full-width CTA.
 *
 * loading.tsx cannot know the resolved role (session resolves inside the page,
 * after the loading frame paints), so this skeleton mirrors the coach card —
 * the structural superset — which also reads correctly under the player grid
 * (same container, same grid, same avatar+name+chip rows). Tokens only.
 * ========================================================================== */

import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';
import { fairwayScope } from '@/lib/redesign/flag';

/** One matte player-card skeleton mirroring FairwayPlayerCard's anatomy. */
function FairwayPlayerCardSkeleton() {
  return (
    <Surface elevation="shadow" padding="none" className="overflow-hidden">
      <div className="p-5 md:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar (68–76px rounded square) */}
          <Skeleton className="h-[68px] w-[68px] flex-shrink-0 rounded-2xl md:h-[76px] md:w-[76px]" />
          {/* Name + year + status/intent chips */}
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-3.5 w-28" />
            <div className="mt-2.5 flex items-center gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Avg Score plinth */}
      <div className="px-5 pb-4 md:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-fw-md bg-surface-sunken px-5 py-4">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      {/* Full-width CTA */}
      <div className="px-5 pb-5 md:px-6 md:pb-6">
        <Skeleton className="h-10 w-full rounded-fw-md" />
      </div>
    </Surface>
  );
}

/**
 * Route-level roster loading skeleton (redesign path). Reserves the same
 * 1200px container + 2-col grid the live surface renders, so the real roster
 * paints into the identical slots with no shift.
 */
export function FairwayRosterSkeleton() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading roster…</span>

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-9 w-48" />
            <Skeleton className="mt-2 h-3.5 w-64" />
          </div>
          <Skeleton className="h-10 w-32 rounded-fw-md" />
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <FairwayPlayerCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
