import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}
