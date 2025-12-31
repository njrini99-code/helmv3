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
      route="/golf/dashboard/stats"
      component="StatsPage"
      title="Failed to load statistics"
      message="We couldn't load your statistics. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
