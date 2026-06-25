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
      route="/baseball/dashboard/lift/[sessionId]"
      component="BaseballPlayerLiftSession"
      title="Lift session error"
      message="We couldn't load this lift session. Please try again."
      homePath="/baseball/dashboard/lift"
    />
  );
}
