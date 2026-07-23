import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Loading skeleton for the Practice Planner route.
 * Mirrors the real layout — same `mx-auto w-full max-w-[1536px]` container
 * and SectionMasthead-shaped header PracticePlannerClient uses (including its
 * own internal loading state at PracticePlannerClient.tsx:585-599), plus a
 * stack of practice-card-shaped placeholders — so there is no layout shift
 * (edge-to-edge rows snapping into a centered column) when data lands.
 *
 * Title bar is a static skeleton, NOT the live <Header> — Header calls
 * useNotifications() unconditionally (before its own redesign-mode branch),
 * opening a realtime Supabase subscription on every route-transition mount
 * of this skeleton for a screen about to render its own header anyway.
 * Mirrors golf's tasks/loading.tsx convention.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6 lg:px-8"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading Practice Planner…</span>

      {/* SectionMasthead — eyebrow + title + accent rule */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      {/* Practice-card list */}
      <div className="mt-8 space-y-4">
        {[0, 1, 2].map((i) => (
          <PaperCard key={i} className="p-5 sm:p-6" grain={false}>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-7 w-20 rounded-fw-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-9 w-full rounded-fw-md" />
                <Skeleton className="h-9 w-full rounded-fw-md" />
              </div>
            </div>
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
