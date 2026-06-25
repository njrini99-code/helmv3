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
      route="/baseball/dashboard/stats-center"
      component="BaseballStatsCenterPage"
      title="Stats Center is unavailable"
      message="We couldn't load the team stats. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
