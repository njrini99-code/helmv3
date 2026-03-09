export default function HubLoading() {
  return (
    <div className="min-h-full">
      {/* Header skeleton */}
      <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-5">
          <div className="h-7 w-52 skeleton-shimmer rounded-lg" />
          <div className="h-4 w-36 skeleton-shimmer rounded-md mt-2" />
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="sticky top-[73px] z-10 bg-white/80 backdrop-blur-sm border-b border-warm-100">
        <div className="max-w-3xl mx-auto px-4 md:px-6 flex gap-4 py-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-5 w-16 skeleton-shimmer rounded" />
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">
        {/* Trip card skeleton */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-4 skeleton-shimmer rounded" />
            <div className="h-4 w-28 skeleton-shimmer rounded" />
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white/70 rounded-2xl border border-white/20 p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 skeleton-shimmer rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 skeleton-shimmer rounded" />
                  <div className="h-3 w-28 skeleton-shimmer rounded" />
                  <div className="h-3 w-36 skeleton-shimmer rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Task card skeleton */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-4 skeleton-shimmer rounded" />
            <div className="h-4 w-16 skeleton-shimmer rounded" />
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/70 rounded-2xl border border-white/20 p-5">
              <div className="flex items-start gap-4">
                <div className="w-7 h-7 skeleton-shimmer rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-44 skeleton-shimmer rounded" />
                  <div className="h-3 w-32 skeleton-shimmer rounded" />
                  <div className="h-3 w-20 skeleton-shimmer rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
