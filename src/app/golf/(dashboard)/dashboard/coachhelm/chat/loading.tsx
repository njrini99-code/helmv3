import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/** CoachHelmSubNav collapsed to its single "Brief" front-door tab (coach role
 *  — see CoachHelmSubNav.tsx COACH_TABS) — width-approximated so the strip's
 *  footprint matches the real component before hydration. */
const SUBNAV_TAB_WIDTH = 44;

/**
 * Route Suspense fallback for /golf/dashboard/coachhelm/chat.
 *
 * Mirrors the live surface: CoachHelmShell's masthead+subnav container chain
 * (see CoachHelmShell.tsx — TWO nested `mx-auto max-w-[1200px]` boxes, exactly
 * like stats/loading.tsx and coachhelm/loading.tsx already reproduce), then
 * AskWorkspace's two-pane inbox — a sticky AskConversationRail (InstrumentPanel
 * "Threads" header + readout + 5 row skeletons, matching AskConversationRail's
 * OWN `loading` branch) beside an AskThreadPane shell (message well + a sunken
 * composer track).
 */
export default function ChatLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
        <div
          className="flex w-full flex-col"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Loading Ask CoachHelm…</span>

          {/* CoachHelmShell's masthead+subnav container. */}
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24 rounded-fw-sm" />
              <Skeleton className="h-9 w-56 rounded-fw-sm" />
              <Skeleton className="h-4 w-48 max-w-full rounded-fw-sm" />
            </div>

            {/* CoachHelmSubNav strip — single "Brief" front-door tab. */}
            <nav
              aria-hidden="true"
              className="flex w-full items-center gap-1 border-b border-border-subtle"
            >
              <div className="px-3.5 pb-3 pt-2.5">
                <Skeleton className="h-4" style={{ width: SUBNAV_TAB_WIDTH }} />
              </div>
            </nav>
          </div>

          {/* CoachHelmShell's body container — the two-pane inbox. */}
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] md:gap-6">
              {/* Left — conversation rail */}
              <aside
                aria-hidden="true"
                className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-6 md:sticky md:top-6"
              >
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-6" />
                </div>
                <div className="flex flex-col gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-fw-md px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3.5" style={{ width: `${68 - (i % 3) * 12}%` }} />
                        <Skeleton className="h-3 w-8" />
                      </div>
                      <Skeleton className="mt-2 h-3 w-4/5" />
                    </div>
                  ))}
                </div>
              </aside>

              {/* Right — thread pane */}
              <div
                aria-hidden="true"
                className="flex min-h-[60vh] min-w-0 flex-col overflow-hidden rounded-card border border-border-subtle bg-surface"
              >
                <div className="flex-1 space-y-4 px-4 pt-5 pb-8 sm:px-5">
                  {[
                    { side: 'left', w: 'w-3/5' },
                    { side: 'right', w: 'w-2/5' },
                    { side: 'left', w: 'w-1/2' },
                    { side: 'left', w: 'w-4/5' },
                  ].map((bubble, i) => (
                    <div
                      key={i}
                      className={`flex ${bubble.side === 'right' ? 'justify-end' : 'justify-start'}`}
                    >
                      <Skeleton className={`h-14 rounded-fw-lg ${bubble.w}`} />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border-subtle bg-surface-sunken p-3">
                  <Skeleton className="h-11 w-full rounded-fw-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
