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
      route="/golf/dashboard/coachhelm/genome/compare-players"
      component="GenomeComparePage"
      title="Failed to load comparison"
      message="We couldn't load the genome comparison. Please try again."
      homePath="/golf/dashboard/coachhelm"
    />
  );
}
