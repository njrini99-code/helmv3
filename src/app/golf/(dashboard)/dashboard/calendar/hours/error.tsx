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
      route="/golf/dashboard/calendar/hours"
      component="PracticeHoursPage"
      title="Failed to load practice hours"
      message="We couldn't load practice hours. Please try again."
      homePath="/golf/dashboard/calendar"
    />
  );
}
