import { AnnouncementCardSkeleton } from '@/components/ui/skeleton';
import { Shimmer } from '@/components/ui/shimmer';

export default function Loading() {
  return (
    <div className="min-h-full">
      {/* Header skeleton */}
      <div className="sticky top-0 z-20 border-b border-warm-200/30 bg-cream-100/60 backdrop-blur-sm pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-[720px] mx-auto px-4 md:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Shimmer className="h-7 w-48" />
              <Shimmer variant="line" className="w-32" />
            </div>
            <Shimmer className="h-10 w-44 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-[720px] mx-auto px-4 md:px-6 py-8 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <AnnouncementCardSkeleton key={i} delay={i * 80} />
        ))}
      </div>
    </div>
  );
}
