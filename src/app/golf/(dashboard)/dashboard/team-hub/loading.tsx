import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton, Surface } from '@/components/fairway';

/**
 * Route-level loading fallback for the player Team Hub (redesign-only route).
 *
 * Ground-truthed against `FairwayTeamHub.tsx`: a `max-w-4xl` (NOT `max-w-3xl`)
 * centered column, a ViewHeader masthead, then a `grid grid-cols-1 gap-4
 * md:grid-cols-2` bento of FIVE cards rendered SIMULTANEOUSLY — there is no
 * `TabsList` on this surface (grep confirms zero hits) and no single-tab
 * "To-do" section. The previous version of this file depicted a retired
 * 5-trigger tab strip + single-column layout and caused a visible
 * "wide skeleton, narrow page" + "tabs collapse to a grid" double jump the
 * moment real data landed. This rewrite mirrors the live grid card-for-card:
 *
 *   - Tasks         (`md:row-span-2`, L209-265) — header row + up to 4
 *                    TaskRow-shaped rows (28px checkbox + 2 text lines) +
 *                    a footer link line.
 *   - Travel        (L268-313) — header row + countdown/title/subtitle.
 *   - Announcements (L324-366) — header row + title + caption.
 *   - Classes       (L369-404) — header row + up to 3 preview rows
 *                    (color dot + class name + time).
 *   - Teammates     (`md:col-span-2`, L407-441) — header + a 6-avatar stack.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-10"
      >
        <span className="sr-only">Loading team hub…</span>

        {/* Masthead — ViewHeader (eyebrow=team name · title · description) */}
        <div className="mb-8 flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* ═══ Tasks — Surface, md:row-span-2, header + TaskRow list + footer ═══ */}
          <Surface padding="md" className="flex flex-col gap-4 md:row-span-2">
            <CardHeaderSkeleton titleWidth="w-12" />
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-2">
                  <Skeleton circle className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5" style={{ width: `${70 - i * 8}%` }} />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-auto">
              <Skeleton className="h-4 w-24" />
            </div>
          </Surface>

          {/* ═══ Travel — CardLink-shaped Surface: header + countdown/title/subtitle ═══ */}
          <Surface padding="md" className="flex h-full flex-col gap-3">
            <CardHeaderSkeleton titleWidth="w-16" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </Surface>

          {/* ═══ Announcements — header + title (2-line clamp) + caption ═══ */}
          <Surface padding="md" className="flex h-full flex-col gap-3">
            <CardHeaderSkeleton titleWidth="w-28" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </Surface>

          {/* ═══ Classes — header + up to 3 preview rows (dot + name + time) ═══ */}
          <Surface padding="md" className="flex h-full flex-col gap-3">
            <CardHeaderSkeleton titleWidth="w-24" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton circle className="h-2.5 w-2.5 shrink-0" />
                  <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${60 - i * 8}%` }} />
                  <Skeleton className="h-3 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </Surface>

          {/* ═══ Teammates — md:col-span-2, header + 6-avatar stack ═══ */}
          <Surface padding="md" className="flex h-full flex-col gap-3 md:col-span-2">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-1 basis-40 items-center justify-between gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </div>
              <div className="flex items-center">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    circle
                    className={`h-8 w-8 border-2 border-surface ${i > 0 ? '-ml-2' : ''}`}
                  />
                ))}
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

/** The shared `CardHeader` shape used by every read-only card: label + chevron. */
function CardHeaderSkeleton({ titleWidth }: { titleWidth: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Skeleton className={`h-4 ${titleWidth}`} />
      <Skeleton className="h-4 w-4" />
    </div>
  );
}
