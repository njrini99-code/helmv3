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
      route="/golf/dashboard/rounds/recover"
      component="RecoverRoundPage"
      title="Failed to load round recovery"
      message="We couldn't load the round recovery page. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
