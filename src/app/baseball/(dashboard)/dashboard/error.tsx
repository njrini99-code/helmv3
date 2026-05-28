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
      route="/baseball/dashboard"
      component="BaseballDashboardPage"
      title="Something went wrong"
      message="We couldn't load your dashboard. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
