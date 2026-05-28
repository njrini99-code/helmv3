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
      route="/baseball/dashboard/comparisons"
      component="ComparisonsPage"
      title="Failed to load comparisons"
      message="We couldn't load comparisons. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
