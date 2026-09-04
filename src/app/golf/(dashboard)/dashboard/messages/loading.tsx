import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Suspense fallback for the Messages inbox.
 *
 * A skeleton's whole job is to occupy the geometry the real page is about to
 * occupy. This one had drifted: it painted the full editorial masthead (eyebrow
 * + title + description + a two-button row), `py-6`, `mt-6`, and a bordered
 * card around the rail — none of which the phone layout renders any more. The
 * result was a visible reconstruction on entering the tab: roughly 120px of
 * masthead skeleton appeared, then vanished as the real page mounted, taking
 * the card border with it and yanking every conversation row upward. That is
 * the "it hot reloads and looks crappy" report, and it is a mismatch between
 * this file and FairwayMessages, not a rendering fault.
 *
 * It now mirrors the shipped layout at BOTH widths:
 *   • phone — no masthead, a right-aligned action row, `py-3`, a flat
 *     edge-to-edge rail with a search field and rows on the canvas
 *   • `md`+ — the masthead and the two-pane grid, unchanged
 *
 * Keep this file and `FairwayMessages` / `MessageConversationRail` in step. A
 * skeleton that no longer matches is worse than none: it manufactures exactly
 * the layout jump it exists to prevent.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope(
        'flex h-[calc(100dvh-4rem-56px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden bg-canvas md:h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]',
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-3 sm:px-6 sm:py-6 lg:py-8">
        <span className="sr-only" role="status" aria-busy="true" aria-live="polite">
          Loading messages…
        </span>

        {/* PHONE — the action row that replaces the masthead below `md`. */}
        <div className="flex items-center justify-end gap-2 md:hidden">
          <Skeleton className="h-9 w-16 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>

        {/* `md`+ — the editorial masthead, unchanged. */}
        <div className="hidden flex-wrap items-end justify-between gap-4 md:flex">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-9 w-48 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-36 max-w-full" />
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </div>

        {/* Two-pane inbox. `mt-3` on phone / `mt-6` from `md` matches the page. */}
        <div className="mt-3 flex min-h-0 flex-1 grid-cols-12 items-stretch gap-5 md:mt-6 md:grid md:gap-6">
          {/* Conversation rail. Flat on phone (no Surface border, no card
              padding) exactly as MessageConversationRail now renders; the
              bordered panel returns at `md`. */}
          <aside className="col-span-12 flex w-full flex-col md:col-span-5 md:w-auto lg:col-span-4">
            <Surface
              elevation="border"
              padding="none"
              className="flex-1 overflow-hidden max-md:!rounded-none max-md:!border-0 max-md:!shadow-none max-md:bg-transparent"
            >
              {/* Search field — the rail's first row on phone, where the
                  bezel heading used to be. */}
              <div className="px-0 pb-3 pt-0 md:px-3 md:pt-3">
                <Skeleton className="h-11 w-full rounded-fw-md" />
              </div>
              <div className="flex flex-col gap-1 px-0 pb-3 md:px-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-fw-md px-3 py-2.5">
                    <Skeleton circle className="h-10 w-10 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between gap-2">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-3 w-40 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </aside>

          {/* Thread pane — hidden on mobile (mirrors mobileShowChat's rail-first default) */}
          <div className="hidden min-h-0 flex-col md:col-span-7 md:flex lg:col-span-8">
            <Surface elevation="border" padding="none" className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
                <Skeleton circle className="h-9 w-9" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex-1 space-y-3 p-5">
                <Skeleton className="h-14 w-2/3 rounded-fw-md" />
                <Skeleton className="ml-auto h-10 w-1/2 rounded-fw-md" />
                <Skeleton className="h-16 w-3/4 rounded-fw-md" />
              </div>
              <div className="border-t border-border-subtle p-4">
                <Skeleton className="h-11 w-full rounded-fw-md" />
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}
