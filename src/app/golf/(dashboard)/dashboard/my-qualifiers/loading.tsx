import { fairwayScope, isRedesignEnabled } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { GenericPageSkeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading fallback for the player My Qualifiers view.
 *
 * P183: when the redesign is on, this must be Fairway-native (warm `--fw-*`
 * skeleton blocks, not the legacy `warm-*`/`cream-*` GenericPageSkeleton) and
 * shape-match what loads — otherwise the skeleton→page swap flashes legacy
 * chrome and shifts layout (CLS). It mirrors FairwayMyQualifiers exactly:
 * the `max-w-[1100px]` column, a ViewHeader masthead (eyebrow / title /
 * description / meta), then an Active and a Concluded section, each a
 * SectionHeading label over a `md:grid-cols-2` grid of scorecard-shaped cards.
 *
 * Flag-off, the legacy MyQualifiersClient still renders, so the legacy
 * GenericPageSkeleton remains the correct match for that fork.
 */
export default function Loading() {
  if (!isRedesignEnabled()) return <GenericPageSkeleton />;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading qualifiers…</span>

        {/* Masthead — eyebrow / title / description / meta */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="mt-1 h-3 w-32" />
        </div>

        {/* Active + Concluded sections — label over a 2-col scorecard grid */}
        <div className="mt-8 flex flex-col gap-10">
          {Array.from({ length: 2 }).map((_, s) => (
            <section key={s} className="flex flex-col gap-3">
              <Skeleton className="ml-1 h-3 w-20" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <QualifierCardSkeleton key={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Shape-matches MyQualifierCard: title + status pill, date/course meta, the
 *  3-up thru/total/to-par scorecard well, and the two action buttons. */
function QualifierCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 rounded-card border border-border-subtle bg-surface p-6 [box-shadow:var(--fw-shadow-card)]">
      {/* Title + status pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </div>
        <Skeleton className="h-6 w-16 flex-shrink-0 rounded-full" />
      </div>

      {/* Dates + course meta */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3.5 w-32" />
      </div>

      {/* Scorecard well — thru / total / to-par */}
      <div className="grid grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Skeleton className="h-8 w-44 rounded-fw-md" />
        <Skeleton className="h-8 w-32 rounded-fw-md" />
      </div>
    </div>
  );
}
