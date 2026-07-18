import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Fairway-scoped route skeleton for the Team Brief (/dashboard/intelligence).
 * Fixes #922 (Phase 1) — replaces the pre-Fairway `GenericPageSkeleton` (a
 * generic warm-200 card grid that reshaped the page on mount → CLS) with a
 * shape-matched reservation of the ACTUAL `FairwayBrief.tsx` layout: the
 * "Work on this first" hero (directive + Readout chip + button on the left,
 * a Ribbon/bar-strip slot on the right), the strengths/weaknesses two-column
 * split, the demoted pulse strip, the 5 category-detail rows, and the
 * collapsed "Deep analysis" disclosure bar — same pattern as
 * `dashboard/insights/loading.tsx` and `FairwayBrief.tsx`'s own
 * `DeepAnalysisSkeleton` (rendered later, under the disclosure).
 *
 * #947 fix: the eyebrow + h1 are real static text (matching
 * `FairwayBrief.tsx`'s `CoachHelmShell` call — `eyebrow` default "CoachHelm
 * AI", `title={shell?.title ?? 'Team Brief'}`), not `<Skeleton>` blocks. This
 * route is `force-dynamic` and awaits several sequential DB reads before it
 * can render at all, so this fallback is what actually paints first on every
 * navigation here — a generic gray bar in the title's place, live for as
 * long as the fetch chain takes, read as a "ghost/blank title" flash when the
 * real text finally popped in. Neither string above depends on fetched data,
 * so there's nothing to reserve a placeholder for; only the description
 * (data-flavored copy) stays a Skeleton.
 */
export default function IntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading team brief…</span>

        {/* masthead */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-accent-700">
              CoachHelm AI
            </p>
            <h1 className="min-w-0 font-fw-display text-h1 font-medium tracking-[-0.008em] text-text-primary [text-wrap:balance]">
              Team Brief
            </h1>
          </div>
          <Skeleton className="h-9 w-28 rounded-fw-md" />
        </div>

        {/* 1 · work-on-this-first hero */}
        <div className="rounded-card border border-border-subtle bg-surface p-6 md:p-8">
          <Skeleton className="mb-5 h-3 w-32" />
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-8 w-5/6" />
              <Skeleton className="h-8 w-1/2" />
              <div className="flex items-end gap-3 pt-1">
                <Skeleton className="h-10 w-20 rounded-fw-md" />
                <Skeleton className="h-6 w-36 rounded-full" />
              </div>
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="mt-1 h-9 w-40 rounded-fw-md" />
            </div>
            <Skeleton className="h-44 w-full rounded-fw-md" />
          </div>
          <div className="mt-5 flex flex-col gap-2 border-t border-border-subtle pt-4">
            <Skeleton className="h-3 w-40" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
          </div>
        </div>

        {/* 2 · strengths & weaknesses */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((col) => (
              <div key={col} className="rounded-card border border-border-subtle bg-surface p-5">
                <Skeleton className="mb-3 h-3 w-24" />
                <div className="flex flex-col gap-2">
                  {[0, 1].map((row) => (
                    <Skeleton key={row} className="h-11 w-full rounded-fw-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 · team pulse strip */}
        <div className="rounded-card border border-border-subtle bg-surface p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>

        {/* 4 · category detail rows */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-card border border-border-subtle bg-surface p-5">
                <div className="flex items-start gap-3">
                  <Skeleton circle className="h-9 w-9 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                </div>
                <Skeleton className="mt-3 h-11 w-full rounded-fw-md" />
                <Skeleton className="mt-3 h-8 w-28 rounded-fw-md" />
              </div>
            ))}
          </div>
        </div>

        {/* 5 · collapsed deep-analysis disclosure bar */}
        <Skeleton className="h-16 w-full rounded-card" />
      </div>
    </div>
  );
}
