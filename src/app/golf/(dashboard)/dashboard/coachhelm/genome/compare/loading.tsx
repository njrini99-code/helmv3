import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * CoachHelmSubNav's COACH strip — two tabs, "Brief" and "Ask" (`COACH_TABS` in
 * CoachHelmSubNav.tsx; labels are the `brief`/`ask` canonicalNames from
 * surface-registry.ts). Width-approximated so the strip's footprint matches the
 * real component before hydration.
 *
 * This file drew ONE tab, on the premise that Spine & Stage (2026-07-19) had
 * collapsed the coach strip to a single Brief front door. It collapsed it to
 * two: `ask` carries neither `legacy` nor `hidden` and was restored to
 * COACH_TABS — only Signals/Players/Effectiveness were folded into `?view=`
 * drills. So the strip grew a second tab on hydrate and the cockpit below it
 * shifted. The single-tab shape is the PLAYER strip (`PLAYER_TABS`, one
 * "Overview" tab) — and GenomeCompareView mounts CoachHelmShell with
 * `role="coach"` and no `embedded`, so the coach set is what paints here.
 */
const SUBNAV_TAB_WIDTHS = [44, 28] as const;

/**
 * Route Suspense fallback for /golf/dashboard/coachhelm/genome/compare.
 *
 * Mirrors GenomeCompareView's default (no `?p1=&p2=` yet) first paint: the
 * CoachHelmShell masthead+subnav chain (same nested `mx-auto max-w-[1200px]`
 * pattern as chat/loading.tsx and coachhelm/loading.tsx) plus its "Players >
 * Compare" leaf breadcrumb, then the cockpit — a raised instrument panel shaped
 * like the `!anySelected` EmptyState branch (centered icon chip + title +
 * description) — and the two roster ComparePicker panels below it.
 */
export default function GenomeCompareLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
        <div
          className="flex w-full flex-col"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Loading genome compare…</span>

          {/* CoachHelmShell's masthead+subnav container. */}
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24 rounded-fw-sm" />
              <Skeleton className="h-9 w-72 max-w-full rounded-fw-sm" />
              <Skeleton className="h-4 w-80 max-w-full rounded-fw-sm" />
            </div>

            {/* Leaf breadcrumb — "Players > Compare" */}
            <div className="-mt-1 flex items-center gap-1.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-14" />
            </div>

            {/* CoachHelmSubNav strip — the coach's "Brief" + "Ask" tabs. */}
            <nav
              aria-hidden="true"
              className="flex w-full items-center gap-1 border-b border-border-subtle"
            >
              {SUBNAV_TAB_WIDTHS.map((w) => (
                <div key={w} className="px-3.5 pb-3 pt-2.5">
                  <Skeleton className="h-4" style={{ width: w }} />
                </div>
              ))}
            </nav>
          </div>

          {/* CoachHelmShell's body container. */}
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
            <div className="flex flex-col gap-6">
              {/* The cockpit — raised accent panel, EmptyState-shaped */}
              <div
                aria-hidden="true"
                className="flex flex-col items-center gap-3 rounded-card border border-accent-200 bg-surface px-6 py-14 text-center"
              >
                <Skeleton circle className="h-12 w-12" />
                <Skeleton className="h-5 w-64 max-w-full" />
                <Skeleton className="h-3.5 w-80 max-w-full" />
              </div>

              {/* Pickers — the two ?p1=&p2= roster lists */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[0, 1].map((col) => (
                  <div
                    key={col}
                    aria-hidden="true"
                    className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface p-4"
                  >
                    <div className="flex items-center gap-2 px-1">
                      <Skeleton circle className="h-2.5 w-2.5" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-fw-sm px-2.5 py-2">
                          <Skeleton circle className="h-6 w-6 flex-shrink-0" />
                          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${64 - (i % 3) * 10}%` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
