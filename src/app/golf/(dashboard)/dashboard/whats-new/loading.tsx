export default function Loading() {
  return (
    <div className="min-h-full bg-transparent">
      {/* Header placeholder */}
      <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-warm-200/30 pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-5">
          <div className="h-7 w-44 skeleton-shimmer rounded-lg" />
          <div className="h-3 w-72 skeleton-shimmer rounded mt-2" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* Day group 1 */}
        <section>
          <div className="h-4 w-24 skeleton-shimmer rounded mb-2" />
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl px-5 py-1 divide-y divide-warm-100">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3 py-3">
                <div className="w-9 h-9 rounded-xl skeleton-shimmer flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 skeleton-shimmer rounded" />
                  <div className="h-4 w-3/4 skeleton-shimmer rounded" />
                  <div className="h-3 w-1/2 skeleton-shimmer rounded" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Day group 2 */}
        <section>
          <div className="h-4 w-20 skeleton-shimmer rounded mb-2" />
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl px-5 py-1">
            <div className="flex items-start gap-3 py-3">
              <div className="w-9 h-9 rounded-xl skeleton-shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 skeleton-shimmer rounded" />
                <div className="h-4 w-2/3 skeleton-shimmer rounded" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
