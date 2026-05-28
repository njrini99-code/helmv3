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
      route="/golf/dashboard/alerts"
      component="AlertsPage"
      title="Failed to load alerts"
      message="We couldn't load your inbox. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
