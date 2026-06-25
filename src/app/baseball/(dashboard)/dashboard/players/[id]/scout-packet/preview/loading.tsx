// Route-level skeleton for the Scout Packet preview (staff "see as a scout").
// The page awaits getScoutPacketPreview before rendering ScoutPacketView.
// This skeleton mirrors the public ScoutPacketView layout:
// back-link + preview banner + hero card + measurables + performance.

import { Skeleton } from '@/components/ui/skeleton';

export default function CoachScoutPacketPreviewLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        {/* Back link */}
        <Skeleton className="h-4 w-32" />
        {/* Preview banner */}
        <Skeleton className="mt-3 h-10 w-full rounded-xl" />
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-12">
        {/* Hero card */}
        <div className="rounded-3xl border border-warm-200 bg-cream-50 px-6 py-7 shadow-card sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          {/* Identity chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-warm-100 pt-4">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        </div>

        {/* Measurables section */}
        <div className="mt-6 rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Performance section */}
        <div className="mt-6 rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-3 w-24 mb-2" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Contact rules section */}
        <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/50 p-5 sm:p-6">
          <div className="flex items-start gap-2.5">
            <Skeleton className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1.5 w-full">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-full max-w-xs" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
