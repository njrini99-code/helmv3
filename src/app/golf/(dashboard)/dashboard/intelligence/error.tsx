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
      route="/golf/dashboard/intelligence"
      component="IntelligencePage"
      title="Failed to load Intelligence Hub"
      message="We couldn't load the Intelligence Hub. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
