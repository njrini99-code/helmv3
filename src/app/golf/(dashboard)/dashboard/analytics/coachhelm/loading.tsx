import { Shimmer, ShimmerCard } from '@/components/ui/shimmer';

export default function Loading() {
  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-20 border-b border-warm-200/30 bg-white/70 backdrop-blur-xl pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Shimmer className="w-12 h-12 rounded-xl" />
              <div className="space-y-2">
                <Shimmer className="h-6 w-48" />
                <Shimmer className="h-3 w-64" />
              </div>
            </div>
            <div className="flex gap-2">
              <Shimmer className="h-9 w-20 rounded-lg" />
              <Shimmer className="h-9 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-8">
        <div className="flex gap-2 p-1 bg-warm-100/50 rounded-xl w-fit">
          {[1, 2, 3].map((i) => (
            <Shimmer key={i} staggerIndex={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <ShimmerCard key={i} staggerIndex={i} className="rounded-3xl p-6">
              <div className="space-y-3">
                <Shimmer className="h-3 w-24" />
                <Shimmer className="h-8 w-16" />
                <Shimmer className="h-3 w-32" />
              </div>
            </ShimmerCard>
          ))}
        </div>

        <ShimmerCard className="rounded-3xl p-6">
          <Shimmer className="h-5 w-32 mb-4" />
          <Shimmer className="h-64 w-full rounded-xl" />
        </ShimmerCard>
      </div>
    </div>
  );
}
