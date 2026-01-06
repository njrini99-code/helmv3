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
      component="GolfDashboard"
      title="Failed to load dashboard"
      message="We couldn't load your golf dashboard. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
