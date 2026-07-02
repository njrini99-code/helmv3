// Route-level skeleton for the coach/staff view of Player Passport.
// The page awaits getPlayerPassport (full mode) + resolveBaseballCapabilities +
// getPassportSettingsForEditor in parallel. This skeleton mirrors the
// Living-Annual coach passport layout: back-link + masthead header with the
// scout-packet action + a Paper spread (identity / measurables / performance /
// development story / media / file readiness) + the optional Visibility
// Controls card. Skeleton loaders, never a spinner, on the same deeper-cream
// Paper stock the real page renders on.

import { Skeleton } from '@/components/ui/skeleton';

export default function CoachPlayerPassportLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      {/* Back link */}
      <Skeleton className="mb-6 h-8 w-32 rounded-full" />

      {/* Masthead header: eyebrow + title + lede + "Scout packet" action */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
        <Skeleton className="h-[3px] w-16 rounded-full" />
        <Skeleton className="mt-1 h-4 w-full max-w-md" />
      </div>

      {/* Passport spread — Paper card */}
      <div className="mt-8 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 sm:p-8">
        {/* Headline + exposure badge */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-6 w-40 rounded-full" />
        </div>

        {/* Identity grid */}
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>

        {/* Measurables — 5 ruled stat lines */}
        <div className="mt-8">
          <Skeleton className="mb-3 h-3 w-40" />
          <Skeleton className="mb-5 h-px w-full" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-[1.5px] w-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Baseball Performance */}
        <div className="mt-8">
          <Skeleton className="mb-3 h-3 w-52" />
          <Skeleton className="mb-5 h-px w-full" />
          <Skeleton className="h-10 w-56" />
          <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-10" />
                <Skeleton className="h-6 w-10" />
              </div>
            ))}
          </div>
        </div>

        {/* Development Story */}
        <div className="mt-8">
          <Skeleton className="mb-3 h-3 w-44" />
          <Skeleton className="mb-5 h-px w-full" />
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3.5 w-full max-w-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Media */}
        <div className="mt-8">
          <Skeleton className="mb-3 h-3 w-32" />
          <Skeleton className="mb-5 h-px w-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-fw-md" />
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="mt-8">
          <Skeleton className="h-16 w-full rounded-fw-md" />
        </div>

        {/* File Readiness */}
        <div className="mt-8">
          <Skeleton className="mb-3 h-3 w-32" />
          <Skeleton className="mb-5 h-px w-full" />
          <Skeleton className="h-9 w-24" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>

      {/* Visibility Controls card (coach can edit) */}
      <div className="mt-8 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 sm:p-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-52" />
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-fw-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
