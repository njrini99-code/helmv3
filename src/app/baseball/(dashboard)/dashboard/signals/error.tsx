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
      route="/baseball/dashboard/signals"
      component="SignalsPage"
      title="Failed to load signals"
      message="We couldn't load the signal inbox. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
