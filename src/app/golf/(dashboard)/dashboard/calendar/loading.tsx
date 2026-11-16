import { CalendarRouteSkeleton } from '@/clubhouse/screens/calendar/CalendarSkeleton';

export default function Loading() {
  // The address's `?view=` (day, month, list) decides the skeleton's view (GAP-S-17).
  return <CalendarRouteSkeleton />;
}
