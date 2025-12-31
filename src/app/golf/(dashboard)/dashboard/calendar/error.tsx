'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/golf/dashboard/calendar"
      component="CalendarPage"
      title="Failed to load calendar"
      message="We couldn't load your calendar. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
