import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P325 — the Suspense fallback for the Qualifying selection workspace must match
 * the LIVE FairwayQualifyingWorkspace, not arbitrary `bg-white/40` glass blocks.
 * The previous skeleton used `bg-white/40` 40%-glass pulses that mismatched the
 * bg-canvas matte Fairway surfaces it precedes. This reserves the ACTUAL layout:
 * a max-w-[960px] shell with a ViewHeader-shaped title + breadcrumb, then the
 * StateBar / Leaderboard / Coach-picks Surfaces, in Fairway tokens only.
 * isRedesignEnabled() is build-time-inlined and safe to read in a loading
 * boundary; the legacy fallback (centered glass blocks) stays gated off.
 */
function FairwayQualifyingWorkspaceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[960px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading selection workspace…</span>

        {/* ViewHeader-shaped title + breadcrumb back-link */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64" />
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
                  <div key={i} className="flex items-center gap-3 py-2.5">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-16 w-full rounded-fw-md" />
                <Skeleton className="h-16 w-full rounded-fw-md" />
              </div>
            </Surface.Body>
          </Surface>
        </div>
      </div>
    </div>
  );
}

/**
 * Legacy (flag-off) fallback — the original centered glass blocks, kept only
 * for the flag-off path so the redesign no longer renders glass tokens.
 */
function LegacyQualifyingWorkspaceLoading() {
  return (
    <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="h-24 bg-white/40 rounded-2xl animate-pulse mb-6" />
      <div className="h-12 bg-white/40 rounded-2xl animate-pulse mb-4" />
      <div className="h-80 bg-white/40 rounded-2xl animate-pulse" />
    </div>
  );
}

export default function Loading() {
  if (isRedesignEnabled()) return <FairwayQualifyingWorkspaceLoading />;
  return <LegacyQualifyingWorkspaceLoading />;
}
