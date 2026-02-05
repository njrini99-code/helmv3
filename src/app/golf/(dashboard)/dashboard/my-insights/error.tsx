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
      route="/golf/dashboard/my-insights"
      component="MyInsightsPage"
      title="Failed to load insights"
      message="We couldn't load your insights. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
