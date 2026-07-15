import { PaperCard } from '@/components/baseball/living-annual';

export default function StatsUploadLoading() {
  return (
    <div className="bg-cream-100">
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8">
        {/* Header skeleton */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-lg bg-warm-200 animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-32 bg-warm-200 rounded animate-pulse" />
            <div className="h-4 w-24 bg-warm-100 rounded animate-pulse" />
          </div>
        </div>

        {/* Progress steps skeleton */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-warm-200 animate-pulse" />
              {i < 4 && <div className="w-8 h-0.5 bg-warm-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Upload area skeleton */}
        <PaperCard className="border-2 border-dashed border-warm-200 p-12" grain={false}>
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-200 animate-pulse mb-4" />
            <div className="h-6 w-48 bg-warm-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-warm-100 rounded animate-pulse mb-6" />
            <div className="h-10 w-28 bg-warm-200 rounded-lg animate-pulse" />
          </div>
        </PaperCard>

        {/* History skeleton */}
        <PaperCard className="mt-8 p-6" grain={false}>
          <div className="h-5 w-32 bg-warm-200 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-warm-50 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-warm-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-warm-200 rounded animate-pulse" />
                  <div className="h-3 w-32 bg-warm-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </PaperCard>
      </div>
    </div>
  );
}
