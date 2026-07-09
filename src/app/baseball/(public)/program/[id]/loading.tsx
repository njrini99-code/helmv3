import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function Loading() {
  return (
    <div className="min-h-dvh bg-[#FAF6F1]">
      {/* Header */}
      {/* Must color-match the real header in page.tsx (bg-cream-50 border-warm-200)
          or the header visibly shifts tone the instant content mounts. */}
      <div className="bg-cream-50 border-b border-warm-200">
        <div className="max-w-[720px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[720px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Program Header */}
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-primary-50 to-white p-8 border-b border-warm-200">
                <div className="flex items-start gap-6">
                  <Skeleton className="w-24 h-24 rounded-lg" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-8 w-64" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-cream-50 space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </Card>

            {/* Staff Card */}
            <Card className="overflow-hidden">
              <div className="p-6 border-b border-warm-200">
                <Skeleton className="h-6 w-40" />
              </div>
              <div className="p-6 bg-warm-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="bg-cream-50 rounded-lg border border-warm-200 p-4"
                    >
                      <div className="flex items-start gap-4">
                        <Skeleton className="w-16 h-16 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-full" />
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
            {/* Contact Card */}
            <Card className="p-6 space-y-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </Card>

            {/* Quick Facts Card */}
            <Card className="p-6 space-y-4">
              <Skeleton className="h-5 w-24" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
