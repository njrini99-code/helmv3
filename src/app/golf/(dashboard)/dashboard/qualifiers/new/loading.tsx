import type { ReactNode } from 'react';
import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/qualifiers/new.
 *
 * Shape-matches FairwayNewQualifier (owner 2026-09-28 rebuild): the
 * `max-w-[1120px]` masthead, then five section cards (a sunken band over a
 * strong rule, then fields) beside the summary. From `md` the summary is the
 * rail in the second grid column; below `md` it is the tray pinned above the
 * tab bar. Same grid, gutters and card chrome, so nothing jumps when the form
 * paints.
 */

/** A section card: the band (step mark, title, one line) and its fields. */
function SectionSkeleton({ titleWidth, children }: { titleWidth: string; children: ReactNode }) {
  return (
    <Surface padding="none" className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border-strong bg-surface-sunken px-4 py-3 sm:px-5">
        <Skeleton circle className="mt-px h-7 w-7 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <Skeleton className={`h-4 ${titleWidth}`} />
          <Skeleton className="h-3.5 w-full max-w-xs" />
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>
    </Surface>
  );
}

/** A field: its visible label and a 44px control (`rounded-fw-sm`, as the controls). */
function FieldSkeleton({ labelWidth, controlHeight = 'h-11' }: { labelWidth: string; controlHeight?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className={`h-3.5 ${labelWidth}`} />
      <Skeleton className={`${controlHeight} w-full`} />
    </div>
  );
}

/** Two or three fields side by side once the column is wide enough, as in the form. */
function FieldRow({ children, three = false }: { children: ReactNode; three?: boolean }) {
  return (
    <div
      className={
        three
          ? 'grid grid-cols-1 gap-4 [@container(min-width:440px)]:grid-cols-2 [@container(min-width:700px)]:grid-cols-3'
          : 'grid grid-cols-1 gap-4 [@container(min-width:440px)]:grid-cols-2'
      }
    >
      {children}
    </div>
  );
}

export default function NewQualifierLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading the new qualifier form…</span>

        {/* ViewHeader: eyebrow, title, description */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        <div className="mt-6 md:mt-8 md:grid md:grid-cols-[minmax(0,1fr)_15.5rem] md:items-start md:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-8">
          <div className="flex min-w-0 flex-col gap-5 [container-type:inline-size]">
            {/* The basics */}
            <SectionSkeleton titleWidth="w-24">
              <FieldSkeleton labelWidth="w-28" controlHeight="h-12" />
              <FieldSkeleton labelWidth="w-24" controlHeight="h-20" />
            </SectionSkeleton>

            {/* When it runs */}
            <SectionSkeleton titleWidth="w-28">
              <FieldRow three>
                <FieldSkeleton labelWidth="w-20" />
                <FieldSkeleton labelWidth="w-20" />
                <FieldSkeleton labelWidth="w-24" />
              </FieldRow>
            </SectionSkeleton>

            {/* Format */}
            <SectionSkeleton titleWidth="w-16">
              <FieldRow>
                <FieldSkeleton labelWidth="w-14" />
                <FieldSkeleton labelWidth="w-16" />
              </FieldRow>
              <Skeleton className="h-14 w-full rounded-fw-md" />
              <FieldSkeleton labelWidth="w-24" controlHeight="h-20" />
            </SectionSkeleton>

            {/* Travel squad */}
            <SectionSkeleton titleWidth="w-28">
              <FieldRow>
                <FieldSkeleton labelWidth="w-20" />
                <FieldSkeleton labelWidth="w-24" />
              </FieldRow>
              <Skeleton className="h-28 w-full rounded-fw-md" />
            </SectionSkeleton>

            {/* Players */}
            <SectionSkeleton titleWidth="w-16">
              <div className="flex justify-end gap-2">
                <Skeleton className="h-9 w-20 rounded-full" />
                <Skeleton className="h-9 w-14 rounded-full" />
              </div>
              <div className="grid grid-cols-1 gap-2 [@container(min-width:440px)]:grid-cols-2 [@container(min-width:680px)]:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex min-h-14 items-center gap-3 rounded-fw-md bg-surface-sunken px-3 py-2">
                    <Skeleton circle className="h-10 w-10 shrink-0" />
                    <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${64 - (i % 3) * 12}%` }} />
                    <Skeleton className="ml-auto h-[1.125rem] w-[1.125rem] shrink-0" />
                  </div>
                ))}
              </div>
            </SectionSkeleton>
          </div>

          {/* Summary: the tray on a phone, the rail from md */}
          <div className="sticky bottom-[var(--golf-mobile-bottom-nav-offset,0px)] z-[var(--fw-z-sticky)] -mx-1 mt-5 md:bottom-auto md:top-[calc(var(--golf-mobile-header-offset,0px)+var(--fw-hub-subnav-offset,0px)+1.5rem)] md:col-start-2 md:row-start-1 md:mx-0 md:mt-0 md:self-start">
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface shadow-raise md:shadow-soft">
              <div className="hidden border-b border-border-strong bg-surface-sunken px-4 py-3 md:block">
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="hidden flex-col gap-3 px-4 pt-4 md:flex">
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-3.5 w-1/2" />
                <div className="mt-1 flex flex-col gap-3 border-y border-border-subtle py-3">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 pl-4 md:flex-col md:items-stretch md:gap-2 md:p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:hidden">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-11 w-[9.5rem] shrink-0 rounded-full md:w-full" />
                <Skeleton className="hidden h-11 w-full rounded-full md:block" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
