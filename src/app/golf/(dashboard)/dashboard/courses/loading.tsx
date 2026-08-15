import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the cloud Course Library.
 *
 * Ground-truthed against `CourseLibraryClient.tsx`: a `max-w-6xl` (NOT
 * `max-w-[1280px]`) column with `pb-16` (not `pb-10`), a masthead, a SOLO
 * search input (`max-w-md` — there is no separate filter button beside it),
 * then a full-width "featured" hero card (`aspect-[16/9] sm:aspect-[21/9]`)
 * above a labeled "Your team's courses" section rendering the standard
 * `aspect-[3/2]` card grid. Previously this reserved a wider column, a
 * phantom filter button, and a flat 9-card grid with no hero — three
 * differences the eye catches at the exact moment the real page mounts.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8"
      >
        <span className="sr-only">Loading courses…</span>

        {/* Masthead — eyebrow / title / count line + (coach) primary action */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-44" />
            <Skeleton className="mt-1.5 h-3.5 w-40" />
          </div>
          <Skeleton className="h-10 w-32 rounded-fw-md" />
        </div>

        {/* Search — solo input, no adjoining filter control */}
        <Skeleton className="mb-8 h-11 w-full max-w-md rounded-fw-sm" />

        <div className="space-y-10">
          {/* Hero — the featured course card */}
          <Skeleton className="aspect-[16/9] w-full rounded-fw-lg sm:aspect-[21/9]" />

          {/* "Your team's courses" section */}
          <section>
            <Skeleton className="mb-3 h-3 w-36" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-card border border-border-subtle bg-surface">
                  <Skeleton className="aspect-[3/2] w-full rounded-none" />
                  <div className="flex items-center gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
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
