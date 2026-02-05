import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>

        <div className="glass-standard rounded-2xl overflow-hidden p-12 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-full mb-4" />
          <Skeleton className="h-6 w-48 mx-auto mb-2" />
          <Skeleton className="h-5 w-64 mx-auto mb-4" />
          <Skeleton className="h-10 w-40 mx-auto rounded-lg" />
        </div>
      </div>
    </div>
  );
}
