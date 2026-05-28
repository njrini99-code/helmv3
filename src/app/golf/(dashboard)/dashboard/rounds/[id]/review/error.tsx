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
      route="/golf/dashboard/rounds/[id]/review"
      component="RoundReviewPage"
      title="Failed to load round review"
      message="We couldn't load this round review. Please try again."
      homePath="/golf/dashboard/rounds"
    />
  );
}
