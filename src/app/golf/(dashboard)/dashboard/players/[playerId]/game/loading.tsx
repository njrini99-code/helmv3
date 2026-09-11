import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P106 — Fairway-native loading state for the coach Player Game Fingerprint
 * deep-dive.
 * ----------------------------------------------------------------------------
 * page.tsx (`PlayerGamePage`) is an async server component that awaits its
 * data fetches before returning `<PlayerDeepDiveTabs>` (page.tsx:515-519), so
 * this fallback covers that await, not a client loading branch. Traced the
 * real t=0 shape through the imports:
 *
 *   PlayerDeepDiveTabs.tsx:92-117 mounts an EMBEDDED <CoachHelmShell> with no
 *   `actions` prop. CoachHelmShell.tsx:137-213: `embedded` suppresses the
 *   eyebrow/title/description masthead AND the persistent sub-nav
 *   (CoachHelmShell.tsx:153-171, 206-208) and — with `actions` unset — leaves
 *   only the breadcrumb row (CoachHelmShell.tsx:173-204, "Players / <player
 *   name>") inside a max-w-[1200px] container, above a SEPARATE
 *   max-w-[1200px] body (CoachHelmShell.tsx:212).
 *
 *   That body renders PlayerDeepDiveTabs' own `<Segmented>` "Game
 *   Fingerprint / Scouting Report" row (PlayerDeepDiveTabs.tsx:104-109), then
 *   — the default tab — `<FairwayPlayerGameFingerprint>`
 *   (FairwayPlayerGameFingerprint.tsx:339-481): a max-w-[1160px] column with
 *   a ViewHeader masthead (avatar + player name, team description, the
 *   Genome/Player-page ghost actions + the Print-report primary action,
 *   FairwayPlayerGameFingerprint.tsx:343-380), an InstrumentCluster
 *   composite-rating hero + recent-trend rail (:383-431), a 6-up "jump to
 *   game area" nav row (:433-462), and six FULL-WIDTH game-area sections
 *   stacked vertically — not a 2-up grid — each split into a metrics rail +
 *   an insight-evidence rail (FairwayPlayerGameFingerprint.tsx:554-647,
 *   FingerprintSection).
 *
 * This reserves those real slots with Fairway tokens to remove the
 * shape/token swap on hydrate (CLS / gate B3).
 */
function FairwayPlayerGameLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div role="status" aria-busy="true" aria-live="polite" className="flex w-full flex-col">
        <span className="sr-only">Loading player game fingerprint…</span>

        {/* CoachHelmShell (embedded) — breadcrumb row only, masthead + sub-nav suppressed */}
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>

        {/* CoachHelmShell body */}
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
          <div className="flex flex-col gap-6">
            {/* Segmented tab row — Game Fingerprint / Scouting Report */}
            <div className="flex w-fit gap-1 rounded-full bg-surface-sunken p-1">
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>

            <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-7 md:gap-9">
              {/* Masthead — avatar + name, team description, actions */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton circle className="h-11 w-11 shrink-0" />
                  <div className="min-w-0">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="mt-2 h-8 w-48 max-w-full" />
                    <Skeleton className="mt-2 h-3.5 w-28" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-20 rounded-fw-md" />
                  <Skeleton className="h-9 w-28 rounded-fw-md" />
                  <Skeleton className="h-11 w-32 rounded-fw-md" />
                </div>
              </div>

              {/* Composite-rating hero + recent-trend rail */}
              <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
                <Surface elevation="shadow" padding="lg" className="min-w-0">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="mt-4 h-16 w-32" />
                  <div className="mt-4 flex items-center gap-2">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                </Surface>
                <Surface elevation="border" padding="md" className="min-w-0">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-10 w-24" />
                </Surface>
              </div>

              {/* "Jump to game area" nav row — 6 sections */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="min-w-0 rounded-fw-md border border-border-subtle bg-surface px-3 py-3"
                  >
                    <Skeleton className="h-2.5 w-5" />
                    <Skeleton className="mt-1.5 h-3.5 w-16" />
                    <Skeleton className="mt-1.5 h-3 w-20" />
                  </div>
                ))}
              </div>

              {/* Six game-area sections, stacked full-width */}
              {Array.from({ length: 6 }).map((_, i) => (
                <Surface key={i} elevation="border" padding="none" className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-tint px-4 py-4 sm:px-5 md:px-6">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 md:p-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                    <div className="grid grid-cols-2 gap-2.5">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <Skeleton key={j} className="h-14 rounded-fw-md" />
                      ))}
                    </div>
                    <div className="flex flex-col gap-3">
                      <Skeleton className="h-24 rounded-card" />
                      <Skeleton className="h-24 rounded-card" />
                    </div>
                  </div>
                </Surface>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayPlayerGameLoading />;
}
