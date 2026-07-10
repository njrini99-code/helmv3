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
      route="/lifting/dashboard"
      component="LiftLabDashboard"
      title="Something went wrong"
      message="We couldn't load your Lift Lab dashboard. Please try again."
      homePath="/lifting/dashboard"
    />
  );
}
