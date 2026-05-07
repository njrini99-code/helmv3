import { Shimmer, ShimmerCard } from '@/components/ui/shimmer';

export default function Loading() {
  return (
    <div className="min-h-full bg-transparent">
      {/* Header skeleton */}
      <div className="sticky top-0 z-20 border-b border-warm-200/30 bg-white/70 backdrop-blur-xl pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
          <div className="flex items-center gap-3">
            <Shimmer className="h-5 w-16" />
            <div className="space-y-1.5">
              <Shimmer className="h-6 w-36" />
              <Shimmer className="h-4 w-24" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column skeleton */}
          <div className="lg:col-span-5 space-y-6">
            {/* Player header card */}
            <ShimmerCard className="rounded-3xl p-6">
              <div className="flex items-start gap-4">
                <Shimmer className="w-14 h-14 rounded-2xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Shimmer className="h-6 w-40" />
                  <Shimmer className="h-4 w-32" />
                  <Shimmer className="h-5 w-20 rounded-full" />
                </div>
                <Shimmer variant="circle" className="w-[88px] flex-shrink-0" />
              </div>
            </ShimmerCard>

            {/* Category breakdown */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-40 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Shimmer staggerIndex={i} className="h-4 w-20 flex-shrink-0" />
                    <Shimmer staggerIndex={i} className="flex-1 h-2.5 rounded-full" />
                    <Shimmer staggerIndex={i} className="h-4 w-8 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Trend summary */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-32 mb-4" />
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-3 space-y-2">
                    <Shimmer staggerIndex={i} className="h-3 w-full" />
                    <Shimmer staggerIndex={i} className="h-6 w-12 mx-auto" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Patterns */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-32 mb-4" />
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Shimmer staggerIndex={i} variant="circle" className="w-2" />
                      <Shimmer staggerIndex={i} className="h-4 w-36" />
                    </div>
                    <Shimmer staggerIndex={i} className="h-3 w-full" />
                    <Shimmer staggerIndex={i} className="h-3 w-24" />
                  </div>
                ))}
              </div>
            </ShimmerCard>
          </div>

          {/* Right column skeleton */}
          <div className="lg:col-span-7 space-y-6">
            {/* Insights */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-24 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Shimmer staggerIndex={i} className="h-4 w-16" />
                      <Shimmer staggerIndex={i} className="h-4 w-40" />
                    </div>
                    <Shimmer staggerIndex={i} className="h-3 w-full" />
                    <Shimmer staggerIndex={i} className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Focus areas */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-28 mb-4" />
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <Shimmer staggerIndex={i} className="h-4 w-36" />
                    <Shimmer staggerIndex={i} className="h-1.5 w-full rounded-full" />
                    <Shimmer staggerIndex={i} className="h-3 w-20" />
                  </div>
                ))}
              </div>
            </ShimmerCard>

            {/* Rounds */}
            <ShimmerCard className="rounded-3xl p-6">
              <Shimmer className="h-5 w-32 mb-4" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-3.5 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <Shimmer staggerIndex={i} className="h-4 w-36" />
                      <Shimmer staggerIndex={i} className="h-3 w-24" />
                    </div>
                    <div className="space-y-1 text-right">
                      <Shimmer staggerIndex={i} className="h-6 w-10 ml-auto" />
                      <Shimmer staggerIndex={i} className="h-3 w-8 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            </ShimmerCard>
          </div>
        </div>
      </div>
    </div>
  );
}
