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
      route="/golf/staff/join"
      component="GolfStaffJoinPage"
      title="Couldn't load this invite"
      message="We couldn't load this staff invite. Please try again."
      homePath="/golf"
    />
  );
}
