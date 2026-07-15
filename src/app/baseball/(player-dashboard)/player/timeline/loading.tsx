// Route-level skeleton for Player Timeline (/baseball/player/timeline).
// The page awaits getPlayerTimeline + getTimelineAcksForViewer before
// rendering, so without this a navigation froze the previous route.
// Mirrors the actual page's Living Annual chrome (fairwayScope('min-h-full
// bg-canvas') + a stack of PaperCard-shaped timeline-event rows: a
// --hairline/--paper bead on the left, a --hairline/--paper card on the
// right) rather than the legacy cream/warm skeleton this had drifted to —
// same fix as passport/loading.tsx's own "the page migrated to the kit but
// this skeleton still had the old drift" comment.

import { Skeleton } from '@/components/ui/skeleton';
import { fairwayScope } from '@/lib/redesign/flag';

export default function PlayerTimelineLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back link placeholder */}
        <Skeleton className="mb-6 h-4 w-28" />

        {/* SectionMasthead */}
        <div className="mb-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>

        {/* Timeline event skeletons — node bead + PaperCard, matching
            PlayerTimelineFairway's actual per-event markup. */}
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="relative flex gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline)] bg-[var(--paper)]">
                <Skeleton className="h-4 w-4 rounded-full" />
              </div>
              <div className="flex-1 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-14 shrink-0" />
                </div>
                <Skeleton className="mt-2 h-3 w-2/3" />
                <div className="mt-2.5 flex items-center gap-1.5">
                  <Skeleton className="h-4 w-14 rounded-fw-sm" />
                  <Skeleton className="h-4 w-16 rounded-fw-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
