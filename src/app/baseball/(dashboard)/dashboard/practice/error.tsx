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
      route="/baseball/dashboard/practice"
      component="BaseballPracticePage"
      title="Failed to load practice planner"
      message="We couldn't load the practice planner. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
