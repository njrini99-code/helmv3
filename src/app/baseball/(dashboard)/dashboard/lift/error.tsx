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
      route="/baseball/dashboard/lift"
      component="BaseballPlayerLift"
      title="Lift error"
      message="We couldn't load your lift. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
