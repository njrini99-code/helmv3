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
      route="/golf/dashboard/practice"
      component="PracticePlanPage"
      title="Failed to load the plan"
      message="We couldn’t load this plan. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
