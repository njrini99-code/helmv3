import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Route-level loading fallback for the coach "Ask CoachHelm" chat history
 * page (AskWorkspace, mounted inside CoachHelmShell active="ask").
 *
 * Mirrors CoachHelmShell's real chrome — masthead (eyebrow/title/description,
 * no action cluster) + the persistent sub-nav strip (now collapsed to the
 * single "Brief" tab per the Spine & Stage redesign) — both inside the same
 * `max-w-[1200px]` container the shell uses, then AskWorkspace's own
 * `md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]` two-pane body: a
 * conversation rail on the left, the thread pane on the right.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient')}>
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading Ask CoachHelm…</span>

        {/* Masthead — eyebrow / title / description (ViewHeader). */}
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-4 w-40" />
          </div>

          {/* Persistent sub-nav strip — collapsed to the single "Brief" tab. */}
          <div className="flex w-full items-center gap-1 border-b border-border-subtle pb-3">
            <Skeleton className="h-5 w-12" />
          </div>
        </div>

        {/* Body — the two-pane inbox (rail + thread pane). */}
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
          <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] md:gap-6">
            {/* Left: conversation rail */}
            <Surface elevation="border" padding="md" className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-fw-md" />
                ))}
              </div>
            </Surface>

            {/* Right: thread pane */}
            <Surface elevation="border" padding="none" className="min-h-[60vh] overflow-hidden">
              <div className="flex min-h-[60vh] flex-col justify-end gap-4 p-5">
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-10 w-2/3 max-w-[26rem] rounded-fw-md" />
                  <Skeleton className="ml-auto h-10 w-1/2 max-w-[20rem] rounded-fw-md" />
                  <Skeleton className="h-16 w-3/4 max-w-[30rem] rounded-fw-md" />
                </div>
                <Skeleton className="h-12 w-full rounded-fw-md" />
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}
