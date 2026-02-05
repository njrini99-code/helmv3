import { ShineEffect } from '@/components/ui/shine-effect';

export default function TeamStatsLoading() {
  return (
    <div className="min-h-full">
      {/* Header Skeleton */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-4 w-32 bg-slate-100 rounded mt-2 animate-pulse" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="relative glass-standard rounded-2xl overflow-hidden">
          <ShineEffect />

          {/* Header Row */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-200/60">
            <div className="w-32 h-4 bg-slate-200 rounded animate-pulse" />
            <div className="w-16 h-4 bg-slate-200 rounded animate-pulse" />
            <div className="w-16 h-4 bg-slate-200 rounded animate-pulse" />
            <div className="w-16 h-4 bg-slate-200 rounded animate-pulse" />
            <div className="w-16 h-4 bg-slate-200 rounded animate-pulse hidden md:block" />
            <div className="w-16 h-4 bg-slate-200 rounded animate-pulse hidden lg:block" />
            <div className="w-16 h-4 bg-slate-200 rounded animate-pulse hidden lg:block" />
          </div>

          {/* Row Skeletons */}
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-4 border-b border-slate-100"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-9 h-9 rounded-lg bg-slate-200 animate-pulse" />
                <div>
                  <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
                  <div className="w-16 h-3 bg-slate-100 rounded mt-1 animate-pulse" />
                </div>
              </div>
              <div className="w-10 h-5 bg-slate-100 rounded animate-pulse" />
              <div className="w-12 h-5 bg-slate-100 rounded animate-pulse" />
              <div className="w-10 h-5 bg-slate-100 rounded animate-pulse" />
              <div className="w-10 h-5 bg-slate-100 rounded animate-pulse hidden md:block" />
              <div className="w-14 h-5 bg-slate-100 rounded animate-pulse hidden lg:block" />
              <div className="w-14 h-5 bg-slate-100 rounded animate-pulse hidden lg:block" />
            </div>
          ))}

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-50/50">
            <div className="w-32 h-4 bg-slate-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
