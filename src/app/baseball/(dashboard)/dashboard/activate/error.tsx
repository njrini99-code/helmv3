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
      route="/baseball/dashboard/activate"
      component="ActivatePage"
      title="Failed to load activation"
      message="We couldn't load recruiting activation. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
