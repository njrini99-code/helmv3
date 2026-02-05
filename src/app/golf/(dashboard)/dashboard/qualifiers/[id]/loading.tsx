import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Back Button Skeleton */}
        <Skeleton className="h-5 w-32 mb-6" />

        {/* Qualifier Header Skeleton */}
        <div className="glass-standard rounded-2xl overflow-hidden p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-5 w-96" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-200">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200">
            <Skeleton className="h-4 w-16 mb-1" />
            <Skeleton className="h-6 w-48 mb-1" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>

        {/* Leaderboard Skeleton */}
        <div className="glass-standard rounded-2xl overflow-hidden p-6">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>

          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-5 w-48 flex-1" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
