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
      route="/golf/dashboard/qualifiers"
      component="QualifiersPage"
      title="Failed to load qualifiers"
      message="We couldn't load the qualifiers. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
