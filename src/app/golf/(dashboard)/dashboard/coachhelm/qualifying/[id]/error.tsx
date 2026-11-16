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
      route="/golf/dashboard/coachhelm/qualifying/[id]"
      component="CoachHelmQualifyingPage"
      homePath="/golf/dashboard/qualifiers"
    />
  );
}
