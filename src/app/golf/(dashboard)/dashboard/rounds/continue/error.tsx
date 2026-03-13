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
      route="/golf/dashboard/rounds/continue"
      component="ContinueRoundPage"
      title="Failed to load round"
      message="We couldn't load your in-progress round. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
