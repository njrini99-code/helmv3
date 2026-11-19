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
      route="/golf/login"
      component="GolfLoginPage"
      title="Login error"
      message="We couldn't load the sign-in page. Please try again."
      homePath="/golf"
    />
  );
}
