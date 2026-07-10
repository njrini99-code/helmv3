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
      route="/baseball/dashboard/operations"
      component="OperationsPage"
      title="Couldn't load Operations"
      message="We couldn't load the team logistics hub. Please try again."
      homePath="/baseball/dashboard/roster"
    />
  );
}
