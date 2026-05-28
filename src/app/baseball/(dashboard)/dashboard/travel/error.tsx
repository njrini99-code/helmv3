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
      route="/baseball/dashboard/travel"
      component="BaseballTravelPage"
      title="Failed to load travel"
      message="We couldn't load travel plans. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
