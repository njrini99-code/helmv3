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
      route="/baseball/dashboard/my-stats"
      component="MyStatsPage"
      title="Unable to load stats"
      message="We couldn't load your stats. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
