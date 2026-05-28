export default function Loading() {
  return (
    <div className="p-6 max-w-[1280px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-9 w-20 bg-warm-100/60 rounded-lg skeleton-shimmer" />
        <div className="flex-1">
          <div className="h-8 w-64 bg-warm-200/60 rounded-lg skeleton-shimmer mb-2" />
          <div className="h-5 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
        <div className="h-9 w-32 bg-warm-200/60 rounded-lg skeleton-shimmer" />
      </div>

      {/* Round Summary Card */}
      <div className="surface-matte rounded-3xl overflow-clip mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <div className="h-6 w-48 bg-warm-200/60 rounded skeleton-shimmer" />
                <div className="h-6 w-20 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-6 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
              <div className="flex items-center gap-6">
                <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            </div>
            <div className="text-right">
              <div className="h-14 w-20 bg-warm-200/60 rounded-lg skeleton-shimmer mb-2" />
              <div className="h-8 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-warm-200">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer mb-2" />
                <div className="h-8 w-16 bg-warm-200/60 rounded skeleton-shimmer mb-1" />
                <div className="h-3 w-12 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scorecard */}
      <div className="surface-matte rounded-3xl overflow-clip">
        <div className="p-4 border-b border-warm-200">
          <div className="h-6 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
        </div>
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200">
                  <th className="text-left py-3 px-3"><div className="h-4 w-12 bg-warm-100/60 rounded skeleton-shimmer" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-12 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-12 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <tr key={i} className="border-b border-warm-100">
                    <td className="py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-6 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
