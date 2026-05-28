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
      route="/golf/dashboard/stats/team"
      component="TeamStatsPage"
      title="Failed to load team stats"
      message="We couldn't load team stats. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
