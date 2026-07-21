import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Route Suspense fallback for the CoachHelm Triage Desk (/dashboard/intelligence).
 *
 * The Triage Desk rebuild replaced the Spine + Bento chassis entirely (a
 * horizontal `BriefBand` + `ViewSwitch` + Signals two-pane master-detail —
 * see `TriageDesk.tsx`), so this fallback reproduces THAT shape instead of
 * the retired left-rail/bento one: the dark accent-900→accent-800 gradient
 * band (matches `BriefBand`'s `rounded-fw-lg border-accent-700
 * bg-gradient-to-r ... shadow-raise`), a segmented-control-shaped bar, and
 * the `380px 1fr` queue|dossier grid `TriageDesk` renders at >=940px. This
 * route is `force-dynamic` and awaits several sequential DB reads before it
 * can render at all, so this fallback is what actually paints first on every
 * navigation here.
 */

const SPINE_BAR = 'bg-accent-700/40';

export default function IntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
          <span className="sr-only">Loading the CoachHelm brief…</span>

          {/* Brief band — eyebrow / verdict / count chips / scan CTA / last-scan caption */}
          <div
            aria-hidden="true"
            className="flex flex-col gap-4 rounded-fw-lg border border-accent-700 bg-gradient-to-r from-accent-900 via-accent-800 to-accent-800 p-5 shadow-raise sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <div className="flex flex-col gap-2.5">
              <Skeleton className={`h-2.5 w-24 ${SPINE_BAR}`} />
              <Skeleton className={`h-4 w-full max-w-md ${SPINE_BAR}`} />
              <div className="flex flex-wrap items-center gap-5 pt-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <Skeleton className={`h-6 w-8 ${SPINE_BAR}`} />
                    <Skeleton className={`h-2 w-16 ${SPINE_BAR}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Skeleton className={`h-10 w-32 rounded-full ${SPINE_BAR}`} />
              <Skeleton className={`h-2.5 w-24 ${SPINE_BAR}`} />
            </div>
          </div>

          {/* View switch */}
          <Skeleton className="h-10 w-64 rounded-fw-sm" />

          {/* Signals two-pane: queue (filter chips + grouped rows) | dossier */}
          <div className="grid grid-cols-1 gap-4 min-[940px]:grid-cols-[380px_1fr] min-[940px]:items-start">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-7 w-16 rounded-full" />
                ))}
              </div>
              <div className="flex flex-col gap-2 rounded-fw-lg border border-border-subtle bg-surface p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-4 w-12 rounded-full" />
                    </div>
                    <Skeleton className="h-9 w-full rounded-fw-sm" />
                    <Skeleton className="h-9 w-full rounded-fw-sm" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-fw-lg border border-border-subtle bg-surface p-5 sm:p-6">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-24 w-full rounded-fw-md" />
              <Skeleton className="h-6 w-32" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-20 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
