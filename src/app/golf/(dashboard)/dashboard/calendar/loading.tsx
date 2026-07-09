import { FairwayCalendarSkeleton } from '@/components/fairway/pages/calendar/FairwayCalendarSkeleton';
import { fairwayScope } from '@/lib/redesign/flag';

export default function Loading() {
  // P235: the live Fairway calendar defaults to an AGENDA view (hero plinth +
  // day strip + agenda list), so the route skeleton mirrors THAT first paint
  // in Fairway tokens.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayCalendarSkeleton />
    </div>
  );
}
