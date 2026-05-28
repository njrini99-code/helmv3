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
      route="/golf/dashboard/hub"
      component="PlayerHubPage"
      title="Failed to load hub"
      message="We couldn't load your hub. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
