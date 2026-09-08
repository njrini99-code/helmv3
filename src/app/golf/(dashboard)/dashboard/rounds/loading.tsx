import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P206 — the Suspense fallback for the Rounds library matches the LIVE
 * Fairway layout (FairwayRoundsLibrary.tsx), populated-state shape, since
 * this fallback already commits to modeling ledgers-with-rows rather than
 * the empty state:
 *
 * - Masthead: `ViewHeader` renders a 3-row title column when `rounds.length
 *   > 0` — eyebrow ("Team Rounds"/"Your Rounds"), title ("The library."/
 *   "Your rounds."), and a `meta` count+range line
 *   (view-header.tsx:270-334, meta gated at FairwayRoundsLibrary.tsx:399 on
 *   `rounds.length > 0`, the state this fallback models). No `description`
 *   is ever passed, so only these three rows apply.
 * - KPI hero: 5 `StatTile`s in a `grid-cols-2 → md:grid-cols-5`
 *   (FairwayRoundsLibrary.tsx:414-482). Each tile's base shell is
 *   `rounded-fw-md bg-surface-sunken p-4` (StatTile.tsx:194); the page's
 *   `className="bg-surface border border-border-subtle shadow-flat"`
 *   (e.g. :424) overrides the surface/border/shadow via `cn()` but carries
 *   no `rounded-*`, so `rounded-fw-md` (14px) survives — not `rounded-card`
 *   (20px). Inside each tile, `Numeric` renders the big value first and the
 *   small uppercase label second (Numeric.tsx:66-91: value row at :67-86,
 *   `label` span at :88-90), so the tile's two skeleton blocks are ordered
 *   value-block-then-label-block to match. The real tile can also render a
 *   conditional `Sparkline` under the value (StatTile.tsx:216-227, gated on
 *   `finite.length >= 2`) — intentionally omitted here since a skeleton
 *   can't know in advance whether a given tile's series qualifies.
 * - Toolbar: the populated branch (`rounds.length > 0`,
 *   FairwayRoundsLibrary.tsx:533-617) renders a search `Input`
 *   (:553-576, shown for both coach and player), four `FilterPill`s
 *   (:590-602), and a Month/Week `Segmented` toggle (:604-615) between the
 *   KPI hero and the month-ledger list — reserved here as matching-sized
 *   Skeleton blocks so the first ledger doesn't render ~70-100px higher
 *   than the real first paint.
 * - Month-ledger `Surface`s below the toolbar, nested in their own
 *   `flex flex-col gap-5` wrapper — the real ledger list sits one level
 *   inside the page's outer `gap-8` column at
 *   FairwayRoundsLibrary.tsx:640, `<div className="flex flex-col
 *   gap-5">` wrapping `{grouped.map(...)}` (:641-704) — so consecutive
 *   Surfaces are 20px apart, not the outer container's 32px.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading rounds…</span>

        {/* Title block — ViewHeader's eyebrow + title + meta */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>

        {/* KPI hero — 5 lifted tiles (matches FairwayRoundsLibrary) */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-fw-md border border-border-subtle bg-surface p-4 shadow-flat"
            >
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Toolbar — search input + filter pills + Month/Week toggle */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full sm:max-w-xs" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-16 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-8 w-28 rounded-fw-sm" />
          </div>
        </div>

        {/* Month-ledger Surfaces — nested in their own gap-5 wrapper to match
            the real `<div className="flex flex-col gap-5">` at
            FairwayRoundsLibrary.tsx:640, which sits one level inside the
            page's outer gap-8 column and separates consecutive ledger
            Surfaces by 20px, not the outer 32px. */}
        <div className="flex flex-col gap-5">
          {[5, 3].map((rows, gi) => (
            <Surface key={gi} padding="none" className="overflow-hidden">
              <div className="flex items-end justify-between gap-4 border-b border-border-subtle px-4 py-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-24" />
              </div>
              <div className="divide-y divide-border-subtle">
                {Array.from({ length: rows }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <Skeleton className="h-9 w-12" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-7 w-12" />
                  </div>
                ))}
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}
