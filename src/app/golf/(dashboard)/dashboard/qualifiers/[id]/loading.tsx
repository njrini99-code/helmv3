import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/qualifiers/[id].
 *
 * Shape-matches the redesigned FairwayQualifierDetail: a flat masthead (quiet
 * back link + ViewHeader silhouette — eyebrow, title, status/date/entrant meta
 * row, role-forked primary action) and a Surface-wrapped detail block (the
 * real `dl` grid of Dates / Entry deadline / Entrants / Rounds submitted).
 *
 * The hero Surface stops at FairwayQualifierLeaderboard's OWN loading branch,
 * not its settled standings table. `useQualifierRealtime`'s `loading` state
 * initializes `true` (use-qualifier-realtime.ts), so the instant this
 * Suspense boundary resolves, FairwayQualifierLeaderboard mounts straight
 * into its `loading ? <LeaderboardSkeleton /> : …` fork
 * (FairwayQualifierLeaderboard.tsx:266) — a plain 3-line stack
 * (`LeaderboardSkeleton`, :651-659) — before any realtime data has arrived.
 * The Pos/Player/Rounds/Avg/Total/To par `StandingsTable` only mounts once
 * scored rows exist; shape-matching it here would itself be the CLS this
 * file exists to prevent.
 * Replaces the legacy `surface-matte rounded-3xl` / `skeleton-shimmer` chrome,
 * which reshaped the page (CLS) when the redesigned surface mounted.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8 md:py-10"
      >
        <span className="sr-only">Loading qualifier…</span>

        {/* Quiet back link */}
        <Skeleton className="mb-6 h-4 w-28" />

        {/* 1 · Flat masthead — ViewHeader silhouette */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-64 max-w-full" />
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>

        <div className="mt-8 flex flex-col gap-8">
          {/* 2 · Detail Surface block — real-column dl grid */}
          <Surface aria-hidden="true">
            <Surface.Body>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </Surface.Body>
          </Surface>

          {/* 3 · HERO — FairwayQualifierLeaderboard's own `loading` branch
              (LeaderboardSkeleton, FairwayQualifierLeaderboard.tsx:651-659),
              not its settled standings table — see file header. */}
          <Surface aria-hidden="true">
            <Surface.Header>
              <Skeleton className="h-5 w-28" />
            </Surface.Header>
            <Surface.Body>
              <div className="space-y-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            </Surface.Body>
          </Surface>
        </div>
      </div>
    </div>
  );
}
