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
      route="/golf/dashboard/development"
      component="DevelopmentPage"
      title="Failed to load development plans"
      message="We couldn't load development plans. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
