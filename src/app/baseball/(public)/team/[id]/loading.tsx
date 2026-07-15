import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Public team profile loading skeleton — mirrors the sibling program/[id]
 * skeleton (header + team card + roster/staff cards + sidebar) but sized for
 * this page's wider two-column layout (max-w-[1536px], not 720px).
 *
 * Must color-match the real header + cards in page.tsx (`bg-[var(--paper)]`
 * header on a `bg-[var(--paper-canvas)]` root, `<PaperCard>` cream surfaces)
 * or the page visibly shifts tone the instant content mounts.
 */
export default function TeamProfileLoading() {
  return (
    <div className="min-h-dvh bg-[var(--paper-canvas)]">
      {/* Header */}
      <div className="border-b border-[color:var(--hairline)] bg-[var(--paper)]">
        <div className="max-w-[1536px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1536px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Team Header */}
            <PaperCard className="overflow-hidden p-8">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6">
                <Skeleton className="w-24 h-24 rounded-fw-md" />
                <div className="w-full flex-1 space-y-3">
                  <Skeleton className="h-8 w-64" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
              <div className="mt-8 space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </PaperCard>

            {/* Roster */}
            <PaperCard className="overflow-hidden">
              <div className="p-6 border-b border-[color:var(--hairline)] bg-[var(--paper-canvas)]">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="divide-y divide-[color:var(--hairline)]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-4 flex items-center gap-4">
                    <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            </PaperCard>

            {/* Staff */}
            <PaperCard className="overflow-hidden">
              <div className="p-6 border-b border-[color:var(--hairline)] bg-[var(--paper-canvas)]">
                <Skeleton className="h-6 w-40" />
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-4"
                    >
                      <div className="flex items-start gap-4">
                        <Skeleton className="w-16 h-16 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PaperCard>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Quick Facts Card */}
            <PaperCard className="p-6 space-y-4">
              <Skeleton className="h-5 w-24" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </PaperCard>

            {/* Contact Card */}
            <PaperCard className="p-6 space-y-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32" />
            </PaperCard>
          </div>
        </div>
      </div>
    </div>
  );
}
