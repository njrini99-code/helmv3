'use client';

import { RouteErrorBoundary } from '@/components/errors';
import { GateError } from '@/clubhouse/screens/auth/GateError';

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
      outsideShell={GateError}
      route="/golf/join"
      component="GolfJoinPage"
      title="Failed to load join page"
      message="We couldn't load the team join page. Please try again."
      homePath="/golf"
    />
  );
}
