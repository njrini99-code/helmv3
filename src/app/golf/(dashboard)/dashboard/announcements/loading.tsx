import { AnnouncementCardSkeleton } from '@/components/golf/GolfSkeletons';

export default function Loading() {
  return (
    <div className="min-h-full">
      {/* Header skeleton */}
      <div className="golf-mobile-page-header bg-white/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-48 bg-warm-200/60 rounded animate-pulse" />
              <div className="h-4 w-32 bg-warm-100/60 rounded animate-pulse" />
            </div>
            <div className="h-10 w-44 bg-warm-200/60 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <AnnouncementCardSkeleton key={i} delay={i * 80} />
        ))}
      </div>
    </div>
  );
}
