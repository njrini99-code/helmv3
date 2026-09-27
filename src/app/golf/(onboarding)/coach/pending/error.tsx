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
      route="/golf/coach/pending"
      component="GolfCoachPendingPage"
      title="Couldn't load your approval status"
      message="We couldn't check your coach approval. Please try again."
      homePath="/golf"
    />
  );
}
