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
      route="/baseball/dashboard/events"
      component="BaseballEventsPage"
      title="Failed to load events"
      message="We couldn't load events. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
