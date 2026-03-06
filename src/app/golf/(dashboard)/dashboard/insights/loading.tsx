export default function Loading() {
  return (
    <div className="relative">
      <div className="sticky top-0 z-10 border-b border-warm-200/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 skeleton-shimmer rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 w-32 skeleton-shimmer rounded" />
                <div className="h-3 w-56 skeleton-shimmer rounded" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-24 skeleton-shimmer rounded-lg" />
              <div className="h-9 w-9 skeleton-shimmer rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-standard rounded-2xl p-5 space-y-2">
              <div className="h-3 w-20 skeleton-shimmer rounded" />
              <div className="h-7 w-12 skeleton-shimmer rounded" />
            </div>
          ))}
        </div>

        <div className="h-10 w-full max-w-md skeleton-shimmer rounded-xl" />

        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-standard rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 skeleton-shimmer rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 skeleton-shimmer rounded" />
                  <div className="h-3 w-full skeleton-shimmer rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
