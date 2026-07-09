import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/** The player-role CoachHelm sub-nav labels (FairwayPlayerStats always mounts
 *  CoachHelmShell with role="player") — width-approximated so the strip's
 *  footprint matches the real `CoachHelmSubNav` before hydration. */
const SUBNAV_TAB_WIDTHS = [64, 84, 92, 64];

/** STATS_TABS labels from FairwayStatsCockpit, width-approximated. */
const STAT_TAB_WIDTHS = [56, 52, 68, 56, 76, 108, 68];

/**
 * Route Suspense fallback for /golf/dashboard/stats.
 *
 * The fallback mirrors the live surface (FairwayPlayerStats → CoachHelmShell →
 * the shared FairwayStatsCockpit), so the skeleton matches the real content's
 * tokens, width, and shape — no two-stage flash, no layout shift. Reproduces
 * the exact container chain (.fairway-ds · bg-canvas · mx-auto max-w-[1200px] ·
 * px-4 py-2 md:px-6), the persistent CoachHelmSubNav strip (so the sub-nav
 * doesn't pop in once FairwayPlayerStats hydrates), and a skeleton mirroring
 * the cockpit's own StatsLoading shape (hero · 4-up vitals · the bordered
 * stat TabsList row · tabbed body) so the stat tab bar reserves its slot too.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
        <div
          className="flex flex-col gap-10"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Loading stats…</span>
          {/* Masthead + CoachHelmSubNav — grouped at the shell's own gap-5 (not
              this list's section-level gap-10) so the sub-nav strip sits right
              under the description exactly as CoachHelmShell lays it out. */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16 rounded-fw-sm" />
              <Skeleton className="h-8 w-56 rounded-fw-sm" />
              <Skeleton className="h-4 w-80 max-w-full rounded-fw-sm" />
            </div>

            {/* CoachHelmSubNav strip — Overview · Development · Game Profile · Standing */}
            <nav
              aria-hidden="true"
              className="flex w-full items-center gap-1 border-b border-border-subtle"
            >
              {SUBNAV_TAB_WIDTHS.map((w, i) => (
                <div key={i} className="px-3.5 pb-3 pt-2.5">
                  <Skeleton className="h-4" style={{ width: w }} />
                </div>
              ))}
            </nav>
          </div>

          {/* 1 · VERDICT hero (SG: Total vs PGA) */}
          <Skeleton className="h-56 rounded-card" />

          {/* 2 · VITALS — 4-up */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>

          {/* Bordered cockpit Surface — the stat tab-bar row + tabbed body, so
              the TabsList never pops in once the real cockpit hydrates. */}
          <Surface padding="none" elevation="border" className="overflow-hidden">
            <div
              aria-hidden="true"
              className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-4"
            >
              {STAT_TAB_WIDTHS.map((w, i) => (
                <div key={i} className="px-3.5 pb-3 pt-2">
                  <Skeleton className="h-4" style={{ width: w }} />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 px-4 py-5 sm:px-5 md:grid md:grid-cols-2">
              <Skeleton className="h-28 rounded-card" />
              <Skeleton className="h-28 rounded-card" />
              <Skeleton className="h-28 rounded-card" />
              <Skeleton className="h-28 rounded-card" />
            </div>
            <div className="grid grid-cols-1 gap-6 px-4 pb-5 sm:px-5 lg:grid-cols-2">
              <Skeleton className="h-72 rounded-card" />
              <Skeleton className="h-72 rounded-card" />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
