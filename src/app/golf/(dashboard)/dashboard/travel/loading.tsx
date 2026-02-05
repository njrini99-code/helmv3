import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-h-full">
      {/* Header Skeleton */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="glass-standard rounded-2xl p-16">
          <Skeleton className="h-16 w-16 rounded-2xl mx-auto mb-4" />
          <Skeleton className="h-6 w-48 mx-auto mb-2" />
          <Skeleton className="h-4 w-80 mx-auto" />
        </div>
      </div>
    </div>
  );
}
