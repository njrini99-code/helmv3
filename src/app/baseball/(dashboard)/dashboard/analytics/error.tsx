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
      route="/baseball/dashboard/analytics"
      component="BaseballAnalyticsPage"
      title="Failed to load analytics"
      message="We couldn't load analytics. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
