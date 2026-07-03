import { Shimmer, ShimmerCard } from '@/components/ui/shimmer';

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Shimmer className="h-8 w-48" />
        <Shimmer variant="line" className="w-72" />
      </div>
      <ShimmerCard className="bg-cream-50 rounded-2xl border border-warm-200 p-6">
        <Shimmer className="h-6 w-1/3 mb-4" />
        <div className="grid grid-cols-9 gap-2 mb-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Shimmer key={i} className="h-12" staggerIndex={i} />
          ))}
        </div>
        <Shimmer className="h-10 w-32 rounded-lg" />
      </ShimmerCard>
    </div>
  );
}
