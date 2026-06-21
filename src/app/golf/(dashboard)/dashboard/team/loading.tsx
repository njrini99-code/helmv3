import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton, SkeletonCard } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for /golf/dashboard/team (Team Settings / Info).
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless under the redesign flag (gate B3 — no
 * jarring token/shape swap). Wrapped in the same
 * `fairwayScope('min-h-full bg-canvas')` frame the page uses, and shape-matched
 * to FairwayTeamSettings/Info: ViewHeader masthead (eyebrow → title → meta) then
 * the stacked form sections, inside the page's `max-w-[760px]` column.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading team…</span>

        {/* Masthead — ViewHeader (eyebrow · title · meta row) */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-56 max-w-full" />
          <div className="mt-1 flex items-center gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        {/* Stacked form sections (team information → invitations) */}
        <div className="mt-8 flex flex-col gap-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      </div>
    </div>
  );
}
