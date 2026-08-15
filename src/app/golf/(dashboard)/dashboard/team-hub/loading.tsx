import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the player Team Hub (redesign-only route).
 *
 * Ground-truthed against `FairwayTeamHub.tsx`: a `max-w-3xl` (NOT 1280px)
 * centered column, a ViewHeader masthead, a 5-trigger underline `TabsList`
 * (Tasks / Announcements / Travel / Class schedule / Teammates — the
 * Teammates tab was added after this skeleton was first written and it never
 * got a 5th bar), and — since Tasks is the default tab — the "To-do" section
 * (SectionTitle + a bordered list of TaskRow-shaped rows), not a 2-up grid of
 * four section cards. The real page shows ONE tab's content at a time, never
 * all four sections simultaneously, so a 4-card grid here caused a visible
 * "wide skeleton, narrow page" and "grid collapses to a list" double jump the
 * moment data landed.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10"
      >
        <span className="sr-only">Loading team hub…</span>

        {/* Masthead — ViewHeader (eyebrow · title · description) */}
        <div className="mb-8 flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        {/* Tabs — underline TabsList, 5 triggers */}
        <div aria-hidden="true" className="flex items-center gap-1 border-b border-border-subtle">
          {[48, 112, 56, 116, 88].map((w, i) => (
            <div key={i} className="px-3.5 pb-3 pt-2">
              <Skeleton className="h-4" style={{ width: w }} />
            </div>
          ))}
        </div>

        {/* Tasks tab content (default) — SectionTitle + TaskRow list */}
        <div className="mt-6 flex flex-col gap-8">
          <section>
            <div className="mb-3 flex items-baseline gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-2">
                  <Skeleton circle className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5" style={{ width: `${64 - i * 6}%` }} />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
