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
      route="/golf/dashboard"
      component="GolfDashboardErrorBoundary"
      title="Something went wrong"
      message="We encountered an unexpected error. Please try again."
      homePath="/golf"
    />
  );
}
