import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P433 — purpose-built loading state for the Documents grid. Matches
 * FairwayDocuments (max-w-[1100px] ViewHeader masthead at
 * FairwayDocuments.tsx:818 — eyebrow/title/description/meta → search/
 * category-filter/sort toolbar → a `grid md:grid-cols-2 xl:grid-cols-3`
 * document-card grid, DocumentCard at FairwayDocuments.tsx:1580-1806) so the
 * real surface paints into the same slots with no layout swap / CLS on
 * hydrate. No folder-tile section: that block is data-gated
 * (`folders.length > 0`, FairwayDocuments.tsx:878) rather than
 * always-present, so this fallback omits it instead of committing to either
 * state — see the inline note above the toolbar comment below.
 *
 * The masthead reserves a 4th line for `meta` (FairwayDocuments.tsx:780-793
 * computes it, view-header.tsx:324-334 renders it as its own row) since
 * `totalCount > 0` is exactly the state this skeleton already commits to
 * (6 document cards). The card's top-right slot and footer preview/download
 * placeholders are sized to IconButton's real `sm` box — `h-9 w-9` plus the
 * coarse-pointer bump to `h-11 w-11` (button.tsx:304) — matching the
 * DropdownMenuTrigger/IconButton controls they stand in for.
 *
 * Outer scope classes (`bg-canvas-gradient font-fw-sans text-text-primary`)
 * are copied verbatim from the page's own wrapper — `bg-canvas-gradient`
 * paints a real warm-cream page gradient, not a shimmer, so dropping it left
 * the fallback on a flat `bg-canvas` that visibly swapped to the gradient the
 * moment the real page mounted.
 *
 * KNOWN, ACCEPTED SWAP: the masthead action cluster (Upload + New folder) is
 * coach-only — `FairwayDocuments` renders neither button for a player
 * (`uploadCta`/`secondaryActions` are both `undefined` when `!isCoach`). Role
 * isn't known until the server component resolves the session, so this
 * fallback commits to the coach shape (2 buttons) rather than rendering none
 * for every viewer — same tradeoff as `FairwayDashboardSkeleton`'s KPI grid.
 */
function FairwayDocumentsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading documents…</span>

        {/* Masthead — ViewHeader (eyebrow · title · description · meta) + CTAs.
            `meta` (the "N files · M folders" caption) is its own stacked row
            below description whenever `totalCount > 0` — see
            FairwayDocuments.tsx's `meta` computation and view-header.tsx's
            `view-header-meta` slot — which is exactly the state this skeleton
            already commits to (6 document cards below), so it gets a 4th line.
            `items-start` matches ViewHeader's outer row
            (view-header.tsx:264-267, `sm:items-start` — the action cluster has
            no independent self-align, view-header.tsx:337-372) rather than
            bottom-aligning the button skeletons to the title stack. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-9 w-56 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-80 max-w-full" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-28 rounded-fw-md" />
            <Skeleton className="h-10 w-28 rounded-fw-md" />
          </div>
        </div>

        {/* No folder-tile block: FairwayDocuments.tsx gates that whole
            section on `folders.length > 0` (folders derived from
            `documents.some(d => d.folder)` plus client-only manual folders),
            unlike the toolbar/grid below which always render once documents
            exist. Folder count is real per-team data unknown at this static
            fallback, and a team with zero folders is a normal, unforced
            state — rendering the block would swap it away on every hydrate
            for those teams, so this fallback omits it rather than commit to
            either state. */}

        {/* Toolbar — real DOM order is search → category pills → sort, in a
            `flex-col sm:flex-row` row (search stacks ABOVE the pills on
            mobile). The fallback used to render the pills first and drop the
            sort control entirely, so on a phone the two blocks swapped
            position the moment the real toolbar mounted. */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-10 w-full flex-1 rounded-fw-md" />
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[64, 80, 72, 88].map((w) => (
              <Skeleton key={w} className="h-[30px] shrink-0 rounded-full" style={{ width: w }} />
            ))}
          </div>
          <Skeleton className="h-8 w-full shrink-0 rounded-fw-md sm:w-[150px]" />
        </div>

        {/* Document-card grid — DocumentCard is icon+badges row, then title/
            description, then a tags row, then a bordered footer (size · date
            + preview/download actions) below a divider. */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Surface key={i} elevation="border" padding="none" className="flex flex-col">
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <Skeleton className="h-11 w-11 flex-shrink-0 rounded-fw-md" />
                  <Skeleton className="h-9 w-9 rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" />
                </div>
                <div className="min-w-0">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-1.5 h-3.5 w-1/2" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3">
                <Skeleton className="h-3 w-24" />
                <div className="flex items-center gap-1">
                  <Skeleton className="h-9 w-9 rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" />
                  <Skeleton className="h-9 w-9 rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" />
                </div>
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayDocumentsLoading />;
}
