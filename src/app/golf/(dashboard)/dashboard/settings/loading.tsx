import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Suspense fallback for /golf/dashboard/settings. Shape-matches
 * FairwaySettingsGeneral's real max-w-[1200px] ViewHeader masthead + stacked
 * Surface `SectionCard` layout (identity card, then icon+title+description
 * panels for personal info / email / password / appearance / distance units /
 * notifications / golf settings / team), never the legacy GenericPageSkeleton.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 pb-24"
      >
        <span className="sr-only">Loading settings…</span>

        {/* Masthead (ViewHeader shape) */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {/* Identity card */}
          <Surface elevation="border" padding="md" className="flex items-center gap-4">
            <Skeleton circle className="h-12 w-12 flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </Surface>

          {/* Section cards (SectionCard shape: icon + title + description + rows) */}
          {Array.from({ length: 6 }).map((_, i) => (
            <Surface key={i} elevation="border" padding="lg">
              <div className="mb-5 flex items-start gap-3">
                <Skeleton className="h-9 w-9 flex-shrink-0 rounded-fw-sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-fw-sm" />
                <Skeleton className="h-10 w-3/4 rounded-fw-sm" />
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}
