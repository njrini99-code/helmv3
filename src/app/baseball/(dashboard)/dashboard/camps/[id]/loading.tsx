import { Header } from '@/components/layout/header';

export default function CampDetailLoading() {
  return (
    <>
      <Header title="Camp Details" />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Camp Info Skeleton */}
        <div className="glass-standard rounded-2xl p-6 animate-pulse">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200" />
                <div>
                  <div className="h-3 w-12 bg-slate-200 rounded mb-1" />
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-standard rounded-xl p-4 animate-pulse">
              <div className="h-3 w-12 bg-slate-200 rounded mb-2" />
              <div className="h-7 w-8 bg-slate-200 rounded" />
            </div>
          ))}
        </div>

        {/* Roster Skeleton */}
        <div className="glass-standard rounded-2xl overflow-clip animate-pulse">
          <div className="px-6 py-4 border-b border-slate-100/50 flex items-center justify-between">
            <div className="h-5 w-24 bg-slate-200 rounded" />
            <div className="h-8 w-48 bg-slate-200 rounded" />
          </div>
          <div className="divide-y divide-slate-100/50">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-slate-200 rounded mb-1" />
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                </div>
                <div className="h-6 w-20 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
