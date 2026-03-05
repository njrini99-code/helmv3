import { CalendarSkeleton } from '@/components/golf/GolfSkeletons';

export default function Loading() {
  return (
    <div
      className="h-[calc(100vh-64px-5.5rem-env(safe-area-inset-bottom))] md:h-[calc(100vh-64px)] p-4 md:p-6"
      style={{
        background: 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 33%, #FAF5EB 66%, #F5F0E6 100%)',
      }}
    >
      <CalendarSkeleton />
    </div>
  );
}
