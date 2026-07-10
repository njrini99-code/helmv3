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
      route="/baseball/dashboard/scouting"
      component="ScoutingPage"
      title="Couldn't load Scouting"
      message="We couldn't load the evaluation and export tools. Please try again."
      homePath="/baseball/dashboard/pipeline"
    />
  );
}
