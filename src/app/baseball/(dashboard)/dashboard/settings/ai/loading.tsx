import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 rounded-lg" />
        <Skeleton className="h-4 w-96 rounded-lg" />
      </div>
      <div className="rounded-2xl border border-warm-200 bg-white/70 p-6 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-warm-100 last:border-0">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48 rounded-lg" />
              <Skeleton className="h-3 w-64 rounded-lg" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
