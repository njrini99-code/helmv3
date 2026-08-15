import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/coachhelm/chat.
 *
 * Mirrors the LIVE surface, `AskSurface.tsx` — NOT `CoachHelmShell` (that
 * masthead + `CoachHelmSubNav` strip this fallback used to draw was pure
 * phantom chrome: `page.tsx` renders `AskSurface` directly, which has never
 * gone through `CoachHelmShell` since the Ask rebuild, PR #1058/#1063 —
 * the two-pane "AskWorkspace" layout this file drew before that predates
 * both PRs and no longer exists anywhere in the tree). Confirmed by reading
 * `AskSurface.tsx` itself: a slim, non-masthead toolbar (History toggle +
 * New link) above a single centered column — greeting, composer, then the
 * `ProgramOpening` findings list — on an empty thread.
 */
export default function ChatLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div
        className="flex h-[calc(100dvh-var(--fw-shell-offset,7rem))] min-h-0 flex-col"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading Ask CoachHelm…</span>

        {/* AskSurface's slim bar — History toggle (left) + New (right). Not a
            page masthead: the conversation is the page. */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2 sm:px-6">
          <Skeleton className="h-9 w-9 rounded-fw-md sm:w-24" />
          <span className="flex-1" />
          <Skeleton className="h-9 w-9 rounded-fw-md sm:w-20" />
        </div>

        {/* Empty-thread first paint: greeting → composer → ProgramOpening. */}
        <div className="min-h-0 flex-1 overflow-hidden px-4 pt-6 sm:px-6">
          <div className="mx-auto flex w-full max-w-[46rem] flex-col">
            {/* Greeting (AskSurface's <Greeting> — Fraunces h1 + one-line sub). */}
            <Skeleton className="h-7 w-4/5 max-w-full rounded-fw-sm" />
            <Skeleton className="mt-2 h-4 w-3/5 max-w-full rounded-fw-sm" />

            {/* Composer (PromptComposer's rounded-fw-lg input bar). */}
            <div className="mt-6">
              <Skeleton className="h-14 w-full rounded-fw-lg" />
            </div>

            {/* ProgramOpening — "Where your program stands": one lead finding
                row, then hairline-divided rows underneath. */}
            <div className="mt-6">
              <Skeleton className="h-3 w-44 rounded-fw-sm" />

              <div className="mt-3 flex items-start gap-3 border-t border-border-subtle py-3">
                <Skeleton circle className="mt-1 h-1.5 w-1.5 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-11/12 max-w-full" />
                  <Skeleton className="h-3 w-2/3 max-w-full" />
                </div>
              </div>

              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 border-t border-border-subtle py-2.5"
                >
                  <Skeleton circle className="mt-[0.5rem] h-1.5 w-1.5 shrink-0" />
                  <Skeleton className="h-3.5" style={{ width: `${72 - i * 10}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
