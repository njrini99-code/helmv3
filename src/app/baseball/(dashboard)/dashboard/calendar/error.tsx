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
      route="/baseball/dashboard/calendar"
      component="BaseballCalendarPage"
      title="Failed to load calendar"
      message="We couldn't load the calendar. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
