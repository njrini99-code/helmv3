import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/[id]/review.
 *
 * Task 10 (2026-07-19) moved this route onto the Spine & Stage filmstrip —
 * `FilmstripReview` composes `ReviewHero` (a green score panel beside the
 * 18-hole `Filmstrip`, ONE hero unit — see ReviewHero.tsx: `grid-cols-1
 * sm:grid-cols-[264px_1fr]`, `rounded-fw-lg border border-accent-700
 * shadow-raise`) above the AI narrative. This fallback reproduces that exact
 * two-pane hero shape at the SAME `max-w-2xl` container the live page uses —
 * a left green-block placeholder (the real panel gradient, so the hero's
 * brand color never "pops in") beside a wide strip block reserving the
 * Filmstrip's own height (now the `HoleShotPath` strip band: `h-28 md:h-32`
 * cells plus the score labels beneath — ~9.5rem/11rem) — so the handoff
 * is a quiet fade, not a layout jump.
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

          {/* Filmstrip hero — left green-block placeholder + wide strip block */}
          <div className="grid grid-cols-1 overflow-hidden rounded-fw-lg border border-accent-700 bg-border-subtle shadow-raise sm:grid-cols-[264px_1fr]">
            <div className="bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-6" aria-hidden="true" />
            <div className="bg-surface p-5 sm:p-6">
              <Skeleton className="h-[9.5rem] w-full rounded-fw-sm md:h-[11rem]" />
              <div className="mt-3 min-h-[40px] border-t border-border-subtle pt-3">
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
          </div>

          {/* AI narrative body */}
          <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>

          <Skeleton className="mx-auto h-4 w-40" />
        </div>
      </div>
    </div>
  );
}
