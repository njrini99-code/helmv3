import { Header } from '@/components/layout/header';

export default function WatchlistLoading() {
  return (
    <>
      <Header title="Watchlist" subtitle="Loading..." />
      <div className="p-6 lg:p-8">
        {/* Filter skeleton */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        
        {/* Table skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-6">
              <div className="h-4 w-4 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
          
          {/* Row skeletons */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-6">
                <div className="h-4 w-4 bg-slate-200 rounded animate-pulse" />
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-slate-200 rounded-full animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-4 w-12 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-12 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                <div className="h-6 w-20 bg-slate-200 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
