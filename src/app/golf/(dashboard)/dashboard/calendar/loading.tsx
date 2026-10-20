import { FairwayCalendarSkeleton } from '@/components/fairway/pages/calendar/FairwayCalendarSkeleton';
import { fairwayScope } from '@/lib/redesign/flag';
import { ClubhouseSwitch } from '@/clubhouse/shell/ClubhouseSwitch';
import { CalendarSkeleton } from '@/clubhouse/screens/calendar/CalendarSkeleton';

export default function Loading() {
  // P235: the live Fairway calendar defaults to an AGENDA view (hero plinth +
  // day strip + agenda list), so the route skeleton mirrors THAT first paint
  // in Fairway tokens.
  return (
    <ClubhouseSwitch
      clubhouse={<CalendarSkeleton />}
      fallback={
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <FairwayCalendarSkeleton />
        </div>
      }
    />
  );
}
