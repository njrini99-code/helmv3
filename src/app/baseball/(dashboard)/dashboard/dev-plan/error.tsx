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
      route="/baseball/dashboard/dev-plan"
      component="DevPlanPage"
      title="Failed to load development plan"
      message="We couldn't load your development plan. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
