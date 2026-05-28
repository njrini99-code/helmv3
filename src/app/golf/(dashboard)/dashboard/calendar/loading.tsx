import { CalendarSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="h-[calc(100dvh-64px-5.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-64px)] p-4 md:p-6">
      <CalendarSkeleton />
    </div>
  );
}
