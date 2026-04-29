export default function Loading() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Back Button Skeleton */}
        <div className="h-5 w-32 bg-warm-100/60 rounded skeleton-shimmer mb-6" />

        {/* Qualifier Header Skeleton */}
        <div className="surface-matte rounded-3xl overflow-clip p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="h-8 w-64 bg-warm-200/60 rounded skeleton-shimmer mb-2" />
              <div className="h-5 w-96 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
            <div className="h-8 w-24 bg-warm-100/60 rounded-full skeleton-shimmer" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-warm-200">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-4 w-20 bg-warm-100/60 rounded skeleton-shimmer mb-1" />
                <div className="h-6 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-warm-200">
            <div className="h-4 w-16 bg-warm-100/60 rounded skeleton-shimmer mb-1" />
            <div className="h-6 w-48 bg-warm-200/60 rounded skeleton-shimmer mb-1" />
            <div className="h-5 w-40 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
        </div>

        {/* Leaderboard Skeleton */}
        <div className="surface-matte rounded-3xl overflow-clip p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-5 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>

          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-5 w-8 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-5 w-48 flex-1 bg-warm-200/60 rounded skeleton-shimmer" />
                <div className="h-5 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-5 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-5 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-5 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
