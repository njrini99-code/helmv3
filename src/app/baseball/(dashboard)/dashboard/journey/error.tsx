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
      route="/baseball/dashboard/journey"
      component="JourneyPage"
      title="Failed to load journey"
      message="We couldn't load your journey. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
