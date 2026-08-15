import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Route Suspense fallback for the CoachHelm Brief (/dashboard/intelligence).
 *
 * The live page is `CoachIntelligenceHome`: the AI-first `CommandOpening`
 * (greeting h1 + status line, quick-action chip row, the prompt composer,
 * then the "Program pulse" panel) ABOVE the existing `TriageDesk`, which
 * itself now opens with `TeamCategoryLeakBand` ("Where the team is bleeding
 * strokes" — a 5-category grid with a team-health ring) BEFORE its own
 * `BriefBand` masthead, `ViewSwitch` segmented control, and (on the default
 * Signals view) the team-diagnostics disclosure + `TeamSignalSummary`
 * pressure map + `SignalQueue`/`SignalDossier` two-pane grid.
 *
 * This fallback used to open directly on a `BriefBand`-shaped dark banner —
 * the shape of an EARLIER Triage Desk revision that no longer exists as the
 * page's first paint now that CommandOpening + TeamCategoryLeakBand sit
 * above it. That mismatch caused a visible re-layout jump the moment data
 * landed (live evidence, 2026-08). Ordering below matches the real DOM order
 * top to bottom so nothing above the fold moves once data resolves.
 */

const DARK_BAR = 'bg-text-on-accent/12';

export default function IntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-8">
          <span className="sr-only">Loading the CoachHelm brief…</span>

          {/* ── CommandOpening: greeting h1 + status line, quick-action chip
              row, the composer frame, then the Program pulse panel. ── */}
          <div className="flex flex-col gap-5">
            <div>
              <Skeleton className="h-9 w-72 max-w-full rounded-fw-sm" />
              <Skeleton className="mt-2 h-4 w-64 max-w-full rounded-fw-sm" />
            </div>

            <div>
              <div className="-mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                {[88, 148, 132, 176, 168].map((w, i) => (
                  <Skeleton key={i} className="h-10 shrink-0 rounded-full" style={{ width: w }} />
                ))}
              </div>
              <div className="flex items-end gap-2 rounded-fw-lg border border-border-subtle bg-surface p-2">
                <Skeleton className="h-11 w-11 shrink-0 rounded-fw-md" />
                <Skeleton className="h-11 flex-1 rounded-fw-sm" />
                <Skeleton className="h-11 w-11 shrink-0 rounded-fw-md" />
              </div>
            </div>

            <div className="rounded-card border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-4 py-2.5">
                <Skeleton className="h-2.5 w-28" />
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 border-b border-border-subtle px-4 py-3 last:border-0">
                  <Skeleton circle className="mt-1.5 h-1.5 w-1.5 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-full max-w-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── TeamCategoryLeakBand: "Where the team is bleeding strokes" —
              eyebrow + header + team-health ring readout, 5-category grid. ── */}
          <div className="rounded-card border border-border-subtle bg-surface p-6">
            <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="space-y-1">
                <Skeleton className="h-2.5 w-28" />
                <Skeleton className="h-5 w-64 max-w-full" />
              </div>
              <div className="flex items-center gap-2.5">
                <Skeleton circle className="h-11 w-11" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex h-full flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-3 w-3" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <Skeleton className="h-4 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* ── BriefBand — the dark accent-900→accent-800 masthead. ── */}
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

          {/* ── ViewSwitch — Signals / Players / Effectiveness segmented pill. ── */}
          <div
            aria-hidden="true"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-border-subtle bg-surface-sunken p-1"
          >
            {[72, 72, 118].map((w, i) => (
              <Skeleton key={i} className="h-9 rounded-full" style={{ width: w }} />
            ))}
          </div>

          {/* ── Team diagnostics disclosure + TeamShotWeaknessesPanel body
              (open by default on first paint). ── */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11 w-full rounded-fw-sm" />
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-fw-md border border-border-subtle bg-surface-sunken p-3">
                  <div className="min-w-0 space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div className="ml-3 shrink-0 space-y-1.5 text-right">
                    <Skeleton className="ml-auto h-3.5 w-10" />
                    <Skeleton className="ml-auto h-3 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── TeamSignalSummary — "Game pressure map" + Priority roster /
              Signal velocity panels. ── */}
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

          {/* ── SignalQueue / SignalDossier two-pane — same bounded
              equal-height frame as the live desk. ── */}
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
