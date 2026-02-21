import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerStatsLoading() {
  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <Skeleton className="h-8 w-32 mb-4" />
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-standard rounded-xl p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>

        {/* Stats Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-standard rounded-2xl p-4">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-8 w-16 mb-2" />
              <div className="pt-2 border-t border-warm-100">
                <Skeleton className="h-3 w-16 mb-1" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="glass-standard rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Skeleton className="h-6 w-40 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <div className="glass-standard rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Skeleton className="h-6 w-40 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>

        {/* Session History */}
        <div className="glass-standard rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-warm-100">
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-6 w-40 mb-1" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-8 w-40" />
            </div>
          </div>
          <div className="divide-y divide-warm-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
