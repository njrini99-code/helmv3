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
      route="/baseball/dashboard/performance"
      component="BaseballPerformanceDashboard"
      title="Performance error"
      message="We couldn't load the performance dashboard. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
