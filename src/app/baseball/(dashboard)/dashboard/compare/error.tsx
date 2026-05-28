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
      route="/baseball/dashboard/compare"
      component="ComparePage"
      title="Failed to load compare"
      message="We couldn't load player comparison. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
