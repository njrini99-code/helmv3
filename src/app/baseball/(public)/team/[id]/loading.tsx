import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

/**
 * Public team profile loading skeleton — mirrors the sibling program/[id]
 * skeleton (header + team card + roster/staff cards + sidebar) but sized for
 * this page's wider two-column layout (max-w-[1536px], not 720px).
 */
export default function TeamProfileLoading() {
  return (
    <div className="min-h-dvh bg-[#FAF6F1]">
      {/* Header */}
      <div className="bg-cream-50 border-b border-warm-200">
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
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-primary-50 to-white p-8 border-b border-warm-200">
                <div className="flex items-start gap-6">
                  <Skeleton className="w-24 h-24 rounded-lg" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-8 w-64" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-cream-50 space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </Card>

            {/* Roster */}
            <Card className="overflow-hidden">
              <div className="p-6 border-b border-warm-200 bg-cream-50">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="divide-y divide-warm-100">
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
            </Card>

            {/* Staff */}
            <Card className="overflow-hidden">
              <div className="p-6 border-b border-warm-200">
                <Skeleton className="h-6 w-40" />
              </div>
              <div className="p-6 bg-warm-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="bg-cream-50 rounded-lg border border-warm-200 p-4"
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
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Quick Facts Card */}
            <Card className="p-6 space-y-4">
              <Skeleton className="h-5 w-24" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </Card>

            {/* Contact Card */}
            <Card className="p-6 space-y-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32" />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
