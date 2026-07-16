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
      route="/baseball"
      component="BaseballRoot"
      title="Something went wrong"
      message="An unexpected error occurred. Please try again."
      homePath="/baseball"
    />
  );
}
