import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Purpose-built Suspense fallback for the Messages inbox. Shape-matches
 * FairwayMessages (ViewHeader masthead → md:grid-cols-12 two-pane inbox: a
 * conversation-rail aside at md:col-span-5/lg:col-span-4 + a thread pane at
 * md:col-span-7/lg:col-span-8), so the real page paints in place with no
 * layout swap / CLS on hydrate. Previously fell back to the legacy
 * `MessagesPageSkeleton` (cream/warm tokens) — a flash-of-wrong-design against
 * this Fairway-only route.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope(
        'flex h-[calc(100dvh-4rem-56px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden bg-canvas md:h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]',
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 lg:py-8">
        <div role="status" aria-busy="true" aria-live="polite" className="flex flex-wrap items-end justify-between gap-4">
          <span className="sr-only">Loading messages…</span>
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

        {/* Two-pane inbox */}
        <div className="mt-6 flex min-h-0 flex-1 grid-cols-12 items-stretch gap-5 md:grid md:gap-6">
          {/* Conversation rail */}
          <aside className="col-span-12 flex w-full flex-col md:col-span-5 md:w-auto lg:col-span-4">
            <Surface elevation="border" padding="none" className="flex-1 overflow-hidden">
              <div className="flex flex-col gap-1 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
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
