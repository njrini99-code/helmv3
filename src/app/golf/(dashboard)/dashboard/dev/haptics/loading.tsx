import { Skeleton, SkeletonList } from '@/components/fairway';

/** Route fallback shaped like the haptics lab: a header, then a list of rows (STATE-X1). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-24 pt-[max(1.5rem,calc(env(safe-area-inset-top,0px)+0.75rem))]">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-8 w-40" />
      <SkeletonList rows={8} />
    </div>
  );
}
