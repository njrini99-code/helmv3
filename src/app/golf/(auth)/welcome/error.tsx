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
      route="/golf/welcome"
      component="GolfWelcomePage"
      title="Failed to load welcome"
      message="We couldn't load the welcome page. Please try again."
      homePath="/golf"
    />
  );
}
