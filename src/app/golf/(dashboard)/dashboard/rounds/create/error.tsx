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
      route="/golf/dashboard/rounds/create"
      component="NewRoundPage"
      title="Failed to load round entry"
      message="We couldn't load round entry. Please try again."
      homePath="/golf/dashboard/rounds"
    />
  );
}
