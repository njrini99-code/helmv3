import { Header } from '@/components/layout/header';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <>
      <Header title="Development Plans" subtitle="Create and manage player development plans" />
      <div className="p-6 lg:p-8">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-6">
          {['All Plans', 'Active', 'Completed'].map((_, i) => (
            <Skeleton key={i} variant="rectangular" width={i === 0 ? 80 : 70} height={36} className="rounded-full" />
          ))}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-warm-200 p-6 animate-pulse"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <Skeleton variant="text" width="70%" height={18} className="mb-2" />
                  <Skeleton variant="text" width="50%" height={14} />
                </div>
                <Skeleton variant="rectangular" width={70} height={24} className="rounded-full" />
              </div>

              {/* Player info */}
              <div className="flex items-center gap-3 pt-4 border-t border-warm-100 mb-4">
                <Skeleton variant="circular" width={32} height={32} />
                <div className="flex-1">
                  <Skeleton variant="text" width="60%" className="mb-1" />
                  <Skeleton variant="text" width="40%" height={12} />
                </div>
              </div>

              {/* Goals */}
              <div className="space-y-2 mb-4">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton variant="rectangular" width={16} height={16} className="rounded" />
                    <Skeleton variant="text" width="80%" height={12} />
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-warm-100">
                <Skeleton variant="text" width={80} height={12} />
                <Skeleton variant="rectangular" width={80} height={32} className="rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
