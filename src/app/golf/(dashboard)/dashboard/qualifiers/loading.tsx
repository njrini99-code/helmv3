export default function Loading() {
  return (
    <div className="min-h-full">
      {/* Header Skeleton */}
      <div className="border-b border-warm-200/60 bg-cream-100/60 backdrop-blur-sm">
        <div className="max-w-[1280px] mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-40 bg-warm-200/60 rounded-lg skeleton-shimmer mb-2" />
              <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
            <div className="h-10 w-32 bg-warm-200/60 rounded-lg skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="surface-matte rounded-3xl overflow-clip p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="h-6 w-48 bg-warm-200/60 rounded skeleton-shimmer mb-2" />
                  <div className="h-4 w-full bg-warm-100/60 rounded skeleton-shimmer" />
                </div>
                <div className="h-6 w-20 bg-warm-100/60 rounded-full skeleton-shimmer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-4 w-full bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-4 w-full bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
              <div className="mt-4 pt-4 border-t border-warm-100">
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
