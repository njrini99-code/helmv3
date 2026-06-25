import { Skeleton } from '@/components/ui/skeleton';

export default function CollegeInterestLoading() {
  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-4 lg:p-6"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-7 w-12 rounded" />
              </div>
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0 ml-2" />
            </div>
          </div>
        ))}
      </div>

      {/* Interest list card */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48 rounded" />
            <Skeleton className="h-4 w-72 rounded hidden lg:block" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-warm-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-4">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-3 w-28 rounded" />
                  <Skeleton className="h-3 w-36 rounded" />
                </div>
              </div>
              <div className="border-t border-warm-100 pt-3 space-y-2">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-4/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
