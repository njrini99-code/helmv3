export default function NewQualifierLoading() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Header skeleton */}
      <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-warm-100 animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-36 bg-warm-100 rounded animate-pulse" />
              <div className="h-4 w-48 bg-warm-100 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Form skeleton */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Section 1 */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-warm-100 animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-40 bg-warm-100 rounded animate-pulse" />
              <div className="h-4 w-56 bg-warm-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="space-y-5">
            <div className="h-10 bg-warm-100 rounded-lg animate-pulse" />
            <div className="h-24 bg-warm-100 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Section 2 */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-warm-100 animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-32 bg-warm-100 rounded animate-pulse" />
              <div className="h-4 w-48 bg-warm-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div className="h-10 bg-warm-100 rounded-lg animate-pulse" />
            <div className="h-10 bg-warm-100 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Section 3 */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-warm-100 animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-28 bg-warm-100 rounded animate-pulse" />
              <div className="h-4 w-40 bg-warm-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-12 bg-warm-100 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
