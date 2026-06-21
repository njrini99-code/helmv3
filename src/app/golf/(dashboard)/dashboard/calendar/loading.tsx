import { CalendarSkeleton } from '@/components/ui/skeleton';
import { FairwayCalendarSkeleton } from '@/components/fairway/pages/calendar/FairwayCalendarSkeleton';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';

export default function Loading() {
  // P235: the live Fairway calendar defaults to an AGENDA view (hero plinth +
  // day strip + agenda list), so the route skeleton must mirror THAT first
  // paint in Fairway tokens — not the legacy week TIME-GRID skeleton, which
  // caused a palette flip + layout shift when the real surface mounted. The
  // legacy CalendarSkeleton stays only on the flag-off (legacy) fork.
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayCalendarSkeleton />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-64px-5.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-64px)] p-4 md:p-6">
      <CalendarSkeleton />
    </div>
  );
}
