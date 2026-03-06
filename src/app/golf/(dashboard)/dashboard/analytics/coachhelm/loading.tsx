export default function Loading() {
  return (
    <div className="min-h-full">
      <div className="bg-white/70 backdrop-blur-xl border-b border-white/20 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 skeleton-shimmer rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 w-48 skeleton-shimmer rounded" />
                <div className="h-3 w-64 skeleton-shimmer rounded" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-20 skeleton-shimmer rounded-lg" />
              <div className="h-9 w-20 skeleton-shimmer rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex gap-2 p-1 bg-warm-100/50 rounded-xl w-fit">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-28 skeleton-shimmer rounded-lg" />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-standard rounded-2xl p-6 space-y-3">
              <div className="h-3 w-24 skeleton-shimmer rounded" />
              <div className="h-8 w-16 skeleton-shimmer rounded" />
              <div className="h-3 w-32 skeleton-shimmer rounded" />
            </div>
          ))}
        </div>

        <div className="glass-standard rounded-2xl p-6">
          <div className="h-5 w-32 skeleton-shimmer rounded mb-4" />
          <div className="h-64 w-full skeleton-shimmer rounded-xl" />
        </div>
      </div>
    </div>
  );
}
