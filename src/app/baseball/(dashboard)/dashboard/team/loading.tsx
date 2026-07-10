import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

export default function TeamLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-56 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <PaperCard className="p-6" grain={false}>
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            </PaperCard>
          </div>
          <div className="space-y-4">
            <PaperCard className="p-4" grain={false}>
              <Skeleton className="h-5 w-24 mb-3" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </PaperCard>
            <PaperCard className="p-4" grain={false}>
              <Skeleton className="h-5 w-32 mb-3" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </PaperCard>
          </div>
        </div>
      </div>
    </div>
  );
}
