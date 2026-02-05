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
      route="/golf/dashboard/analytics/coachhelm"
      component="CoachHelmAnalyticsPage"
      title="Failed to load analytics"
      message="We couldn't load the CoachHelm analytics. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
