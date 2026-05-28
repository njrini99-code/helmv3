import { Shimmer, ShimmerCard } from '@/components/ui/shimmer';

export default function Loading() {
  return (
    <div className="min-h-full bg-transparent">
      {/* Header placeholder */}
      <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-warm-200/30 pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-[720px] mx-auto px-4 md:px-6 py-5">
          <Shimmer className="h-7 w-44 rounded-lg" />
          <Shimmer className="h-3 w-72 mt-2" />
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* Day group 1 */}
        <section>
          <Shimmer className="h-4 w-24 mb-2" />
          <ShimmerCard className="px-5 py-1 rounded-2xl">
            <div className="divide-y divide-warm-100">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 py-3">
                  <Shimmer staggerIndex={i} className="w-9 h-9 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Shimmer staggerIndex={i} className="h-3 w-40" />
                    <Shimmer staggerIndex={i} className="h-4 w-3/4" />
                    <Shimmer staggerIndex={i} className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </ShimmerCard>
        </section>

        {/* Day group 2 */}
        <section>
          <Shimmer className="h-4 w-20 mb-2" />
          <ShimmerCard className="px-5 py-1 rounded-2xl">
            <div className="flex items-start gap-3 py-3">
              <Shimmer className="w-9 h-9 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3 w-40" />
                <Shimmer className="h-4 w-2/3" />
              </div>
            </div>
          </ShimmerCard>
        </section>
      </div>
    </div>
  );
}
