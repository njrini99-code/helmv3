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
      route="/golf/dashboard/rounds"
      component="RoundsPage"
      title="Failed to load rounds"
      message="We couldn't load your golf rounds. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
