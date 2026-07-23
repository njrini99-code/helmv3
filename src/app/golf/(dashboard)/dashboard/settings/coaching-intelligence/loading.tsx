import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Suspense fallback for /golf/dashboard/settings/coaching-intelligence.
 * Mirrors FairwaySettingsCoachingIntelligence's own CoachingIntelligenceFrame
 * shell (back-button + max-w-[1200px] + ViewHeader masthead) and its internal
 * loading branch (4 stacked Surface cards, each a title + description + two
 * field-row placeholders) — never the legacy GenericPageSkeleton.
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
        <span className="sr-only">Loading coaching intelligence settings…</span>

        {/* Back-button affordance (always present in CoachingIntelligenceFrame) */}
        <Skeleton className="mb-4 h-7 w-24" />

        {/* Masthead (ViewHeader shape) */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-full max-w-[68ch]" />
          <Skeleton className="h-4 w-2/3 max-w-[68ch]" />
        </div>

        {/* Section cards — matches the component's own loading branch */}
        <div className="mt-8 flex flex-col gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Surface key={i} elevation="border" padding="lg" className="flex flex-col gap-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-64" />
              <div className="flex flex-col gap-3">
                <Skeleton className="h-8 w-full rounded-fw-sm" />
                <Skeleton className="h-8 w-3/4 rounded-fw-sm" />
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}
