'use client';

import { RouteErrorBoundary } from '@/components/errors';
import { surfaceName } from '@/lib/golf/surface-registry';

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
      title={`Failed to load ${surfaceName('brief')}`}
      message={`We couldn't load the ${surfaceName('brief')}. Please try again.`}
      homePath="/golf/dashboard"
    />
  );
}
