import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
