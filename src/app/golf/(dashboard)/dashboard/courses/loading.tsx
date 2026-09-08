import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the cloud Course Library.
 *
 * Ground-truthed against `CourseLibraryClient.tsx`: a `max-w-6xl` (NOT
 * `max-w-[1280px]`) column with `pb-16` (not `pb-10`), a masthead, a SOLO
 * search input (`max-w-md` — there is no separate filter button beside it),
 * then a full-width "featured" hero card above a labeled "Your team's
 * courses" section rendering the standard `aspect-[3/2]` card grid.
 * Previously this reserved a wider column, a phantom filter button, and a
 * flat 9-card grid with no hero — three differences the eye catches at the
 * exact moment the real page mounts.
 *
 * Two more corrections against `CourseCard.tsx`'s real markup:
 *  - The hero (`variant="featured"`, CourseCard.tsx:76) is
 *    `aspect-[16/9] max-h-[340px] w-full sm:aspect-[21/9]` — the `max-h`
 *    cap is deliberate (CourseCard.tsx:70-75: keeps the grid on-screen below
 *    the fold), and without it this skeleton was ~120-150px taller than the
 *    real hero on a typical desktop column, shifting the whole grid up when
 *    real content mounts.
 *  - The masthead's primary-action placeholder stood for a Fairway `Button`
 *    (button.tsx:93-94: `base` includes `rounded-full` for every variant),
 *    not a `rounded-fw-md` rectangle — matches the `rounded-full` convention
 *    already used for the same CTA-skeleton shape in sibling routes (e.g.
 *    `dashboard/recruiting/loading.tsx`, `dashboard/rounds/new/loading.tsx`).
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
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>

        {/* Search — solo input, no adjoining filter control */}
        <Skeleton className="mb-8 h-11 w-full max-w-md rounded-fw-sm" />

        <div className="space-y-10">
          {/* Hero — the featured course card */}
          <Skeleton className="aspect-[16/9] max-h-[340px] w-full rounded-fw-lg sm:aspect-[21/9]" />

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
