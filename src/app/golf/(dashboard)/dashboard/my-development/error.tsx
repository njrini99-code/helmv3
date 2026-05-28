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
      route="/golf/dashboard/my-development"
      component="MyDevelopmentPage"
      title="Failed to load development"
      message="We couldn't load your development plan. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
