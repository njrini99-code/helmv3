export default function Loading() {
  return (
    <div className="min-h-full bg-transparent">
      {/* Header skeleton */}
      <div className="golf-mobile-page-header bg-white/70 backdrop-blur-xl border-white/20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
          <div className="flex items-center gap-3">
            <div className="h-5 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
            <div className="space-y-1.5">
              <div className="h-6 w-36 bg-warm-200/60 rounded skeleton-shimmer" />
              <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column skeleton */}
          <div className="lg:col-span-5 space-y-6">
            {/* Player header card */}
            <div className="glass-premium rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-warm-100/60 skeleton-shimmer flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-6 w-40 bg-warm-200/60 rounded skeleton-shimmer" />
                  <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
                  <div className="h-5 w-20 bg-warm-100/60 rounded-full skeleton-shimmer" />
                </div>
                <div className="w-[88px] h-[88px] rounded-full bg-warm-100/60 skeleton-shimmer flex-shrink-0" />
              </div>
            </div>

            {/* Category breakdown */}
            <div className="glass-premium rounded-2xl p-6">
              <div className="h-5 w-40 bg-warm-200/60 rounded skeleton-shimmer mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-4 w-20 bg-warm-100/60 rounded skeleton-shimmer flex-shrink-0" />
                    <div className="flex-1 h-2.5 bg-warm-100/60 rounded-full skeleton-shimmer" />
                    <div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Trend summary */}
            <div className="glass-premium rounded-2xl p-6">
              <div className="h-5 w-32 bg-warm-200/60 rounded skeleton-shimmer mb-4" />
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-3 space-y-2">
                    <div className="h-3 w-full bg-warm-100/60 rounded skeleton-shimmer" />
                    <div className="h-6 w-12 bg-warm-200/60 rounded skeleton-shimmer mx-auto" />
                  </div>
                ))}
              </div>
            </div>

            {/* Patterns */}
            <div className="glass-premium rounded-2xl p-6">
              <div className="h-5 w-32 bg-warm-200/60 rounded skeleton-shimmer mb-4" />
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-warm-200/60 skeleton-shimmer" />
                      <div className="h-4 w-36 bg-warm-200/60 rounded skeleton-shimmer" />
                    </div>
                    <div className="h-3 w-full bg-warm-100/60 rounded skeleton-shimmer" />
                    <div className="h-3 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column skeleton */}
          <div className="lg:col-span-7 space-y-6">
            {/* Insights */}
            <div className="glass-premium rounded-2xl p-6">
              <div className="h-5 w-24 bg-warm-200/60 rounded skeleton-shimmer mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
                      <div className="h-4 w-40 bg-warm-200/60 rounded skeleton-shimmer" />
                    </div>
                    <div className="h-3 w-full bg-warm-100/60 rounded skeleton-shimmer" />
                    <div className="h-3 w-3/4 bg-warm-100/60 rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>

            {/* Focus areas */}
            <div className="glass-premium rounded-2xl p-6">
              <div className="h-5 w-28 bg-warm-200/60 rounded skeleton-shimmer mb-4" />
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-4 space-y-2">
                    <div className="h-4 w-36 bg-warm-200/60 rounded skeleton-shimmer" />
                    <div className="h-1.5 w-full bg-warm-100/60 rounded-full skeleton-shimmer" />
                    <div className="h-3 w-20 bg-warm-100/60 rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>

            {/* Rounds */}
            <div className="glass-premium rounded-2xl p-6">
              <div className="h-5 w-32 bg-warm-200/60 rounded skeleton-shimmer mb-4" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-warm-50/60 rounded-xl p-3.5 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <div className="h-4 w-36 bg-warm-200/60 rounded skeleton-shimmer" />
                      <div className="h-3 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="h-6 w-10 bg-warm-200/60 rounded skeleton-shimmer ml-auto" />
                      <div className="h-3 w-8 bg-warm-100/60 rounded skeleton-shimmer ml-auto" />
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
