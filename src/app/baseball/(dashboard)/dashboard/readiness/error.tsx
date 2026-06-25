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
      route="/baseball/dashboard/readiness"
      component="BaseballPlayerReadiness"
      title="Check-in error"
      message="We couldn't load your check-in. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
