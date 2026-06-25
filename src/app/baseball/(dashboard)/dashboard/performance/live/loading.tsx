import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-cream-50">
      {/* Top bar skeleton */}
      <div className="sticky top-0 z-30 border-b border-warm-200 bg-cream-50/95 px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-5 w-48 rounded-md" />
          <div className="ml-auto flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-20 rounded-md" />
            ))}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="mx-auto max-w-[1600px] p-4">
        <div className="grid gap-4 xl:grid-cols-4">
          {/* Athlete grid */}
          <div className="xl:col-span-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          </div>
          {/* Right rail */}
          <div className="space-y-3">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
