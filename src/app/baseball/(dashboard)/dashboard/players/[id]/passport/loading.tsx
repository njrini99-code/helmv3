// Route-level skeleton for the coach/staff view of Player Passport.
// The page awaits getPlayerPassport (full mode) + resolveBaseballCapabilities +
// getPassportSettingsForEditor in parallel. This skeleton mirrors the coach
// passport layout: back-link + header with action button + PlayerPassportCard +
// optional VisibilityControls.

import { Skeleton } from '@/components/ui/skeleton';

export default function CoachPlayerPassportLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back link */}
        <Skeleton className="mb-6 h-4 w-28" />

        {/* Page header: title + "Scout packet" action button */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-9 w-56" />
            <Skeleton className="mt-2 h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>

        {/* Passport card */}
        <div className="rounded-2xl border border-warm-200 bg-cream-50 p-6 shadow-card sm:p-8">
          {/* Card header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-40" />
              </div>
            </div>
            <Skeleton className="h-7 w-32 rounded-full" />
          </div>

          {/* Identity grid */}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>

          {/* Measurables */}
          <div className="mt-6">
            <Skeleton className="mb-3 h-4 w-36" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          </div>

          {/* Performance section */}
          <div className="mt-7">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Development story */}
          <div className="mt-7">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          </div>

          {/* Completeness meter */}
          <div className="mt-6">
            <Skeleton className="mb-3 h-4 w-36" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          </div>
        </div>

        {/* Visibility Controls card (coach can edit) */}
        <div className="mt-8 rounded-2xl border border-warm-200 bg-cream-50 p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-52" />
            </div>
          </div>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
