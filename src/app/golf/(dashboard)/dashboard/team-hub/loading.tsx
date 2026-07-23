import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Route-level loading fallback for the player Team Hub (redesign-only route).
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless. Wrapped in the same
 * `fairwayScope('min-h-full bg-canvas')` frame the page uses, and shape-matched
 * to the LIVE FairwayTeamHub: a narrow `max-w-3xl` column, a ViewHeader
 * masthead, a 5-tab underline row (Tasks / Announcements / Travel / Class
 * schedule / Teammates), and — since Tasks is the default, always-active tab —
 * a single-column stack of task rows in one Surface, never a 2-up grid of every
 * section at once.
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

        {/* Masthead (ViewHeader shape: eyebrow=teamName, title, description) */}
        <div className="mb-8 flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        {/* Tab row — 5 underline tabs (Tasks / Announcements / Travel / Class schedule / Teammates) */}
        <div className="flex items-center gap-1 border-b border-border-subtle pb-3">
          {[56, 108, 64, 112, 84].map((w, i) => (
            <Skeleton key={i} className="h-5 rounded-fw-sm px-3.5" style={{ width: w }} />
          ))}
        </div>

        {/* Tasks tab content (default active tab) — a single stacked list */}
        <div className="mt-6 flex flex-col gap-8">
          <section>
            <Skeleton className="mb-3 h-4 w-20" />
            <Surface padding="sm" className="flex flex-col gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-fw-sm p-3">
                  <Skeleton className="h-5 w-5 flex-shrink-0 rounded-fw-sm" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-5 w-16 flex-shrink-0 rounded-full" />
                </div>
              ))}
            </Surface>
          </section>
        </div>
      </div>
    </div>
  );
}
