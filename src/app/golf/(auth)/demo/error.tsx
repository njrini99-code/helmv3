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
      route="/golf/demo"
      component="GolfDemoGatePage"
      title="Couldn't open the demo"
      message="We couldn't load the demo. Please try again."
      homePath="/golf"
    />
  );
}
