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
      route="/baseball/dashboard/performance/live"
      component="BaseballLiveWeightRoom"
      title="Live Weight Room error"
      message="We couldn't load the live weight room. Please try again."
      homePath="/baseball/dashboard/performance"
    />
  );
}
