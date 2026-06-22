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
 *   • a 4-up flat readout grid (Classes / Credits / Days·week / Buildings)
 *   • the "Weekly schedule" section — a 5-column day grid of class chips
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

/** One bordered matte readout tile mirroring an InstrumentPanel depth="base". */
function ReadoutTileSkeleton() {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-4">
      <Skeleton className="h-7 w-12" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}

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

          {/* ════════════ 2 · QUICK READOUTS (4-up) ══════════ */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ReadoutTileSkeleton key={i} />
            ))}
          </div>

          {/* ════════════ 3 · WEEKLY SCHEDULE (5 day columns) ═════════ */}
          <section className="flex flex-col gap-3">
            <Skeleton className="ml-1 h-3 w-36" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {Array.from({ length: DAY_COUNT }).map((_, day) => (
                <div key={day} className="flex flex-col">
                  <Skeleton className="mx-auto mb-2 h-3 w-16" />
                  <div className="flex min-h-[160px] flex-col gap-2">
                    {/* 1–2 class chips per day, deterministic for SSR/client match. */}
                    {Array.from({ length: day % 2 === 0 ? 2 : 1 }).map((_, c) => (
                      <div
                        key={c}
                        className="flex flex-col gap-1 rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5"
                      >
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
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
