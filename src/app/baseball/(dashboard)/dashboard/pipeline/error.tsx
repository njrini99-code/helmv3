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
      route="/baseball/dashboard/pipeline"
      component="PipelinePage"
      title="Failed to load pipeline"
      message="We couldn't load your pipeline. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
