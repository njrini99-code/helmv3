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
      route="/baseball/dashboard/performance/builder"
      component="LiftBuilderPage"
      title="Couldn't load the Lift Builder"
      message="We couldn't load the lift planning tools. Please try again."
      homePath="/baseball/dashboard/performance"
    />
  );
}
