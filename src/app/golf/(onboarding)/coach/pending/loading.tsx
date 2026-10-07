import { Skeleton, SkeletonText } from '@/components/fairway';

/**
 * Route fallback shaped like the page: one centred card with a title, two paragraphs and two actions (STATE-X1).
 */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-fw-lg border border-border-subtle bg-surface p-8">
        <Skeleton className="h-9 w-4/5" />
        <SkeletonText lines={3} className="mt-4" />
        <div className="mt-8 flex gap-3">
          <Skeleton className="h-10 w-32 rounded-fw-md" />
          <Skeleton className="h-10 w-24 rounded-fw-md" />
        </div>
      </div>
    </main>
  );
}
