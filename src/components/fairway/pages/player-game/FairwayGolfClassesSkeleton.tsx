/**
 * ============================================================================
 * Fairway · player-game · FairwayGolfClassesSkeleton (P220 — route loading)
 * ----------------------------------------------------------------------------
 * The Fairway-scoped Suspense fallback for /dashboard/classes under the redesign
 * flag. It mirrors the LIVE FairwayGolfClasses layout so the route doesn't jump
 * (CLS) when the real surface mounts (DESIGN-SYSTEM §7.3 — skeletons reserve the
 * final slot; never a spinner).
 *
 * The live surface is:
 *   • masthead — eyebrow + large title + description + a right action cluster
 *     (a primary "Add class" + secondary "Import" / "Delete all" buttons)
 *   • the today strip — one instrument row (up-next reading + 3 tallies)
 *   • the "This week" section — a time-axis timeline grid
 *   • the "All classes" section — a two-column roster of event-card rows
 *
 * loading.tsx cannot know the resolved counts (the page fetches client-side),
 * so every block is a shape-matched placeholder. Tokens + the Fairway Skeleton
 * primitive only — no legacy `surface-matte` / `warm-*` / `skeleton-shimmer`.
 * Renders inside `.fairway-ds` on a `bg-canvas` page exactly like the real
 * surface (matching the route fork's `min-h-full bg-canvas` wrapper + the
 * component's own 1100px container).
 * ========================================================================== */

import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

const DAY_COUNT = 5;

export function FairwayGolfClassesSkeleton() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading classes…</span>

        <div className="flex flex-col gap-8">
          {/* ════════════════ 1 · MASTHEAD ═════════════════ */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:ml-auto sm:justify-end">
              <Skeleton className="h-8 w-24 rounded-fw-md" />
              <Skeleton className="h-8 w-20 rounded-fw-md" />
              <Skeleton className="h-9 w-28 rounded-fw-md" />
            </div>
          </div>

          {/* ════════════ 2 · TODAY STRIP (one instrument row) ══════════ */}
          <div className="rounded-card border border-border-subtle bg-surface p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <div className="flex shrink-0 items-center gap-5">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          </div>

          {/* ════════════ 3 · WEEK TIMELINE (time-axis grid) ═════════ */}
          <section className="flex flex-col gap-3">
            <Skeleton className="ml-1 h-3 w-24" />
            <Skeleton className="h-[420px] w-full rounded-card" />
          </section>

          {/* ════════════ 4 · ALL CLASSES (2-col roster) ══════════════ */}
          <section className="flex flex-col gap-3">
            <Skeleton className="ml-1 h-3 w-24" />
            <div className="grid gap-2.5 md:grid-cols-2">
              {Array.from({ length: DAY_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface p-4"
                >
                  <div className="flex w-[68px] flex-shrink-0 flex-col gap-1 md:w-[76px]">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-52 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default FairwayGolfClassesSkeleton;
