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
      route="/baseball/dashboard/dev-plans"
      component="DevPlansPage"
      title="Failed to load development plans"
      message="We couldn't load development plans. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
