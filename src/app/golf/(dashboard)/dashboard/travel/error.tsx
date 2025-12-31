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
      route="/golf/dashboard/travel"
      component="TravelPage"
      title="Failed to load travel"
      message="We couldn't load your travel information. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
