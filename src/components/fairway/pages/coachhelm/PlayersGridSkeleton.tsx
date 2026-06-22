/**
 * ============================================================================
 * Fairway · CoachHelm · PlayersGridSkeleton (P089 — route-level loading state)
 * ----------------------------------------------------------------------------
 * The Fairway-scoped Suspense fallback for /dashboard/development under the
 * redesign flag. It mirrors the LIVE PlayersGridView layout so the route doesn't
 * jump (CLS) when the real surface mounts (DESIGN-SYSTEM §7.3 — skeletons
 * reserve the final slot; never a spinner).
 *
 * The live surface is a CoachHelmShell-wrapped page:
 *   • masthead — eyebrow + large title + description + a right action cluster
 *     (a Segmented "Roster / Focus areas" + a primary "New focus area" button)
 *   • a persistent sub-nav strip beneath the masthead
 *   • the RosterHealthHeader InstrumentCluster — a focal "who needs attention"
 *     panel + a secondary outcome-mix panel + a 4-up tertiary readout row
 *   • the roster section label + a bordered matte DataTable body
 *
 * loading.tsx cannot know the resolved counts (the page fetches above the fork),
 * so every block is a shape-matched placeholder. Tokens + the Fairway Skeleton
 * primitive only — no legacy `surface-matte` / `warm-*` / `skeleton-shimmer`.
 * Renders inside `.fairway-ds` on a `bg-canvas` page exactly like the real
 * surface (matching the route fork's wrapper classes).
 * ========================================================================== */

import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/** One bordered matte readout tile mirroring an InstrumentPanel depth="base". */
function ReadoutTileSkeleton() {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-4">
      <Skeleton className="h-7 w-14" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  );
}

export function PlayersGridSkeleton() {
  return (
    <div
      className={fairwayScope(
        'min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary',
      )}
    >
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="flex w-full flex-col"
      >
        <span className="sr-only">Loading players…</span>

        {/* ── Masthead + sub-nav strip (shares the shell's 1200px container) ── */}
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
          {/* ViewHeader: eyebrow + title + description, with the right action
              cluster (Segmented + primary button). */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:ml-auto sm:justify-end">
              <Skeleton className="h-9 w-44 rounded-fw-md" />
              <Skeleton className="h-9 w-36 rounded-fw-md" />
            </div>
          </div>

          {/* Persistent sub-nav tab strip. */}
          <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>

        {/* ── Body (aligned to the masthead width) ──────────────────────────── */}
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
          <div className="flex flex-col gap-6">
            {/* RosterHealthHeader cluster — focal panel + secondary panel. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Focal "who needs attention" panel (raised, spans 2 cols). */}
              <div className="rounded-card border border-border-subtle bg-surface p-6 lg:col-span-2">
                <Skeleton className="h-3 w-40" />
                <div className="mt-4 flex items-end gap-3">
                  <Skeleton className="h-10 w-12" />
                  <Skeleton className="mb-1 h-4 w-64 max-w-full" />
                </div>
                <div className="mt-4 flex flex-col">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 border-t border-border-subtle py-2.5 first:border-t-0"
                    >
                      <Skeleton circle className="h-8 w-8 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="mt-1.5 h-3 w-24" />
                      </div>
                      <Skeleton className="h-8 w-28 rounded-fw-md" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Secondary outcome-mix panel. */}
              <div className="rounded-card border border-border-subtle bg-surface p-6">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="mt-4 h-6 w-full rounded-full" />
                <Skeleton className="mt-3 h-3 w-48 max-w-full" />
              </div>
            </div>

            {/* 4-up tertiary readout row. */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ReadoutTileSkeleton key={i} />
              ))}
            </div>

            {/* Roster section: a label row + the bordered matte DataTable. */}
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
                {/* Header row. */}
                <div className="flex items-center gap-4 border-b border-border-subtle px-4 py-3">
                  <Skeleton className="h-3 w-20" />
                  <div className="ml-auto flex items-center gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-3 w-14" />
                    ))}
                  </div>
                </div>
                {/* Body rows. */}
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-border-subtle/60 px-4 py-4 last:border-b-0"
                  >
                    <Skeleton circle className="h-8 w-8 flex-shrink-0" />
                    <div className="min-w-0">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="mt-1.5 h-3 w-16" />
                    </div>
                    <div className="ml-auto flex items-center gap-6">
                      <Skeleton className="h-3.5 w-8" />
                      <Skeleton className="h-3.5 w-10" />
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayersGridSkeleton;
