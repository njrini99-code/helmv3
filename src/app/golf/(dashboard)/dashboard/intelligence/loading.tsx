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

const DARK_BAR = 'bg-accent-700/40';

export default function IntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
          <span className="sr-only">Loading the CoachHelm brief…</span>

          {/* Brief band — identical footprint to the live CoachHelm masthead. */}
          <div
            aria-hidden="true"
            className="flex flex-col gap-4 rounded-fw-lg border border-accent-700 bg-gradient-to-r from-accent-900 via-accent-800 to-accent-800 p-5 shadow-raise sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <div className="flex flex-col gap-2.5">
              <Skeleton className={`h-2.5 w-24 ${DARK_BAR}`} />
              <Skeleton className={`h-4 w-full max-w-md ${DARK_BAR}`} />
              <div className="flex flex-wrap items-center gap-5 pt-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <Skeleton className={`h-6 w-8 ${DARK_BAR}`} />
                    <Skeleton className={`h-2 w-16 ${DARK_BAR}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Skeleton className={`h-10 w-32 rounded-full ${DARK_BAR}`} />
              <Skeleton className={`h-2.5 w-24 ${DARK_BAR}`} />
            </div>
          </div>

          {/* View switch — full-width on the real desk. */}
          <Skeleton className="h-11 w-full rounded-fw-sm" />

          {/* Team command map. This deliberately mirrors the finished
              pressure-map/category/priority composition so route transitions
              never flash the retired empty queue shell. */}
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <div className="overflow-hidden rounded-fw-lg border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
              <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
                <div className="space-y-2">
                  <Skeleton className="h-2.5 w-32" />
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid min-h-[300px] lg:grid-cols-[minmax(270px,0.9fr)_minmax(300px,1.1fr)]">
                <div className="grid place-items-center border-b border-border-subtle bg-surface-sunken/45 p-5 lg:border-b-0 lg:border-r">
                  <Skeleton className="h-52 w-52 rounded-full" />
                </div>
                <div className="grid content-center gap-3 p-4 sm:p-5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-fw-md border border-border-subtle bg-surface-raised p-3">
                      <div className="flex items-center justify-between gap-3">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-6 w-8" />
                      </div>
                      <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-border-subtle border-t border-border-subtle sm:grid-cols-4 sm:divide-y-0">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-4 h-10 rounded-fw-sm" />)}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {[0, 1].map((panel) => (
                <div key={panel} className="rounded-fw-lg border border-border-subtle bg-surface p-4 [box-shadow:var(--fw-shadow-card)]">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-2 h-3 w-48 max-w-full" />
                  <div className="mt-4 grid gap-2.5">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-fw-md" />)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Signals two-pane — same bounded equal-height frame as the live desk. */}
          <div className="grid grid-cols-1 gap-4 min-[940px]:h-[min(760px,calc(100vh-180px))] min-[940px]:grid-cols-[380px_1fr] min-[940px]:items-stretch">
            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-7 w-16 rounded-full" />
                ))}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-fw-lg border border-border-subtle bg-surface p-3">
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
            <div className="flex min-h-[360px] flex-col gap-4 overflow-hidden rounded-fw-lg border border-border-subtle bg-surface p-5 sm:p-6 min-[940px]:min-h-0">
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
