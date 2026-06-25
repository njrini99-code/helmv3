// Route-level skeleton for the Scout Packet management surface (coach).
// The page awaits playerRow + settingsRow + programSettings + listScoutPacketLinks +
// getScoutPacketPreview in parallel. This skeleton mirrors the ScoutPacketManager
// layout: back-link + header + guardrail notice + mint form + links list.

import { Skeleton } from '@/components/ui/skeleton';

export default function CoachScoutPacketLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back link */}
        <Skeleton className="mb-6 h-4 w-28" />

        {/* Page header */}
        <div className="mb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-9 w-52" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>

        {/* ScoutPacketManager card */}
        <div className="rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>

          {/* Mint form: recipient input + expiry select + button */}
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>

          {/* Preview link */}
          <Skeleton className="mt-3 h-4 w-32" />

          {/* Links list */}
          <div className="mt-5 space-y-px">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <div className="flex shrink-0 gap-1">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
