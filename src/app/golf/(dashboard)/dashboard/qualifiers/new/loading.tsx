import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/** One FormSection's skeleton: title + description + fields (gap-8 matches
 *  Form spacing="roomy" between sections; FormSection itself has no border/
 *  divider chrome — see FormSection.tsx — just a `mb-5` header + field gap). */
function SectionSkeleton({
  titleWidth,
  descWidth,
  children,
}: {
  titleWidth: string;
  descWidth: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-5 flex flex-col gap-1">
        <Skeleton className={`h-5 ${titleWidth}`} />
        <Skeleton className={`h-3.5 ${descWidth}`} />
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

/** One FormField's skeleton: visible label + control. */
function FieldSkeleton({
  labelWidth,
  controlHeight = 'h-11',
}: {
  labelWidth: string;
  controlHeight?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className={`h-3.5 ${labelWidth}`} />
      <Skeleton className={`${controlHeight} w-full rounded-fw-md`} />
    </div>
  );
}

/**
 * Route Suspense fallback for /golf/dashboard/qualifiers/new.
 *
 * Shape-matches FairwayNewQualifier: a `max-w-[760px]` ViewHeader masthead,
 * then the Basics / Schedule / Course & rules / Travel squad / Players
 * FormSections in the same order, `gap-8` between sections (Form
 * spacing="roomy"), and the Cancel/Create action row.
 */
export default function NewQualifierLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading new qualifier form…</span>

        {/* ViewHeader */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        <div className="mt-8 flex flex-col gap-8">
          <SectionSkeleton titleWidth="w-16" descWidth="w-56">
            <FieldSkeleton labelWidth="w-28" />
            <FieldSkeleton labelWidth="w-24" controlHeight="h-20" />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-20" descWidth="w-40">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldSkeleton labelWidth="w-16" />
              <FieldSkeleton labelWidth="w-16" />
            </div>
            <FieldSkeleton labelWidth="w-28" />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-32" descWidth="w-52">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldSkeleton labelWidth="w-14" />
              <FieldSkeleton labelWidth="w-14" />
            </div>
            <FieldSkeleton labelWidth="w-24" controlHeight="h-16" />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-28" descWidth="w-60">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldSkeleton labelWidth="w-20" />
              <FieldSkeleton labelWidth="w-24" />
            </div>
            <Skeleton className="h-[68px] w-full rounded-fw-md" />
          </SectionSkeleton>

          {/* Players */}
          <div className="flex flex-col">
            <div className="mb-5 flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-16" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-10" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-3.5 py-3"
                >
                  <Skeleton className="h-4 w-4 flex-shrink-0" />
                  <Skeleton circle className="h-6 w-6 flex-shrink-0" />
                  <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${60 - (i % 3) * 10}%` }} />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <Skeleton className="h-9 w-16 rounded-full" />
            <Skeleton className="h-10 w-[170px] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
