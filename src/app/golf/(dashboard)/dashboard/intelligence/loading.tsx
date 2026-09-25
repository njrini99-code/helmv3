import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Route Suspense fallback for the CoachHelm Brief (/dashboard/intelligence).
 *
 * 2026-09-25: the default view is now Team roots (`?view=team`), so below
 * CommandOpening this draws what that view paints first: the view-switch row
 * with Ask beside it, the Team roots header, the summary card (key number,
 * two lines, the loss bar, one primary button) and the closed disclosures.
 * The Signals desk (BriefBand, queue, dossier) no longer paints first, so
 * its skeleton is gone. The history below describes the earlier layout.
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


          {/* ── View switch (Team roots / Signals / Players / Effectiveness)
              with Ask beside it, one row on phones. ── */}
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <Skeleton className="h-11 min-w-0 flex-1 rounded-full sm:w-[420px] sm:flex-none" />
            <Skeleton className="h-11 w-20 shrink-0 rounded-fw-md" />
          </div>

          {/* ── Team roots: header, then the summary card. ── */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-72 max-w-full" />
              <Skeleton className="h-7 w-40" />
            </div>

            <div className="flex flex-col gap-5 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-64 max-w-full" />
                <Skeleton className="h-12 w-28" />
                <Skeleton className="h-4 w-full max-w-md" />
                <Skeleton className="h-4 w-3/4 max-w-sm" />
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-fw-md" />
            </div>

            {/* Closed disclosures: team map, player matrix, trend. */}
            <div className="flex flex-col">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex min-h-11 items-center justify-between border-t border-border-subtle py-3">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-4" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
