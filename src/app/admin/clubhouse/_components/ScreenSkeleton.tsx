import { Skeleton } from '@/components/fairway';

/**
 * BR-xx90: a Clubhouse screen loading, shaped like the anatomy it becomes (plan §7.5): the title and question, the
 * truth line, the scope bar, then rows.
 */
export function ScreenSkeleton({ code, rows = 8 }: { code: string; rows?: number }) {
  return (
    <div data-br={code} aria-busy="true" className="min-w-0 space-y-4">
      <span className="sr-only">Loading</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-3 w-full max-w-xl" />
      <Skeleton className="h-12 w-full rounded-fw-md" />
      <div className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
