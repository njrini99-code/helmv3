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
      route="/baseball/dashboard/decision-room"
      component="BaseballDecisionRoomPage"
      title="Failed to load the Decision Room"
      message="We couldn't load your staff decision room. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
