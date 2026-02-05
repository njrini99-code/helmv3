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
      route="/golf/dashboard/insights"
      component="InsightsPage"
      title="Failed to load insights"
      message="We couldn't load the coaching insights. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
