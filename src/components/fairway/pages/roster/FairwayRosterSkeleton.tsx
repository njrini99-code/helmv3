/**
 * ============================================================================
 * Fairway · Roster · FairwayRosterSkeleton (P246)
 * ----------------------------------------------------------------------------
 * The route-level loading state for /roster under the redesign flag. It mirrors
 * the LIVE Fairway roster layout so there is no layout swap / CLS on hydrate
 * (DESIGN-SYSTEM §7.3 — skeletons reserve the final slot).
 *
 * loading.tsx cannot know the resolved role — page.tsx branches on
 * `getGolfSessionProfile()` AFTER this frame has already painted — so the
 * coach's FairwayPlayerCard (avatar + actions menu, Avg Score plinth,
 * CoachHelm signal strip, full-width CTA) and the player's read-only
 * TeammateCard (smaller avatar, one chip row, a single ghost Message button —
 * no plinth, no signal strip) can't both be matched exactly by one grid.
 *
 * P2 fix (2026-08-26): given that ambiguity, this grid now renders the
 * SHORTER TeammateCard shape rather than the taller coach superset the
 * previous version used — growing into extra rows on paint (the coach case)
 * reads as content arriving, where the old approach shrank out of rows for
 * every player view, which reads as content disappearing. Under-promising
 * height is the safer default when the resolved role is unknown here.
 * ========================================================================== */

import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Coach roster card skeleton — mirrors FairwayPlayerCard's full anatomy,
 * including the CoachHelm signal strip (SG:Total / Focus / Goals) it was
 * previously missing. Not used by the shared grid below (see file header —
 * role is unknowable at this boundary); exported as the accurate coach-shaped
 * skeleton for a coach-only surface that wants one.
 */
export function FairwayCoachCardSkeleton() {
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
          {/* Actions-menu kebab (IconButton size="md", 44px) */}
          <Skeleton className="h-11 w-11 flex-shrink-0 rounded-fw-md" />
        </div>
      </div>

      {/* Avg Score plinth */}
      <div className="px-5 pb-3 md:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-fw-md bg-surface-sunken px-5 py-4">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      {/* CoachHelm signal strip — SG:Total, Focus, Goals */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-4 md:px-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-fw-md bg-surface-sunken px-3 py-2.5">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="mt-1.5 h-4 w-10" />
          </div>
        ))}
      </div>

      {/* Full-width CTA */}
      <div className="px-5 pb-5 md:px-6 md:pb-6">
        <Skeleton className="h-10 w-full rounded-fw-md" />
      </div>
    </Surface>
  );
}

/**
 * Player roster card skeleton — mirrors TeammateCard's shorter anatomy
 * (round avatar, name + year badge, one chip row, a single ghost-height
 * button). No Avg Score plinth, no signal strip — the player view never
 * renders either. This is the shape the shared grid below actually uses.
 */
function FairwayTeammateCardSkeleton() {
  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        {/* Avatar (48px round) */}
        <Skeleton className="h-12 w-12 flex-shrink-0 rounded-full" />
        {/* Name + year badge, then handicap chip + grad-year caption */}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        </div>
      </div>

      {/* Ghost Message button (size="sm", 36px) */}
      <Skeleton className="h-9 w-full rounded-fw-md" />
    </Surface>
  );
}

/**
 * Route-level roster loading skeleton (redesign path). Reserves the same
 * 1200px container + 2-col grid the live surface renders, so the real roster
 * paints into the identical slots with no shift. Renders
 * FairwayTeammateCardSkeleton (the shorter shape) — see the file header for
 * why this grid can't just use the coach card instead.
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

        {/* Card grid — gap-5 matches FairwayPlayerRoster's real grid (the
            coach grid steps gap-4 → lg:gap-5 instead; this skeleton now
            follows the shorter player shape it renders below). Breakpoint is
            lg (1024px), not md — GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1
            moved both real grids off md:grid-cols-2 because it left tablet/
            mobile-landscape cards too narrow for their content; the skeleton
            must mirror the real grid's breakpoints exactly or it reserves
            the wrong slot shape and the real content shifts on paint. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <FairwayTeammateCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
