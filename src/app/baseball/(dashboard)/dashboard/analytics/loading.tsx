import { Header } from '@/components/layout/header';
import { Skeleton, SkeletonStat } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <>
      <Header title="Analytics" subtitle="Track your recruiting activity over the last 30 days" />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonStat key={i} />
          ))}
        </div>

        {/* Views Chart */}
        <div className="bg-white rounded-2xl border border-warm-200 p-6">
          <div className="mb-6">
            <Skeleton variant="text" width="30%" height={20} className="mb-2" />
            <Skeleton variant="text" width="50%" height={14} />
          </div>
          <Skeleton variant="rectangular" className="w-full h-80" />
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Schools */}
          <div className="bg-white rounded-2xl border border-warm-200 p-6">
            <Skeleton variant="text" width="40%" height={20} className="mb-6" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div className="flex-1">
                    <Skeleton variant="text" width="60%" className="mb-2" />
                    <Skeleton variant="text" width="40%" height={12} />
                  </div>
                  <Skeleton variant="text" width={32} height={12} />
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-warm-200 p-6">
            <Skeleton variant="text" width="40%" height={20} className="mb-6" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton variant="circular" width={8} height={8} className="mt-1.5" />
                  <div className="flex-1">
                    <Skeleton variant="text" width="80%" className="mb-1" />
                    <Skeleton variant="text" width="40%" height={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
