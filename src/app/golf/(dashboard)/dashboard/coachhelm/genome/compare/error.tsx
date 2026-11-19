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
      route="/golf/dashboard/coachhelm/genome/compare"
      component="GenomeComparePage"
      homePath="/golf/dashboard/coachhelm"
    />
  );
}
