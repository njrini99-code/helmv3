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
      route="/golf/dashboard/rounds/continue/[id]"
      component="ContinueRoundPage"
      title="Failed to load round"
      message="We couldn't continue this round. Please try again."
      homePath="/golf/dashboard/rounds"
    />
  );
}
