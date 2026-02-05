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
      route="/golf/dashboard/patterns"
      component="PatternsPage"
      title="Failed to load patterns"
      message="We couldn't load your performance patterns. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
