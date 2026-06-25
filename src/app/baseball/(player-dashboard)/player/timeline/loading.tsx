// Route-level skeleton for Player Timeline (/baseball/player/timeline).
// The page awaits getPlayerTimeline + getTimelineAcksForViewer before
// rendering, so without this a navigation froze the previous route.
// Mirrors the timeline's actual layout: header + a stack of timeline-event
// skeletons (icon bead left, content block right).

import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerTimelineLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back link placeholder */}
        <Skeleton className="mb-6 h-4 w-28" />

        {/* Header */}
        <div className="mb-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>

        {/* Timeline event skeletons — icon bead + content */}
        <div className="relative space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 pb-8">
              {/* Bead + connecting line */}
              <div className="flex flex-col items-center">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                {i < 5 && (
                  <div className="mt-1 w-px flex-1 bg-warm-100" />
                )}
              </div>
              {/* Content */}
              <div className="flex-1 pt-1.5 pb-2">
                <Skeleton className="h-4 w-1/3 mb-1.5" />
                <Skeleton className="h-3 w-2/3 mb-2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
