export default function SignalsLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="h-8 w-40 bg-warm-200 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-warm-200 rounded-lg animate-pulse mt-2" />
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-24 bg-warm-200 rounded-xl animate-pulse" />
          ))}
        </div>

        {/* View toggle */}
        <div className="h-12 w-80 bg-warm-200 rounded-2xl animate-pulse mb-5" />

        {/* Signal cards */}
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-cream-100/75 border border-warm-200/50 rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex gap-1.5 mb-2">
                    <div className="h-5 w-16 bg-warm-200 rounded animate-pulse" />
                    <div className="h-5 w-20 bg-warm-200 rounded animate-pulse" />
                  </div>
                  <div className="h-5 w-3/4 bg-warm-200 rounded animate-pulse" />
                  <div className="h-3 w-32 bg-warm-200 rounded animate-pulse mt-2" />
                </div>
                <div className="h-6 w-20 bg-warm-200 rounded animate-pulse" />
              </div>
              <div className="h-4 w-full bg-warm-200 rounded animate-pulse mt-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
