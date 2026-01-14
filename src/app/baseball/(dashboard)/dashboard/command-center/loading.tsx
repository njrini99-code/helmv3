export default function CommandCenterLoading() {
  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-slate-200 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Stats Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 bg-slate-200 rounded-lg animate-pulse" />
              </div>
              <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse mt-2" />
            </div>
          ))}
        </div>

        {/* Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Search Skeleton */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <div className="h-10 bg-slate-200 rounded-lg animate-pulse" />
            </div>

            {/* Cards Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-slate-200 rounded-full animate-pulse" />
                    <div>
                      <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-slate-200 rounded animate-pulse mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="bg-slate-100 rounded-lg p-2">
                        <div className="h-3 w-8 bg-slate-200 rounded animate-pulse mx-auto" />
                        <div className="h-5 w-12 bg-slate-200 rounded animate-pulse mx-auto mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Skeleton */}
          <div className="space-y-4">
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <div className="h-5 w-24 bg-slate-200 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-slate-50 rounded-lg p-3 border border-slate-100"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-slate-200 rounded-lg animate-pulse" />
                      <div className="flex-1">
                        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                        <div className="h-3 w-full bg-slate-200 rounded animate-pulse mt-2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
