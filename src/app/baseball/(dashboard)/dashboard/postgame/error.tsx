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
      route="/baseball/dashboard/postgame"
      component="PostgameReviewPage"
      title="Failed to load postgame review"
      message="We couldn't load the postgame action review. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
