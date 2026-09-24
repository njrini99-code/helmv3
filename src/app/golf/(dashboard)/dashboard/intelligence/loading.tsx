import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Route Suspense fallback for the coach Brief (/dashboard/intelligence).
 *
 * The live page is `CoachIntelligenceHome` -> `TriageDesk`, rebuilt as a field
 * sheet (docs/design/fairway-facelift/screens/intelligence.v3.md): a BARE
 * masthead on the canvas, ONE `Surface` stage holding the leak rail plus its
 * readouts, a bare three-column ledger row, then the dense Signals table.
 *
 * This fallback previously reserved a `CommandOpening` composer, a
 * `TeamCategoryLeakBand` grid, a deep-green `BriefBand`/`Spine` banner and a
 * two-pane `SignalQueue`/`SignalDossier` workspace — none of which the page
 * renders any more. Every one of them flashed and then vanished on load, which
 * is precisely the re-layout jump this file's previous revision was written to
 * stop. Ordering below matches the real DOM top to bottom, and the outer
 * wrapper matches `page.tsx`'s own `max-w-[1440px] px-4 py-6 md:px-6` so the
 * content column does not shift width when data lands.
 */

export default function IntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6">
        <div role="status" aria-busy="true" aria-live="polite" className="flex w-full flex-col">
          <span className="sr-only">Loading the CoachHelm brief…</span>

          {/* ── 1 · Masthead, bare on the canvas ─────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <Skeleton className="h-3 w-40 rounded-fw-sm" />
              {/* The ViewSwitch takes its own row below md, as it does live. */}
              <Skeleton className="order-last h-10 w-full rounded-full md:order-none md:w-72" />
              <div className="flex items-center gap-2">
                <Skeleton circle className="h-10 w-10" />
                <Skeleton className="h-10 w-32 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-10 w-40 rounded-fw-sm" />
            <Skeleton className="h-6 w-full max-w-[64ch] rounded-fw-sm" />
            <Skeleton className="h-6 w-2/3 max-w-[46ch] rounded-fw-sm" />
          </div>

          {/* ── 2 · The stage, the one Surface ───────────────────────────── */}
          <div className="mt-10 overflow-hidden rounded-card border border-border-subtle bg-surface">
            <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 md:px-6">
              <Skeleton className="h-2.5 w-44 rounded-fw-sm" />
              <Skeleton className="h-6 w-40 rounded-fw-sm" />
              <Skeleton className="h-3 w-full max-w-[64ch] rounded-fw-sm" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
              <div className="order-2 min-w-0 px-5 py-5 md:px-6 xl:order-1">
                <div className="flex flex-col gap-2.5">
                  {[100, 62, 34, 18, 12, 10, 8, 6].map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="hidden h-3 shrink-0 rounded-fw-sm md:block md:w-[132px]" />
                      <div className="min-w-0 flex-1">
                        <Skeleton className="h-[10px] rounded-full" style={{ width: `${w}%` }} />
                      </div>
                      <Skeleton className="h-3 w-[88px] shrink-0 rounded-fw-sm" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="order-1 border-b border-border-subtle px-5 py-4 md:px-6 md:py-5 xl:order-2 xl:border-b-0">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4 md:gap-x-8 xl:grid-cols-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <Skeleton className="h-2.5 w-24 rounded-fw-sm" />
                      <Skeleton className="h-7 w-16 rounded-fw-sm" />
                      <Skeleton className="h-2.5 w-28 rounded-fw-sm" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── 3 · The ledger row ───────────────────────────────────────── */}
          <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
            {[
              'xl:col-span-4 xl:pr-8 2xl:col-span-5',
              'xl:col-span-4 xl:px-8 2xl:col-span-3',
              'md:col-span-2 xl:col-span-4 xl:pl-8 2xl:col-span-4',
            ].map((span, col) => (
              <div key={col} className={`flex min-w-0 flex-col gap-3 ${span}`}>
                <Skeleton className="h-2.5 w-28 rounded-fw-sm" />
                <div className="flex flex-col">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-start gap-2.5 border-b border-border-subtle py-2.5 last:border-b-0">
                      <div className="min-w-0 flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-32 max-w-full rounded-fw-sm" />
                        <Skeleton className="mt-1.5 h-2.5 w-full rounded-fw-sm" />
                      </div>
                      <Skeleton className="h-4 w-14 shrink-0 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── 4 · The table ────────────────────────────────────────────── */}
          <div className="mt-12 flex flex-col gap-3">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline gap-2.5">
                <Skeleton className="h-5 w-24 rounded-fw-sm" />
                <Skeleton className="h-3 w-6 rounded-fw-sm" />
              </div>
              <div aria-hidden="true" className="h-px w-full bg-accent-300" />
            </div>
            <div className="flex gap-2 border-b border-border-subtle pb-3">
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
            </div>
            <div className="flex flex-col">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-3">
                  <Skeleton className="h-4 w-16 shrink-0 rounded-full" />
                  <Skeleton className="hidden h-3.5 w-32 shrink-0 rounded-fw-sm md:block" />
                  <Skeleton className="h-3.5 min-w-0 flex-1 rounded-fw-sm" />
                  <Skeleton className="hidden h-3.5 w-28 shrink-0 rounded-fw-sm md:block" />
                  <Skeleton className="h-3.5 w-16 shrink-0 rounded-fw-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
