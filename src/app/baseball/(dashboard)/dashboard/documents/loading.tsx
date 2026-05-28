import { Skeleton } from '@/components/ui/skeleton';

export default function DocumentsLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-40 mb-2" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-10 w-full max-w-md mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-standard rounded-xl p-4">
              <Skeleton className="h-10 w-10 rounded mb-3" />
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
