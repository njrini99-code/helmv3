/**
 * ============================================================================
 * Fairway · player-game · FairwayGolfClassesSkeleton (P220 — route loading)
 * ----------------------------------------------------------------------------
 * The Fairway-scoped Suspense fallback for /dashboard/classes under the redesign
 * flag. src/app/golf/(dashboard)/dashboard/classes/page.tsx is itself a 'use
 * client' component with `loading` initialized `true` and a post-mount fetch
 * (page.tsx:66-96), so this route's REAL first paint is not the populated
 * layout — it is FairwayGolfClasses.tsx's own internal `loading` branch
 * (FairwayGolfClasses.tsx:492-536). This file shape-matches THAT branch, not
 * the settled one, so the route doesn't jump (CLS) when data resolves
 * (DESIGN-SYSTEM §7.3 — skeletons reserve the final slot; never a spinner).
 *
 * FairwayGolfClasses.tsx:492-536 renders:
 *   • the masthead (ViewHeader, FairwayGolfClasses.tsx:453-490) — this always
 *     renders, loading or not: eyebrow + large title + description + a right
 *     action cluster (primary "Add class" + secondary "Import"; "Delete all"
 *     is gated on `hasClasses` and never shows before data exists). No `size`
 *     prop is passed, so ViewHeader's masthead row is non-compact
 *     (view-header.tsx:199,266) — `gap-5` at every breakpoint, not just
 *     `sm:`+, since ViewHeader's own `cn("... gap-4 ...", "gap-5")`
 *     (view-header.tsx:264-267) has tailwind-merge drop the unprefixed
 *     `gap-4` for the later unprefixed `gap-5` outright.
 *   • one flat, unbordered `h-20` bar (line 504) where the today strip's
 *     InstrumentPanel eventually mounts — NOT that instrument's bordered
 *     eyebrow/header/readout composition, which is populated-branch-only
 *     (lines 566-628). No radius class on that real `<Skeleton>`, so it
 *     renders at the primitive's own `rounded-fw-sm` default
 *     (Skeleton.tsx:56) — matched here the same way, no `rounded-card` added.
 *   • the week-timeline block (lines 509-515) — no heading skeleton above it;
 *     the real "This week" `<h2>` (line 633) is populated-branch-only. The
 *     560px desktop block also carries no radius class in the real branch,
 *     so it too stays at the `rounded-fw-sm` default, not `rounded-card`.
 *   • the 2-col roster grid (lines 519-535) — exactly 4 cards
 *     (`Array.from({ length: 4 })`, line 520), no heading skeleton above it
 *     either ("All classes", line 879, is also populated-branch-only)
 *
 * loading.tsx cannot know the resolved counts (the page fetches client-side),
 * so every block below is a shape-matched placeholder for the loading branch
 * above — never for the final, data-driven state. Tokens + the Fairway
 * Skeleton primitive only — no legacy `surface-matte` / `warm-*` /
 * `skeleton-shimmer`. Renders inside `.fairway-ds` on a `bg-canvas` page
 * exactly like the real surface (matching the route fork's `min-h-full
 * bg-canvas` wrapper + the component's own 1100px container).
 * ========================================================================== */

import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

const ROSTER_CARD_COUNT = 4;

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
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            {/* Only "Add class" + "Import" — guaranteed to render on every
                load. "Delete all" is conditional on the player already
                having classes, which this route-level skeleton (fetched
                client-side, before any data exists) cannot know in advance;
                promising a 3rd button that may not appear is worse than
                omitting one that then pops in. */}
            <div className="flex shrink-0 items-center gap-2 sm:ml-auto sm:justify-end">
              <Skeleton className="h-11 w-20 rounded-fw-md" />
              <Skeleton className="h-11 w-28 rounded-fw-md" />
            </div>
          </div>

          {/* ════════════ 2 · TODAY STRIP ══════════════
              The real first paint's `loading` branch (FairwayGolfClasses.tsx:504)
              renders a single flat, unbordered bar here — the bordered
              InstrumentPanel composition only exists in the populated branch
              (FairwayGolfClasses.tsx:566-628). */}
          <Skeleton className="h-20 w-full" />

          {/* ════════════ 3 · WEEK TIMELINE (time-axis grid) ═════════
              No heading placeholder: the real loading branch
              (FairwayGolfClasses.tsx:509-515) goes straight from the today-strip
              bar into this block with no `<h2>`-shaped skeleton — "This week"
              (line 633) only renders in the populated branch. */}
          <section className="flex flex-col gap-3">
            <Skeleton className="hidden h-[560px] w-full md:block" />
            <div className="flex flex-col gap-3 md:hidden">
              <Skeleton className="h-9 w-full rounded-fw-md" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[60px] w-full rounded-fw-md" />
              ))}
            </div>
          </section>

          {/* ════════════ 4 · ALL CLASSES (2-col roster) ══════════════
              No heading placeholder here either — same reasoning as the
              timeline section above; "All classes" (line 879) is populated-only.
              4 cards, matching FairwayGolfClasses.tsx:520
              (`Array.from({ length: 4 })`), not 5. */}
          <section className="flex flex-col gap-3">
            <div className="grid gap-2.5 md:grid-cols-2">
              {Array.from({ length: ROSTER_CARD_COUNT }).map((_, i) => (
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
