import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P325 — the Suspense fallback for the Qualifying selection workspace matches
 * the LIVE FairwayQualifyingWorkspace, not arbitrary `glass-subtle` glass blocks.
 * This reserves the ACTUAL layout: a max-w-[960px] shell (with the real page's
 * own `pb-24` bottom-nav clearance) with a `ViewHeader`-shaped masthead — its
 * real slot order is eyebrow ("Coach · Selection") → title (the qualifier
 * name) → description (the spots/top-score/coach-pick line) → meta (the
 * "← Back to qualifier" link), per `ViewHeader`'s own render (eyebrow, title,
 * description, meta, in that order inside one title column) — then the
 * StateBar / Leaderboard / Coach-picks Surfaces, in Fairway tokens only.
 *
 * Leaderboard and Coach-picks rows are shaped off
 * FairwayQualifyingWorkspace.tsx: the leaderboard `<li>` at line 352
 * (`flex items-center gap-4 border-b border-border-subtle py-3
 * last:border-b-0`, rank/name/rounds/score/status columns) and the
 * CoachPicks `<li>`/row at lines 530-541 (`border-b border-border-subtle
 * py-3.5 last:border-b-0` wrapping a `flex items-center gap-4` of
 * rank (`w-7`) / name (`flex-1`) / score (`w-14`) / an action-button
 * cluster) — both real lists are single-column bordered rows, not a
 * multi-column tile grid, so the fallback reserves the same row anatomy
 * and divider instead of an approximate block shape.
 */
function FairwayQualifyingWorkspaceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[960px] px-4 py-6 md:px-6 md:py-8 pb-24"
      >
        <span className="sr-only">Loading selection workspace…</span>

        {/* ViewHeader-shaped masthead — eyebrow · title · description · meta */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="mt-1 h-3.5 w-36" />
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {/* StateBar — status pill + action cluster Surface */}
          <Surface elevation="border" padding="md">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <Skeleton className="h-7 w-32 rounded-full" />
              <div className="flex flex-wrap gap-2 md:ml-auto">
                <Skeleton className="h-8 w-24 rounded-card" />
                <Skeleton className="h-8 w-24 rounded-card" />
              </div>
            </div>
            <Skeleton className="mt-3 h-3.5 w-3/5" />
          </Surface>

          {/* Leaderboard Surface — header + ranked rows */}
          <Surface>
            <Surface.Header>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </Surface.Header>
            <Surface.Body>
              <div className="flex flex-col">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 border-b border-border-subtle py-3 last:border-b-0"
                  >
                    <Skeleton className="h-6 w-6" />
                    <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - (i % 3) * 8}%` }} />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                ))}
              </div>
            </Surface.Body>
          </Surface>

          {/* Coach-picks Surface */}
          <Surface>
            <Surface.Header>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-24" />
            </Surface.Header>
            <Surface.Body>
              <div className="flex flex-col">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 border-b border-border-subtle py-3.5 last:border-b-0"
                  >
                    <Skeleton className="h-4 w-7" />
                    <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 - i * 10}%` }} />
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-8 w-16 rounded-card" />
                  </div>
                ))}
              </div>
            </Surface.Body>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayQualifyingWorkspaceLoading />;
}
